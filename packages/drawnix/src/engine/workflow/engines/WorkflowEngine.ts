/**
 * 工作流执行引擎
 * 处理简洁 JSON 格式的链式 MCP 调用
 */

import type { MCPTool, MCPToolResult } from '../types/mcp.types';
import type {
  WorkflowConfig,
  WorkflowResult,
  MCPCallRecord,
  WorkflowEvent,
  WorkflowEventListener,
  AIService,
  ToolExecutor,
} from '../types/workflow.types';
import { DEFAULT_WORKFLOW_CONFIG } from '../types/workflow.types';
import {
  getWorkflowSystemPrompt,
  getWorkflowUserPrompt,
  parseWorkflowResponse,
  shouldTerminate,
  cleanFinalOutput,
  type WorkflowMCPCall,
} from '../prompts/workflow';
import { WorkflowGuard } from '../guards/workflow-guard';
import { ExecutionLogger } from '../guards/execution-logger';
import { ParameterMapper } from '../parameter/ParameterMapper';
import { DEFAULT_TOOL_MAPPINGS } from '../parameter/tool-mappings';
import type { MappingRule, ToolMappingConfig, LogLevel } from '../parameter/types';

/**
 * 工作流执行引擎
 * 
 * 处理简洁 JSON 格式的链式 MCP 调用：
 * - 解析大模型返回的 {"content": "...", "next": [...]} 格式
 * - 按顺序执行 next 数组中的 MCP 调用
 * - 自动将前一个工具的输出传递给后一个工具的 content 参数
 * - 最后一个工具的输出作为下次大模型调用的输入
 */
export class WorkflowEngine {
  private config: WorkflowConfig;
  private tools: MCPTool[];
  private aiService: AIService;
  private toolExecutor: ToolExecutor;
  private listeners: WorkflowEventListener[] = [];
  private isCancelled: boolean = false;
  private guard: WorkflowGuard;
  private logger: ExecutionLogger;
  private parameterMapper: ParameterMapper;
  private lastToolId: string | null = null;
  private currentRequestId: string | null = null;

  constructor(
    aiService: AIService,
    toolExecutor: ToolExecutor,
    config: Partial<WorkflowConfig> = {},
    tools: MCPTool[] = []
  ) {
    this.aiService = aiService;
    this.toolExecutor = toolExecutor;
    this.config = { ...DEFAULT_WORKFLOW_CONFIG, ...config };
    this.tools = tools;

    // 初始化防护机制
    this.guard = new WorkflowGuard({
      recursion: {
        maxIterations: this.config.maxIterations,
        warningThreshold: this.config.warningThreshold ?? 10,
        softLimit: this.config.softLimit ?? 15,
        hardLimit: this.config.maxIterations,
      },
      loopDetection: {
        windowSize: 10,
        repeatThreshold: 3,
        similarityThreshold: 0.9,
        enablePatternDetection: this.config.enableLoopDetection ?? true,
      },
      verbose: this.config.verbose,
    });

    // 初始化日志记录器
    this.logger = new ExecutionLogger();
    this.logger.setEnabled(this.config.verbose);

    // 初始化参数映射器
    this.parameterMapper = new ParameterMapper({
      enableTracing: this.config.enableParameterMapping ?? true,
      logLevel: (this.config.parameterMappingLogLevel ?? 'info') as LogLevel,
      enableTypeCoercion: true,
    });

    // 注册默认的工具映射规则
    this.parameterMapper.registerMappings(DEFAULT_TOOL_MAPPINGS);
  }

  /**
   * 设置可用工具
   */
  setTools(tools: MCPTool[]): void {
    this.tools = tools;
  }

  /**
   * 注册参数映射规则
   */
  registerParameterMapping(
    sourceToolId: string,
    targetToolId: string,
    rules: MappingRule[]
  ): void {
    this.parameterMapper.registerMapping(sourceToolId, targetToolId, rules);
  }

  /**
   * 批量注册参数映射规则
   */
  registerParameterMappings(config: ToolMappingConfig): void {
    this.parameterMapper.registerMappings(config);
  }

  /**
   * 获取参数映射器实例
   */
  getParameterMapper(): ParameterMapper {
    return this.parameterMapper;
  }

  /**
   * 取消执行
   */
  cancel(): void {
    this.isCancelled = true;
    this.guard.terminate('用户取消');

    if (this.currentRequestId && this.aiService.stopGeneration) {
      this.aiService.stopGeneration(this.currentRequestId);
      this.currentRequestId = null;
    }
  }

  /**
   * 添加事件监听器
   */
  addEventListener(listener: WorkflowEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * 触发事件
   */
  private emit(event: WorkflowEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (e) {
        console.error('Event listener error:', e);
      }
    }
  }

  /**
   * 执行工作流
   */
  async execute(
    userRequest: string,
    pageContext?: string
  ): Promise<WorkflowResult> {
    this.isCancelled = false;
    this.guard.reset();
    this.lastToolId = null;
    
    const executionId = `wf-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    this.logger.info(`工作流开始执行: ${executionId}`, { userRequest: userRequest.substring(0, 100) });
    
    const systemPrompt = getWorkflowSystemPrompt(this.tools);
    const mcpCalls: MCPCallRecord[] = [];
    let previousOutput: string | undefined;
    let iterations = 0;
    let lastContent = '';
    let terminationReason: string | undefined;

    try {
      while (!this.isCancelled) {
        const guardCheck = this.guard.startIteration();
        iterations = guardCheck.recursionCheck.currentIteration;

        this.emit({ type: 'iteration_start', iteration: iterations });

        if (guardCheck.forceTerminate) {
          terminationReason = guardCheck.forceTerminateReason;
          this.logger.warn(`强制终止: ${terminationReason}`);
          this.emit({ type: 'force_terminate', reason: terminationReason! });
          break;
        }

        if (guardCheck.warningMessage) {
          this.logger.warn(guardCheck.warningMessage);
          this.emit({ type: 'guard_warning', message: guardCheck.warningMessage, checkResult: guardCheck });
        }

        if (guardCheck.loopCheck.loopDetected) {
          this.emit({ type: 'loop_detected', description: guardCheck.loopCheck.description || '检测到循环调用' });
        }

        const warningInjection = this.guard.generatePromptInjection();
        const userPrompt = getWorkflowUserPrompt({
          userRequest,
          previousOutput,
          pageContext,
          warningMessage: warningInjection || undefined,
          currentIteration: iterations,
          maxIterations: this.config.maxIterations,
        });

        this.emit({
          type: 'iteration_started',
          iteration: iterations,
          prompt: { system: systemPrompt, user: userPrompt }
        });

        if (this.isCancelled) break;

        this.currentRequestId = `workflow_${executionId}_iter${iterations}`;

        let rawResponse: string;
        try {
          rawResponse = await this.aiService.chat(
            [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            this.config.model,
            this.currentRequestId
          );
        } catch (error) {
          if (this.isCancelled) break;
          throw error;
        } finally {
          this.currentRequestId = null;
        }

        if (this.isCancelled) break;

        const response = parseWorkflowResponse(rawResponse);
        this.emit({ type: 'llm_response', response });
        lastContent = response.content;

        if (shouldTerminate(response)) {
          this.logger.info('任务完成，工作流终止');
          const cleanedOutput = cleanFinalOutput(response.content);
          this.emit({ type: 'iteration_completed', iteration: iterations, content: cleanedOutput });
          this.guard.terminate('任务完成');
          const result: WorkflowResult = {
            success: true,
            output: cleanedOutput,
            finalOutput: cleanedOutput,
            iterations,
            mcpCalls,
            terminationReason: '任务完成',
          };
          this.emit({ type: 'workflow_complete', result });
          return result;
        }

        let chainOutput: string = '';
        let shouldTerminateByTool = false;
        let terminateContent = '';
        
        for (const call of response.next!) {
          if (this.isCancelled) break;
          
          this.emit({ type: 'mcp_call_start', call });
          this.guard.recordToolCall(call.mcp, call.args);

          const record = await this.executeMCPCall(call, chainOutput);
          mcpCalls.push(record);

          this.emit({
            type: 'mcp_call',
            mcpName: call.mcp,
            args: call.args,
            result: record.result,
            success: record.success,
            error: record.error,
            duration: record.duration,
          });

          if (record.progressMessage) {
            this.emit({ type: 'progress_update', message: record.progressMessage });
          }

          if (record.terminateWorkflow && record.success) {
            shouldTerminateByTool = true;
            terminateContent = record.result || '';
            this.emit({ type: 'display_result', content: terminateContent, terminateWorkflow: true });
            this.logger.info(`工具 ${call.mcp} 请求终止工作流`);
            break;
          }

          if (!record.success) {
            this.logger.error(`工具 ${call.mcp} 执行失败: ${record.error}`);
            this.emit({ type: 'mcp_call_error', call, error: record.error! });
            chainOutput = `错误: ${record.error}`;
          } else {
            this.emit({ type: 'mcp_call_complete', call, result: record.result! });
            chainOutput = record.rawResult || record.result!;
          }

          const postCallCheck = this.guard.check();
          if (postCallCheck.loopCheck.loopDetected) {
            this.emit({ type: 'loop_detected', description: postCallCheck.loopCheck.description || '检测到循环调用' });
            chainOutput = `${chainOutput}\n\n⚠️ 警告：${postCallCheck.loopCheck.description}`;
          }
        }

        if (shouldTerminateByTool) {
          this.logger.info('工具请求终止，工作流结束');
          this.emit({ type: 'iteration_completed', iteration: iterations, content: terminateContent });
          this.guard.terminate('工具请求终止');
          const result: WorkflowResult = {
            success: true,
            output: terminateContent,
            finalOutput: terminateContent,
            iterations,
            mcpCalls,
            terminationReason: '工具请求终止',
          };
          this.emit({ type: 'workflow_complete', result });
          return result;
        }

        this.emit({ type: 'iteration_completed', iteration: iterations, content: lastContent });
        previousOutput = chainOutput;
      }

      const finalOutput = previousOutput || lastContent || '工作流已终止';
      terminationReason = terminationReason || (this.isCancelled ? '用户取消' : '达到最大迭代次数限制');
      
      this.logger.warn(`工作流因限制终止: ${terminationReason}`);
      this.guard.terminate(terminationReason);
      
      const result: WorkflowResult = {
        success: false,
        output: finalOutput,
        finalOutput,
        iterations,
        mcpCalls,
        error: terminationReason,
        terminationReason,
      };
      this.emit({ type: 'workflow_complete', result });
      return result;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`工作流执行错误: ${errorMsg}`);
      this.emit({ type: 'workflow_error', error: errorMsg });
      this.guard.terminate(`错误: ${errorMsg}`);
      return {
        success: false,
        output: '',
        finalOutput: '',
        iterations,
        mcpCalls,
        error: errorMsg,
        terminationReason: `执行错误: ${errorMsg}`,
      };
    }
  }

  /**
   * 获取执行摘要
   */
  getExecutionSummary(): string {
    return this.guard.generateSummary();
  }

  /**
   * 执行单个 MCP 调用
   * 
   * 链式调用的核心逻辑：
   * 1. 如果有 previousOutput，尝试通过参数映射器转换
   * 2. 如果映射失败，将 previousOutput 注入到 args.content
   * 3. 执行工具并返回结果
   * 
   * @param call - MCP 调用定义
   * @param previousOutput - 前一个工具的输出（用于链式传递）
   * @returns MCP 调用记录
   */
  private async executeMCPCall(
    call: WorkflowMCPCall,
    previousOutput: string
  ): Promise<MCPCallRecord> {
    const startTime = Date.now();

    // 构建参数，实现输出到输入的自动传递
    let args = { ...call.args };
    
    if (previousOutput) {
      // 优先使用参数映射器进行智能映射
      if (this.config.enableParameterMapping && this.lastToolId) {
        const mappingResult = this.parameterMapper.map(
          this.lastToolId,
          call.mcp,
          previousOutput,
          args
        );
        
        if (mappingResult.success) {
          args = mappingResult.params as Record<string, unknown>;
          this.logger.info(`参数映射成功: ${this.lastToolId} -> ${call.mcp}`);
        } else {
          // 映射失败，使用默认的 content 参数注入
          this.injectPreviousOutput(args, previousOutput);
        }
      } else {
        // 未启用映射或无前置工具，直接注入
        this.injectPreviousOutput(args, previousOutput);
      }
    }

    this.lastToolId = call.mcp;

    try {
      const result = await Promise.race([
        this.toolExecutor.execute(call.mcp, args),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('工具执行超时')), this.config.toolTimeout)
        ),
      ]);

      const duration = Date.now() - startTime;
      const rawResultStr = this.extractResultString(result);

      const record: MCPCallRecord = {
        mcp: call.mcp,
        args,
        result: rawResultStr,
        success: true,
        duration,
        rawResult: rawResultStr,
      };

      return record;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      return {
        mcp: call.mcp,
        args,
        success: false,
        error: errorMsg,
        duration,
      };
    }
  }

  /**
   * 将前一个工具的输出注入到参数中
   * 
   * 注入规则：
   * 1. 如果 args 中没有 content 字段，注入到 content
   * 2. 如果 args 中没有 input 字段，注入到 input
   * 3. 否则不覆盖已有参数
   */
  private injectPreviousOutput(args: Record<string, unknown>, previousOutput: string): void {
    if (!args.content && !args.input) {
      // 优先使用 content 字段
      args.content = previousOutput;
    } else if (!args.content) {
      args.content = previousOutput;
    }
    // 如果已有 content，不覆盖
  }

  /**
   * 从 MCP 结果中提取字符串
   */
  private extractResultString(result: MCPToolResult): string {
    if (!result.content || result.content.length === 0) {
      return '';
    }

    return result.content
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .join('\n');
  }
}
