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

/** 远程图片缓存有效期（12小时，毫秒） */
const REMOTE_IMAGE_CACHE_TTL = 12 * 60 * 60 * 1000;

/** IndexedDB 统一缓存数据库名称 */
const UNIFIED_DB_NAME = 'drawnix-unified-cache';
const UNIFIED_STORE_NAME = 'media';

/**
 * 从 IndexedDB 获取图片的原始缓存时间
 * 注意：Cache API 中的 sw-cache-date 会在每次访问时刷新，
 * 而 IndexedDB 中的 cachedAt 是原始缓存时间，不会被刷新
 * 
 * @param url 图片 URL
 * @returns 原始缓存时间戳，如果没有则返回 null
 */
async function getOriginalCacheTime(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(UNIFIED_DB_NAME);
      
      request.onerror = () => {
        console.warn('[MediaUtils] Failed to open IndexedDB:', request.error);
        resolve(null);
      };
      
      request.onsuccess = () => {
        try {
          const db = request.result;
          
          // 检查 store 是否存在
          if (!db.objectStoreNames.contains(UNIFIED_STORE_NAME)) {
            db.close();
            resolve(null);
            return;
          }
          
          const transaction = db.transaction(UNIFIED_STORE_NAME, 'readonly');
          const store = transaction.objectStore(UNIFIED_STORE_NAME);
          const getRequest = store.get(url);
          
          getRequest.onsuccess = () => {
            const item = getRequest.result;
            db.close();
            if (item && item.cachedAt) {
              resolve(item.cachedAt);
            } else {
              resolve(null);
            }
          };
          
          getRequest.onerror = () => {
            db.close();
            resolve(null);
          };
        } catch (err) {
          resolve(null);
        }
      };
    } catch (err) {
      console.warn('[MediaUtils] Error accessing IndexedDB:', err);
      resolve(null);
    }
  });
}

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

/**
 * 将 Blob 转换为 base64 data URL
 * @param blob Blob 对象
 * @returns base64 data URL
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** 图片压缩目标大小（确保 base64 < 1MB） */
const MAX_IMAGE_SIZE_BYTES = 1024 * 1024;

/** 最小压缩质量 */
const MIN_QUALITY = 0.1;

/** 最大尺寸（宽或高） */
const MAX_DIMENSION = 2048;

/**
 * 压缩图片 Blob 到指定大小以内
 * 使用二分查找找到最接近目标大小的最高质量
 * 
 * @param blob 原始图片 Blob
 * @param maxSizeBytes 最大字节数，默认 750KB
 * @returns 压缩后的 Blob
 */
export async function compressImageBlob(
  blob: Blob,
  maxSizeBytes: number = MAX_IMAGE_SIZE_BYTES
): Promise<Blob> {
  // 如果已经小于目标大小，直接返回
  if (blob.size <= maxSizeBytes) {
    // console.log(`[MediaUtils] Image already small enough: ${(blob.size / 1024).toFixed(1)}KB <= ${(maxSizeBytes / 1024).toFixed(1)}KB`);
    return blob;
  }

    // console.log(`[MediaUtils] Compressing image: ${(blob.size / 1024).toFixed(1)}KB -> target ${(maxSizeBytes / 1024).toFixed(1)}KB`);

  try {
    // 创建 ImageBitmap
    const imageBitmap = await createImageBitmap(blob);
    let { width, height } = imageBitmap;
    const originalDimensions = { width, height };

    // 计算缩放比例（如果尺寸超过最大值）
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      const scale = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    // console.log(`[MediaUtils] Resizing from ${originalDimensions.width}x${originalDimensions.height} to ${width}x${height}`);
    }

    // 创建 OffscreenCanvas
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.warn('[MediaUtils] Failed to get 2d context from OffscreenCanvas');
      return blob;
    }

    // 绘制图片
    ctx.drawImage(imageBitmap, 0, 0, width, height);
    imageBitmap.close();

    // 使用二分查找找到最接近目标大小的最高质量
    let lowQuality = MIN_QUALITY;
    let highQuality = 0.95;
    let bestBlob: Blob | null = null;
    let bestQuality = 0;
    const maxIterations = 8; // 最多 8 次迭代

    for (let i = 0; i < maxIterations; i++) {
      const midQuality = (lowQuality + highQuality) / 2;
      const testBlob = await canvas.convertToBlob({
        type: 'image/jpeg',
        quality: midQuality,
      });

    // console.log(`[MediaUtils] Binary search #${i + 1}: quality=${midQuality.toFixed(3)}, size=${(testBlob.size / 1024).toFixed(1)}KB`);

      if (testBlob.size <= maxSizeBytes) {
        // 符合条件，记录并尝试更高质量
        bestBlob = testBlob;
        bestQuality = midQuality;
        lowQuality = midQuality;
      } else {
        // 太大，降低质量
        highQuality = midQuality;
      }

      // 如果质量差距已经很小，停止搜索
      if (highQuality - lowQuality < 0.02) {
        break;
      }
    }

    if (bestBlob) {
    // console.log(`[MediaUtils] Compression successful: quality=${bestQuality.toFixed(3)}, size=${(bestBlob.size / 1024).toFixed(1)}KB`);
      return bestBlob;
    }

    // 如果最低质量仍然超过大小限制，尝试进一步缩小尺寸
    // console.log(`[MediaUtils] Min quality not enough, trying to reduce dimensions...`);
    let compressedBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: MIN_QUALITY });
    
    let scale = 0.8;
    while (scale >= 0.3 && compressedBlob.size > maxSizeBytes) {
      const newWidth = Math.round(width * scale);
      const newHeight = Math.round(height * scale);
      
      const smallerCanvas = new OffscreenCanvas(newWidth, newHeight);
      const smallerCtx = smallerCanvas.getContext('2d');
      if (!smallerCtx) break;

      // 重新创建 ImageBitmap 从原始 blob
      const tempBitmap = await createImageBitmap(blob);
      smallerCtx.drawImage(tempBitmap, 0, 0, newWidth, newHeight);
      tempBitmap.close();

      // 对缩小后的图片再次使用二分查找
      let smallLow = MIN_QUALITY;
      let smallHigh = 0.95;
      let smallBest: Blob | null = null;

      for (let i = 0; i < 6; i++) {
        const midQ = (smallLow + smallHigh) / 2;
        const testBlob = await smallerCanvas.convertToBlob({ type: 'image/jpeg', quality: midQ });
        
        if (testBlob.size <= maxSizeBytes) {
          smallBest = testBlob;
          smallLow = midQ;
        } else {
          smallHigh = midQ;
        }
        
        if (smallHigh - smallLow < 0.02) break;
      }

      if (smallBest) {
    // console.log(`[MediaUtils] Scale ${scale.toFixed(1)} (${newWidth}x${newHeight}): ${(smallBest.size / 1024).toFixed(1)}KB`);
        return smallBest;
      }

      compressedBlob = await smallerCanvas.convertToBlob({ type: 'image/jpeg', quality: MIN_QUALITY });
    // console.log(`[MediaUtils] Scale ${scale.toFixed(1)} (${newWidth}x${newHeight}): ${(compressedBlob.size / 1024).toFixed(1)}KB (min quality)`);
      
      scale -= 0.1;
    }

    // console.log(`[MediaUtils] Final compressed size: ${(compressedBlob.size / 1024).toFixed(1)}KB`);
    return compressedBlob;
  } catch (err) {
    console.warn('[MediaUtils] Image compression failed, returning original:', err);
    return blob;
  }
}

/**
 * 将 Blob 转换为压缩后的 base64
 * @param blob 原始 Blob
 * @param maxSizeBytes 最大字节数
 * @returns 压缩后的 base64 data URL
 */
export async function blobToCompressedBase64(
  blob: Blob,
  maxSizeBytes: number = MAX_IMAGE_SIZE_BYTES
): Promise<string> {
  const compressedBlob = await compressImageBlob(blob, maxSizeBytes);
  return blobToBase64(compressedBlob);
}

/**
 * 处理后的参考图片结果
 */
export interface ProcessedReferenceImage {
  /** 原始 URL */
  originalUrl: string;
  /** 处理后的值（base64 或原始 URL） */
  value: string;
  /** 是否转换为了 base64 */
  isBase64: boolean;
}

/**
 * 处理单个参考图片
 * - 本地图片（/asset-library/...）：从缓存获取并转换为 base64（压缩到 1M 以内）
 * - 远程图片（http/https）：检查缓存时间，12小时内直接使用 URL，超过则转换为 base64
 * - data: URL：检查大小，超过 1M 则压缩
 * 
 * @param url 图片 URL
 * @param signal 取消信号
 * @returns 处理后的图片信息
 */
export async function processReferenceImage(
  url: string,
  signal?: AbortSignal
): Promise<ProcessedReferenceImage> {
  // 已经是 base64，检查大小
  if (url.startsWith('data:')) {
    // 估算 base64 大小（base64 编码后约为原始大小的 4/3）
    const base64Part = url.split(',')[1] || '';
    const estimatedSize = (base64Part.length * 3) / 4;
    
    if (estimatedSize > MAX_IMAGE_SIZE_BYTES) {
      // 需要压缩
      const blob = dataUrlToBlob(url);
      if (blob) {
        const compressedBase64 = await blobToCompressedBase64(blob);
        return { originalUrl: url, value: compressedBase64, isBase64: true };
      }
    }
    return { originalUrl: url, value: url, isBase64: true };
  }

  try {
    const cache = await caches.open(IMAGE_CACHE_NAME);

    // 本地素材库图片：/asset-library/xxx.png
    if (url.startsWith('/asset-library/')) {
      const cachedResponse = await cache.match(url);
      if (cachedResponse) {
        const blob = await cachedResponse.blob();
        // 压缩并转换为 base64
        const base64 = await blobToCompressedBase64(blob);
        return { originalUrl: url, value: base64, isBase64: true };
      }
      // 缓存中没有，返回原始 URL（可能会失败，但让 API 层处理）
      console.warn(`[MediaUtils] Asset library image not found in cache: ${url}`);
      return { originalUrl: url, value: url, isBase64: false };
    }

    // 远程图片：http/https
    if (url.startsWith('http://') || url.startsWith('https://')) {
    // console.log(`[MediaUtils] Processing remote image: ${url.substring(0, 80)}...`);
      
      // 使用 ignoreVary 确保匹配时不考虑 Vary header
      const cachedResponse = await cache.match(url, { ignoreVary: true });
      
      

      if (cachedResponse) {
        // 优先从 IndexedDB 获取原始缓存时间（不会因访问而刷新）
        // Cache API 中的 sw-cache-date 会在每次访问时更新，不适合判断过期
        const originalCacheTime = await getOriginalCacheTime(url);
        
        // 如果 IndexedDB 中没有，回退到 Cache API 的 sw-cache-date
        const cacheDate = cachedResponse.headers.get('sw-cache-date');
        const fallbackCacheTime = cacheDate ? parseInt(cacheDate, 10) : 0;
        
        const cacheTime = originalCacheTime ?? fallbackCacheTime;
        const now = Date.now();
        const age = cacheTime ? now - cacheTime : Infinity;
        const ageHours = age / (60 * 60 * 1000);

    // console.log(`[MediaUtils] Cache found for ${url.substring(0, 50)}...`, {
        //   originalCacheTime,
        //   fallbackCacheTime,
        //   cacheTimeUsed: cacheTime,
        //   now,
        //   ageMs: age,
        //   ageHours: ageHours.toFixed(2),
        //   ttlHours: (REMOTE_IMAGE_CACHE_TTL / (60 * 60 * 1000)).toFixed(2),
        //   isWithinTTL: cacheTime > 0 && age < REMOTE_IMAGE_CACHE_TTL,
        // });

        if (cacheTime > 0 && age < REMOTE_IMAGE_CACHE_TTL) {
          // 缓存在 12 小时内，直接使用 URL
    // console.log(`[MediaUtils] Using cached URL (within TTL): ${url.substring(0, 50)}...`);
          return { originalUrl: url, value: url, isBase64: false };
        }

        // 缓存超过 12 小时或没有缓存时间，压缩并转换为 base64
    // console.log(`[MediaUtils] Cache expired or no cache date, converting to base64: ${url.substring(0, 50)}...`);
        const blob = await cachedResponse.blob();
        const base64 = await blobToCompressedBase64(blob);
    // console.log(`[MediaUtils] Converted to base64, length: ${base64.length}`);
        return { originalUrl: url, value: base64, isBase64: true };
      }

      // 缓存中没有，从网络获取并转换为 base64
    // console.log(`[MediaUtils] No cache found, fetching from network: ${url.substring(0, 50)}...`);
      const response = await fetch(url, { signal });
      if (response.ok) {
        const blob = await response.blob();
        
        // 存入缓存
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

        // 新获取的图片，压缩并转换为 base64（因为 URL 可能很快失效）
        const base64 = await blobToCompressedBase64(blob);
        return { originalUrl: url, value: base64, isBase64: true };
      }

      console.warn(`[MediaUtils] Failed to fetch remote image: ${url.substring(0, 50)}...`);
      return { originalUrl: url, value: url, isBase64: false };
    }

    // 其他类型的 URL，直接返回
    return { originalUrl: url, value: url, isBase64: false };
  } catch (err) {
    console.warn(`[MediaUtils] Error processing reference image: ${url.substring(0, 50)}...`, err);
    return { originalUrl: url, value: url, isBase64: false };
  }
}

/**
 * 批量处理参考图片
 * @param urls 图片 URL 数组
 * @param signal 取消信号
 * @returns 处理后的图片值数组（base64 或 URL）
 */
export async function processReferenceImages(
  urls: string[],
  signal?: AbortSignal
): Promise<string[]> {
  if (!urls || urls.length === 0) {
    return [];
  }

  const results = await Promise.all(
    urls.map(url => processReferenceImage(url, signal))
  );

  return results.map(r => r.value);
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
