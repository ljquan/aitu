/**
 * 视频生成 MCP 工具
 *
 * 封装现有的视频生成服务，提供标准化的 MCP 工具接口
 * 支持两种执行模式：
 * - async: 直接调用 API 等待返回（Agent 流程）
 * - queue: 创建任务加入队列（直接生成流程）
 */

import type { MCPTool, MCPResult, MCPExecuteOptions, MCPTaskResult } from '../types';
import { videoAPIService } from '../../services/video-api-service';
import { taskQueueService } from '../../services/task-queue-service';
import { TaskType } from '../../types/task.types';
import type { VideoModel } from '../../types/video.types';
import { VIDEO_MODEL_CONFIGS } from '../../constants/video-model-config';
import { VIDEO_MODELS, DEFAULT_VIDEO_MODEL } from '../../constants/model-config';

/**
 * 生成视频模型的描述文本
 */
function getVideoModelDescription(): string {
  return VIDEO_MODELS.map(m => `- ${m.id}${m.isVip ? '（推荐）' : ''}${m.description ? `：${m.description}` : ''}`).join('\n');
}

/**
 * 获取视频模型 ID 列表
 */
function getVideoModelIds(): string[] {
  return VIDEO_MODELS.map(m => m.id);
}

/**
 * 获取所有可用的视频时长选项（去重）
 */
function getVideoDurationOptions(): string[] {
  const durations = new Set<string>();
  Object.values(VIDEO_MODEL_CONFIGS).forEach(config => {
    config.durationOptions.forEach(opt => durations.add(opt.value));
  });
  return Array.from(durations).sort((a, b) => parseInt(a) - parseInt(b));
}

/**
 * 获取所有可用的视频尺寸选项（去重）
 */
function getVideoSizeOptions(): string[] {
  const sizes = new Set<string>();
  Object.values(VIDEO_MODEL_CONFIGS).forEach(config => {
    config.sizeOptions.forEach(opt => sizes.add(opt.value));
  });
  return Array.from(sizes);
}

/**
 * 视频生成参数
 */
export interface VideoGenerationParams {
  /** 视频描述提示词 */
  prompt: string;
  /** 视频模型 */
  model?: VideoModel;
  /** 视频时长（秒） */
  seconds?: string;
  /** 视频尺寸 */
  size?: string;
  /** 参考图片 URL 列表 */
  referenceImages?: string[];
  /** 生成数量（仅 queue 模式支持） */
  count?: number;
}

/**
 * 直接调用 API 生成视频（async 模式）
 */
async function executeAsync(params: VideoGenerationParams): Promise<MCPResult> {
  const {
    prompt,
    model = 'veo3',
    seconds = '8',
    size = '1280x720',
    referenceImages,
  } = params;

  if (!prompt || typeof prompt !== 'string') {
    return {
      success: false,
      error: '缺少必填参数 prompt',
      type: 'error',
    };
  }

  try {
    console.log('[VideoGenerationTool] Generating video with params:', {
      prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
      model,
      seconds,
      size,
      referenceImages: referenceImages?.length || 0,
    });

    // 准备参考图片
    let inputReferences: Array<{ type: 'url'; url: string }> | undefined;
    if (referenceImages && referenceImages.length > 0) {
      inputReferences = referenceImages.map((url) => ({
        type: 'url' as const,
        url,
      }));
    }

    // 调用视频生成 API（带轮询）
    const result = await videoAPIService.generateVideoWithPolling(
      {
        model: model as VideoModel,
        prompt,
        seconds,
        size,
        inputReferences,
      },
      {
        interval: 5000, // 每 5 秒轮询一次
        onProgress: (progress, status) => {
          console.log(`[VideoGenerationTool] Progress: ${progress}% (${status})`);
        },
      }
    );

    console.log('[VideoGenerationTool] Generation completed:', result);

    // 提取视频 URL
    const videoUrl = result.video_url || result.url;
    if (!videoUrl) {
      return {
        success: false,
        error: 'API 未返回有效的视频 URL',
        type: 'error',
      };
    }

    return {
      success: true,
      data: {
        url: videoUrl,
        format: 'mp4',
        prompt,
        model,
        seconds,
        size,
      },
      type: 'video',
    };
  } catch (error: any) {
    console.error('[VideoGenerationTool] Generation failed:', error);

    // 提取更详细的错误信息
    let errorMessage = error.message || '视频生成失败';
    if (error.apiErrorBody) {
      errorMessage = `${errorMessage} - ${JSON.stringify(error.apiErrorBody)}`;
    }

    return {
      success: false,
      error: errorMessage,
      type: 'error',
    };
  }
}

/**
 * 创建任务加入队列（queue 模式）
 * 支持批量创建任务（通过 count 参数）
 */
function executeQueue(params: VideoGenerationParams, options: MCPExecuteOptions): MCPTaskResult {
  const { prompt, model = 'veo3', seconds, size, referenceImages, count = 1 } = params;

  if (!prompt || typeof prompt !== 'string') {
    return {
      success: false,
      error: '缺少必填参数 prompt',
      type: 'error',
    };
  }

  try {
    // 获取模型默认配置
    const modelConfig = VIDEO_MODEL_CONFIGS[model as VideoModel] || VIDEO_MODEL_CONFIGS['veo3'];

    // 将参考图片转换为 uploadedImages 格式
    const uploadedImages = referenceImages?.map((url, index) => ({
      type: 'url' as const,
      url,
      name: `reference-${index + 1}`,
    }));

    // 生成批次 ID（如果有多个任务）
    const actualCount = Math.min(Math.max(1, count), 10); // 限制 1-10 个
    const batchId = actualCount > 1 ? `batch_${Date.now()}` : options.batchId;

    const createdTasks: any[] = [];

    // 创建任务（支持批量）
    for (let i = 0; i < actualCount; i++) {
      const task = taskQueueService.createTask(
        {
          prompt,
          size: size || '16x9',
          duration: parseInt(seconds || modelConfig.defaultDuration, 10),
          model,
          uploadedImages: uploadedImages && uploadedImages.length > 0 ? uploadedImages : undefined,
          // 批量参数
          batchId: batchId,
          batchIndex: i + 1,
          batchTotal: actualCount,
          globalIndex: options.globalIndex ? options.globalIndex + i : i + 1,
        },
        TaskType.VIDEO
      );
      createdTasks.push(task);
      console.log(`[VideoGenerationTool] Created task ${i + 1}/${actualCount}:`, task.id);
    }

    const firstTask = createdTasks[0];

    return {
      success: true,
      data: {
        taskId: firstTask.id,
        taskIds: createdTasks.map(t => t.id),
        prompt,
        size: size || '16x9',
        duration: parseInt(seconds || modelConfig.defaultDuration, 10),
        model,
        count: actualCount,
      },
      type: 'video',
      taskId: firstTask.id,
      task: firstTask,
    };
  } catch (error: any) {
    console.error('[VideoGenerationTool] Failed to create task:', error);

    return {
      success: false,
      error: error.message || '创建任务失败',
      type: 'error',
    };
  }
}

/**
 * 视频生成 MCP 工具定义
 */
export const videoGenerationTool: MCPTool = {
  name: 'generate_video',
  description: `生成视频工具。根据用户的文字描述生成视频。

使用场景：
- 用户想要创建、生成视频
- 用户描述了想要的视频内容、动作、场景
- 用户提供了图片并想要将其转换为视频（图生视频）
- 用户明确提到"视频"、"动画"、"动态"等关键词

不适用场景：
- 用户想要生成静态图片（使用 generate_image 工具）
- 用户只是在聊天，没有生成视频的意图

可用模型：
${getVideoModelDescription()}`,

  inputSchema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: '视频描述提示词，详细描述想要生成的视频内容、动作、场景、风格等',
      },
      model: {
        type: 'string',
        description: '视频生成模型',
        enum: getVideoModelIds(),
        default: DEFAULT_VIDEO_MODEL,
      },
      seconds: {
        type: 'string',
        description: '视频时长（秒），不同模型支持的时长不同',
        enum: getVideoDurationOptions(),
        default: '8',
      },
      size: {
        type: 'string',
        description: '视频尺寸',
        enum: getVideoSizeOptions(),
        default: '1280x720',
      },
      referenceImages: {
        type: 'array',
        description: '参考图片 URL 列表，用于图生视频',
        items: {
          type: 'string',
        },
      },
      count: {
        type: 'number',
        description: '生成数量，1-10 之间，默认为 1',
        default: 1,
      },
    },
    required: ['prompt'],
  },

  supportedModes: ['async', 'queue'],

  execute: async (params: Record<string, unknown>, options?: MCPExecuteOptions): Promise<MCPResult> => {
    const typedParams = params as unknown as VideoGenerationParams;
    const mode = options?.mode || 'async';

    if (mode === 'queue') {
      return executeQueue(typedParams, options || {});
    }

    return executeAsync(typedParams);
  },
};

/**
 * 便捷方法：直接生成视频（async 模式）
 */
export async function generateVideo(params: VideoGenerationParams): Promise<MCPResult> {
  return videoGenerationTool.execute(params as unknown as Record<string, unknown>, { mode: 'async' });
}

/**
 * 便捷方法：创建视频生成任务（queue 模式）
 */
export function createVideoTask(
  params: VideoGenerationParams,
  options?: Omit<MCPExecuteOptions, 'mode'>
): MCPTaskResult {
  return videoGenerationTool.execute(params as unknown as Record<string, unknown>, {
    ...options,
    mode: 'queue',
  }) as unknown as MCPTaskResult;
}
