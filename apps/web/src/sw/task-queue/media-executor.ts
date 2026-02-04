/**
 * SW Media Executor
 *
 * 统一的媒体生成执行器，供 channel-manager 和 workflow-executor 复用
 * 避免重复的执行逻辑
 */

import type { GeminiConfig, VideoAPIConfig } from './types';
import { TaskStatus } from './types';
import type { MCPResult } from './workflow-types';

/**
 * 媒体执行配置
 */
export interface MediaExecutorConfig {
  geminiConfig: GeminiConfig;
  videoConfig: VideoAPIConfig;
  onProgress?: (progress: number, phase?: string) => void;
  onRemoteId?: (remoteId: string) => void;
  signal?: AbortSignal;
}

/**
 * 媒体执行结果
 */
export interface MediaExecutorResult {
  success: boolean;
  data?: unknown;
  error?: string;
  /** AI 分析返回的动态步骤 */
  addSteps?: Array<{
    id: string;
    mcp: string;
    args: Record<string, unknown>;
    description: string;
    status: 'pending';
  }>;
}

/**
 * 执行图片生成
 */
export async function executeImageGeneration(
  params: Record<string, unknown>,
  config: MediaExecutorConfig
): Promise<MediaExecutorResult> {
  const { generateImageTool } = await import('./mcp/tools');

  const toolConfig = {
    geminiConfig: config.geminiConfig,
    videoConfig: config.videoConfig,
    onProgress: config.onProgress || (() => {}),
    onRemoteId: config.onRemoteId,
    signal: config.signal,
  };

  try {
    const result = await generateImageTool.execute(params, toolConfig);
    return {
      success: result.success,
      data: result.data,
      error: result.error,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Image generation failed',
    };
  }
}

/**
 * 执行视频生成
 */
export async function executeVideoGeneration(
  params: Record<string, unknown>,
  config: MediaExecutorConfig
): Promise<MediaExecutorResult> {
  const { generateVideoTool } = await import('./mcp/tools');

  const toolConfig = {
    geminiConfig: config.geminiConfig,
    videoConfig: config.videoConfig,
    onProgress: config.onProgress || (() => {}),
    onRemoteId: config.onRemoteId,
    signal: config.signal,
  };

  try {
    const result = await generateVideoTool.execute(params, toolConfig);
    return {
      success: result.success,
      data: result.data,
      error: result.error,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Video generation failed',
    };
  }
}

/**
 * 执行 AI 分析
 */
export async function executeAIAnalyze(
  params: Record<string, unknown>,
  config: MediaExecutorConfig
): Promise<MediaExecutorResult> {
  const { aiAnalyzeTool } = await import('./mcp/ai-analyze');

  const toolConfig = {
    geminiConfig: config.geminiConfig,
    videoConfig: config.videoConfig,
    onProgress: config.onProgress || (() => {}),
    onRemoteId: config.onRemoteId,
    signal: config.signal,
  };

  try {
    const result = await aiAnalyzeTool.execute(params, toolConfig);
    console.log('[SW:executeAIAnalyze] Result:', {
      success: result.success,
      addStepsCount: result.addSteps?.length ?? 0,
    });
    return {
      success: result.success,
      data: result.data,
      error: result.error,
      // 传递 AI 分析返回的动态步骤
      addSteps: result.addSteps,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'AI analyze failed',
    };
  }
}

/**
 * 根据类型执行媒体任务
 */
export async function executeMediaTask(
  type: 'image' | 'video' | 'ai_analyze',
  params: Record<string, unknown>,
  config: MediaExecutorConfig
): Promise<MediaExecutorResult> {
  switch (type) {
    case 'image':
      return executeImageGeneration(params, config);
    case 'video':
      return executeVideoGeneration(params, config);
    case 'ai_analyze':
      return executeAIAnalyze(params, config);
    default:
      return {
        success: false,
        error: `Unknown media type: ${type}`,
      };
  }
}

/**
 * 执行 MCP 工具（用于工作流步骤）
 * 返回 MCPResult 格式，与现有接口兼容
 */
export async function executeMCPToolForWorkflow(
  toolName: string,
  args: Record<string, unknown>,
  config: MediaExecutorConfig
): Promise<MCPResult> {
  // 根据工具名称映射到媒体类型
  const toolTypeMap: Record<string, 'image' | 'video' | 'ai_analyze'> = {
    generate_image: 'image',
    generate_video: 'video',
    ai_analyze: 'ai_analyze',
  };

  const mediaType = toolTypeMap[toolName];

  if (mediaType) {
    const result = await executeMediaTask(mediaType, args, config);
    return {
      success: result.success,
      data: result.data,
      error: result.error,
      type: mediaType === 'image' ? 'image' : mediaType === 'video' ? 'video' : 'text',
      // 传递 ai_analyze 返回的 addSteps
      addSteps: result.addSteps,
    };
  }

  // 非媒体工具，使用原有的 executeSWMCPTool
  const { executeSWMCPTool } = await import('./mcp/tools');
  return executeSWMCPTool(toolName, args, {
    geminiConfig: config.geminiConfig,
    videoConfig: config.videoConfig,
    onProgress: config.onProgress || (() => {}),
    onRemoteId: config.onRemoteId,
    signal: config.signal,
  });
}
