/**
 * useMediaCache Hook
 *
 * React hook for managing media cache state and operations.
 */

import { useState, useEffect, useCallback } from 'react';
import { mediaCacheService, CacheStatus } from '../services/media-cache-service';

interface UseMediaCacheResult {
  /** Cache status for the task */
  cacheStatus: CacheStatus;
  /** Whether currently caching */
  isCaching: boolean;
  /** Whether cached */
  isCached: boolean;
  /** Cache progress (0-100) */
  cacheProgress: number;
  /** Cache the media */
  cacheMedia: () => Promise<boolean>;
  /** Delete the cache */
  deleteCache: () => Promise<boolean>;
  /** Get cached URL (creates blob URL) */
  getCachedUrl: () => Promise<string | null>;
}

/**
 * Hook to manage media cache for a specific task
 */
export function useMediaCache(
  taskId: string,
  originalUrl: string | undefined,
  type: 'image' | 'video',
  prompt?: string
): UseMediaCacheResult {
  const [cacheStatus, setCacheStatus] = useState<CacheStatus>('none');
  const [cacheProgress, setCacheProgress] = useState(0);

  // Check initial cache status
  useEffect(() => {
    const checkCacheStatus = async () => {
      const cached = await mediaCacheService.isCached(taskId);
      setCacheStatus(cached ? 'cached' : 'none');
    };
    checkCacheStatus();

    // Subscribe to cache status changes
    const unsubscribe = mediaCacheService.subscribe(() => {
      const status = mediaCacheService.getCacheStatus(taskId);
      setCacheStatus(status);
    });

    return unsubscribe;
  }, [taskId]);

  // Cache media
  const cacheMedia = useCallback(async () => {
    if (!originalUrl) return false;

    setCacheProgress(0);
    const success = await mediaCacheService.cacheMedia(
      taskId,
      originalUrl,
      type,
      prompt,
      (progress) => setCacheProgress(progress)
    );

    return success;
  }, [taskId, originalUrl, type, prompt]);

  // Delete cache
  const deleteCache = useCallback(async () => {
    const success = await mediaCacheService.deleteCache(taskId);
    if (success) {
      setCacheStatus('none');
    }
    return success;
  }, [taskId]);

  // Get cached URL
  const getCachedUrl = useCallback(async () => {
    return mediaCacheService.getCachedUrl(taskId);
  }, [taskId]);

  return {
    cacheStatus,
    isCaching: cacheStatus === 'caching',
    isCached: cacheStatus === 'cached',
    cacheProgress,
    cacheMedia,
    deleteCache,
    getCachedUrl,
  };
}

/**
 * Hook to get media URL with cache fallback
 * Returns cached URL if available, otherwise original URL
 * Automatically switches to cached URL when caching completes
 */
export function useMediaUrl(
  taskId: string,
  originalUrl: string | undefined
): { url: string | null; isFromCache: boolean; isLoading: boolean } {
  const [url, setUrl] = useState<string | null>(originalUrl || null);
  const [isFromCache, setIsFromCache] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  // Load URL function
  const loadUrl = useCallback(async () => {
    setIsLoading(true);

    // First try to get cached URL
    const cachedUrl = await mediaCacheService.getCachedUrl(taskId);

    if (cachedUrl) {
      // Revoke old blob URL if exists
      if (blobUrl && blobUrl !== cachedUrl) {
        URL.revokeObjectURL(blobUrl);
      }
      setBlobUrl(cachedUrl);
      setUrl(cachedUrl);
      setIsFromCache(true);
    } else if (originalUrl) {
      setUrl(originalUrl);
      setIsFromCache(false);
    } else {
      setUrl(null);
      setIsFromCache(false);
    }

    setIsLoading(false);
  }, [taskId, originalUrl, blobUrl]);

  // Initial load
  useEffect(() => {
    loadUrl();
  }, [taskId, originalUrl]);

  // Subscribe to cache status changes
  useEffect(() => {
    const unsubscribe = mediaCacheService.subscribe(() => {
      const status = mediaCacheService.getCacheStatus(taskId);
      // When cache status changes to 'cached' or 'none', reload URL
      if (status === 'cached' || status === 'none') {
        loadUrl();
      }
    });

    return unsubscribe;
  }, [taskId, loadUrl]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);

  return { url, isFromCache, isLoading };
}

/**
 * Hook to get overall cache statistics
 */
export function useCacheStats() {
  const [totalSize, setTotalSize] = useState(0);
  const [cachedCount, setCachedCount] = useState(0);

  useEffect(() => {
    const loadStats = async () => {
      const size = await mediaCacheService.getTotalCacheSize();
      const ids = await mediaCacheService.getAllCachedTaskIds();
      setTotalSize(size);
      setCachedCount(ids.length);
    };

    loadStats();

    // Subscribe to changes
    const unsubscribe = mediaCacheService.subscribe(loadStats);
    return unsubscribe;
  }, []);

  return {
    totalSize,
    cachedCount,
    formattedSize: mediaCacheService.formatSize(totalSize),
  };
}
