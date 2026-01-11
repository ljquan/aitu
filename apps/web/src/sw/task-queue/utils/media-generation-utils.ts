/**
 * Media Generation Utilities
 *
 * 通用的媒体生成工具函数，用于图片和视频生成的共享逻辑
 * 包括：
 * - 尺寸转换
 * - 参考图片提取
 * - 视频轮询
 * - 图片缓存获取
 */

import type { TaskExecutionPhase } from '../types';

// ============================================================================
// Size Conversion
// ============================================================================

/**
 * 宽高比到像素尺寸的映射表
 */
const ASPECT_RATIO_TO_SIZE: Record<string, string> = {
  '1x1': '1024x1024',
  '16x9': '1792x1024',
  '9x16': '1024x1792',
  '4x3': '1536x1152',
  '3x4': '1152x1536',
  '3x2': '1536x1024',
  '2x3': '1024x1536',
};

/**
 * 将宽高比转换为像素尺寸
 * @param aspectRatio 宽高比字符串，如 '1x1', '16x9'
 * @returns 像素尺寸字符串，如 '1024x1024'
 */
export function convertAspectRatioToSize(aspectRatio: string): string {
  return ASPECT_RATIO_TO_SIZE[aspectRatio] || aspectRatio;
}

// ============================================================================
// Reference Image Extraction
// ============================================================================

/**
 * 上传图片的类型定义
 */
interface UploadedImage {
  type?: string;
  url?: string;
  name?: string;
}

/**
 * 输入引用的类型定义
 */
interface InputReference {
  url?: string;
  [key: string]: unknown;
}

/**
 * 从 uploadedImages 数组中提取 URL
 * @param uploadedImages 上传图片数组
 * @returns URL 数组或 undefined
 */
export function extractUrlsFromUploadedImages(
  uploadedImages: unknown
): string[] | undefined {
  if (!uploadedImages || !Array.isArray(uploadedImages)) {
    return undefined;
  }

  const urls = uploadedImages
    .filter((img): img is UploadedImage => 
      img && typeof img === 'object' && typeof (img as UploadedImage).url === 'string'
    )
    .map((img) => img.url as string);

  return urls.length > 0 ? urls : undefined;
}

/**
 * 合并所有可能的参考图片来源
 * 支持多种参数格式：referenceImages, uploadedImages, inputReference, inputReferences
 * @param params 包含参考图片的参数对象
 * @returns 合并后的 URL 数组
 */
export function mergeReferenceImages(params: {
  referenceImages?: string[];
  uploadedImages?: UploadedImage[];
  inputReference?: string;
  inputReferences?: InputReference[];
}): string[] {
  const urls: string[] = [];

  // 1. 从 inputReferences 提取
  if (Array.isArray(params.inputReferences)) {
    for (const ref of params.inputReferences) {
      if (ref?.url) {
        urls.push(String(ref.url));
      }
    }
  }

  // 2. 从 inputReference 提取
  if (params.inputReference) {
    urls.push(String(params.inputReference));
  }

  // 3. 从 uploadedImages 提取
  if (Array.isArray(params.uploadedImages)) {
    for (const img of params.uploadedImages) {
      if (img && typeof img === 'object' && img.url) {
        urls.push(String(img.url));
      }
    }
  }

  // 4. 从 referenceImages 提取
  if (Array.isArray(params.referenceImages)) {
    for (const url of params.referenceImages) {
      if (typeof url === 'string') {
        urls.push(url);
      }
    }
  }

  return urls;
}

// ============================================================================
// Video Polling
// ============================================================================

/**
 * 视频状态响应
 */
export interface VideoStatusResponse {
  id: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed' | 'succeeded' | 'error';
  progress?: number;
  video_url?: string;
  url?: string;
  width?: number;
  height?: number;
  seconds?: string;
  error?: string | { code: string; message: string };
  message?: string;
}

/**
 * 视频轮询配置
 */
export interface VideoPollingOptions {
  /** 进度回调 */
  onProgress?: (progress: number, phase?: TaskExecutionPhase) => void;
  /** 取消信号 */
  signal?: AbortSignal;
  /** API Key */
  apiKey?: string;
  /** 轮询间隔（毫秒），默认 5000 */
  interval?: number;
  /** 最大尝试次数，默认 1080（90分钟） */
  maxAttempts?: number;
}

/**
 * 轮询视频生成状态直到完成
 * @param baseUrl API 基础 URL
 * @param videoId 视频 ID
 * @param options 轮询配置
 * @returns 完成的视频状态响应
 */
export async function pollVideoUntilComplete(
  baseUrl: string,
  videoId: string,
  options: VideoPollingOptions = {}
): Promise<VideoStatusResponse> {
  const {
    onProgress,
    signal,
    apiKey,
    interval = 5000,
    maxAttempts = 1080,
  } = options;

  let attempts = 0;

  while (attempts < maxAttempts) {
    if (signal?.aborted) {
      throw new Error('Video generation cancelled');
    }

    const response = await fetch(`${baseUrl}/videos/${videoId}`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to get video status: ${response.status}`);
    }

    const data: VideoStatusResponse = await response.json();
    const status = data.status?.toLowerCase() as VideoStatusResponse['status'];

    // 更新进度
    const progress = data.progress ?? Math.min(10 + attempts * 2, 90);
    onProgress?.(progress, 'polling' as TaskExecutionPhase);

    // 检查完成状态
    if (status === 'completed' || status === 'succeeded') {
      onProgress?.(100);
      return data;
    }

    // 检查失败状态
    if (status === 'failed' || status === 'error') {
      const errorMsg = typeof data.error === 'string'
        ? data.error
        : data.error?.message || data.message || 'Video generation failed';
      throw new Error(errorMsg);
    }

    // 等待下一次轮询
    await new Promise((resolve) => setTimeout(resolve, interval));
    attempts++;
  }

  throw new Error('Video generation timed out');
}

/**
 * 查询视频状态（单次）
 * @param baseUrl API 基础 URL
 * @param videoId 视频 ID
 * @param apiKey API Key
 * @param signal 取消信号
 * @returns 视频状态响应
 */
export async function queryVideoStatus(
  baseUrl: string,
  videoId: string,
  apiKey?: string,
  signal?: AbortSignal
): Promise<VideoStatusResponse> {
  const response = await fetch(`${baseUrl}/videos/${videoId}`, {
    method: 'GET',
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
    signal,
  });

  if (!response.ok) {
    throw new Error(`Video status query failed: ${response.status}`);
  }

  return response.json();
}

// ============================================================================
// Image Cache
// ============================================================================

const IMAGE_CACHE_NAME = 'drawnix-images';

/**
 * 从缓存或网络获取图片
 * 优先从 Cache API 获取，失败时回退到网络请求
 * 对于 data: URL (base64)，直接转换为 Blob
 * @param url 图片 URL
 * @param signal 取消信号
 * @returns Blob 或 null
 */
export async function fetchImageWithCache(
  url: string,
  signal?: AbortSignal
): Promise<Blob | null> {
  try {
    // 处理 data: URL (base64)
    if (url.startsWith('data:')) {
      return dataUrlToBlob(url);
    }

    // 1. 先尝试从缓存获取
    const cache = await caches.open(IMAGE_CACHE_NAME);
    const cachedResponse = await cache.match(url);

    if (cachedResponse) {
      // console.log(`[MediaUtils] Cache hit for image: ${url.substring(0, 50)}...`);
      return await cachedResponse.blob();
    }

    // 2. 缓存未命中，从网络获取
    // console.log(`[MediaUtils] Cache miss, fetching from network: ${url.substring(0, 50)}...`);
    const response = await fetch(url, { signal });

    if (response.ok) {
      const blob = await response.blob();
      // 将获取的图片存入缓存以备后用
      try {
        const cacheResponse = new Response(blob.slice(), {
          headers: {
            'Content-Type': blob.type || 'image/png',
            'sw-cache-date': Date.now().toString(),
          },
        });
        await cache.put(url, cacheResponse);
      } catch (cacheErr) {
        console.warn(`[MediaUtils] Failed to cache image: ${url.substring(0, 50)}...`, cacheErr);
      }
      return blob;
    }

    console.warn(`[MediaUtils] Network fetch failed: ${url.substring(0, 50)}...`, response.status);
    return null;
  } catch (err) {
    console.warn(`[MediaUtils] Error in fetchImageWithCache: ${url.substring(0, 50)}...`, err);
    return null;
  }
}

/**
 * 将 data URL (base64) 转换为 Blob
 * @param dataUrl data URL 字符串
 * @returns Blob 或 null
 */
export function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    const [header, base64Data] = dataUrl.split(',');
    if (!base64Data) return null;

    const mimeMatch = header.match(/data:([^;]+)/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';

    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return new Blob([bytes], { type: mimeType });
  } catch (err) {
    console.warn('[MediaUtils] Failed to convert data URL to Blob:', err);
    return null;
  }
}

// ============================================================================
// API Request Helpers
// ============================================================================

/**
 * 图片生成请求参数
 */
export interface ImageGenerationParams {
  prompt: string;
  model?: string;
  size?: string;
  referenceImages?: string[];
  n?: number;
  quality?: '1k' | '2k' | '4k';
  isInspirationBoard?: boolean;
  inspirationBoardImageCount?: number;
}

/**
 * 构建图片生成请求体
 * @param params 图片生成参数
 * @param defaultModel 默认模型名称
 * @returns 请求体对象
 */
export function buildImageGenerationRequestBody(
  params: ImageGenerationParams,
  defaultModel: string = 'gemini-3-pro-image-preview-vip'
): Record<string, unknown> {
  const requestBody: Record<string, unknown> = {
    model: params.model || defaultModel,
    prompt: params.prompt,
    n: params.n || 1,
    response_format: 'url',
  };

  // 添加尺寸
  if (params.size) {
    requestBody.size = convertAspectRatioToSize(params.size);
  }

  // 添加质量
  if (params.quality) {
    requestBody.quality = params.quality;
  }

  // 添加参考图片
  if (params.referenceImages && params.referenceImages.length > 0) {
    requestBody.image = params.referenceImages;
  }

  // 处理灵感图
  if (params.isInspirationBoard && params.inspirationBoardImageCount) {
    requestBody.n = params.inspirationBoardImageCount;
  }

  return requestBody;
}

/**
 * 视频生成请求参数
 */
export interface VideoGenerationParams {
  prompt: string;
  model?: string;
  seconds?: string | number;
  size?: string;
  referenceImages?: string[];
}

/**
 * 构建视频生成 FormData
 * @param params 视频生成参数
 * @param referenceBlobs 参考图片的 Blob 数组（可选）
 * @returns FormData 对象
 */
export function buildVideoGenerationFormData(
  params: VideoGenerationParams,
  referenceBlobs?: Array<{ blob: Blob; index: number } | { url: string; index: number }>
): FormData {
  const formData = new FormData();
  
  formData.append('model', params.model || 'veo3');
  formData.append('prompt', params.prompt);

  if (params.seconds) {
    formData.append('seconds', String(params.seconds));
  }

  if (params.size) {
    formData.append('size', params.size);
  }

  // 添加参考图片
  if (referenceBlobs && referenceBlobs.length > 0) {
    for (const item of referenceBlobs) {
      if ('blob' in item) {
        formData.append('input_reference', item.blob, `reference-${item.index + 1}.png`);
      } else {
        formData.append('input_reference', item.url);
      }
    }
  }

  return formData;
}

/**
 * 解析图片生成响应
 * @param data API 响应数据
 * @returns 图片 URL 数组
 */
export function parseImageGenerationResponse(data: any): {
  url: string;
  urls?: string[];
} {
  if (!data.data || data.data.length === 0) {
    throw new Error('No image data in response');
  }

  const imageData = data.data[0];
  const url = imageData.url || 
    (imageData.b64_json ? `data:image/png;base64,${imageData.b64_json}` : null);

  if (!url) {
    // 检查是否包含违禁内容错误
    if (imageData.revised_prompt?.includes('PROHIBITED_CONTENT')) {
      throw new Error('内容被拒绝：包含违禁内容');
    }
    throw new Error('No image URL in response');
  }

  // 提取所有 URL
  const urls = data.data
    .map((d: any) => d.url || (d.b64_json ? `data:image/png;base64,${d.b64_json}` : null))
    .filter(Boolean);

  return {
    url,
    urls: urls.length > 1 ? urls : undefined,
  };
}
