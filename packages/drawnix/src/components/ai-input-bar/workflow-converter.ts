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
}

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * 场景1-3: 将直接生成场景转换为工作流定义
 * 
 * 这些场景通过正则解析用户输入，直接生成图片/视频
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
  
  // 根据数量创建多个生成步骤
  for (let i = 0; i < count; i++) {
    const stepId = `step-${i + 1}`;
    
    if (generationType === 'image') {
      steps.push({
        id: stepId,
        mcp: 'generate_image',
        args: {
          prompt,
          model: modelId,
          size: size || '1x1',
          referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
        },
        description: count > 1 
          ? `生成图片 (${i + 1}/${count})`
          : '生成图片',
        status: 'pending',
      });
    } else {
      // 视频生成
      steps.push({
        id: stepId,
        mcp: 'generate_video',
        args: {
          prompt,
          model: modelId,
          size: size || '16x9',
          duration: duration || '5',
          referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
        },
        description: count > 1 
          ? `生成视频 (${i + 1}/${count})`
          : '生成视频',
        status: 'pending',
      });
    }
  }
  
  return {
    id: generateId(),
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
 * 这个场景需要先调用文本模型分析用户意图，然后根据分析结果生成工作流
 * 初始只创建一个"分析"步骤，后续步骤由 AI 动态生成
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

  // Agent 流程初始只有一个分析步骤
  // 后续步骤会在 AI 分析后动态添加
  const steps: WorkflowStep[] = [
    {
      id: 'step-analyze',
      mcp: 'ai_analyze',
      args: {
        // 用户指令（包含额外要求）
        userInstruction,
        // 选中的文本作为生成 prompt
        selectedTexts: selection.texts,
        context: {
          generationType,
          modelId,
          isModelExplicit,
          count,
          size,
          duration,
          hasReferenceImages: referenceImages.length > 0,
          hasSelectedTexts: selection.texts.length > 0,
          hasSelectedVideos: selection.videos.length > 0,
        },
      },
      description: 'AI 分析用户意图',
      status: 'pending',
    },
  ];

  return {
    id: generateId(),
    name: 'AI 智能生成',
    description: `AI 分析用户请求并执行相应操作`,
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
 * 从 AI 响应解析工作流步骤
 * 
 * AI 返回的格式：
 * {"content": "分析结果", "next": [{"mcp": "工具名", "args": {...}}]}
 */
export function parseAIResponseToSteps(
  response: string,
  existingStepCount: number = 0
): WorkflowStep[] {
  try {
    // 尝试提取 JSON
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || 
                      response.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      return [];
    }
    
    const jsonStr = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(jsonStr);
    
    if (!Array.isArray(parsed.next) || parsed.next.length === 0) {
      return [];
    }
    
    return parsed.next
      .filter((item: any) => typeof item.mcp === 'string' && typeof item.args === 'object')
      .map((item: any, index: number) => ({
        id: `step-${existingStepCount + index + 1}`,
        mcp: item.mcp,
        args: item.args,
        description: getStepDescription(item.mcp, item.args),
        status: 'pending' as const,
      }));
  } catch {
    return [];
  }
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
 * 向工作流添加新步骤
 */
export function addStepsToWorkflow(
  workflow: WorkflowDefinition,
  newSteps: WorkflowStep[]
): WorkflowDefinition {
  return {
    ...workflow,
    steps: [...workflow.steps, ...newSteps],
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
