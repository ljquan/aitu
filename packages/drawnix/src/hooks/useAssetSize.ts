/**
 * useAssetSize Hook
 * 获取素材的实际文件大小，支持从缓存获取
 * 优化：使用内存缓存和批量查询避免重复访问 Cache API
 */

import { useState, useEffect } from 'react';
import { unifiedCacheService } from '../services/unified-cache-service';

const IMAGE_CACHE_NAME = 'drawnix-images';

// 内存缓存：url -> size
const sizeCache = new Map<string, number>();
// 待查询队列
const pendingQueries = new Map<string, ((size: number | null) => void)[]>();

/**
 * 批量处理待查询的 size
 */
async function processPendingQueries(): Promise<void> {
  if (pendingQueries.size === 0) return;
  
  // 复制当前队列并清空
  const queries = new Map(pendingQueries);
  pendingQueries.clear();
  
  for (const [url, callbacks] of queries) {
    try {
      const size = await fetchSizeFromCache(url);
      if (size !== null) {
        sizeCache.set(url, size);
      }
      callbacks.forEach(cb => cb(size));
    } catch {
      callbacks.forEach(cb => cb(null));
    }
  }
}

/**
 * 从缓存获取文件大小的实际实现
 */
async function fetchSizeFromCache(url: string): Promise<number | null> {
  try {
    // 首先尝试从 unifiedCacheService 获取
    const cacheInfo = await unifiedCacheService.getCacheInfo(url);
    if (cacheInfo.isCached && cacheInfo.size && cacheInfo.size > 0) {
      return cacheInfo.size;
    }

    // 如果 unifiedCacheService 没有，直接从 Cache API 获取（主要用于视频）
    if (typeof caches !== 'undefined') {
      const cache = await caches.open(IMAGE_CACHE_NAME);
      const response = await cache.match(url);
      if (response) {
        // 尝试从 header 获取大小
        const sizeHeader =
          response.headers.get('sw-video-size') ||
          response.headers.get('sw-image-size') ||
          response.headers.get('Content-Length');
        if (sizeHeader) {
          const size = parseInt(sizeHeader, 10);
          if (size > 0) {
            return size;
          }
        }
        // 如果 header 没有，获取 blob 大小
        const blob = await response.blob();
        if (blob.size > 0) {
          return blob.size;
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * 从缓存获取文件大小（非 Hook 版本，可在任意地方调用）
 */
export async function getAssetSizeFromCache(url: string): Promise<number | null> {
  // 先检查内存缓存
  if (sizeCache.has(url)) {
    return sizeCache.get(url)!;
  }
  
  const size = await fetchSizeFromCache(url);
  if (size !== null) {
    sizeCache.set(url, size);
  }
  return size;
}

/**
 * 获取素材的实际文件大小（React Hook 版本）
 * 优先使用 asset.size，如果为 0 则尝试从缓存获取
 */
export function useAssetSize(
  assetId: string | undefined,
  assetUrl: string | undefined,
  assetSize: number | undefined
): number | null {
  const [cachedSize, setCachedSize] = useState<number | null>(null);

  useEffect(() => {
    if (!assetId || !assetUrl) {
      setCachedSize(null);
      return;
    }

    // 如果 asset 已有有效的 size，直接使用
    if (assetSize && assetSize > 0) {
      setCachedSize(assetSize);
      return;
    }

    // 检查内存缓存
    if (sizeCache.has(assetUrl)) {
      setCachedSize(sizeCache.get(assetUrl)!);
      return;
    }

    // 加入待查询队列
    const callbacks = pendingQueries.get(assetUrl) || [];
    callbacks.push(setCachedSize);
    pendingQueries.set(assetUrl, callbacks);

    // 使用 requestIdleCallback 批量处理
    if (callbacks.length === 1) {
      if ('requestIdleCallback' in window) {
        (window as Window).requestIdleCallback(processPendingQueries, { timeout: 1000 });
      } else {
        setTimeout(processPendingQueries, 100);
      }
    }
  }, [assetId, assetUrl, assetSize]);

  return cachedSize;
}
