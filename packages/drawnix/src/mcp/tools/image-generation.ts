/**
 * 图片生成 MCP 工具
 *
 * 封装现有的图片生成服务，提供标准化的 MCP 工具接口
 * 支持两种执行模式：
 * - async: 直接调用 API 等待返回（Agent 流程）
 * - queue: 创建任务加入队列（直接生成流程）
 */

import type { MCPTool, MCPResult, MCPExecuteOptions, MCPTaskResult } from '../types';
import { defaultGeminiClient } from '../../utils/gemini-api';
import { taskQueueService } from '../../services/task-queue-service';
import { TaskType } from '../../types/task.types';

/**
 * 图片生成参数
 */
export interface ImageGenerationParams {
  /** 图片描述提示词 */
  prompt: string;
  /** 图片尺寸，格式如 '1x1', '16x9', '9x16' */
  size?: string;
  /** 参考图片 URL 列表 */
  referenceImages?: string[];
  /** 图片质量 */
  quality?: '1k' | '2k' | '4k';
  /** AI 模型 */
  model?: string;
  /** 生成数量（仅 queue 模式支持） */
  count?: number;
}

/**
 * 直接调用 API 生成图片（async 模式）
 */
async function executeAsync(params: ImageGenerationParams): Promise<MCPResult> {
  const { prompt, size, referenceImages, quality } = params;

  if (!prompt || typeof prompt !== 'string') {
    return {
      success: false,
      error: '缺少必填参数 prompt',
      type: 'error',
    };
  }

  try {
    console.log('[ImageGenerationTool] Generating image with params:', {
      prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
      size,
      referenceImages: referenceImages?.length || 0,
      quality,
    });

    // 调用 Gemini 图片生成 API
    const result = await defaultGeminiClient.generateImage(prompt, {
      size: size || '1x1',
      image: referenceImages && referenceImages.length > 0 ? referenceImages : undefined,
      response_format: 'url',
      quality: quality || '1k',
    });

    console.log('[ImageGenerationTool] Generation response:', result);

    // 解析响应
    if (result.data && Array.isArray(result.data) && result.data.length > 0) {
      const imageData = result.data[0];
      let imageUrl: string;

      if (imageData.url) {
        imageUrl = imageData.url;
      } else if (imageData.b64_json) {
        imageUrl = `data:image/png;base64,${imageData.b64_json}`;
      } else {
        return {
          success: false,
          error: 'API 未返回有效的图片数据',
          type: 'error',
        };
      }

      return {
        success: true,
        data: {
          url: imageUrl,
          format: 'png',
          prompt,
          size: size || '1x1',
        },
        type: 'image',
      };
    }

    return {
      success: false,
      error: 'API 未返回有效的图片数据',
      type: 'error',
    };
  } catch (error: any) {
    console.error('[ImageGenerationTool] Generation failed:', error);

    // 提取更详细的错误信息
    let errorMessage = error.message || '图片生成失败';
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
function executeQueue(params: ImageGenerationParams, options: MCPExecuteOptions): MCPTaskResult {
  const { prompt, size, referenceImages, model, count = 1 } = params;

  if (!prompt || typeof prompt !== 'string') {
    return {
      success: false,
      error: '缺少必填参数 prompt',
      type: 'error',
    };
  }

  try {
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
          size: size || '1x1',
          uploadedImages: uploadedImages && uploadedImages.length > 0 ? uploadedImages : undefined,
          model: model || 'imagen-3.0-generate-002',
          // 批量参数
          batchId: batchId,
          batchIndex: i + 1,
          batchTotal: actualCount,
          globalIndex: options.globalIndex ? options.globalIndex + i : i + 1,
        },
        TaskType.IMAGE
      );
      createdTasks.push(task);
      console.log(`[ImageGenerationTool] Created task ${i + 1}/${actualCount}:`, task.id);
    }

    const firstTask = createdTasks[0];

    return {
      success: true,
      data: {
        taskId: firstTask.id,
        taskIds: createdTasks.map(t => t.id),
        prompt,
        size: size || '1x1',
        model: model || 'imagen-3.0-generate-002',
        count: actualCount,
      },
      type: 'image',
      taskId: firstTask.id,
      task: firstTask,
    };
  } catch (error: any) {
    console.error('[ImageGenerationTool] Failed to create task:', error);

    return {
      success: false,
      error: error.message || '创建任务失败',
      type: 'error',
    };
  }
}

/**
 * 图片生成 MCP 工具定义
 */
export const imageGenerationTool: MCPTool = {
  name: 'generate_image',
  description: `生成图片工具。根据用户的文字描述生成图片。

使用场景：
- 用户想要创建、生成、绘制图片
- 用户描述了想要的图片内容
- 用户提供了参考图片并想要生成类似或修改后的图片

不适用场景：
- 用户想要生成视频（使用 generate_video 工具）
- 用户只是在聊天，没有生成图片的意图`,

  inputSchema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: '图片描述提示词，详细描述想要生成的图片内容、风格、构图等',
      },
      size: {
        type: 'string',
        description: '图片尺寸比例，可选值：1x1（正方形）、16x9（横向）、9x16（纵向）、3x2、2x3、4x3、3x4',
        enum: ['1x1', '16x9', '9x16', '3x2', '2x3', '4x3', '3x4', '4x5', '5x4'],
        default: '1x1',
      },
      referenceImages: {
        type: 'array',
        description: '参考图片 URL 列表，用于图生图或风格参考',
        items: {
          type: 'string',
        },
      },
      quality: {
        type: 'string',
        description: '图片质量，可选值：1k、2k、4k',
        enum: ['1k', '2k', '4k'],
        default: '1k',
      },
      model: {
        type: 'string',
        description: '图片生成模型',
        default: 'imagen-3.0-generate-002',
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
    const typedParams = params as unknown as ImageGenerationParams;
    const mode = options?.mode || 'async';

    if (mode === 'queue') {
      return executeQueue(typedParams, options || {});
    }

    return executeAsync(typedParams);
  },
};

/**
 * 便捷方法：直接生成图片（async 模式）
 */
export async function generateImage(params: ImageGenerationParams): Promise<MCPResult> {
  return imageGenerationTool.execute(params as unknown as Record<string, unknown>, { mode: 'async' });
}

/**
 * 便捷方法：创建图片生成任务（queue 模式）
 */
export function createImageTask(
  params: ImageGenerationParams,
  options?: Omit<MCPExecuteOptions, 'mode'>
): MCPTaskResult {
  return imageGenerationTool.execute(params as unknown as Record<string, unknown>, {
    ...options,
    mode: 'queue',
  }) as unknown as MCPTaskResult;
}
