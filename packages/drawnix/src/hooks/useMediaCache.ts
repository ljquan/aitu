/**
 * useMediaCache Hook
 *
 * React hook for managing media cache state and operations.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { unifiedCacheService, CacheStatus } from '../services/unified-cache-service';

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
      if (!originalUrl) {
        setCacheStatus('none');
        return;
      }
      const cached = await unifiedCacheService.isCached(originalUrl);
      setCacheStatus(cached ? 'cached' : 'none');
    };
    checkCacheStatus();

    // Subscribe to cache status changes
    const unsubscribe = unifiedCacheService.subscribe(() => {
      if (originalUrl) {
        const status = unifiedCacheService.getCacheStatus(originalUrl);
        setCacheStatus(status);
      }
    });

    return unsubscribe;
  }, [taskId, originalUrl]);

  // Cache media
  const cacheMedia = useCallback(async () => {
    if (!originalUrl) return false;

    setCacheProgress(0);
    const success = await unifiedCacheService.cacheImage(originalUrl, {
      taskId,
      prompt,
    });
    setCacheProgress(100);

    return success;
  }, [taskId, originalUrl, prompt]);

  // Delete cache
  const deleteCache = useCallback(async () => {
    if (!originalUrl) return false;
    try {
      await unifiedCacheService.deleteCache(originalUrl);
      setCacheStatus('none');
      return true;
    } catch {
      return false;
    }
  }, [originalUrl]);

  // Get cached URL
  const getCachedUrl = useCallback(async () => {
    if (!originalUrl) return null;
    return unifiedCacheService.getCachedUrl(originalUrl);
  }, [originalUrl]);

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
  // Track the last known cache status to detect changes for THIS task only
  const lastStatusRef = useRef<CacheStatus>('none');

  // Load URL function
  const loadUrl = useCallback(async () => {
    setIsLoading(true);

    if (!originalUrl) {
      setUrl(null);
      setIsFromCache(false);
      setIsLoading(false);
      return;
    }

    // First try to get cached URL
    const cachedUrl = await unifiedCacheService.getCachedUrl(originalUrl);

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
  }, [originalUrl, blobUrl]);

  // Initial load
  useEffect(() => {
    loadUrl();
    // Initialize last status
    if (originalUrl) {
      lastStatusRef.current = unifiedCacheService.getCacheStatus(originalUrl);
    }
  }, [taskId, originalUrl]);

  // Subscribe to cache status changes - only react to THIS task's changes
  useEffect(() => {
    const unsubscribe = unifiedCacheService.subscribe(() => {
      if (!originalUrl) return;
      
      const currentStatus = unifiedCacheService.getCacheStatus(originalUrl);
      const previousStatus = lastStatusRef.current;

      // Only reload if THIS task's status actually changed
      if (currentStatus !== previousStatus) {
        lastStatusRef.current = currentStatus;

        // Only reload when status becomes 'cached' or 'none' (not during 'caching')
        if (currentStatus === 'cached' || currentStatus === 'none') {
          loadUrl();
        }
      }
    });

    return unsubscribe;
  }, [originalUrl, loadUrl]);

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
      const usage = await unifiedCacheService.getStorageUsage();
      const urls = await unifiedCacheService.getAllCachedUrls();
      setTotalSize(usage.used);
      setCachedCount(urls.length);
    };

    loadStats();

    // Subscribe to changes
    const unsubscribe = unifiedCacheService.subscribe(loadStats);
    return unsubscribe;
  }, []);

  return {
    totalSize,
    cachedCount,
    formattedSize: unifiedCacheService.formatSize(totalSize),
  };
}
