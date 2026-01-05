/**
 * Video Recovery Service
 *
 * 恢复页面刷新后失效的合并视频 Blob URL
 * 从 IndexedDB 中重新创建 Blob URL 并更新画布元素
 */

import { mediaCacheService } from './media-cache-service';
import type { PlaitBoard } from '@plait/core';
import { Transforms } from '@plait/core';

/**
 * 检查并恢复画布中失效的视频 URL
 *
 * @param board PlaitBoard 实例
 * @returns Promise<number> 恢复的视频数量
 */
export async function recoverExpiredVideoUrls(board: PlaitBoard | null): Promise<number> {
  if (!board || !board.children) {
    return 0;
  }

  console.log('[VideoRecovery] Starting video URL recovery...');

  let recoveredCount = 0;

  for (const element of board.children) {
    const url = (element as any).url as string | undefined;

    if (!url) continue;

    // 检查是否是合并视频的 URL (格式: blob:http://...#merged-video-{timestamp})
    if (url.startsWith('blob:') && url.includes('#merged-video-')) {
      // 提取 taskId (处理可能存在多个 # 的情况)
      const mergedVideoIndex = url.indexOf('#merged-video-');
      if (mergedVideoIndex === -1) continue;

      const afterHash = url.substring(mergedVideoIndex + 1); // 从 'merged-video-' 开始
      const nextHashIndex = afterHash.indexOf('#', 1); // 查找下一个 #
      const taskId = nextHashIndex > 0
        ? afterHash.substring(0, nextHashIndex) // 截取到下一个 # 之前
        : afterHash; // 如果没有下一个 #，就取全部

      console.log('[VideoRecovery] Found merged video URL:', { url, taskId });

      // 对于合并视频，刷新后 Blob URL 一定会失效，直接恢复即可
      // 从 IndexedDB 恢复
      try {
        const cached = await mediaCacheService.getCachedMedia(taskId);
        if (cached && cached.blob) {
          const newBlobUrl = URL.createObjectURL(cached.blob);
          const newUrl = `${newBlobUrl}#${taskId}`;

          // 使用 Transforms.setNode 更新元素（Plait 元素是只读的）
          Transforms.setNode(
            board,
            { url: newUrl } as any,
            {
              at: board.children.indexOf(element),
            }
          );
          recoveredCount++;

          console.log('[VideoRecovery] Video URL recovered:', {
            taskId,
            oldUrl: url,
            newUrl,
            size: cached.blob.size,
          });
        } else {
          console.warn('[VideoRecovery] Cache not found for taskId:', taskId);
        }
      } catch (error) {
        console.error('[VideoRecovery] Failed to recover video:', taskId, error);
      }
    }
  }

  if (recoveredCount > 0) {
    console.log(`[VideoRecovery] Recovery complete: ${recoveredCount} video(s) recovered`);
    // Transforms.setNode 会自动触发重新渲染，不需要手动更新 board.children
  } else {
    console.log('[VideoRecovery] No videos needed recovery');
  }

  return recoveredCount;
}

/**
 * 初始化视频恢复服务
 * 在应用启动时调用
 *
 * @param board PlaitBoard 实例
 */
export function initVideoRecoveryService(board: PlaitBoard | null): void {
  if (!board) return;

  console.log('[VideoRecovery] Initializing video recovery service...');

  // 立即执行恢复，避免视频元素加载失败
  // 使用 requestAnimationFrame 确保DOM已更新
  requestAnimationFrame(async () => {
    try {
      await recoverExpiredVideoUrls(board);
    } catch (error) {
      console.error('[VideoRecovery] Initialization failed:', error);
    }
  });
}
