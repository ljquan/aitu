/// <reference lib="webworker" />
/* eslint-disable no-restricted-globals */

// fix: self redeclaration error and type casting
const sw = self as unknown as ServiceWorkerGlobalScope;
export { }; // Make this a module

// Import task queue module
import {
  initTaskQueue,
  handleTaskQueueMessage,
  initWorkflowHandler,
  updateWorkflowConfig,
  isWorkflowMessage,
  handleWorkflowMessage,
  handleMainThreadToolResponse,
  resendPendingToolRequests,
  taskQueueStorage,
  type MainToSWMessage,
  type WorkflowMainToSWMessage,
  type MainThreadToolResponseMessage,
} from './task-queue';

// Initialize task queue (instance used internally by handleTaskQueueMessage)
initTaskQueue(sw);

// Service Worker for PWA functionality and handling CORS issues with external images
// Version will be replaced during build process
declare const __APP_VERSION__: string;
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
const CACHE_NAME = `drawnix-v${APP_VERSION}`;
const IMAGE_CACHE_NAME = `drawnix-images`;
const STATIC_CACHE_NAME = `drawnix-static-v${APP_VERSION}`;
const FONT_CACHE_NAME = `drawnix-fonts`;

// 缓存 URL 前缀 - 用于合并视频、图片等本地缓存资源
const CACHE_URL_PREFIX = '/__aitu_cache__/';

// 素材库 URL 前缀 - 用于素材库媒体资源
const ASSET_LIBRARY_PREFIX = '/asset-library/';

// Detect development mode
// 在构建时，process.env.NODE_ENV 会被替换，或者我们可以通过 mode 判断
// 这里使用 location 判断也行，但通常构建时会注入
const isDevelopment = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

interface CorsDomain {
  hostname: string;
  pathPattern: string;
  fallbackDomain: string;
}

// 允许跨域处理的域名配置 - 仅拦截需要CORS处理的域名
// 备用域名 cdn.i666.fun 支持原生跨域显示，不需要拦截
const CORS_ALLOWED_DOMAINS: CorsDomain[] = [
  {
    hostname: 'google.datas.systems',
    pathPattern: 'response_images',
    fallbackDomain: 'cdn.i666.fun'
  },
  {
    hostname: 'googlecdn2.datas.systems',
    pathPattern: 'response_images',
    fallbackDomain: 'googlecdn2.i666.fun'
  },
  {
    hostname: 'filesystem.i666.fun',
    pathPattern: 'response_images',
    fallbackDomain: 'filesystem.i666.fun'
  }
];

// 通用图片文件扩展名匹配
const IMAGE_EXTENSIONS_REGEX = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i;

// 视频文件扩展名匹配
const VIDEO_EXTENSIONS_REGEX = /\.(mp4|webm|ogg|mov|avi|mkv|flv|wmv|m4v)$/i;

interface PendingRequestEntry {
  promise: Promise<Response>;
  timestamp: number;
  count: number;
  originalRequestId?: string;
  duplicateRequestIds?: string[];
  requestId?: string; // for video
}

// 图片请求去重字典：存储正在进行的请求Promise
const pendingImageRequests = new Map<string, PendingRequestEntry>();

// 已完成请求的缓存：存储最近完成的请求 Response，避免短时间内重复请求
interface CompletedRequestEntry {
  response: Response;
  timestamp: number;
}
const completedImageRequests = new Map<string, CompletedRequestEntry>();
// 已完成请求的缓存保留时间（30秒）
const COMPLETED_REQUEST_CACHE_TTL = 30 * 1000;

interface VideoRequestEntry {
  promise: Promise<Blob | null>;
  timestamp: number;
  count: number;
  requestId: string;
}

// 视频请求去重字典：存储正在进行的视频下载Promise
// 注意：这里 promise 返回的是 Blob 而不是 Response，所以类型略有不同，但为了方便统一定义
const pendingVideoRequests = new Map<string, VideoRequestEntry>();

interface VideoCacheEntry {
  blob: Blob;
  timestamp: number;
}

// 视频缓存：存储已下载的完整视频Blob，用于快速响应Range请求
const videoBlobCache = new Map<string, VideoCacheEntry>();

// 域名故障标记：记录已知失败的域名
const failedDomains = new Set<string>();

// 检查URL是否需要CORS处理
function shouldHandleCORS(url: URL): CorsDomain | null {
  for (const domain of CORS_ALLOWED_DOMAINS) {
    if (url.hostname === domain.hostname && url.pathname.includes(domain.pathPattern)) {
      return domain;
    }
  }
  return null;
}

// 检查是否为图片请求
function isImageRequest(url: URL, request: Request): boolean {
  return (
    IMAGE_EXTENSIONS_REGEX.test(url.pathname) ||
    request.destination === 'image' ||
    shouldHandleCORS(url) !== null
  );
}

// 检查是否为视频请求
function isVideoRequest(url: URL, request: Request): boolean {
  return (
    VIDEO_EXTENSIONS_REGEX.test(url.pathname) ||
    request.destination === 'video' ||
    url.pathname.includes('/video/') ||
    url.hash.startsWith('#merged-video-') || // 合并视频的特殊标识
    url.hash.includes('video') // 视频的 # 标识
  );
}

// 检查是否为字体请求
function isFontRequest(url: URL, request: Request): boolean {
  // Google Fonts CSS 文件
  if (url.hostname === 'fonts.googleapis.com') {
    return true;
  }
  // Google Fonts 字体文件
  if (url.hostname === 'fonts.gstatic.com') {
    return true;
  }
  // 通用字体文件扩展名
  const fontExtensions = /\.(woff|woff2|ttf|otf|eot)$/i;
  return fontExtensions.test(url.pathname) || request.destination === 'font';
}

// 从IndexedDB恢复失败域名列表
async function loadFailedDomains(): Promise<void> {
  try {
    const request = indexedDB.open('ServiceWorkerDB', 1);

    return new Promise((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        if (db.objectStoreNames.contains('failedDomains')) {
          const transaction = db.transaction(['failedDomains'], 'readonly');
          const store = transaction.objectStore('failedDomains');
          const getAllRequest = store.getAll();

          getAllRequest.onsuccess = () => {
            const domains = getAllRequest.result;
            domains.forEach((item: any) => failedDomains.add(item.domain));
            // console.log('Service Worker: 恢复失败域名列表:', Array.from(failedDomains));
            resolve();
          };
          getAllRequest.onerror = () => reject(getAllRequest.error);
        } else {
          resolve();
        }
      };
      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('failedDomains')) {
          db.createObjectStore('failedDomains', { keyPath: 'domain' });
        }
      };
    });
  } catch (error) {
    console.warn('Service Worker: 无法加载失败域名列表:', error);
  }
}

// 保存失败域名到IndexedDB
async function saveFailedDomain(domain: string): Promise<void> {
  try {
    const request = indexedDB.open('ServiceWorkerDB', 1);

    return new Promise((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['failedDomains'], 'readwrite');
        const store = transaction.objectStore('failedDomains');

        store.put({ domain: domain, timestamp: Date.now() });
        transaction.oncomplete = () => {
          // console.log('Service Worker: 已保存失败域名到数据库:', domain);
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      };
      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('failedDomains')) {
          db.createObjectStore('failedDomains', { keyPath: 'domain' });
        }
      };
    });
  } catch (error) {
    console.warn('Service Worker: 无法保存失败域名:', error);
  }
}


// ==================== 智能升级相关函数 ====================

// 标记新版本已准备好，等待用户确认
function markNewVersionReady() {
  // console.log(`Service Worker: 新版本 v${APP_VERSION} 已准备好，等待用户确认...`);

  // 通知客户端有新版本可用
  sw.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'SW_NEW_VERSION_READY',
        version: APP_VERSION
      });
    });
  });
}

// 清理旧的缓存条目以释放空间（基于LRU策略）
async function cleanOldCacheEntries(cache: Cache) {
  try {
    // console.log('Service Worker: Starting cache cleanup to free space');
    const requests = await cache.keys();

    if (requests.length <= 10) {
      // console.log('Service Worker: Cache has few entries, skipping cleanup');
      return;
    }

    interface CacheEntry {
      request: Request;
      cacheDate: number;
      imageSize: number;
    }

    // 获取所有缓存条目及其时间戳
    const entries: CacheEntry[] = [];
    for (const request of requests) {
      try {
        const response = await cache.match(request);
        if (response) {
          const cacheDate = response.headers.get('sw-cache-date');
          const imageSize = response.headers.get('sw-image-size');
          entries.push({
            request,
            cacheDate: cacheDate ? parseInt(cacheDate) : 0,
            imageSize: imageSize ? parseInt(imageSize) : 0
          });
        }
      } catch (error) {
        console.warn('Service Worker: Error reading cache entry:', error);
      }
    }

    // 按时间排序，最老的在前面
    entries.sort((a, b) => a.cacheDate - b.cacheDate);

    // 删除最老的25%缓存条目
    const deleteCount = Math.max(1, Math.floor(entries.length * 0.25));
    let deletedCount = 0;
    let freedSpace = 0;

    for (let i = 0; i < deleteCount && i < entries.length; i++) {
      try {
        await cache.delete(entries[i].request);
        deletedCount++;
        freedSpace += entries[i].imageSize;
        // console.log(`Service Worker: Deleted old cache entry (${(entries[i].imageSize / 1024 / 1024).toFixed(2)}MB)`);
      } catch (error) {
        console.warn('Service Worker: Error deleting cache entry:', error);
      }
    }

    // console.log(`Service Worker: Cache cleanup completed, deleted ${deletedCount} entries, freed ${(freedSpace / 1024 / 1024).toFixed(2)}MB`);

  } catch (error) {
    console.warn('Service Worker: Cache cleanup failed:', error);
  }
}

// Files to cache for offline functionality (only in production)
const STATIC_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/favicon-new.svg'
];

sw.addEventListener('install', (event: ExtendableEvent) => {
  // console.log(`Service Worker v${APP_VERSION} installing...`);

  const installPromises: Promise<any>[] = [];

  // Load failed domains from database
  installPromises.push(loadFailedDomains());

  // Only pre-cache static files in production
  if (!isDevelopment) {
    installPromises.push(
      caches.open(STATIC_CACHE_NAME)
        .then(cache => {
          // console.log('Caching static files for new version');
          return cache.addAll(STATIC_FILES);
        })
        .catch(_err => {/* console.log('Cache pre-loading failed:', err) */})
    );
  }

  event.waitUntil(
    Promise.all(installPromises).then(() => {
      // console.log(`Service Worker v${APP_VERSION} installed, resources ready`);
      // 不立即调用 skipWaiting()，而是标记新版本已准备好
      // 等待合适的时机（没有活跃请求时）再升级
      markNewVersionReady();
    })
  );
});

sw.addEventListener('activate', (event: ExtendableEvent) => {
  // console.log('Service Worker activated');

  // 迁移旧的图片缓存并清理过期缓存
  // 重要：延迟清理旧版本的静态资源缓存，避免升级时资源加载失败
  event.waitUntil(
    caches.keys().then(async cacheNames => {
      // 查找旧的版本化图片缓存
      const legacyImageCaches = cacheNames.filter(name =>
        name.startsWith('drawnix-images-v') && name !== IMAGE_CACHE_NAME
      );

      // 如果存在旧的图片缓存,迁移到新的固定名称缓存
      if (legacyImageCaches.length > 0) {
        // console.log('Migrating legacy image caches to new cache name:', legacyImageCaches);

        const newImageCache = await caches.open(IMAGE_CACHE_NAME);

        // 迁移所有旧缓存中的数据
        for (const legacyCacheName of legacyImageCaches) {
          try {
            const legacyCache = await caches.open(legacyCacheName);
            const requests = await legacyCache.keys();

            // console.log(`Migrating ${requests.length} images from ${legacyCacheName}`);

            for (const request of requests) {
              const response = await legacyCache.match(request);
              if (response) {
                await newImageCache.put(request, response);
              }
            }

            // 迁移完成后删除旧缓存
            await caches.delete(legacyCacheName);
            // console.log(`Deleted legacy cache: ${legacyCacheName}`);
          } catch (error) {
            console.warn(`Failed to migrate cache ${legacyCacheName}:`, error);
          }
        }

        // console.log('Image cache migration completed');
      }

      // 找出旧版本的静态资源缓存（但不立即删除）
      const oldStaticCaches = cacheNames.filter(name =>
        name.startsWith('drawnix-static-v') && name !== STATIC_CACHE_NAME
      );

      const oldAppCaches = cacheNames.filter(name =>
        name.startsWith('drawnix-v') &&
        name !== CACHE_NAME &&
        name !== IMAGE_CACHE_NAME &&
        !name.startsWith('drawnix-static-v')
      );

      if (oldStaticCaches.length > 0 || oldAppCaches.length > 0) {
        // console.log('Found old version caches, will keep them temporarily:', [...oldStaticCaches, ...oldAppCaches]);
        // console.log('Old caches will be cleaned up after clients are updated');

        // 延迟 30 秒后清理旧缓存，给所有客户端足够时间刷新
        setTimeout(async () => {
          // console.log('Cleaning up old version caches now...');
          for (const cacheName of [...oldStaticCaches, ...oldAppCaches]) {
            try {
              await caches.delete(cacheName);
              // console.log('Deleted old cache:', cacheName);
            } catch (error) {
              console.warn('Failed to delete old cache:', cacheName, error);
            }
          }
          // console.log('Old version caches cleanup completed');
        }, 30000); // 30秒延迟
      }

      // console.log(`Service Worker v${APP_VERSION} activated`);
      return sw.clients.claim();
    })
  );
});

// Task queue message types
const TASK_QUEUE_MESSAGE_TYPES = [
  'TASK_QUEUE_INIT',
  'TASK_QUEUE_UPDATE_CONFIG',
  'TASK_SUBMIT',
  'TASK_CANCEL',
  'TASK_RETRY',
  'TASK_RESUME',
  'TASK_GET_STATUS',
  'TASK_GET_ALL',
  'TASK_DELETE',
  'TASK_MARK_INSERTED',
  'CHAT_START',
  'CHAT_STOP',
  'TASK_RESTORE',
];

// Check if message is a task queue message
function isTaskQueueMessage(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const msg = data as { type?: string };
  return msg.type ? TASK_QUEUE_MESSAGE_TYPES.includes(msg.type) : false;
}

// Track if workflow handler is initialized
let workflowHandlerInitialized = false;

// Store config for lazy initialization
let storedGeminiConfig: any = null;
let storedVideoConfig: any = null;

// Pending workflow messages waiting for config
interface PendingWorkflowMessage {
  message: WorkflowMainToSWMessage;
  clientId: string;
}
const pendingWorkflowMessages: PendingWorkflowMessage[] = [];

// Handle messages from main thread
sw.addEventListener('message', (event: ExtendableMessageEvent) => {
  // Handle task queue messages
  if (event.data && isTaskQueueMessage(event.data)) {
    const clientId = (event.source as Client)?.id || '';
    handleTaskQueueMessage(event.data as MainToSWMessage, clientId);

    // Initialize workflow handler when task queue is initialized
    if (event.data.type === 'TASK_QUEUE_INIT') {
      const { geminiConfig, videoConfig } = event.data;
      // Store config for later use
      storedGeminiConfig = geminiConfig;
      storedVideoConfig = videoConfig;
      
      if (!workflowHandlerInitialized) {
        initWorkflowHandler(sw, geminiConfig, videoConfig);
        workflowHandlerInitialized = true;
        // console.log('Service Worker: Workflow handler initialized');
        
        // Process any pending workflow messages that were waiting for config
        if (pendingWorkflowMessages.length > 0) {
          for (const pending of pendingWorkflowMessages) {
            handleWorkflowMessage(pending.message, pending.clientId);
          }
          pendingWorkflowMessages.length = 0; // Clear the array
        }
      }

      // Re-send any pending tool requests to the new client
      // This handles page refresh during workflow execution
      resendPendingToolRequests();
    }

    // Update workflow config when task queue config is updated
    if (event.data.type === 'TASK_QUEUE_UPDATE_CONFIG') {
      const { geminiConfig, videoConfig } = event.data;
      // Update stored config
      if (geminiConfig) storedGeminiConfig = { ...storedGeminiConfig, ...geminiConfig };
      if (videoConfig) storedVideoConfig = { ...storedVideoConfig, ...videoConfig };
      updateWorkflowConfig(geminiConfig, videoConfig);
    }

    return;
  }

  // Handle workflow messages
  if (event.data && isWorkflowMessage(event.data)) {
    // Lazy initialize workflow handler if not yet initialized
    if (!workflowHandlerInitialized && storedGeminiConfig && storedVideoConfig) {
      initWorkflowHandler(sw, storedGeminiConfig, storedVideoConfig);
      workflowHandlerInitialized = true;
      // console.log('Service Worker: Workflow handler lazy initialized');
    }
    
    // If still not initialized, try to load config from storage
    if (!workflowHandlerInitialized) {
      // Use async IIFE to handle the async operation
      (async () => {
        try {
          const { geminiConfig, videoConfig } = await taskQueueStorage.loadConfig();
          if (geminiConfig && videoConfig) {
            storedGeminiConfig = geminiConfig;
            storedVideoConfig = videoConfig;
            initWorkflowHandler(sw, geminiConfig, videoConfig);
            workflowHandlerInitialized = true;
            // console.log('Service Worker: Workflow handler initialized from storage');
            
            // Now handle the message
            const clientId = (event.source as Client)?.id || '';
            handleWorkflowMessage(event.data as WorkflowMainToSWMessage, clientId);
          } else {
            // 配置不存在时，通知主线程需要重新发送配置
            console.warn('[SW] Cannot initialize workflow handler: no config in storage, requesting config from main thread');
            
            // 广播请求配置消息给所有客户端
            const clients = await sw.clients.matchAll({ type: 'window' });
            for (const client of clients) {
              client.postMessage({
                type: 'SW_REQUEST_CONFIG',
                reason: 'workflow_handler_not_initialized',
                pendingMessageType: (event.data as WorkflowMainToSWMessage).type,
              });
            }
            
            // 将消息暂存，等配置到达后再处理
            pendingWorkflowMessages.push({
              message: event.data as WorkflowMainToSWMessage,
              clientId: (event.source as Client)?.id || '',
            });
          }
        } catch (error) {
          console.error('[SW] Failed to load config from storage:', error);
        }
      })();
      return;
    }
    
    const clientId = (event.source as Client)?.id || '';
    handleWorkflowMessage(event.data as WorkflowMainToSWMessage, clientId);
    return;
  }

  // Handle main thread tool response
  if (event.data && event.data.type === 'MAIN_THREAD_TOOL_RESPONSE') {
    handleMainThreadToolResponse(event.data as MainThreadToolResponseMessage);
    return;
  }

  if (event.data && event.data.type === 'SKIP_WAITING') {
    // 主线程请求立即升级（用户主动触发）
    // console.log('Service Worker: 收到主线程的 SKIP_WAITING 请求');

    // 直接调用 skipWaiting
    sw.skipWaiting();

    // Notify clients that SW has been updated
    sw.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({ type: 'SW_UPDATED' });
      });
    });
  } else if (event.data && event.data.type === 'GET_UPGRADE_STATUS') {
    // 主线程查询升级状态
    event.source?.postMessage({
      type: 'UPGRADE_STATUS',
      version: APP_VERSION
    });
  } else if (event.data && event.data.type === 'FORCE_UPGRADE') {
    // 主线程强制升级
    // console.log('Service Worker: 收到强制升级请求');
    sw.skipWaiting();
    sw.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({ type: 'SW_UPDATED' });
      });
    });
  } else if (event.data && event.data.type === 'DELETE_CACHE') {
    // 删除单个缓存
    const { url } = event.data;
    if (url) {
      deleteCacheByUrl(url).then(() => {
        // console.log('Service Worker: Cache deleted:', url);
        // 通知主线程
        sw.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.postMessage({ type: 'CACHE_DELETED', url });
          });
        });
      }).catch(error => {
        console.error('Service Worker: Failed to delete cache:', error);
      });
    }
  } else if (event.data && event.data.type === 'DELETE_CACHE_BATCH') {
    // 批量删除缓存
    const { urls } = event.data;
    if (urls && Array.isArray(urls)) {
      deleteCacheBatch(urls).then(() => {
        // console.log('Service Worker: Batch cache deleted:', urls.length);
      }).catch(error => {
        console.error('Service Worker: Failed to batch delete caches:', error);
      });
    }
  } else if (event.data && event.data.type === 'CLEAR_ALL_CACHE') {
    // 清空所有缓存
    clearImageCache().then(() => {
      // console.log('Service Worker: All image cache cleared');
    }).catch(error => {
      console.error('Service Worker: Failed to clear all cache:', error);
    });
  }
});


// 删除单个缓存条目
async function deleteCacheByUrl(url: string): Promise<void> {
  try {
    const cache = await caches.open(IMAGE_CACHE_NAME);
    await cache.delete(url);
    // console.log('Service Worker: Deleted cache entry:', url);
  } catch (error) {
    console.error('Service Worker: Failed to delete cache entry:', url, error);
    throw error;
  }
}

// 批量删除缓存
async function deleteCacheBatch(urls: string[]): Promise<void> {
  try {
    const cache = await caches.open(IMAGE_CACHE_NAME);
    let deletedCount = 0;

    for (const url of urls) {
      try {
        await cache.delete(url);
        deletedCount++;
      } catch (error) {
        console.warn('Service Worker: Failed to delete cache in batch:', url, error);
      }
    }

    // console.log(`Service Worker: Batch deleted ${deletedCount}/${urls.length} cache entries`);
  } catch (error) {
    console.error('Service Worker: Failed to batch delete caches:', error);
    throw error;
  }
}

// 清空所有图片缓存
async function clearImageCache(): Promise<void> {
  try {
    const cache = await caches.open(IMAGE_CACHE_NAME);
    const requests = await cache.keys();

    for (const request of requests) {
      await cache.delete(request);
    }

    // console.log(`Service Worker: Cleared ${requests.length} cache entries`);
  } catch (error) {
    console.error('Service Worker: Failed to clear image cache:', error);
    throw error;
  }
}

// 通知主线程图片已缓存（带元数据）
async function notifyImageCached(url: string, size: number, mimeType: string): Promise<void> {
  try {
    const clients = await sw.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'IMAGE_CACHED',
        url,
        size,
        mimeType,
        timestamp: Date.now()
      });
    });
  } catch (error) {
    console.warn('Service Worker: Failed to notify image cached:', error);
  }
}

// 检测并警告存储配额
async function checkStorageQuota(): Promise<void> {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const percentage = quota > 0 ? (usage / quota) * 100 : 0;

      // 如果使用率超过 90%，发送警告
      if (percentage > 90) {
        console.warn('Service Worker: Storage quota warning:', { usage, quota, percentage });
        const clients = await sw.clients.matchAll();
        clients.forEach(client => {
          client.postMessage({
            type: 'QUOTA_WARNING',
            usage,
            quota
          });
        });
      }
    }
  } catch (error) {
    console.warn('Service Worker: Failed to check storage quota:', error);
  }
}

sw.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url);

  // 只处理 http 和 https 协议的请求，忽略 chrome-extension、data、blob 等
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  // 拦截缓存 URL 请求 (/__aitu_cache__/{type}/{taskId}.{ext})
  if (url.pathname.startsWith(CACHE_URL_PREFIX)) {
    // console.log('Service Worker: Intercepting cache URL request:', event.request.url);

    event.respondWith(
      handleCacheUrlRequest(event.request)
    );
    return;
  }

  // 拦截素材库 URL 请求 (/asset-library/{assetId}.{ext})
  if (url.pathname.startsWith(ASSET_LIBRARY_PREFIX)) {
    // console.log('Service Worker: Intercepting asset library request:', event.request.url);

    event.respondWith(
      handleAssetLibraryRequest(event.request)
    );
    return;
  }

  // 注意：bypass_sw 和 direct_fetch 参数不再完全绕过 SW
  // 而是在 handleImageRequest 中跳过缓存检查直接 fetch，但仍会缓存响应
  // 这样可以确保绕过请求的响应也能被缓存，供后续正常请求使用

  // 完全不拦截备用域名，让浏览器直接处理
  if (url.hostname === 'cdn.i666.fun') {
    // console.log('Service Worker: 备用域名请求直接通过，不拦截:', url.href);
    return; // 直接返回，让浏览器处理
  }

  // 放行火山引擎域名（seedream 模型图片），让浏览器直接用 <img> 标签加载
  // 这些域名不支持 CORS，但 <img> 标签可以直接加载
  if (url.hostname.endsWith('.volces.com') || url.hostname.endsWith('.volccdn.com')) {
    // console.log('Service Worker: 火山引擎域名请求直接通过，不拦截:', url.href);
    return; // 直接返回，让浏览器处理
  }

  // 放行阿里云OSS域名，这些域名不支持CORS fetch，但<img>标签可以直接加载
  if (url.hostname.endsWith('.aliyuncs.com')) {
    // console.log('Service Worker: 阿里云OSS域名请求直接通过，不拦截:', url.href);
    return; // 直接返回，让浏览器处理
  }



  // 拦截视频请求以支持 Range 请求
  if (isVideoRequest(url, event.request)) {
    // console.log('Service Worker: Intercepting video request:', url.href);

    event.respondWith(
      handleVideoRequest(event.request)
    );
    return;
  }

  // 拦截字体请求（Google Fonts CSS 和字体文件）
  if (isFontRequest(url, event.request)) {
    // console.log('Service Worker: Intercepting font request:', url.href);

    event.respondWith(
      handleFontRequest(event.request)
    );
    return;
  }

  // 拦截外部图片请求（非同源且为图片格式）
  if (url.origin !== location.origin && isImageRequest(url, event.request)) {
    // console.log('Service Worker: Intercepting external image request:', url.href);

    event.respondWith(
      handleImageRequest(event.request)
    );
    return;
  }

  // Handle static file requests with cache-first strategy
  // Handle navigation requests and static resources (JS, CSS, images, fonts, etc.)
  // Note: For navigation requests, destination might be empty or 'document'
  // In development mode, we still need to handle requests when offline
  if (event.request.method === 'GET') {
    const isNavigationRequest = event.request.mode === 'navigate';
    const isStaticResource = event.request.destination !== '';
    
    // Handle both navigation requests and static resources
    if (isNavigationRequest || isStaticResource) {
      event.respondWith(
        handleStaticRequest(event.request)
      );
      return;
    }
  }

  // 对于其他请求（如 XHR/API 请求），不拦截，让浏览器直接处理
  // 这些请求不会被追踪，但通常它们很快完成
  // SW 升级会在拦截的请求（图片、视频、静态资源）完成后进行
});

// 处理字体请求（Google Fonts CSS 和字体文件）
async function handleFontRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const requestId = Math.random().toString(36).substring(2, 10);

  try {
    // 使用 Cache-First 策略：优先从缓存读取
    const cache = await caches.open(FONT_CACHE_NAME);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      // console.log(`Service Worker [Font-${requestId}]: 从缓存返回字体:`, url.href);
      return cachedResponse;
    }

    // 缓存未命中，从网络获取
    // console.log(`Service Worker [Font-${requestId}]: 从网络下载字体:`, url.href);
    const response = await fetch(request);

    // 只缓存成功的响应
    if (response && response.status === 200) {
      // 克隆响应用于缓存
      const responseToCache = response.clone();

      // 添加自定义头部标记缓存时间
      const headers = new Headers(responseToCache.headers);
      headers.set('sw-cache-date', Date.now().toString());

      const cachedResponse = new Response(responseToCache.body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers: headers,
      });

      // 异步缓存，不阻塞响应
      cache.put(request, cachedResponse).catch(error => {
        console.warn(`Service Worker [Font-${requestId}]: 缓存字体失败:`, error);
      });

      // console.log(`Service Worker [Font-${requestId}]: 字体已缓存:`, url.href);
    }

    return response;
  } catch (error) {
    console.error(`Service Worker [Font-${requestId}]: 字体请求失败:`, error);

    // 尝试从缓存返回（离线场景）
    const cache = await caches.open(FONT_CACHE_NAME);
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      // console.log(`Service Worker [Font-${requestId}]: 网络失败，从缓存返回:`, url.href);
      return cachedResponse;
    }

    // 返回错误响应
    return new Response('Font loading failed', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: {
        'Content-Type': 'text/plain',
      },
    });
  }
}

// Utility function to perform fetch with retries
// skipRetryOnNetworkError: if true, don't retry on network errors (for offline scenarios)
async function fetchWithRetry(request: Request, maxRetries = 2, fetchOptions: any = {}, skipRetryOnNetworkError = false): Promise<Response> {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // console.log(`Fetch attempt ${attempt + 1}/${maxRetries + 1} for:`, request.url);
      const response = await fetch(request, fetchOptions);

      if (response.ok || response.status < 500) {
        // Consider 4xx errors as final (don't retry), only retry on 5xx or network errors
        return response;
      }

      if (attempt < maxRetries) {
        // console.warn(`Fetch attempt ${attempt + 1} failed with status ${response.status}, retrying...`);
        lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
        // Wait before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        continue;
      }

      return response;
    } catch (error: any) {
      // console.warn(`Fetch attempt ${attempt + 1} failed:`, error.message);
      lastError = error;

      // For network errors (offline), don't retry - fail fast
      if (skipRetryOnNetworkError) {
        throw lastError;
      }

      // Check if it's a connection refused error - don't retry these
      const isConnectionError = error.message?.includes('ERR_CONNECTION_REFUSED') ||
        error.message?.includes('ERR_NETWORK') ||
        error.message?.includes('Failed to fetch') ||
        error.message?.includes('NetworkError');
      
      if (isConnectionError) {
        // Connection refused means server is down, no point retrying
        throw lastError;
      }

      if (attempt < maxRetries) {
        // Wait before retrying (exponential backoff: 1s, 2s, 4s...)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }

  throw lastError;
}

// Quick fetch without retries - for cache-first scenarios
async function fetchQuick(request: Request, fetchOptions: any = {}): Promise<Response> {
  return fetch(request, fetchOptions);
}

// 处理缓存 URL 请求 (/__aitu_cache__/{type}/{taskId}.{ext})
// 从 Cache API 获取合并媒体并返回，视频支持 Range 请求
async function handleCacheUrlRequest(request: Request): Promise<Response> {
  const requestId = Math.random().toString(36).substring(2, 10);
  const url = new URL(request.url);
  const rangeHeader = request.headers.get('range');

  // 使用完整 URL 作为缓存 key（与主线程保持一致）
  const cacheKey = request.url;

  // 通过路径或扩展名判断是否为视频
  const isVideo = url.pathname.includes('/video/') || /\.(mp4|webm|ogg|mov)$/i.test(url.pathname);

  // console.log(`Service Worker [Cache-${requestId}]: Handling cache URL request:`, cacheKey);

  try {
    // 从 Cache API 获取
    const cache = await caches.open(IMAGE_CACHE_NAME);
    const cachedResponse = await cache.match(cacheKey);

    if (cachedResponse) {
      // console.log(`Service Worker [Cache-${requestId}]: Found cached media:`, cacheKey);
      const blob = await cachedResponse.blob();

      if (isVideo) {
        // 视频请求支持 Range
        return createVideoResponse(blob, rangeHeader, requestId);
      }

      // 图片请求 - 直接返回完整响应
      return new Response(blob, {
        status: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': blob.type || 'image/png',
          'Content-Length': blob.size.toString(),
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'max-age=31536000' // 1年
        }
      });
    }

    // 如果 Cache API 没有，返回 404
    console.error(`Service Worker [Cache-${requestId}]: Media not found in cache:`, cacheKey);
    return new Response('Media not found', {
      status: 404,
      statusText: 'Not Found',
      headers: {
        'Content-Type': 'text/plain'
      }
    });

  } catch (error) {
    console.error(`Service Worker [Cache-${requestId}]: Error handling cache URL request:`, error);
    return new Response('Internal error', {
      status: 500,
      statusText: 'Internal Server Error',
      headers: {
        'Content-Type': 'text/plain'
      }
    });
  }
}

// 处理素材库 URL 请求 (/asset-library/{assetId}.{ext})
// 从 Cache API 获取素材库媒体并返回，支持 Range 请求（视频）
async function handleAssetLibraryRequest(request: Request): Promise<Response> {
  const requestId = Math.random().toString(36).substring(2, 10);
  const url = new URL(request.url);
  const rangeHeader = request.headers.get('range');

  // 使用完整路径作为缓存 key
  const cacheKey = url.pathname;

  // console.log(`Service Worker [Asset-${requestId}]: Handling asset library request:`, cacheKey);

  try {
    // 从 Cache API 获取
    const cache = await caches.open(IMAGE_CACHE_NAME);
    const cachedResponse = await cache.match(cacheKey);

    if (cachedResponse) {
      // console.log(`Service Worker [Asset-${requestId}]: Found cached asset:`, cacheKey);
      const blob = await cachedResponse.blob();

      // 检查是否是视频请求
      const isVideo = url.pathname.match(/\.(mp4|webm|ogg|mov)$/i);

      if (isVideo && rangeHeader) {
        // 视频请求支持 Range
        return createVideoResponse(blob, rangeHeader, requestId);
      }

      // 图片或完整视频请求
      return new Response(blob, {
        status: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': blob.type || 'application/octet-stream',
          'Content-Length': blob.size.toString(),
          'Accept-Ranges': 'bytes',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'max-age=31536000' // 1年
        }
      });
    }

    // 如果 Cache API 没有，返回 404
    console.error(`Service Worker [Asset-${requestId}]: Asset not found in cache:`, cacheKey);
    return new Response('Asset not found', {
      status: 404,
      statusText: 'Not Found',
      headers: {
        'Content-Type': 'text/plain'
      }
    });

  } catch (error) {
    console.error(`Service Worker [Asset-${requestId}]: Error handling asset library request:`, error);
    return new Response('Internal error', {
      status: 500,
      statusText: 'Internal Server Error',
      headers: {
        'Content-Type': 'text/plain'
      }
    });
  }
}

// 处理视频请求,支持 Range 请求以实现视频 seek 功能
async function handleVideoRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const requestId = Math.random().toString(36).substring(2, 10);
  // console.log(`Service Worker [Video-${requestId}]: Handling video request:`, url.href);

  try {
    // 检查请求是否包含 Range header
    const rangeHeader = request.headers.get('range');
    // console.log(`Service Worker [Video-${requestId}]: Range header:`, rangeHeader);

    // 创建去重键（移除缓存破坏参数）
    const dedupeUrl = new URL(url);
    const cacheBreakingParams = ['_t', 'cache_buster', 'v', 'timestamp', 'nocache', '_cb', 't', 'retry', 'rand'];
    cacheBreakingParams.forEach(param => dedupeUrl.searchParams.delete(param));
    const dedupeKey = dedupeUrl.toString();

    // 检查是否有相同视频正在下载
    const existingEntry = pendingVideoRequests.get(dedupeKey);
    if (existingEntry) {
      existingEntry.count = (existingEntry.count || 1) + 1;
      // const waitTime = Date.now() - existingEntry.timestamp;

      // console.log(`Service Worker [Video-${requestId}]: 发现重复视频请求 (等待${waitTime}ms)，复用下载Promise:`, dedupeKey);
      // console.log(`Service Worker [Video-${requestId}]: 重复请求计数: ${existingEntry.count}`);

      // 等待视频下载完成
      const videoBlob = await existingEntry.promise;

      if (!videoBlob) {
        const fetchOptions = {
          method: 'GET',
          headers: new Headers(request.headers),
          mode: 'cors' as RequestMode,
          credentials: 'omit' as RequestCredentials
        };
        return await fetch(url, fetchOptions);
      }

      // 使用缓存的blob响应Range请求
      return createVideoResponse(videoBlob, rangeHeader, requestId);
    }

    // 检查是否已有缓存的视频Blob（内存缓存）
    if (videoBlobCache.has(dedupeKey)) {
      const cacheEntry = videoBlobCache.get(dedupeKey);
      if (cacheEntry) {
        // console.log(`Service Worker [Video-${requestId}]: 使用内存缓存的视频Blob (缓存时间: ${Math.round((Date.now() - cacheEntry.timestamp) / 1000)}秒)`);

        // 更新访问时间
        cacheEntry.timestamp = Date.now();

        return createVideoResponse(cacheEntry.blob, rangeHeader, requestId);
      }
    }

    // 检查 Cache API 持久化缓存
    try {
      const cache = await caches.open(IMAGE_CACHE_NAME);
      const cachedResponse = await cache.match(dedupeKey);
      if (cachedResponse) {
        // console.log(`Service Worker [Video-${requestId}]: 从 Cache API 恢复视频缓存`);
        const videoBlob = await cachedResponse.blob();
        const videoSizeMB = videoBlob.size / (1024 * 1024);

        // 恢复到内存缓存（用于后续快速访问）
        if (videoSizeMB < 50) {
          videoBlobCache.set(dedupeKey, {
            blob: videoBlob,
            timestamp: Date.now()
          });
          // console.log(`Service Worker [Video-${requestId}]: 视频已恢复到内存缓存`);
        }

        return createVideoResponse(videoBlob, rangeHeader, requestId);
      }
    } catch (cacheError) {
      console.warn(`Service Worker [Video-${requestId}]: 检查 Cache API 失败:`, cacheError);
    }

    // 创建新的视频下载Promise
    // console.log(`Service Worker [Video-${requestId}]: 开始下载新视频:`, dedupeKey);

    const downloadPromise = (async () => {
      // 构建请求选项
      const fetchOptions = {
        method: 'GET',
        mode: 'cors' as RequestMode,
        credentials: 'omit' as RequestCredentials,
        cache: 'default' as RequestCache // 使用浏览器默认缓存策略
      };

      // 获取视频响应（不带Range header，获取完整视频）
      const fetchUrl = new URL(dedupeUrl);
      const response = await fetch(fetchUrl, fetchOptions);

      if (!response.ok) {
        console.error(`Service Worker [Video-${requestId}]: Video fetch failed:`, response.status);
        throw new Error(`Video fetch failed: ${response.status}`);
      }

      // 如果服务器返回206，说明服务器原生支持Range，直接返回不缓存
      if (response.status === 206) {
        // console.log(`Service Worker [Video-${requestId}]: 服务器原生支持Range请求，直接返回`);
        return null; // 返回null表示不缓存，直接使用服务器响应
      }

      // 下载完整视频
      // console.log(`Service Worker [Video-${requestId}]: 开始下载完整视频...`);
      const videoBlob = await response.blob();
      const videoSizeMB = videoBlob.size / (1024 * 1024);
      // console.log(`Service Worker [Video-${requestId}]: 视频下载完成 (大小: ${videoSizeMB.toFixed(2)}MB)`);

      // 缓存视频Blob（仅缓存小于50MB的视频）
      if (videoSizeMB < 50) {
        // 1. 内存缓存（用于当前会话快速访问）
        videoBlobCache.set(dedupeKey, {
          blob: videoBlob,
          timestamp: Date.now()
        });
        // console.log(`Service Worker [Video-${requestId}]: 视频已缓存到内存`);

        // 2. 持久化到 Cache API（用于跨会话持久化）
        try {
          const cache = await caches.open(IMAGE_CACHE_NAME);
          const cacheResponse = new Response(videoBlob, {
            headers: {
              'Content-Type': videoBlob.type || 'video/mp4',
              'Content-Length': videoBlob.size.toString(),
              'sw-cache-date': Date.now().toString(),
              'sw-video-size': videoBlob.size.toString()
            }
          });
          await cache.put(dedupeKey, cacheResponse);
          // console.log(`Service Worker [Video-${requestId}]: 视频已持久化到 Cache API`);
        } catch (cacheError) {
          console.warn(`Service Worker [Video-${requestId}]: 持久化到 Cache API 失败:`, cacheError);
        }
      } else {
        // console.log(`Service Worker [Video-${requestId}]: 视频过大(${videoSizeMB.toFixed(2)}MB)，不缓存`);
      }

      return videoBlob;
    })();

    // 将下载Promise存储到去重字典
    pendingVideoRequests.set(dedupeKey, {
      promise: downloadPromise,
      timestamp: Date.now(),
      count: 1,
      requestId: requestId
    });

    // 下载完成后从字典中移除
    downloadPromise.finally(() => {
      const entry = pendingVideoRequests.get(dedupeKey);
      if (entry) {
        // const totalTime = Date.now() - entry.timestamp;
        // console.log(`Service Worker [Video-${requestId}]: 视频下载完成 (耗时${totalTime}ms，请求计数: ${entry.count})`);
        pendingVideoRequests.delete(dedupeKey);
      }
    });

    // 等待视频下载完成
    const videoBlob = await downloadPromise;

    // 如果返回null，说明服务器支持Range，重新发送原始请求
    if (videoBlob === null) {
      const fetchOptions = {
        method: 'GET',
        headers: new Headers(request.headers),
        mode: 'cors' as RequestMode,
        credentials: 'omit' as RequestCredentials
      };
      return await fetch(url, fetchOptions);
    }

    // 使用下载的blob响应Range请求
    return createVideoResponse(videoBlob as Blob, rangeHeader, requestId);

  } catch (error) {
    console.error(`Service Worker [Video-${requestId}]: Video request error:`, error);
    return new Response('Video loading error', {
      status: 500,
      statusText: 'Internal Server Error',
      headers: {
        'Content-Type': 'text/plain'
      }
    });
  }
}

// 创建视频响应，支持Range请求
function createVideoResponse(videoBlob: Blob, rangeHeader: string | null, requestId: string): Response {
  const videoSize = videoBlob.size;

  // 如果没有Range请求，返回完整视频
  if (!rangeHeader) {
    // console.log(`Service Worker [Video-${requestId}]: 返回完整视频 (大小: ${(videoSize / 1024 / 1024).toFixed(2)}MB)`);
    return new Response(videoBlob, {
      status: 200,
      statusText: 'OK',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': videoSize.toString(),
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length'
      }
    });
  }

  // 解析Range header (格式: "bytes=start-end")
  const rangeMatch = rangeHeader.match(/bytes=(\d+)-(\d*)/);
  if (!rangeMatch) {
    console.error(`Service Worker [Video-${requestId}]: Invalid Range header format`);
    return new Response(videoBlob, {
      status: 200,
      statusText: 'OK',
      headers: {
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes'
      }
    });
  }

  const start = parseInt(rangeMatch[1], 10);
  const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : videoSize - 1;

  // console.log(`Service Worker [Video-${requestId}]: Range请求: ${start}-${end} / ${videoSize} (${((end - start + 1) / 1024).toFixed(2)}KB)`);

  // 提取指定范围的数据
  const slicedBlob = videoBlob.slice(start, end + 1);
  const contentLength = end - start + 1;

  // 构建206 Partial Content响应
  return new Response(slicedBlob, {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Range': `bytes ${start}-${end}/${videoSize}`,
      'Content-Length': contentLength.toString(),
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length'
    }
  });
}

async function handleStaticRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const isHtmlRequest = request.mode === 'navigate' || url.pathname.endsWith('.html');
  const cache = await caches.open(STATIC_CACHE_NAME);

  // ===========================================
  // Development Mode: Network First (for hot reload / live updates)
  // Still caches for offline testing, but always tries network first
  // ===========================================
  if (isDevelopment) {
    try {
      const response = await fetchQuick(request);
      
      // Cache successful responses for offline testing
      if (response && response.status === 200 && request.url.startsWith('http')) {
        cache.put(request, response.clone());
      }
      
      return response;
    } catch (networkError) {
      // Network failed (server stopped) - fall back to cache
      // console.warn('Dev mode: Network failed, trying cache');
      
      let cachedResponse = await cache.match(request);
      
      // For SPA navigation, fall back to index.html
      if (!cachedResponse && isHtmlRequest) {
        cachedResponse = await cache.match('/');
        if (!cachedResponse) {
          cachedResponse = await cache.match('/index.html');
        }
      }
      
      if (cachedResponse) {
        return cachedResponse;
      }
      
      // No cache available
      if (isHtmlRequest) {
        return createOfflinePage();
      }
      return new Response('Resource unavailable', { status: 503 });
    }
  }

  // ===========================================
  // Production Mode: Optimized strategies
  // ===========================================

  // Strategy 1: HTML/Navigation - Network First with fast fallback
  if (isHtmlRequest) {
    try {
      // Try network first (no retries for connection errors - fail fast)
      const response = await fetchQuick(request, { cache: 'reload' as RequestCache });

      // Cache successful responses
      if (response && response.status === 200 && request.url.startsWith('http')) {
        cache.put(request, response.clone());
      }

      return response;
    } catch (networkError) {
      // Network failed - immediately try cache (no waiting)
      let cachedResponse = await cache.match(request);
      
      // For SPA, any route should fall back to index.html
      if (!cachedResponse) {
        cachedResponse = await cache.match('/');
      }
      if (!cachedResponse) {
        cachedResponse = await cache.match('/index.html');
      }
      
      if (cachedResponse) {
        return cachedResponse;
      }
      
      // No cache - return offline page
      return createOfflinePage();
    }
  }

  // Strategy 2: Static Resources - Cache First (fast offline)
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  // Cache miss - try network
  try {
    const response = await fetchQuick(request);

    // Validate response - don't cache HTML responses for static assets (SPA 404 fallback)
    const contentType = response.headers.get('Content-Type');
    const isInvalidResponse = response.status === 200 &&
      contentType?.includes('text/html') &&
      (url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|webp|svg|json|woff|woff2|ttf)$/i) ||
        request.destination === 'script' ||
        request.destination === 'style' ||
        request.destination === 'image' ||
        request.destination === 'font');

    if (isInvalidResponse) {
      console.warn('Service Worker: HTML response for static resource (404):', request.url);
      return new Response('Resource not found', { status: 404, statusText: 'Not Found' });
    }

    // Cache successful responses
    if (response && response.status === 200 && request.url.startsWith('http')) {
      cache.put(request, response.clone());
    }

    return response;
  } catch (networkError) {
    console.error('Static resource unavailable:', request.url);
    return new Response('Resource unavailable offline', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// Create offline fallback page
function createOfflinePage(): Response {
  return new Response(
    `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>离线 - aitu</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      text-align: center;
      padding: 20px;
    }
    h1 { font-size: 2rem; margin-bottom: 1rem; }
    p { font-size: 1.1rem; opacity: 0.9; max-width: 400px; }
    button {
      margin-top: 2rem;
      padding: 12px 24px;
      font-size: 1rem;
      border: none;
      border-radius: 8px;
      background: white;
      color: #667eea;
      cursor: pointer;
      transition: transform 0.2s;
    }
    button:hover { transform: scale(1.05); }
  </style>
</head>
<body>
  <h1>📡 无法连接到服务器</h1>
  <p>请检查您的网络连接，或稍后再试。</p>
  <button onclick="location.reload()">重试</button>
</body>
</html>`,
    {
      status: 503,
      statusText: 'Service Unavailable',
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    }
  );
}

// 图片请求超时时间（毫秒）
const IMAGE_REQUEST_TIMEOUT = 15000; // 15秒

// 过期请求清理阈值（毫秒）- 超过此时间的 pending 请求会被清理
const STALE_REQUEST_THRESHOLD = 30000; // 30秒

// 创建带超时的 Promise
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    })
  ]);
}

// 清理过期的 pending 请求和已完成请求缓存
function cleanupStaleRequests(): void {
  const now = Date.now();
  
  // 清理过期的 pending 请求
  const stalePendingKeys: string[] = [];
  pendingImageRequests.forEach((entry, key) => {
    if (now - entry.timestamp > STALE_REQUEST_THRESHOLD) {
      stalePendingKeys.push(key);
    }
  });
  
  if (stalePendingKeys.length > 0) {
    console.warn(`Service Worker: 清理 ${stalePendingKeys.length} 个过期的 pending 请求`);
    stalePendingKeys.forEach(key => pendingImageRequests.delete(key));
  }

  // 清理过期的已完成请求缓存
  const staleCompletedKeys: string[] = [];
  completedImageRequests.forEach((entry, key) => {
    if (now - entry.timestamp > COMPLETED_REQUEST_CACHE_TTL) {
      staleCompletedKeys.push(key);
    }
  });
  
  if (staleCompletedKeys.length > 0) {
    // console.log(`Service Worker: 清理 ${staleCompletedKeys.length} 个过期的已完成请求缓存`);
    staleCompletedKeys.forEach(key => completedImageRequests.delete(key));
  }
}

async function handleImageRequest(request: Request): Promise<Response> {
  try {
    // 生成唯一的请求ID用于追踪
    const requestId = Math.random().toString(36).substring(2, 10);

    // console.log(`Service Worker [${requestId}]: Intercepting image request at ${new Date().toISOString()}:`, request.url);

    // 创建原始URL（不带缓存破坏参数）用于缓存键和去重键
    const originalUrl = new URL(request.url);
    // 检测是否要求绕过缓存检查（但仍会缓存响应）
    const bypassCache = originalUrl.searchParams.has('bypass_sw') || originalUrl.searchParams.has('direct_fetch');
    const cacheBreakingParams = ['_t', 'cache_buster', 'v', 'timestamp', 'nocache', '_cb', 't', 'retry', '_retry', 'rand', '_force', 'bypass_sw', 'direct_fetch'];
    cacheBreakingParams.forEach(param => originalUrl.searchParams.delete(param));
    const originalRequest = new Request(originalUrl.toString(), {
      method: request.method,
      headers: request.headers,
      mode: request.mode,
      credentials: request.credentials
    });

    const dedupeKey = originalUrl.toString();

    // 首先检查是否有最近完成的相同请求（内存缓存）
    const completedEntry = completedImageRequests.get(dedupeKey);
    if (completedEntry) {
      const elapsed = Date.now() - completedEntry.timestamp;
      if (elapsed < COMPLETED_REQUEST_CACHE_TTL) {
        // console.log(`Service Worker [${requestId}]: 命中已完成请求缓存 (${elapsed}ms ago):`, dedupeKey);
        return completedEntry.response.clone();
      } else {
        // 缓存过期，清理
        completedImageRequests.delete(dedupeKey);
      }
    }

    // 检查是否有相同的请求正在进行
    if (pendingImageRequests.has(dedupeKey)) {
      const existingEntry = pendingImageRequests.get(dedupeKey);
      if (existingEntry) {
        // 检查请求是否已过期（卡住了）
        const elapsed = Date.now() - existingEntry.timestamp;
        if (elapsed > STALE_REQUEST_THRESHOLD) {
          console.warn(`Service Worker [${requestId}]: 发现过期的 pending 请求 (${elapsed}ms)，清理并重新发起:`, dedupeKey);
          pendingImageRequests.delete(dedupeKey);
          // 继续执行下面的新请求逻辑
        } else {
          existingEntry.count = (existingEntry.count || 1) + 1;
          // const waitTime = Date.now() - existingEntry.timestamp;

          // console.log(`Service Worker [${requestId}]: 发现重复请求 (等待${waitTime}ms)，返回已有Promise:`, dedupeKey);
          // console.log(`Service Worker [${requestId}]: 重复请求计数: ${existingEntry.count}`, dedupeKey);

          // 为重复请求添加标记，便于追踪
          existingEntry.duplicateRequestIds = existingEntry.duplicateRequestIds || [];
          existingEntry.duplicateRequestIds.push(requestId);

          // Response body 只能被消费一次，重复请求需要返回克隆
          try {
            const response = await withTimeout(
              existingEntry.promise,
              IMAGE_REQUEST_TIMEOUT,
              'Image request timeout'
            );
            return response && response.clone ? response.clone() : response;
          } catch (timeoutError: any) {
            if (timeoutError.message === 'Image request timeout') {
              console.warn(`Service Worker [${requestId}]: 重复请求等待超时，清理并返回超时响应让前端直接加载`);
              // 超时后主动清理该条目，避免后续请求继续等待
              pendingImageRequests.delete(dedupeKey);
              return createTimeoutResponse(request.url, requestId);
            }
            throw timeoutError;
          }
        }
      }
    }

    // 定期清理过期请求（每次新请求时检查）
    cleanupStaleRequests();

    // 创建请求处理Promise并存储到去重字典
    const requestPromise = handleImageRequestInternal(originalRequest, request.url, dedupeKey, requestId, bypassCache);

    // 将Promise存储到去重字典中，包含时间戳和计数
    pendingImageRequests.set(dedupeKey, {
      promise: requestPromise,
      timestamp: Date.now(),
      count: 1,
      originalRequestId: requestId,
      duplicateRequestIds: []
    });

    // console.log(`Service Worker [${requestId}]: 创建新的请求处理Promise:`, dedupeKey);

    // 请求完成后从 pending 字典中移除，并存入 completed 缓存
    requestPromise.then((response) => {
      // 请求成功，将响应存入已完成缓存
      if (response && response.ok) {
        completedImageRequests.set(dedupeKey, {
          response: response.clone(),
          timestamp: Date.now()
        });
        // console.log(`Service Worker [${requestId}]: 请求成功，存入已完成缓存:`, dedupeKey);
      }
    }).catch(() => {
      // 请求失败，不缓存
    }).finally(() => {
      const entry = pendingImageRequests.get(dedupeKey);
      if (entry) {
        // const totalTime = Date.now() - entry.timestamp;
        // const allRequestIds = [entry.originalRequestId, ...entry.duplicateRequestIds || []];
        // console.log(`Service Worker [${requestId}]: 请求完成 (耗时${totalTime}ms，总计数: ${entry.count}，涉及请求IDs: [${allRequestIds.join(', ')}]):`, dedupeKey);
        pendingImageRequests.delete(dedupeKey);
      }
    });

    // 添加超时机制
    try {
      return await withTimeout(requestPromise, IMAGE_REQUEST_TIMEOUT, 'Image request timeout');
    } catch (timeoutError: any) {
      if (timeoutError.message === 'Image request timeout') {
        console.warn(`Service Worker [${requestId}]: 图片请求超时(${IMAGE_REQUEST_TIMEOUT}ms)，清理并返回超时响应让前端直接加载:`, request.url);
        // 超时后主动清理该条目
        pendingImageRequests.delete(dedupeKey);
        return createTimeoutResponse(request.url, requestId);
      }
      throw timeoutError;
    }

  } catch (error) {
    console.error('Service Worker fetch error:', error);
    throw error;
  }
}

// 创建超时响应，通知前端使用直接加载方式
function createTimeoutResponse(url: string, requestId: string): Response {
  // console.log(`Service Worker [${requestId}]: 创建超时响应，建议前端直接加载:`, url);
  return new Response('Image request timeout - use direct load', {
    status: 504,
    statusText: 'Gateway Timeout',
    headers: {
      'Content-Type': 'text/plain',
      'X-SW-Timeout': 'true',
      'X-SW-Original-URL': url,
      'Access-Control-Allow-Origin': '*'
    }
  });
}

// 实际的图片请求处理逻辑
// bypassCache: 如果为 true，跳过缓存检查直接 fetch，但成功后仍会缓存响应
async function handleImageRequestInternal(originalRequest: Request, requestUrl: string, dedupeKey: string, requestId: string, bypassCache: boolean = false): Promise<Response> {
  try {
    // console.log(`Service Worker [${requestId}]: 开始处理图片请求:`, dedupeKey);

    const cache = await caches.open(IMAGE_CACHE_NAME);

    // 如果不是绕过模式，先尝试从缓存获取
    if (!bypassCache) {
      const cachedResponse = await cache.match(originalRequest);

      if (cachedResponse) {
        const cacheDate = cachedResponse.headers.get('sw-cache-date');
        if (cacheDate) {
          const now = Date.now();

          // 再次访问时延长缓存时间 - 创建新的响应并更新缓存
          const responseClone = cachedResponse.clone();
          const blob = await responseClone.blob();

          const refreshedResponse = new Response(blob, {
            status: cachedResponse.status,
            statusText: cachedResponse.statusText,
            headers: {
              ...Object.fromEntries((cachedResponse.headers as any).entries()),
              'sw-cache-date': now.toString() // 更新访问时间为当前时间
            }
          });

          // 用新时间戳重新缓存（使用原始URL作为键）
          if (originalRequest.url.startsWith('http')) {
            await cache.put(originalRequest, refreshedResponse.clone());
          }
          return refreshedResponse;
        } else {
          // 旧的缓存没有时间戳，为其添加时间戳并延长
          // console.log(`Service Worker [${requestId}]: Adding timestamp to legacy cached image:`, requestUrl);
          const responseClone = cachedResponse.clone();
          const blob = await responseClone.blob();

          const refreshedResponse = new Response(blob, {
            status: cachedResponse.status,
            statusText: cachedResponse.statusText,
            headers: {
              ...Object.fromEntries((cachedResponse.headers as any).entries()),
              'sw-cache-date': Date.now().toString()
            }
          });

          if (originalRequest.url.startsWith('http')) {
            await cache.put(originalRequest, refreshedResponse.clone());
          }
          return refreshedResponse;
        }
      }
    } else {
      // console.log(`Service Worker [${requestId}]: 绕过缓存检查，直接发起网络请求:`, dedupeKey);
    }

    // 检查域名配置，准备备用域名
    const originalUrlObject = new URL(requestUrl);
    const domainConfig = shouldHandleCORS(originalUrlObject);
    let fallbackUrl = null;
    let shouldUseFallbackDirectly = false;

    if (domainConfig && domainConfig.fallbackDomain) {
      // 创建备用URL，替换域名
      fallbackUrl = requestUrl.replace(domainConfig.hostname, domainConfig.fallbackDomain);

      // 检查该域名是否已被标记为失败
      if (failedDomains.has(domainConfig.hostname)) {
        shouldUseFallbackDirectly = true;
        // console.log(`Service Worker [${requestId}]: ${domainConfig.hostname}已标记为失败域名，直接使用备用URL:`, fallbackUrl);
      } else {
        // console.log(`Service Worker [${requestId}]: 检测到${domainConfig.hostname}域名，准备备用URL:`, fallbackUrl);
      }
    }

    // 尝试多种获取方式，每种方式都支持重试和域名切换
    let response;
    let fetchOptions = [
      // 1. 优先尝试no-cors模式（可以绕过CORS限制）
      {
        method: 'GET',
        mode: 'no-cors' as RequestMode,
        cache: 'no-cache' as RequestCache,
        credentials: 'omit' as RequestCredentials,
        referrerPolicy: 'no-referrer' as ReferrerPolicy
      },
      // 2. 尝试cors模式  
      {
        method: 'GET',
        mode: 'cors' as RequestMode,
        cache: 'no-cache' as RequestCache,
        credentials: 'omit' as RequestCredentials,
        referrerPolicy: 'no-referrer' as ReferrerPolicy
      },
      // 3. 最基本的设置
      {
        method: 'GET',
        cache: 'no-cache' as RequestCache
      }
    ];

    // 尝试不同的URL和不同的fetch选项
    let urlsToTry: string[];

    if (shouldUseFallbackDirectly) {
      // 如果域名已被标记为失败，直接使用备用URL
      urlsToTry = [fallbackUrl!];
    } else {
      // 正常情况下先尝试原始URL
      urlsToTry = [requestUrl];
      if (fallbackUrl) {
        urlsToTry.push(fallbackUrl); // 如果有备用URL，添加到尝试列表
      }
    }

    let finalError = null;

    for (let urlIndex = 0; urlIndex < urlsToTry.length; urlIndex++) {
      const currentUrl = urlsToTry[urlIndex];
      const isUsingFallback = urlIndex > 0;

      if (isUsingFallback) {
        // console.log(`Service Worker [${requestId}]: 原始URL失败，尝试备用域名:`, currentUrl);
      }

      for (let options of fetchOptions) {
        try {
          // console.log(`Service Worker [${requestId}]: Trying fetch with options (${isUsingFallback ? 'fallback' : 'original'} URL, mode: ${options.mode || 'default'}):`, options);

          // Use retry logic for each fetch attempt
          let lastError;
          let isCORSError = false;
          for (let attempt = 0; attempt <= 2; attempt++) {
            try {
              // console.log(`Service Worker [${requestId}]: Fetch attempt ${attempt + 1}/3 with options on ${isUsingFallback ? 'fallback' : 'original'} URL`);
              response = await fetch(currentUrl, options);

              if (response && response.status !== 0) {
                // console.log(`Service Worker [${requestId}]: Fetch successful with status: ${response.status} from ${isUsingFallback ? 'fallback' : 'original'} URL`);
                break;
              }
            } catch (fetchError: any) {
              // console.warn(`Service Worker [${requestId}]: Fetch attempt ${attempt + 1} failed on ${isUsingFallback ? 'fallback' : 'original'} URL:`, fetchError);
              lastError = fetchError;

              // 检测CORS错误，不重试直接跳过
              const errorMessage = fetchError.message || '';
              if (errorMessage.includes('CORS') ||
                errorMessage.includes('cross-origin') ||
                errorMessage.includes('Access-Control-Allow-Origin') ||
                errorMessage.includes('Failed to fetch') ||
                errorMessage.includes('NetworkError') ||
                errorMessage.includes('TypeError')) {
                // console.log(`Service Worker [${requestId}]: 检测到CORS/网络错误，跳过重试:`, errorMessage);
                isCORSError = true;
                break;
              }

              if (attempt < 2) {
                // Wait before retrying (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
              }
            }
          }

          // 如果是CORS错误，返回特殊响应让前端直接用img标签加载
          if (isCORSError) {
            // console.log(`Service Worker [${requestId}]: CORS错误，返回特殊响应提示前端直接加载`);
            // 返回一个特殊的响应，前端可以根据这个响应决定直接用img标签加载
            return new Response('CORS error - use img tag directly', {
              status: 403,
              statusText: 'CORS Error',
              headers: {
                'Content-Type': 'text/plain',
                'X-SW-CORS-Error': 'true',
                'Access-Control-Allow-Origin': '*'
              }
            });
          }

          if (response && response.status !== 0) {
            break;
          }

          if (lastError) {
            // console.warn(`Service Worker [${requestId}]: All fetch attempts failed with options on ${isUsingFallback ? 'fallback' : 'original'} URL:`, options, lastError);
            finalError = lastError;
          }
        } catch (fetchError) {
          // console.warn(`Service Worker [${requestId}]: Fetch failed with options on ${isUsingFallback ? 'fallback' : 'original'} URL:`, options, fetchError);
          finalError = fetchError;
          continue;
        }
      }

      // 如果当前URL成功获取到响应，跳出URL循环
      if (response && response.status !== 0) {
        break;
      } else {
        // 如果是配置的域名且是第一次尝试（原始URL），标记为失败域名
        if (domainConfig && domainConfig.fallbackDomain && urlIndex === 0 && !shouldUseFallbackDirectly) {
          // console.warn(`Service Worker [${requestId}]: 标记${domainConfig.hostname}为失败域名，后续请求将直接使用备用域名`);
          failedDomains.add(domainConfig.hostname);
          // 异步保存到数据库，不阻塞当前请求
          saveFailedDomain(domainConfig.hostname).catch(error => {
            console.warn('Service Worker: 保存失败域名到数据库时出错:', error);
          });
        }
      }
    }

    if (!response || response.status === 0) {
      let errorMessage = 'All fetch attempts failed';

      if (domainConfig && domainConfig.fallbackDomain) {
        if (shouldUseFallbackDirectly) {
          errorMessage = `备用域名${domainConfig.fallbackDomain}也失败了`;
        } else {
          errorMessage = `All fetch attempts failed for both ${domainConfig.hostname} and ${domainConfig.fallbackDomain} domains`;
        }
      }

      console.error(`Service Worker [${requestId}]: ${errorMessage}`, finalError);

      // 不要抛出错误，而是返回一个表示图片加载失败的响应
      // 这样前端img标签会触发onerror事件，但不会导致浏览器回退到默认CORS处理
      return new Response('Image load failed after all attempts', {
        status: 404,
        statusText: 'Image Not Found',
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': '*'
        }
      });
    }

    // 处理no-cors模式的opaque响应
    if (response.type === 'opaque') {
      // console.log('Got opaque response, creating transparent CORS response');
      // 对于opaque响应，我们创建一个透明的CORS响应
      const corsResponse = new Response(response.body, {
        status: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': 'image/png',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': '*',
          'Cache-Control': 'max-age=3153600000', // 100年
          'sw-cache-date': Date.now().toString() // 添加缓存时间戳
        }
      });

      // 尝试缓存响应，处理存储限制错误
      try {
        if (originalRequest.url.startsWith('http')) {
          await cache.put(originalRequest, corsResponse.clone());
          // console.log('Service Worker: Opaque response cached with 30-day expiry and timestamp');
          // 通知主线程图片已缓存
          await notifyImageCached(requestUrl, 0, 'image/png');
          // 检查存储配额
          await checkStorageQuota();
        }
      } catch (cacheError) {
        console.warn('Service Worker: Failed to cache opaque response (可能超出存储限制):', cacheError);
        // 尝试清理一些旧缓存后重试
        await cleanOldCacheEntries(cache);
        try {
          if (originalRequest.url.startsWith('http')) {
            await cache.put(originalRequest, corsResponse.clone());
            // console.log('Service Worker: Opaque response cached after cleanup');
            // 通知主线程图片已缓存
            await notifyImageCached(requestUrl, 0, 'image/png');
          }
        } catch (retryError) {
          console.error('Service Worker: Still failed to cache after cleanup:', retryError);
        }
      }

      return corsResponse;
    }

    // 处理正常响应
    if (response.ok) {
      const responseClone = response.clone();
      const blob = await responseClone.blob();

      // 检查图片大小
      const imageSizeMB = blob.size / (1024 * 1024);
      // console.log(`Service Worker: Image size: ${imageSizeMB.toFixed(2)}MB`);

      // 如果图片超过5MB，记录警告但仍尝试缓存
      // if (imageSizeMB > 5) {
      //   console.warn(`Service Worker: Large image detected (${imageSizeMB.toFixed(2)}MB), 可能影响缓存性能`);
      // }

      const corsResponse = new Response(blob, {
        status: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': response.headers.get('Content-Type') || 'image/png',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': '*',
          'Cache-Control': 'max-age=3153600000', // 100年
          'sw-cache-date': Date.now().toString(), // 添加缓存时间戳
          'sw-image-size': blob.size.toString() // 添加图片大小信息
        }
      });

      // 尝试缓存响应，处理存储限制错误
      try {
        if (originalRequest.url.startsWith('http')) {
          await cache.put(originalRequest, corsResponse.clone());
          // console.log(`Service Worker: Normal response cached (${imageSizeMB.toFixed(2)}MB) with 30-day expiry and timestamp`);
          // 通知主线程图片已缓存
          await notifyImageCached(requestUrl, blob.size, blob.type);
          // 检查存储配额
          await checkStorageQuota();
        }
      } catch (cacheError) {
        console.warn(`Service Worker: Failed to cache normal response (${imageSizeMB.toFixed(2)}MB, 可能超出存储限制):`, cacheError);
        // 尝试清理一些旧缓存后重试
        await cleanOldCacheEntries(cache);
        try {
          if (originalRequest.url.startsWith('http')) {
            await cache.put(originalRequest, corsResponse.clone());
            // console.log(`Service Worker: Normal response cached after cleanup (${imageSizeMB.toFixed(2)}MB)`);
            // 通知主线程图片已缓存
            await notifyImageCached(requestUrl, blob.size, blob.type);
          }
        } catch (retryError) {
          console.error('Service Worker: Still failed to cache after cleanup:', retryError);
        }
      }

      return corsResponse;
    }

    throw new Error(`HTTP ${response.status}: ${response.statusText}`);

  } catch (error: any) {
    console.error('Service Worker fetch error:', error);

    // 重新获取URL用于错误处理
    const errorUrl = new URL(requestUrl);

    // 特殊处理SSL协议错误
    const isSSLError = error.message.includes('SSL_PROTOCOL_ERROR') ||
      error.message.includes('ERR_SSL_PROTOCOL_ERROR') ||
      error.message.includes('net::ERR_CERT') ||
      error.message.includes('ERR_INSECURE_RESPONSE');

    if (isSSLError) {
      console.warn('Service Worker: 检测到SSL/证书错误，尝试跳过Service Worker处理');

      // 对于SSL错误，让请求回退到浏览器的默认网络处理
      return fetch(requestUrl, {
        method: 'GET',
        mode: 'no-cors',
        cache: 'no-cache',
        credentials: 'omit'
      }).catch(() => {
        // 如果仍然失败，返回404让SmartImage组件处理重试
        return new Response('SSL Error - Image not accessible', {
          status: 404,
          statusText: 'SSL Protocol Error',
          headers: {
            'Content-Type': 'text/plain',
            'Access-Control-Allow-Origin': '*'
          }
        });
      });
    }

    // 对于图片请求，返回错误状态码而不是占位符图片
    // 这样前端的img标签会触发onerror事件，SmartImage组件可以进行重试
    if (errorUrl.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i) ||
      errorUrl.searchParams.has('_t') ||
      errorUrl.searchParams.has('cache_buster') ||
      errorUrl.searchParams.has('timestamp')) {
      // console.log('Service Worker: 图片加载失败，返回错误状态码以触发前端重试');

      // 返回404错误，让前端img标签触发onerror事件
      return new Response('Image not found', {
        status: 404,
        statusText: 'Not Found',
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // 对于非图片请求，仍然返回错误信息
    return new Response(`Network Error: ${error.message}`, {
      status: 500,
      statusText: 'Internal Server Error',
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
