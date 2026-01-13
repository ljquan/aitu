/**
 * useInfinitePagination Hook
 *
 * A reusable hook for implementing infinite scroll pagination.
 * Manages pagination state, loading, and data merging.
 */

import { useState, useCallback, useRef, useEffect } from 'react';

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  hasMore: boolean;
  offset?: number;
}

export interface UseInfinitePaginationOptions<T> {
  /** Fetcher function that returns paginated data */
  fetcher: (params: { offset: number; limit: number }) => Promise<PaginatedResult<T>>;
  /** Number of items per page (default: 50) */
  pageSize?: number;
  /** Unique key extractor for deduplication */
  getItemKey?: (item: T) => string;
  /** Whether to load initial data on mount (default: true) */
  loadOnMount?: boolean;
  /** Dependencies that trigger a reset when changed */
  deps?: unknown[];
}

export interface UseInfinitePaginationReturn<T> {
  /** All loaded items */
  items: T[];
  /** Whether initial load is in progress */
  isLoading: boolean;
  /** Whether loading more is in progress */
  isLoadingMore: boolean;
  /** Whether there are more items to load */
  hasMore: boolean;
  /** Total count of items (if available) */
  total: number;
  /** Error message if any */
  error: string | null;
  /** Load more items */
  loadMore: () => Promise<void>;
  /** Reset and reload from beginning */
  reset: () => Promise<void>;
  /** Refresh current data without resetting */
  refresh: () => Promise<void>;
  /** Prepend items to the list (for real-time updates) */
  prependItems: (newItems: T[]) => void;
  /** Update a specific item */
  updateItem: (key: string, updater: (item: T) => T) => void;
  /** Remove an item by key */
  removeItem: (key: string) => void;
}

/**
 * Hook for implementing infinite scroll pagination
 *
 * @example
 * ```tsx
 * const {
 *   items,
 *   isLoading,
 *   isLoadingMore,
 *   hasMore,
 *   loadMore,
 *   reset,
 * } = useInfinitePagination({
 *   fetcher: async ({ offset, limit }) => {
 *     const result = await swTaskQueueClient.requestPaginatedTasks({
 *       offset,
 *       limit,
 *       status: filterStatus,
 *     });
 *     return {
 *       items: result.tasks,
 *       total: result.total,
 *       hasMore: result.hasMore,
 *     };
 *   },
 *   pageSize: 50,
 *   getItemKey: (task) => task.id,
 *   deps: [filterStatus],
 * });
 * ```
 */
export function useInfinitePagination<T>(
  options: UseInfinitePaginationOptions<T>
): UseInfinitePaginationReturn<T> {
  const {
    fetcher,
    pageSize = 50,
    getItemKey,
    loadOnMount = true,
    deps = [],
  } = options;

  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const offsetRef = useRef(0);
  const loadingRef = useRef(false);
  const mountedRef = useRef(true);

  // Track deps for reset
  const depsRef = useRef(deps);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Load initial data
  const loadInitial = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const result = await fetcher({ offset: 0, limit: pageSize });
      if (!mountedRef.current) return;

      setItems(result.items);
      setTotal(result.total);
      setHasMore(result.hasMore);
      offsetRef.current = result.items.length;
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
        loadingRef.current = false;
      }
    }
  }, [fetcher, pageSize]);

  // Load more data
  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setIsLoadingMore(true);
    setError(null);

    try {
      const result = await fetcher({ offset: offsetRef.current, limit: pageSize });
      if (!mountedRef.current) return;

      setItems((prev) => {
        // Deduplicate if getItemKey is provided
        if (getItemKey) {
          const existingKeys = new Set(prev.map(getItemKey));
          const newItems = result.items.filter((item) => !existingKeys.has(getItemKey(item)));
          return [...prev, ...newItems];
        }
        return [...prev, ...result.items];
      });
      setTotal(result.total);
      setHasMore(result.hasMore);
      offsetRef.current += result.items.length;
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load more data');
    } finally {
      if (mountedRef.current) {
        setIsLoadingMore(false);
        loadingRef.current = false;
      }
    }
  }, [fetcher, pageSize, hasMore, getItemKey]);

  // Reset and reload
  const reset = useCallback(async () => {
    offsetRef.current = 0;
    setItems([]);
    setHasMore(true);
    setTotal(0);
    loadingRef.current = false;
    await loadInitial();
  }, [loadInitial]);

  // Refresh current data
  const refresh = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setError(null);

    try {
      // Reload all currently loaded items
      const currentCount = offsetRef.current || pageSize;
      const result = await fetcher({ offset: 0, limit: currentCount });
      if (!mountedRef.current) return;

      setItems(result.items);
      setTotal(result.total);
      setHasMore(result.hasMore);
      offsetRef.current = result.items.length;
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to refresh data');
    } finally {
      if (mountedRef.current) {
        loadingRef.current = false;
      }
    }
  }, [fetcher, pageSize]);

  // Prepend items (for real-time updates)
  const prependItems = useCallback(
    (newItems: T[]) => {
      setItems((prev) => {
        if (getItemKey) {
          const existingKeys = new Set(prev.map(getItemKey));
          const uniqueNewItems = newItems.filter((item) => !existingKeys.has(getItemKey(item)));
          return [...uniqueNewItems, ...prev];
        }
        return [...newItems, ...prev];
      });
      offsetRef.current += newItems.length;
      setTotal((prev) => prev + newItems.length);
    },
    [getItemKey]
  );

  // Update a specific item
  const updateItem = useCallback(
    (key: string, updater: (item: T) => T) => {
      if (!getItemKey) return;
      setItems((prev) =>
        prev.map((item) => (getItemKey(item) === key ? updater(item) : item))
      );
    },
    [getItemKey]
  );

  // Remove an item
  const removeItem = useCallback(
    (key: string) => {
      if (!getItemKey) return;
      setItems((prev) => prev.filter((item) => getItemKey(item) !== key));
      offsetRef.current = Math.max(0, offsetRef.current - 1);
      setTotal((prev) => Math.max(0, prev - 1));
    },
    [getItemKey]
  );

  // Reset when deps change
  useEffect(() => {
    const depsChanged = deps.some((dep, i) => dep !== depsRef.current[i]);
    if (depsChanged) {
      depsRef.current = deps;
      reset();
    }
  }, [deps, reset]);

  // Load on mount
  useEffect(() => {
    if (loadOnMount) {
      loadInitial();
    }
  }, [loadOnMount, loadInitial]);

  return {
    items,
    isLoading,
    isLoadingMore,
    hasMore,
    total,
    error,
    loadMore,
    reset,
    refresh,
    prependItems,
    updateItem,
    removeItem,
  };
}
