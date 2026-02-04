/**
 * Workflow Engine
 *
 * 主线程工作流引擎，负责：
 * - 管理工作流状态
 * - 按顺序/依赖执行步骤
 * - 使用执行器工厂执行媒体生成任务
 * - 轮询等待任务完成
 */

import { Subject, Observable } from 'rxjs';
import type {
  Workflow,
  WorkflowStep,
  WorkflowStatus,
  WorkflowEvent,
  WorkflowEngineOptions,
} from './types';
import { executorFactory, waitForTaskCompletion, taskStorageWriter } from '../media-executor';
import type { AIAnalyzeParams } from '../media-executor/types';
import { workflowStorageWriter } from './workflow-storage-writer';
import { findExecutableSteps, getFirstError } from './workflow-factory';

/**
 * 主线程工作流引擎
 */
export class WorkflowEngine {
  private workflows: Map<string, Workflow> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();
  private events$ = new Subject<WorkflowEvent>();
  private options: Required<WorkflowEngineOptions>;

  constructor(options: WorkflowEngineOptions = {}) {
    this.options = {
      stepTimeout: options.stepTimeout ?? 10 * 60 * 1000, // 10 分钟
      continueOnError: options.continueOnError ?? false,
      onEvent: options.onEvent ?? (() => {}),
      executeMainThreadTool: options.executeMainThreadTool,
    };

    // 订阅事件并调用回调
    this.events$.subscribe((event) => {
      this.options.onEvent(event);
    });
  }

  /**
   * 获取事件流
   */
  getEvents(): Observable<WorkflowEvent> {
    return this.events$.asObservable();
  }

  /**
   * 提交工作流
   */
  async submitWorkflow(workflow: Workflow): Promise<void> {
    // 保存到内存
    this.workflows.set(workflow.id, workflow);

    // 保存到 IndexedDB
    await workflowStorageWriter.saveWorkflow(workflow);

    // 创建取消控制器
    const abortController = new AbortController();
    this.abortControllers.set(workflow.id, abortController);

    // 异步执行工作流
    this.executeWorkflow(workflow.id).catch((error) => {
      console.error(`[WorkflowEngine] Workflow ${workflow.id} execution error:`, error);
    });
  }

  /**
   * 取消工作流
   */
  async cancelWorkflow(workflowId: string): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return;

    // 发送取消信号
    const abortController = this.abortControllers.get(workflowId);
    abortController?.abort();

    // 更新状态
    workflow.status = 'cancelled';
    workflow.updatedAt = Date.now();
    await workflowStorageWriter.saveWorkflow(workflow);

    this.emitEvent({
      type: 'status',
      workflowId,
      status: 'cancelled',
    });
  }

  /**
   * 获取工作流
   */
  getWorkflow(workflowId: string): Workflow | undefined {
    return this.workflows.get(workflowId);
  }

  /**
   * 从 IndexedDB 恢复并继续执行工作流
   * 用于页面刷新后恢复未完成的工作流
   */
  async resumeWorkflow(workflowId: string): Promise<void> {
    // 检查是否已在内存中
    if (this.workflows.has(workflowId)) {
      console.log('[WorkflowEngine] Workflow already in memory:', workflowId);
      return;
    }

    // 从 IndexedDB 加载
    const workflow = await workflowStorageWriter.getWorkflow(workflowId);
    if (!workflow) {
      console.log('[WorkflowEngine] Workflow not found in IndexedDB:', workflowId);
      return;
    }

    // 检查是否有需要执行的步骤
    const hasPendingSteps = workflow.steps.some((s) => s.status === 'pending');
    const hasRunningSteps = workflow.steps.some((s) => s.status === 'running');
    const hasPendingMainThreadSteps = workflow.steps.some((s) => s.status === 'pending_main_thread');

    if (!hasPendingSteps && !hasRunningSteps && !hasPendingMainThreadSteps) {
      console.log('[WorkflowEngine] No pending/running steps to resume:', workflowId);
      return;
    }

    console.log('[WorkflowEngine] Resuming workflow:', workflowId, {
      pendingSteps: workflow.steps.filter((s) => s.status === 'pending').length,
      runningSteps: workflow.steps.filter((s) => s.status === 'running').length,
      pendingMainThreadSteps: workflow.steps.filter((s) => s.status === 'pending_main_thread').length,
    });

    // 将 running 步骤重置为 pending（页面刷新导致中断）
    // pending_main_thread 步骤保持不变，由 WorkflowPollingService 处理
    workflow.steps.forEach((s) => {
      if (s.status === 'running') {
        s.status = 'pending';
      }
    });

    // 加载到内存并执行
    this.workflows.set(workflowId, workflow);
    const abortController = new AbortController();
    this.abortControllers.set(workflowId, abortController);

    // 开始执行
    this.executeWorkflow(workflowId).catch((error) => {
      console.error('[WorkflowEngine] Resume workflow failed:', workflowId, error);
    });
  }

  /**
   * 执行工作流
   */
  private async executeWorkflow(workflowId: string): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return;

    const abortController = this.abortControllers.get(workflowId);

    try {
      // 更新状态为 running
      workflow.status = 'running';
      workflow.updatedAt = Date.now();
      await workflowStorageWriter.saveWorkflow(workflow);

      this.emitEvent({
        type: 'status',
        workflowId,
        status: 'running',
      });

      // 执行步骤
      await this.executeSteps(workflow, abortController?.signal);

      // 检查是否所有步骤都完成
      const allCompleted = workflow.steps.every(
        (s) => s.status === 'completed' || s.status === 'skipped'
      );
      const hasFailed = workflow.steps.some((s) => s.status === 'failed');

      if (hasFailed && !this.options.continueOnError) {
        workflow.status = 'failed';
        workflow.error = getFirstError(workflow);
      } else if (allCompleted) {
        workflow.status = 'completed';
        workflow.completedAt = Date.now();
      }

      workflow.updatedAt = Date.now();
      await workflowStorageWriter.saveWorkflow(workflow);

      if (workflow.status === 'completed') {
        this.emitEvent({
          type: 'completed',
          workflowId,
          workflow,
        });
      } else if (workflow.status === 'failed') {
        this.emitEvent({
          type: 'failed',
          workflowId,
          error: workflow.error || 'Unknown error',
        });
      }
    } catch (error: any) {
      // 处理执行错误
      workflow.status = 'failed';
      workflow.error = error.message || 'Workflow execution failed';
      workflow.updatedAt = Date.now();
      await workflowStorageWriter.saveWorkflow(workflow);

      this.emitEvent({
        type: 'failed',
        workflowId,
        error: workflow.error,
      });
    } finally {
      // 清理
      this.abortControllers.delete(workflowId);
    }
  }

  /**
   * 执行工作流步骤
   */
  private async executeSteps(workflow: Workflow, signal?: AbortSignal): Promise<void> {
    // 循环执行，直到没有可执行的步骤
    let iteration = 0;
    while (true) {
      iteration++;
      if (signal?.aborted) {
        throw new Error('Workflow cancelled');
      }

      // 查找可执行的步骤
      const executableSteps = findExecutableSteps(workflow);
      console.log(`[WorkflowEngine] Iteration ${iteration}: ${executableSteps.length} executable steps, total ${workflow.steps.length} steps`);
      
      if (executableSteps.length === 0) {
        console.log('[WorkflowEngine] No more executable steps, workflow steps status:', 
          workflow.steps.map(s => ({ id: s.id, mcp: s.mcp, status: s.status })));
        break;
      }

      console.log('[WorkflowEngine] Executing steps:', executableSteps.map(s => ({ id: s.id, mcp: s.mcp })));

      // 并行执行所有可执行的步骤
      await Promise.all(
        executableSteps.map((step) => this.executeStep(workflow, step, signal))
      );
    }
  }


  /**
   * 执行单个步骤
   */
  private async executeStep(
    workflow: Workflow,
    step: WorkflowStep,
    signal?: AbortSignal
  ): Promise<void> {
    const startTime = Date.now();

    // 更新步骤状态为 running
    step.status = 'running';
    workflow.updatedAt = Date.now();
    await workflowStorageWriter.saveWorkflow(workflow);

    this.emitEvent({
      type: 'step',
      workflowId: workflow.id,
      stepId: step.id,
      status: 'running',
    });

    try {
      // 根据工具类型执行
      await this.executeToolStep(workflow, step, signal);

      // 更新步骤状态为 completed
      step.status = 'completed';
      step.duration = Date.now() - startTime;
      workflow.updatedAt = Date.now();
      await workflowStorageWriter.saveWorkflow(workflow);

      this.emitEvent({
        type: 'step',
        workflowId: workflow.id,
        stepId: step.id,
        status: 'completed',
        result: step.result,
        duration: step.duration,
      });
    } catch (error: any) {
      // 更新步骤状态为 failed
      step.status = 'failed';
      step.error = error.message || 'Step execution failed';
      step.duration = Date.now() - startTime;
      workflow.updatedAt = Date.now();
      await workflowStorageWriter.saveWorkflow(workflow);

      this.emitEvent({
        type: 'step',
        workflowId: workflow.id,
        stepId: step.id,
        status: 'failed',
        error: step.error,
        duration: step.duration,
      });

      if (!this.options.continueOnError) {
        throw error;
      }
    }
  }

  /**
   * 执行工具步骤
   */
  private async executeToolStep(
    workflow: Workflow,
    step: WorkflowStep,
    signal?: AbortSignal
  ): Promise<void> {
    const executor = await executorFactory.getExecutor();
    const taskId = step.id; // 使用步骤 ID 作为任务 ID

    // 根据工具类型执行
    switch (step.mcp) {
      case 'generate_image': {
        // 创建任务记录
        await taskStorageWriter.createTask(taskId, 'image', {
          prompt: step.args.prompt as string,
          ...step.args,
        });

        // 执行图片生成
        await executor.generateImage({
          taskId,
          prompt: step.args.prompt as string,
          model: step.args.model as string | undefined,
          size: step.args.size as string | undefined,
          referenceImages: step.args.referenceImages as string[] | undefined,
          count: step.args.count as number | undefined,
        }, { signal });

        // 等待任务完成
        const result = await waitForTaskCompletion(taskId, {
          timeout: this.options.stepTimeout,
          signal,
        });

        if (!result.success) {
          throw new Error(result.error || 'Image generation failed');
        }

        step.result = result.task?.result;
        break;
      }

      case 'generate_video': {
        // 创建任务记录
        await taskStorageWriter.createTask(taskId, 'video', {
          prompt: step.args.prompt as string,
          ...step.args,
        });

        // 执行视频生成
        await executor.generateVideo({
          taskId,
          prompt: step.args.prompt as string,
          model: step.args.model as string | undefined,
          duration: step.args.duration as string | undefined,
          size: step.args.size as string | undefined,
        }, { signal });

        // 等待任务完成
        const result = await waitForTaskCompletion(taskId, {
          timeout: this.options.stepTimeout,
          signal,
        });

        if (!result.success) {
          throw new Error(result.error || 'Video generation failed');
        }

        step.result = result.task?.result;
        break;
      }

      case 'ai_analyze': {
        // AI 分析任务（不写入 tasks 表，chat 类型不应该出现在用户任务列表）
        // 注意：ai_analyze 必须使用降级执行器（主线程执行），因为需要立即返回结果和 addSteps
        // SW 执行器的 fire-and-forget 模式无法满足这个需求
        console.log('[WorkflowEngine] Executing ai_analyze step:', step.id, 'args:', {
          hasMessages: !!(step.args.messages as unknown[])?.length,
          prompt: (step.args.prompt as string)?.substring(0, 100),
          textModel: step.args.textModel,
          allArgs: Object.keys(step.args),
        });

        // 强制使用降级执行器，确保结果立即返回
        const fallbackExecutor = executorFactory.getFallbackExecutor();
        const analyzeResult = await fallbackExecutor.aiAnalyze({
          taskId,
          // 支持 messages 或 prompt
          messages: step.args.messages as AIAnalyzeParams['messages'],
          prompt: step.args.prompt as string | undefined,
          // 支持 referenceImages 或 images
          referenceImages: step.args.referenceImages as string[] | undefined,
          images: step.args.images as string[] | undefined,
          // 支持 textModel 或 model
          textModel: step.args.textModel as string | undefined,
          model: step.args.model as string | undefined,
        }, { signal });

        console.log('[WorkflowEngine] ai_analyze result:', {
          content: analyzeResult.content?.substring(0, 100),
          addStepsCount: analyzeResult.addSteps?.length ?? 0,
          addSteps: analyzeResult.addSteps?.map(s => ({ id: s.id, mcp: s.mcp })),
        });

        step.result = { content: analyzeResult.content };

        // 处理动态添加的步骤（AI 规划的后续任务）
        if (analyzeResult.addSteps && analyzeResult.addSteps.length > 0) {
          console.log(`[WorkflowEngine] Adding ${analyzeResult.addSteps.length} new steps from ai_analyze`);
          for (const newStep of analyzeResult.addSteps) {
            // 去重检查
            if (!workflow.steps.find(s => s.id === newStep.id)) {
              workflow.steps.push({
                id: newStep.id,
                mcp: newStep.mcp,
                args: newStep.args,
                description: newStep.description,
                status: newStep.status,
              });
            }
          }
          // 保存工作流状态（包含新步骤）
          await workflowStorageWriter.saveWorkflow(workflow);
        }
        break;
      }

      // 主线程工具（需要访问 Board/Canvas）
      case 'insert_mermaid':
      case 'insert_mindmap':
      case 'insert_svg':
      case 'canvas_insert':
      case 'insert_to_canvas': {
        if (!this.options.executeMainThreadTool) {
          throw new Error(`No main thread tool executor configured for: ${step.mcp}`);
        }

        console.log(`[WorkflowEngine] Executing main thread tool: ${step.mcp}`);
        const toolResult = await this.options.executeMainThreadTool(step.mcp, step.args);

        if (!toolResult.success) {
          throw new Error(toolResult.error || `${step.mcp} failed`);
        }

        step.result = toolResult.result;
        break;
      }

      default:
        throw new Error(`Unknown tool: ${step.mcp}`);
    }
  }


  /**
   * 发送事件
   */
  private emitEvent(event: WorkflowEvent): void {
    this.events$.next(event);
  }

  /**
   * 销毁引擎
   */
  destroy(): void {
    // 取消所有正在执行的工作流
    for (const [workflowId, abortController] of this.abortControllers) {
      abortController.abort();
    }
    this.abortControllers.clear();
    this.workflows.clear();
    this.events$.complete();
  }
}

// Re-export createWorkflow from workflow-factory
export { createWorkflow } from './workflow-factory';
