/**
 * MCP Tools for Service Worker
 *
 * All MCP tools run in the Service Worker context.
 * Tools that need DOM/Board operations use delegation pattern
 * to request execution from the main thread.
 *
 * 使用通用的媒体生成工具函数来减少重复代码
 */

import type { SWMCPTool, SWMCPToolConfig, MCPResult } from '../workflow-types';
import { TaskExecutionPhase } from '../types';
import {
  buildImageGenerationRequestBody,
  parseImageGenerationResponse,
  pollVideoUntilComplete,
} from '../utils/media-generation-utils';
import { aiAnalyzeTool } from './ai-analyze';

// ============================================================================
// Image Generation Tool
// ============================================================================

/**
 * Generate image using Gemini API
 */
export const generateImageTool: SWMCPTool = {
  name: 'generate_image',
  description: 'Generate images using AI',

  async execute(args, config): Promise<MCPResult> {
    const { geminiConfig, onProgress, signal } = config;
    const { prompt, size, referenceImages, quality, model, count = 1 } = args as {
      prompt: string;
      size?: string;
      referenceImages?: string[];
      quality?: '1k' | '2k' | '4k';
      model?: string;
      count?: number;
    };

    if (!prompt) {
      return { success: false, error: '缺少必填参数 prompt', type: 'error' };
    }

    try {
      onProgress?.(0, TaskExecutionPhase.SUBMITTING);

      // 使用通用函数构建请求体
      const requestBody = buildImageGenerationRequestBody(
        {
          prompt,
          model,
          size,
          referenceImages,
          quality,
          n: Math.min(Math.max(1, count), 10),
        },
        geminiConfig.modelName
      );

      onProgress?.(10, TaskExecutionPhase.SUBMITTING);

      // Make API request (using debugFetch for logging)
      const { debugFetch } = await import('../debug-fetch');
      const response = await debugFetch(`${geminiConfig.baseUrl}/images/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${geminiConfig.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal,
      }, {
        label: `🎨 生成图片 (${geminiConfig.modelName})`,
        logRequestBody: true,
        logResponseBody: true,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[SW:generateImage] ✗ API error:', response.status, errorText.substring(0, 200));
        throw new Error(`Image generation failed: ${response.status} - ${errorText}`);
      }

      onProgress?.(80, TaskExecutionPhase.DOWNLOADING);

      const data = await response.json();

      // 使用通用函数解析响应（异步：Base64 会被缓存为虚拟路径 URL）
      const { url, urls } = await parseImageGenerationResponse(data);

      onProgress?.(100);

      return {
        success: true,
        type: 'image',
        data: {
          url,
          urls,
          format: 'png',
          prompt,
          size: size || '1x1',
        },
      };
    } catch (error: any) {
      console.error('[SW:generateImage] Error:', error);
      return {
        success: false,
        error: error.message || '图片生成失败',
        type: 'error',
      };
    }
  },
};

// ============================================================================
// Video Generation Tool
// ============================================================================

/**
 * Generate video using Video API
 */
export const generateVideoTool: SWMCPTool = {
  name: 'generate_video',
  description: 'Generate videos using AI',

  async execute(args, config): Promise<MCPResult> {
    const { videoConfig, onProgress, onRemoteId, signal } = config;
    const {
      prompt,
      model = 'veo3',
      seconds = '8',
      size = '1280x720',
      inputReference,
      inputReferences,
      referenceImages,
    } = args as {
      prompt: string;
      model?: string;
      seconds?: string;
      size?: string;
      inputReference?: string;
      inputReferences?: any[];
      referenceImages?: string[];
    };

    if (!prompt) {
      return { success: false, error: '缺少必填参数 prompt', type: 'error' };
    }

    try {
      onProgress?.(0, TaskExecutionPhase.SUBMITTING);

      // Prepare request body
      const requestBody: Record<string, unknown> = {
        model,
        prompt,
        seconds,
        size,
      };

      // Handle reference images - 合并所有来源
      const refUrls: string[] = [];
      if (inputReferences && inputReferences.length > 0) {
        inputReferences.forEach(ref => {
          const url = typeof ref === 'string' ? ref : ref?.url;
          if (url) refUrls.push(url);
        });
      } else if (referenceImages && referenceImages.length > 0) {
        refUrls.push(...referenceImages);
      } else if (inputReference) {
        refUrls.push(inputReference);
      }

      if (refUrls.length > 0) {
        if (refUrls.length === 1) {
          requestBody.input_reference = refUrls[0];
        } else {
          requestBody.input_references = refUrls;
        }
      }

      // Submit video generation request (using debugFetch for logging)
      const { debugFetch: debugFetchVideo } = await import('../debug-fetch');
      const submitResponse = await debugFetchVideo(`${videoConfig.baseUrl}/videos/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(videoConfig.apiKey ? { Authorization: `Bearer ${videoConfig.apiKey}` } : {}),
        },
        body: JSON.stringify(requestBody),
        signal,
      }, {
        label: `🎬 提交视频生成 (${videoConfig.model || 'default'})`,
        logRequestBody: true,
        logResponseBody: true,
      });

      if (!submitResponse.ok) {
        const errorText = await submitResponse.text();
        console.error('[SW:generateVideo] ✗ Submit failed:', submitResponse.status, errorText.substring(0, 200));
        throw new Error(`Video submission failed: ${submitResponse.status} - ${errorText}`);
      }

      const submitData = await submitResponse.json();
      const videoId = submitData.id || submitData.video_id;

      if (!videoId) {
        console.error('[SW:generateVideo] ✗ No video ID in response:', submitData);
        throw new Error('No video ID in response');
      }

      // Notify about remote ID for recovery
      onRemoteId?.(videoId);
      onProgress?.(10, TaskExecutionPhase.POLLING);

      // 使用通用轮询函数
      const result = await pollVideoUntilComplete(
        videoConfig.baseUrl,
        videoId,
        {
          onProgress,
          signal,
          apiKey: videoConfig.apiKey,
        }
      );

      return {
        success: true,
        type: 'video',
        data: {
          url: result.video_url || result.url,
          format: 'mp4',
          prompt,
          duration: parseInt(result.seconds || '') || parseInt(seconds),
        },
      };
    } catch (error: any) {
      console.error('[SW:generateVideo] ✗ Error:', error.message);
      return {
        success: false,
        error: error.message || '视频生成失败',
        type: 'error',
      };
    }
  },
};

// ============================================================================
// Tool Registry
// ============================================================================

/**
 * All available MCP tools in SW
 *
 * Note: Only tools that can be executed directly in SW are registered here.
 * Tools requiring main thread (DOM/Board access) are handled by requiresMainThread()
 * check in workflow-executor.ts, which delegates them to main thread directly.
 *
 * ai_analyze now runs in SW using textModelName configuration.
 */
export const swMCPTools: Map<string, SWMCPTool> = new Map([
  ['generate_image', generateImageTool],
  ['generate_video', generateVideoTool],
  ['ai_analyze', aiAnalyzeTool],
]);

/**
 * Get a tool by name
 */
export function getSWMCPTool(name: string): SWMCPTool | undefined {
  return swMCPTools.get(name);
}

/**
 * Execute a tool by name
 */
export async function executeSWMCPTool(
  name: string,
  args: Record<string, unknown>,
  config: SWMCPToolConfig
): Promise<MCPResult> {
  const tool = swMCPTools.get(name);
  if (!tool) {
    return {
      success: false,
      error: `Unknown tool: ${name}`,
      type: 'error',
    };
  }
  return tool.execute(args, config);
}

/**
 * Canvas 操作工具（必须在主线程执行，需要访问 DOM/Canvas）
 * 这些工具会被标记为 pending_main_thread，由主线程轮询 IndexedDB 后执行
 */
const CANVAS_TOOLS = [
  'canvas_insert',
  'insert_to_canvas', // alias for canvas_insert
  'insert_mermaid',
  'insert_mindmap',
  'insert_svg',
];

/**
 * 媒体生成工具（可在 SW 执行，但为了任务队列集成委托给主线程）
 */
const MEDIA_GENERATION_TOOLS = [
  'generate_image',
  'generate_video',
  'generate_grid_image',
  'generate_inspiration_board',
  'split_image',
  'generate_long_video',
];

/**
 * 检查工具是否必须在主线程执行（Canvas 操作）
 * 这些工具将被标记为 pending_main_thread，由主线程轮询执行
 */
export function isCanvasTool(toolName: string): boolean {
  return CANVAS_TOOLS.includes(toolName);
}

/**
 * 检查工具是否是媒体生成工具
 */
export function isMediaGenerationTool(toolName: string): boolean {
  return MEDIA_GENERATION_TOOLS.includes(toolName);
}

/**
 * Check if a tool requires main thread delegation
 *
 * Note: generate_image and generate_video are delegated to main thread
 * to use the task queue system, which enables:
 * - Task status tracking
 * - Workflow step status synchronization
 * - Task recovery on page reload
 *
 * ai_analyze now runs in SW using textModelName configuration.
 */
export function requiresMainThread(toolName: string): boolean {
  return isCanvasTool(toolName) || isMediaGenerationTool(toolName);
}
