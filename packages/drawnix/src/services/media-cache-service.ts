/**
 * Media Cache Service
 *
 * Manages caching of generated images and videos using IndexedDB.
 * Allows media to persist even after original URLs expire.
 */

// Database constants
const DB_NAME = 'aitu-media-cache';
const DB_VERSION = 1;
const STORE_NAME = 'media';

// Cached media interface
export interface CachedMedia {
  taskId: string;
  type: 'image' | 'video';
  blob: Blob;
  mimeType: string;
  size: number;
  cachedAt: number;
  prompt?: string;
  originalUrl?: string;
}

// Cache status
export type CacheStatus = 'none' | 'caching' | 'cached' | 'error';

// Cache progress callback
export type CacheProgressCallback = (progress: number) => void;

/**
 * Media Cache Service
 * Singleton service for managing media cache in IndexedDB
 */
class MediaCacheService {
  private db: IDBDatabase | null = null;
  private dbPromise: Promise<IDBDatabase> | null = null;
  private cacheStatusMap: Map<string, CacheStatus> = new Map();
  private listeners: Set<() => void> = new Set();

  constructor() {
    // Initialize database on service creation
    this.initDB();
  }

  /**
   * Initialize IndexedDB database
   */
  private async initDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('[MediaCache] Failed to open database:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[MediaCache] Database opened successfully');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'taskId' });
          store.createIndex('cachedAt', 'cachedAt', { unique: false });
          store.createIndex('type', 'type', { unique: false });
          console.log('[MediaCache] Object store created');
        }
      };
    });

    return this.dbPromise;
  }

  /**
   * Cache media from Blob (直接缓存 Blob 对象)
   */
  async cacheMediaFromBlob(
    taskId: string,
    blob: Blob,
    type: 'image' | 'video',
    mimeType: string,
    prompt?: string
  ): Promise<string> {
    try {
      // Update status
      this.setCacheStatus(taskId, 'caching');

      // Store in IndexedDB
      const db = await this.initDB();
      const cachedMedia: CachedMedia = {
        taskId,
        type,
        blob,
        mimeType,
        size: blob.size,
        cachedAt: Date.now(),
        prompt,
      };

      await this.storeMedia(db, cachedMedia);

      // Update status
      this.setCacheStatus(taskId, 'cached');
      console.log(`[MediaCache] Cached ${type} from Blob for task ${taskId}, size: ${blob.size} bytes`);

      // Return IndexedDB-backed URL
      return URL.createObjectURL(blob);
    } catch (error) {
      console.error(`[MediaCache] Failed to cache Blob for task ${taskId}:`, error);
      this.setCacheStatus(taskId, 'error');
      throw error;
    }
  }

  /**
   * Cache media from URL
   */
  async cacheMedia(
    taskId: string,
    url: string,
    type: 'image' | 'video',
    prompt?: string,
    onProgress?: CacheProgressCallback
  ): Promise<boolean> {
    try {
      // Update status
      this.setCacheStatus(taskId, 'caching');

      // Fetch media as blob with progress tracking
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch media: ${response.status}`);
      }

      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;

      let loaded = 0;
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          chunks.push(value);
          loaded += value.length;

          if (total && onProgress) {
            onProgress(Math.round((loaded / total) * 100));
          }
        }
      }

      // Create blob from chunks
      const blob = new Blob(chunks, {
        type: response.headers.get('content-type') || (type === 'image' ? 'image/png' : 'video/mp4')
      });

      // Store in IndexedDB
      const db = await this.initDB();
      const cachedMedia: CachedMedia = {
        taskId,
        type,
        blob,
        mimeType: blob.type,
        size: blob.size,
        cachedAt: Date.now(),
        prompt,
        originalUrl: url,
      };

      await this.storeMedia(db, cachedMedia);

      // Update status
      this.setCacheStatus(taskId, 'cached');
      console.log(`[MediaCache] Cached ${type} for task ${taskId}, size: ${blob.size} bytes`);

      return true;
    } catch (error) {
      console.error(`[MediaCache] Failed to cache media for task ${taskId}:`, error);
      this.setCacheStatus(taskId, 'error');
      return false;
    }
  }

  /**
   * Store media in IndexedDB
   */
  private storeMedia(db: IDBDatabase, media: CachedMedia): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(media);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get cached media by task ID
   */
  async getCachedMedia(taskId: string): Promise<CachedMedia | null> {
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(taskId);

        request.onsuccess = () => {
          resolve(request.result || null);
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error(`[MediaCache] Failed to get cached media for task ${taskId}:`, error);
      return null;
    }
  }

  /**
   * Get cached media URL (creates object URL from blob)
   */
  async getCachedUrl(taskId: string): Promise<string | null> {
    const cached = await this.getCachedMedia(taskId);
    if (cached?.blob) {
      return URL.createObjectURL(cached.blob);
    }
    return null;
  }

  /**
   * Check if media is cached
   */
  async isCached(taskId: string): Promise<boolean> {
    const cached = await this.getCachedMedia(taskId);
    return cached !== null;
  }

  /**
   * Delete cached media
   */
  async deleteCache(taskId: string): Promise<boolean> {
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(taskId);

        request.onsuccess = () => {
          this.setCacheStatus(taskId, 'none');
          console.log(`[MediaCache] Deleted cache for task ${taskId}`);
          resolve(true);
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error(`[MediaCache] Failed to delete cache for task ${taskId}:`, error);
      return false;
    }
  }

  /**
   * Get all cached task IDs
   */
  async getAllCachedTaskIds(): Promise<string[]> {
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAllKeys();

        request.onsuccess = () => {
          resolve(request.result as string[]);
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('[MediaCache] Failed to get all cached task IDs:', error);
      return [];
    }
  }

  /**
   * Get total cache size
   */
  async getTotalCacheSize(): Promise<number> {
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
          const items = request.result as CachedMedia[];
          const totalSize = items.reduce((sum, item) => sum + (item.size || 0), 0);
          resolve(totalSize);
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('[MediaCache] Failed to get total cache size:', error);
      return 0;
    }
  }

  /**
   * Clear all cached media
   */
  async clearAllCache(): Promise<boolean> {
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onsuccess = () => {
          this.cacheStatusMap.clear();
          this.notifyListeners();
          console.log('[MediaCache] All cache cleared');
          resolve(true);
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('[MediaCache] Failed to clear all cache:', error);
      return false;
    }
  }

  /**
   * Set cache status for a task
   */
  private setCacheStatus(taskId: string, status: CacheStatus): void {
    this.cacheStatusMap.set(taskId, status);
    this.notifyListeners();
  }

  /**
   * Get cache status for a task
   */
  getCacheStatus(taskId: string): CacheStatus {
    return this.cacheStatusMap.get(taskId) || 'none';
  }

  /**
   * Subscribe to cache status changes
   */
  subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Notify all listeners of status change
   */
  private notifyListeners(): void {
    this.listeners.forEach(callback => callback());
  }

  /**
   * Initialize cache status from IndexedDB
   * Call this on app startup to sync status
   */
  async initCacheStatus(): Promise<void> {
    const cachedIds = await this.getAllCachedTaskIds();
    cachedIds.forEach(id => {
      this.cacheStatusMap.set(id, 'cached');
    });
    this.notifyListeners();
  }

  /**
   * Format file size for display
   */
  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

// Export singleton instance
export const mediaCacheService = new MediaCacheService();
