/**
 * Video Utilities
 *
 * 视频处理工具函数
 * - 视频缩略图生成
 * - 视频帧提取
 * - 时间戳格式化
 */

import type {
  ExtractedFrame,
  ExtractFrameOptions,
  ThumbnailSize,
} from './types';

// ==================== 常量 ====================

const DEFAULT_THUMBNAIL_QUALITY = 0.8;
const DEFAULT_VIDEO_SEEK_TIME = 0.1; // 0.1秒处，避免完全黑屏
const DEFAULT_FRAME_QUALITY = 0.92;
const DEFAULT_TIMEOUT = 30000;

// ==================== 辅助函数 ====================

/**
 * 计算缩略图尺寸（保持宽高比）
 *
 * @param originalWidth - 原始宽度
 * @param originalHeight - 原始高度
 * @param maxSize - 最大尺寸
 * @returns 计算后的尺寸
 *
 * @example
 * ```typescript
 * calculateThumbnailSize(1920, 1080, 400);
 * // { width: 400, height: 225 }
 *
 * calculateThumbnailSize(1080, 1920, 400);
 * // { width: 225, height: 400 }
 * ```
 */
export function calculateThumbnailSize(
  originalWidth: number,
  originalHeight: number,
  maxSize: number
): ThumbnailSize {
  const aspectRatio = originalWidth / originalHeight;

  let width = maxSize;
  let height = maxSize;

  if (aspectRatio > 1) {
    // 横向视频
    height = maxSize / aspectRatio;
  } else {
    // 纵向视频
    width = maxSize * aspectRatio;
  }

  return {
    width: Math.round(width),
    height: Math.round(height),
  };
}

// ==================== 视频缩略图 ====================

/**
 * 从视频 Blob 生成缩略图
 *
 * 在主线程中使用 video 元素和 canvas 生成预览图。
 * 注意：此函数需要 DOM 环境，不能在 Service Worker 中使用。
 *
 * @param blob - 视频 Blob
 * @param maxSize - 最大尺寸（默认 400）
 * @returns 缩略图 Blob（JPEG 格式）
 *
 * @example
 * ```typescript
 * const videoBlob = await fetch('/video.mp4').then(r => r.blob());
 * const thumbnail = await generateVideoThumbnailFromBlob(videoBlob, 200);
 * // thumbnail 是一个 JPEG 格式的 Blob
 * ```
 */
export async function generateVideoThumbnailFromBlob(
  blob: Blob,
  maxSize: number = 400
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const videoUrl = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;

    let isResolved = false;

    const cleanup = () => {
      URL.revokeObjectURL(videoUrl);
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('error', handleError);
      video.src = '';
      video.load();
    };

    const handleLoadedData = () => {
      try {
        video.currentTime = DEFAULT_VIDEO_SEEK_TIME;
      } catch (error) {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          reject(new Error('Failed to seek video'));
        }
      }
    };

    const handleSeeked = () => {
      if (isResolved) return;

      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          throw new Error('Failed to get canvas context');
        }

        const { width, height } = calculateThumbnailSize(
          video.videoWidth,
          video.videoHeight,
          maxSize
        );

        canvas.width = width;
        canvas.height = height;

        ctx.drawImage(video, 0, 0, width, height);

        canvas.toBlob(
          (thumbnailBlob) => {
            if (isResolved) return;
            isResolved = true;
            cleanup();

            if (thumbnailBlob) {
              resolve(thumbnailBlob);
            } else {
              reject(new Error('Failed to convert canvas to blob'));
            }
          },
          'image/jpeg',
          DEFAULT_THUMBNAIL_QUALITY
        );
      } catch (error) {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          reject(
            error instanceof Error
              ? error
              : new Error('Failed to generate thumbnail')
          );
        }
      }
    };

    const handleError = () => {
      if (!isResolved) {
        isResolved = true;
        cleanup();
        reject(new Error('Failed to load video'));
      }
    };

    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('error', handleError);

    // 设置超时
    const timeout = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        cleanup();
        reject(new Error('Video thumbnail generation timeout'));
      }
    }, DEFAULT_TIMEOUT);

    // 开始加载视频
    video.src = videoUrl;

    // 清理超时
    const originalResolve = resolve;
    const originalReject = reject;
    resolve = (value) => {
      clearTimeout(timeout);
      originalResolve(value);
    };
    reject = (error) => {
      clearTimeout(timeout);
      originalReject(error);
    };
  });
}

// ==================== 视频帧提取 ====================

/**
 * 从视频 URL 提取指定帧
 *
 * @param videoUrl - 视频 URL（可以是远程 URL 或 blob URL）
 * @param options - 提取选项
 * @returns 提取的帧数据
 *
 * @example
 * ```typescript
 * // 提取最后一帧
 * const frame = await extractVideoFrame('/video.mp4');
 *
 * // 提取第一帧
 * const firstFrame = await extractVideoFrame('/video.mp4', { timestamp: 'first' });
 *
 * // 提取第 5 秒的帧
 * const frame5s = await extractVideoFrame('/video.mp4', { timestamp: 5 });
 * ```
 */
export async function extractVideoFrame(
  videoUrl: string,
  options: ExtractFrameOptions = {}
): Promise<ExtractedFrame> {
  const {
    timestamp = 'last',
    format = 'image/png',
    quality = DEFAULT_FRAME_QUALITY,
    timeout = DEFAULT_TIMEOUT,
  } = options;

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Failed to get canvas context'));
      return;
    }

    let timeoutId: number | null = null;
    let isResolved = false;

    const cleanup = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      video.removeEventListener('loadedmetadata', handleMetadata);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('error', handleError);
      video.src = '';
      video.load();
    };

    const resolveWithFrame = () => {
      if (isResolved) return;
      isResolved = true;

      try {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL(format, quality);

        cleanup();
        resolve({
          dataUrl,
          timestamp: video.currentTime,
          width: video.videoWidth,
          height: video.videoHeight,
        });
      } catch (error) {
        cleanup();
        reject(new Error(`Failed to extract frame: ${error}`));
      }
    };

    const handleMetadata = () => {
      const duration = video.duration;

      let targetTime: number;
      if (timestamp === 'last') {
        targetTime = Math.max(0, duration - 0.1);
      } else if (timestamp === 'first') {
        targetTime = 0.1;
      } else {
        targetTime = Math.min(Math.max(0, timestamp), duration);
      }

      video.currentTime = targetTime;
    };

    const handleSeeked = () => {
      resolveWithFrame();
    };

    const handleError = () => {
      cleanup();
      reject(
        new Error(
          `Failed to load video: ${video.error?.message || 'Unknown error'}`
        )
      );
    };

    timeoutId = window.setTimeout(() => {
      if (!isResolved) {
        cleanup();
        reject(new Error(`Video frame extraction timed out after ${timeout}ms`));
      }
    }, timeout);

    video.addEventListener('loadedmetadata', handleMetadata);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('error', handleError);

    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = videoUrl;
  });
}

/**
 * 提取视频的最后一帧
 *
 * @param videoUrl - 视频 URL
 * @returns 最后一帧数据
 */
export async function extractLastFrame(videoUrl: string): Promise<ExtractedFrame> {
  return extractVideoFrame(videoUrl, { timestamp: 'last' });
}

/**
 * 提取视频的第一帧
 *
 * @param videoUrl - 视频 URL
 * @returns 第一帧数据
 */
export async function extractFirstFrame(videoUrl: string): Promise<ExtractedFrame> {
  return extractVideoFrame(videoUrl, { timestamp: 'first' });
}

// ==================== 时间格式化 ====================

/**
 * 格式化时间戳为可读字符串
 *
 * @param timestamp - 时间戳（秒）
 * @returns 格式化的时间字符串 (mm:ss.s)
 *
 * @example
 * ```typescript
 * formatVideoTimestamp(65.5);  // "1:05.5"
 * formatVideoTimestamp(3.2);   // "0:03.2"
 * formatVideoTimestamp(125);   // "2:05.0"
 * ```
 */
export function formatVideoTimestamp(timestamp: number): string {
  const minutes = Math.floor(timestamp / 60);
  const seconds = (timestamp % 60).toFixed(1);
  return `${minutes}:${seconds.padStart(4, '0')}`;
}
