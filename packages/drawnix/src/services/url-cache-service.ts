/**
 * URL Cache Service
 *
 * 混合缓存策略：内存缓存 + IndexedDB 持久化
 * - 图片：转换为 Base64 存储，永久有效
 * - 视频：存储 Blob，通过 ObjectURL 访问
 */

import { DataURL } from '../types';
import { getDataURL } from '../data/blob';

// IndexedDB 配置
const DB_NAME = 'aitu-url-cache';
const DB_VERSION = 1;
const STORE_NAME = 'media-cache';

// 缓存条目接口
interface CacheEntry {
  url: string;           // 原始 URL（作为 key）
  type: 'image' | 'video';
  data: string;          // Base64 for images, stored as string
  blob?: Blob;           // Blob for videos
  mimeType: string;
  size: number;
  cachedAt: number;
}

/**
 * URL 缓存服务
 * 单例模式，提供统一的缓存管理
 */
class UrlCacheService {
  // 内存缓存层
  private memoryCache: Map<string, DataURL> = new Map();
  private videoBlobCache: Map<string, Blob> = new Map();

  // IndexedDB 实例
  private db: IDBDatabase | null = null;
  private dbPromise: Promise<IDBDatabase> | null = null;

  // 正在进行的下载任务（防止重复下载）
  private pendingDownloads: Map<string, Promise<DataURL>> = new Map();

  constructor() {
    this.initDB();
  }

  /**
   * 初始化 IndexedDB
   */
  private async initDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('[UrlCache] Failed to open database:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[UrlCache] Database opened successfully');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'url' });
          store.createIndex('cachedAt', 'cachedAt', { unique: false });
          store.createIndex('type', 'type', { unique: false });
          console.log('[UrlCache] Object store created');
        }
      };
    });

    return this.dbPromise;
  }

  /**
   * 获取图片的 Base64 数据（带缓存）
   * @param imageUrl 图片 URL
   * @returns Base64 DataURL
   */
  async getImageAsBase64(imageUrl: string): Promise<DataURL> {
    // 1. 检查内存缓存
    const memoryCached = this.memoryCache.get(imageUrl);
    if (memoryCached) {
      console.log('[UrlCache] Memory cache hit for:', imageUrl.substring(0, 50));
      return memoryCached;
    }

    // 2. 检查是否已经有进行中的下载
    const pending = this.pendingDownloads.get(imageUrl);
    if (pending) {
      console.log('[UrlCache] Waiting for pending download:', imageUrl.substring(0, 50));
      return pending;
    }

    // 3. 检查 IndexedDB 缓存
    const dbCached = await this.getFromIndexedDB(imageUrl);
    if (dbCached && dbCached.type === 'image') {
      const dataURL = dbCached.data as DataURL;
      this.memoryCache.set(imageUrl, dataURL);
      console.log('[UrlCache] IndexedDB cache hit for:', imageUrl.substring(0, 50));
      return dataURL;
    }

    // 4. 下载并缓存
    const downloadPromise = this.downloadAndCacheImage(imageUrl);
    this.pendingDownloads.set(imageUrl, downloadPromise);

    try {
      const dataURL = await downloadPromise;
      return dataURL;
    } finally {
      this.pendingDownloads.delete(imageUrl);
    }
  }

  /**
   * 下载图片并转换为 Base64，存入缓存
   */
  private async downloadAndCacheImage(imageUrl: string): Promise<DataURL> {
    console.log('[UrlCache] Downloading image:', imageUrl.substring(0, 50));

    try {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }

      const blob = await response.blob();
      const dataURL = await getDataURL(blob);

      // 存入内存缓存
      this.memoryCache.set(imageUrl, dataURL);

      // 存入 IndexedDB
      const entry: CacheEntry = {
        url: imageUrl,
        type: 'image',
        data: dataURL,
        mimeType: blob.type,
        size: blob.size,
        cachedAt: Date.now(),
      };
      await this.saveToIndexedDB(entry);

      console.log('[UrlCache] Image cached successfully:', {
        url: imageUrl.substring(0, 50),
        size: `${(blob.size / 1024).toFixed(1)} KB`,
      });

      return dataURL;
    } catch (error) {
      console.error('[UrlCache] Failed to download image:', error);
      throw error;
    }
  }

  /**
   * 获取视频的 Blob（带缓存）
   * @param videoUrl 视频 URL
   * @returns Blob 和 ObjectURL
   */
  async getVideoAsBlob(videoUrl: string): Promise<{ blob: Blob; objectUrl: string }> {
    // 1. 检查内存缓存
    const memoryCached = this.videoBlobCache.get(videoUrl);
    if (memoryCached) {
      console.log('[UrlCache] Video memory cache hit for:', videoUrl.substring(0, 50));
      return {
        blob: memoryCached,
        objectUrl: URL.createObjectURL(memoryCached),
      };
    }

    // 2. 检查 IndexedDB 缓存
    const dbCached = await this.getFromIndexedDB(videoUrl);
    if (dbCached && dbCached.type === 'video' && dbCached.blob) {
      this.videoBlobCache.set(videoUrl, dbCached.blob);
      console.log('[UrlCache] Video IndexedDB cache hit for:', videoUrl.substring(0, 50));
      return {
        blob: dbCached.blob,
        objectUrl: URL.createObjectURL(dbCached.blob),
      };
    }

    // 3. 下载并缓存
    return this.downloadAndCacheVideo(videoUrl);
  }

  /**
   * 下载视频并存入缓存
   */
  private async downloadAndCacheVideo(videoUrl: string): Promise<{ blob: Blob; objectUrl: string }> {
    console.log('[UrlCache] Downloading video:', videoUrl.substring(0, 50));

    try {
      const response = await fetch(videoUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch video: ${response.status}`);
      }

      const blob = await response.blob();

      // 存入内存缓存
      this.videoBlobCache.set(videoUrl, blob);

      // 存入 IndexedDB
      const entry: CacheEntry = {
        url: videoUrl,
        type: 'video',
        data: '', // 视频不存 Base64
        blob: blob,
        mimeType: blob.type,
        size: blob.size,
        cachedAt: Date.now(),
      };
      await this.saveToIndexedDB(entry);

      console.log('[UrlCache] Video cached successfully:', {
        url: videoUrl.substring(0, 50),
        size: `${(blob.size / 1024 / 1024).toFixed(1)} MB`,
      });

      return {
        blob,
        objectUrl: URL.createObjectURL(blob),
      };
    } catch (error) {
      console.error('[UrlCache] Failed to download video:', error);
      throw error;
    }
  }

  /**
   * 从 IndexedDB 获取缓存
   */
  private async getFromIndexedDB(url: string): Promise<CacheEntry | null> {
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(url);

        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('[UrlCache] Failed to get from IndexedDB:', error);
      return null;
    }
  }

  /**
   * 保存到 IndexedDB
   */
  private async saveToIndexedDB(entry: CacheEntry): Promise<void> {
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(entry);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('[UrlCache] Failed to save to IndexedDB:', error);
    }
  }

  /**
   * 检查 URL 是否已缓存
   */
  async isCached(url: string): Promise<boolean> {
    if (this.memoryCache.has(url) || this.videoBlobCache.has(url)) {
      return true;
    }
    const cached = await this.getFromIndexedDB(url);
    return cached !== null;
  }

  /**
   * 清除指定 URL 的缓存
   */
  async clearCache(url: string): Promise<void> {
    this.memoryCache.delete(url);
    this.videoBlobCache.delete(url);

    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(url);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('[UrlCache] Failed to clear cache:', error);
    }
  }

  /**
   * 清除所有缓存
   */
  async clearAllCache(): Promise<void> {
    this.memoryCache.clear();
    this.videoBlobCache.clear();

    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onsuccess = () => {
          console.log('[UrlCache] All cache cleared');
          resolve();
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('[UrlCache] Failed to clear all cache:', error);
    }
  }

  /**
   * 获取缓存统计信息
   */
  async getCacheStats(): Promise<{
    memoryImageCount: number;
    memoryVideoCount: number;
    indexedDBCount: number;
    totalSize: number;
  }> {
    let indexedDBCount = 0;
    let totalSize = 0;

    try {
      const db = await this.initDB();
      const entries = await new Promise<CacheEntry[]>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });

      indexedDBCount = entries.length;
      totalSize = entries.reduce((sum, entry) => sum + (entry.size || 0), 0);
    } catch (error) {
      console.error('[UrlCache] Failed to get cache stats:', error);
    }

    return {
      memoryImageCount: this.memoryCache.size,
      memoryVideoCount: this.videoBlobCache.size,
      indexedDBCount,
      totalSize,
    };
  }
}

// 导出单例实例
export const urlCacheService = new UrlCacheService();
