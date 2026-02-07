/**
 * 场景转换器
 *
 * 将 AIInputBar 的4种发送场景转换为工作流定义
 *
 * 场景1: 只有选择元素，没有输入文字 -> 直接生成
 * 场景2: 输入内容有模型、参数 -> 解析后直接生成
 * 场景3: 输入内容指定了数量 -> 按数量生成
 * 场景4: 输入内容包含其他内容 -> 走 Agent 流程（调用文本模型获取工作流）
 */

import type { ParsedGenerationParams, GenerationType, SelectionInfo } from '../../utils/ai-input-parser';
import { cleanLLMResponse } from '../../services/agent/tool-parser';
import {
  generateSystemPrompt,
  generateReferenceImagesPrompt,
  buildStructuredUserMessage,
} from '../../services/agent';

/**
 * 工作流步骤执行选项（批量参数等）
 */
export interface WorkflowStepOptions {
  /** 执行模式 */
  mode?: 'async' | 'queue';
  /** 批次 ID */
  batchId?: string;
  /** 批次索引（1-based） */
  batchIndex?: number;
  /** 批次总数 */
  batchTotal?: number;
  /** 全局索引 */
  globalIndex?: number;
}

/**
 * 工作流步骤定义
 */
export interface WorkflowStep {
  /** 步骤 ID */
  id: string;
  /** MCP 工具名称 */
  mcp: string;
  /** 工具参数 */
  args: Record<string, unknown>;
  /** 执行选项（批量参数等） */
  options?: WorkflowStepOptions;
  /** 步骤描述 */
  description: string;
  /** 步骤状态 */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  /** 执行结果 */
  result?: unknown;
  /** 错误信息 */
  error?: string;
  /** 执行时间（毫秒） */
  duration?: number;
}

/**
 * 工作流定义
 */
export interface WorkflowDefinition {
  /** 工作流 ID */
  id: string;
  /** 工作流名称 */
  name: string;
  /** 工作流描述 */
  description: string;
  /** 场景类型 */
  scenarioType: 'direct_generation' | 'agent_flow';
  /** 生成类型 */
  generationType: GenerationType;
  /** 工作流状态 */
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  /** AI 分析内容（AI 对用户请求的理解和计划） */
  aiAnalysis?: string;
  /** 步骤列表 */
  steps: WorkflowStep[];
  /** 元数据 */
  metadata: {
    /** 最终生成用的提示词 */
    prompt: string;
    /** 用户输入的指令（可能包含额外要求） */
    userInstruction: string;
    /** 原始输入文本 */
    rawInput: string;
    /** 模型 ID */
    modelId: string;
    /** 是否为用户显式选择的模型 */
    isModelExplicit: boolean;
    /** 生成数量 */
    count: number;
    /** 尺寸参数（如 '16x9', '1x1'） */
    size?: string;
    /** 时长（视频） */
    duration?: string;
    /** 参考图片（图片 + 图形） */
    referenceImages?: string[];
    /** 选中元素的分类信息 */
    selection: SelectionInfo;
  };
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt?: number;
  /** 上下文信息（从 SW 恢复时使用） */
  context?: {
    userInput?: string;
    model?: string;
    referenceImages?: string[];
  };
  /** 错误信息（失败时） */
  error?: string;
}

/**
 * 生成唯一的工作流 ID
 * 
 * 注意：之前使用基于内容哈希的 ID 来实现幂等性，但这会导致用户无法用相同提示词重复生成。
 * 防重复逻辑应该在 AI 输入框层面做（让用户确认），而不是在 SW 层面静默跳过。
 * 现在改为使用时间戳 + 随机字符串，确保每次提交都是唯一的工作流。
 */
function generateWorkflowId(): string {
  return `wf-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * 场景1-3: 将直接生成场景转换为工作流定义
 *
 * 这些场景通过正则解析用户输入，直接生成图片/视频
 * 步骤中包含完整的工具调用信息（mcp、args、options），调用方可直接执行
 */
export function convertDirectGenerationToWorkflow(
  params: ParsedGenerationParams,
  referenceImages: string[] = []
): WorkflowDefinition {
  const {
    generationType,
    modelId,
    isModelExplicit,
    prompt,
    userInstruction,
    rawInput,
    count,
    size,
    duration,
    selection,
  } = params;

  const steps: WorkflowStep[] = [];

  // 使用唯一 ID（每次提交都是新的工作流）
  const workflowId = generateWorkflowId();

  // 生成批次 ID（用于区分同一批次中的不同任务）
  const batchId = `wf_batch_${workflowId}`;

  // 根据数量创建多个生成步骤
  for (let i = 0; i < count; i++) {
    const stepId = `${workflowId}-step-${i + 1}`;

    // 通用的执行选项
    const options: WorkflowStepOptions = {
      mode: 'queue',
      batchId,
      batchIndex: i + 1,
      batchTotal: count,
      globalIndex: i + 1,
    };

    if (generationType === 'image') {
      // 构建图片生成参数，size 为 undefined 时不传（让模型自动决定）
      // 注意：batchId 等参数直接放在 args 中，确保传输时不会丢失
      const imageArgs: Record<string, unknown> = {
        prompt,
        model: modelId,
        // 批量生成参数直接放在 args 中
        batchId,
        batchIndex: i + 1,
        batchTotal: count,
        globalIndex: i + 1,
      };
      if (size) {
        imageArgs.size = size;
      }
      if (referenceImages.length > 0) {
        imageArgs.referenceImages = referenceImages;
      }

      steps.push({
        id: stepId,
        mcp: 'generate_image',
        args: imageArgs,
        options,
        description: count > 1 ? `生成图片 (${i + 1}/${count})` : '生成图片',
        status: 'pending',
      });
    } else {
      // 构建视频生成参数，size 为 undefined 时不传（让模型自动决定）
      // 注意：batchId 等参数直接放在 args 中，确保传输时不会丢失
      const videoArgs: Record<string, unknown> = {
        prompt,
        model: modelId,
        seconds: duration || '5',
        // 批量生成参数直接放在 args 中
        batchId,
        batchIndex: i + 1,
        batchTotal: count,
        globalIndex: i + 1,
      };
      if (size) {
        videoArgs.size = size;
      }
      if (referenceImages.length > 0) {
        videoArgs.referenceImages = referenceImages;
      }

      steps.push({
        id: stepId,
        mcp: 'generate_video',
        args: videoArgs,
        options,
        description: count > 1 ? `生成视频 (${i + 1}/${count})` : '生成视频',
        status: 'pending',
      });
    }
  }

  return {
    id: workflowId,
    name: generationType === 'image' ? '图片生成' : '视频生成',
    description: `使用 ${modelId} 模型${count > 1 ? `生成 ${count} 个` : '生成'}${generationType === 'image' ? '图片' : '视频'}`,
    scenarioType: 'direct_generation',
    generationType,
    steps,
    metadata: {
      prompt,
      userInstruction,
      rawInput,
      modelId,
      isModelExplicit,
      count,
      size,
      duration,
      referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
      selection,
    },
    createdAt: Date.now(),
  };
}

/**
 * 场景4: 将 Agent 流程转换为工作流定义
 *
 * 这个场景需要先调用文本模型分析用户意图，然后根据分析结果执行工具
 * 初始只创建一个 ai_analyze 步骤，后续步骤由 AI 动态生成
 * 步骤中包含完整的工具调用信息，调用方可直接执行
 */
export function convertAgentFlowToWorkflow(
  params: ParsedGenerationParams,
  referenceImages: string[] = []
): WorkflowDefinition {
  const {
    generationType,
    modelId,
    isModelExplicit,
    prompt,
    userInstruction,
    rawInput,
    count,
    size,
    duration,
    selection,
  } = params;

  // 使用唯一 ID（每次提交都是新的工作流）
  const workflowId = generateWorkflowId();

  // 构建 Agent 执行上下文（与 AgentExecutionContext 类型一致）
  // Agent flow 场景下 generationType 不会是 'text'
  const agentContext = {
    userInstruction,
    rawInput,
    model: {
      id: modelId,
      type: generationType as 'image' | 'video',
      isExplicit: isModelExplicit,
    },
    params: {
      count,
      size,
      duration,
    },
    selection,
    finalPrompt: prompt,
  };

  // 收集所有参考图片 URL
  const allReferenceImages = [
    ...(selection.images || []),
    ...(selection.graphics || []),
  ];

  // 构建系统提示词（在应用层构建，传递给 SW）
  let systemPrompt = generateSystemPrompt();
  if (allReferenceImages.length > 0) {
    systemPrompt += generateReferenceImagesPrompt(
      allReferenceImages.length,
      selection.imageDimensions
    );
  }

  // 构建用户消息
  const userMessage = buildStructuredUserMessage(agentContext);

  // 构建 messages 数组（传递给 SW 的 ai_analyze）
  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userMessage },
  ];

  // Agent 流程初始只有一个 ai_analyze 步骤
  // 后续步骤会在 AI 分析后动态添加
  const steps: WorkflowStep[] = [
    {
      id: `${workflowId}-step-analyze`,
      mcp: 'ai_analyze',
      args: {
        // 传递预构建的 messages（SW 直接使用，不重复生成提示词）
        messages,
        // 传递参考图片 URL（用于占位符替换）
        referenceImages: allReferenceImages.length > 0 ? allReferenceImages : undefined,
        // 传递用户选择的文本模型（优先于系统配置）
        textModel: modelId,
      },
      options: {
        mode: 'async',
      },
      description: 'AI 分析用户意图',
      status: 'pending',
    },
  ];

  return {
    id: workflowId,
    name: 'AI 智能生成',
    description: 'AI 分析用户请求并执行相应操作',
    scenarioType: 'agent_flow',
    generationType,
    steps,
    metadata: {
      prompt,
      userInstruction,
      rawInput,
      modelId,
      isModelExplicit,
      count,
      size,
      duration,
      referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
      selection,
    },
    createdAt: Date.now(),
  };
}

/**
 * 根据解析结果自动选择转换方法
 */
export function convertToWorkflow(
  params: ParsedGenerationParams,
  referenceImages: string[] = []
): WorkflowDefinition {
  if (params.scenario === 'direct_generation') {
    return convertDirectGenerationToWorkflow(params, referenceImages);
  } else {
    return convertAgentFlowToWorkflow(params, referenceImages);
  }
}

/**
 * AI 响应解析结果
 */
export interface AIResponseParseResult {
  /** AI 分析内容（对用户请求的理解和计划） */
  content: string;
  /** 工作流步骤列表 */
  steps: WorkflowStep[];
}

/**
 * 从 AI 响应解析工作流步骤和分析内容
 *
 * AI 返回的格式：
 * {"content": "分析结果", "next": [{"mcp": "工具名", "args": {...}}]}
 */
export function parseAIResponse(
  response: string,
  existingStepCount: number = 0
): AIResponseParseResult {
  try {
    // 使用公共清理函数
    const cleaned = cleanLLMResponse(response);

    // 尝试提取 JSON
    const jsonMatch = cleaned.match(/\{\s*"content"\s*:[\s\S]*?"next"\s*:[\s\S]*?\}/) ||
                      cleaned.match(/\{[\s\S]*"content"[\s\S]*"next"[\s\S]*\}/);

    if (!jsonMatch) {
      return { content: '', steps: [] };
    }

    const jsonStr = jsonMatch[0];
    const parsed = JSON.parse(jsonStr);

    // 提取 content 字段
    const content = typeof parsed.content === 'string' ? parsed.content : '';

    // 提取 steps
    if (!Array.isArray(parsed.next) || parsed.next.length === 0) {
      return { content, steps: [] };
    }

    const steps = parsed.next
      .filter((item: any) => typeof item.mcp === 'string' && typeof item.args === 'object')
      .map((item: any, index: number) => ({
        id: `step-${existingStepCount + index + 1}`,
        mcp: item.mcp,
        args: item.args,
        description: getStepDescription(item.mcp, item.args),
        status: 'pending' as const,
      }));

    return { content, steps };
  } catch {
    return { content: '', steps: [] };
  }
}

/**
 * 从 AI 响应解析工作流步骤（兼容旧接口）
 *
 * AI 返回的格式：
 * {"content": "分析结果", "next": [{"mcp": "工具名", "args": {...}}]}
 */
export function parseAIResponseToSteps(
  response: string,
  existingStepCount: number = 0
): WorkflowStep[] {
  return parseAIResponse(response, existingStepCount).steps;
}

/**
 * 根据工具名称和参数生成步骤描述
 */
function getStepDescription(mcp: string, args: Record<string, unknown>): string {
  switch (mcp) {
    case 'generate_image':
      return `生成图片: ${(args.prompt as string)?.substring(0, 30) || ''}...`;
    case 'generate_video':
      return `生成视频: ${(args.prompt as string)?.substring(0, 30) || ''}...`;
    case 'ai_analyze':
      return 'AI 分析用户意图';
    case 'format_markdown':
      return '格式化输出';
    case 'show_result':
      return '展示结果';
    default:
      return `执行 ${mcp}`;
  }
}

/**
 * 更新工作流步骤状态
 */
export function updateStepStatus(
  workflow: WorkflowDefinition,
  stepId: string,
  status: WorkflowStep['status'],
  result?: unknown,
  error?: string,
  duration?: number
): WorkflowDefinition {
  return {
    ...workflow,
    steps: workflow.steps.map(step => 
      step.id === stepId
        ? { ...step, status, result, error, duration }
        : step
    ),
  };
}

/**
 * 向工作流添加新步骤（自动去重）
 */
export function addStepsToWorkflow(
  workflow: WorkflowDefinition,
  newSteps: WorkflowStep[]
): WorkflowDefinition {
  // Filter out steps that already exist (by ID)
  const existingIds = new Set(workflow.steps.map(s => s.id));
  const uniqueNewSteps = newSteps.filter(step => !existingIds.has(step.id));
  
  if (uniqueNewSteps.length === 0) {
    return workflow; // No new steps to add
  }
  
  return {
    ...workflow,
    steps: [...workflow.steps, ...uniqueNewSteps],
  };
}

/**
 * 获取工作流当前状态
 */
export function getWorkflowStatus(workflow: WorkflowDefinition): {
  status: 'pending' | 'running' | 'completed' | 'failed';
  completedSteps: number;
  totalSteps: number;
  currentStep?: WorkflowStep;
} {
  const completedSteps = workflow.steps.filter(s => s.status === 'completed').length;
  const failedSteps = workflow.steps.filter(s => s.status === 'failed').length;
  const runningStep = workflow.steps.find(s => s.status === 'running');
  const pendingSteps = workflow.steps.filter(s => s.status === 'pending').length;
  
  let status: 'pending' | 'running' | 'completed' | 'failed';
  
  if (failedSteps > 0) {
    status = 'failed';
  } else if (runningStep) {
    status = 'running';
  } else if (pendingSteps === 0 && completedSteps > 0) {
    status = 'completed';
  } else {
    status = 'pending';
  }
  
  return {
    status,
    completedSteps,
    totalSteps: workflow.steps.length,
    currentStep: runningStep || workflow.steps.find(s => s.status === 'pending'),
  };
}
