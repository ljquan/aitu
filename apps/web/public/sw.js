/* eslint-disable no-restricted-globals */
// Service Worker for PWA functionality and handling CORS issues with external images
// Version will be replaced during build process
const APP_VERSION = '0.2.4';
const CACHE_NAME = `drawnix-v${APP_VERSION}`;
const IMAGE_CACHE_NAME = `drawnix-images`;
const STATIC_CACHE_NAME = `drawnix-static-v${APP_VERSION}`;

// Detect development mode
const isDevelopment = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

// 允许跨域处理的域名配置 - 仅拦截需要CORS处理的域名
// 备用域名 cdn.i666.fun 支持原生跨域显示，不需要拦截
const CORS_ALLOWED_DOMAINS = [
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

// 图片请求去重字典：存储正在进行的请求Promise
const pendingImageRequests = new Map();

// 视频请求去重字典：存储正在进行的视频下载Promise
const pendingVideoRequests = new Map();

// 视频缓存：存储已下载的完整视频Blob，用于快速响应Range请求
const videoBlobCache = new Map();

// 域名故障标记：记录已知失败的域名
const failedDomains = new Set();

// 检查URL是否需要CORS处理
function shouldHandleCORS(url) {
  for (const domain of CORS_ALLOWED_DOMAINS) {
    if (url.hostname === domain.hostname && url.pathname.includes(domain.pathPattern)) {
      return domain;
    }
  }
  return null;
}

// 检查是否为图片请求
function isImageRequest(url, request) {
  return (
    IMAGE_EXTENSIONS_REGEX.test(url.pathname) ||
    request.destination === 'image' ||
    shouldHandleCORS(url) !== null
  );
}

// 检查是否为视频请求
function isVideoRequest(url, request) {
  return (
    VIDEO_EXTENSIONS_REGEX.test(url.pathname) ||
    request.destination === 'video' ||
    url.pathname.includes('/video/')
  );
}

// 从IndexedDB恢复失败域名列表
async function loadFailedDomains() {
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
            domains.forEach(item => failedDomains.add(item.domain));
            console.log('Service Worker: 恢复失败域名列表:', Array.from(failedDomains));
            resolve();
          };
          getAllRequest.onerror = () => reject(getAllRequest.error);
        } else {
          resolve();
        }
      };
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
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
async function saveFailedDomain(domain) {
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
          console.log('Service Worker: 已保存失败域名到数据库:', domain);
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      };
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('failedDomains')) {
          db.createObjectStore('failedDomains', { keyPath: 'domain' });
        }
      };
    });
  } catch (error) {
    console.warn('Service Worker: 无法保存失败域名:', error);
  }
}

// 清理过期的pending请求（避免内存泄漏）
function cleanupPendingRequests() {
  const now = Date.now();
  const maxAge = 30000; // 30秒后清理未完成的请求
  
  for (const [key, entry] of pendingImageRequests.entries()) {
    if (now - entry.timestamp > maxAge) {
      console.log('Service Worker: 清理过期的pending图片请求:', key);
      pendingImageRequests.delete(key);
    }
  }
  
  for (const [key, entry] of pendingVideoRequests.entries()) {
    if (now - entry.timestamp > maxAge) {
      console.log('Service Worker: 清理过期的pending视频请求:', key);
      pendingVideoRequests.delete(key);
    }
  }
}

// 清理过期的视频Blob缓存（避免内存泄漏）
function cleanupVideoBlobCache() {
  const now = Date.now();
  const maxAge = 5 * 60 * 1000; // 5分钟后清理视频缓存
  
  for (const [key, entry] of videoBlobCache.entries()) {
    if (now - entry.timestamp > maxAge) {
      console.log('Service Worker: 清理过期的视频Blob缓存:', key);
      videoBlobCache.delete(key);
    }
  }
}

// 定期清理pending请求和视频缓存
setInterval(cleanupPendingRequests, 60000); // 每分钟清理一次
setInterval(cleanupVideoBlobCache, 2 * 60 * 1000); // 每2分钟清理一次视频缓存

// 清理旧的缓存条目以释放空间（基于LRU策略）
async function cleanOldCacheEntries(cache) {
  try {
    console.log('Service Worker: Starting cache cleanup to free space');
    const requests = await cache.keys();
    
    if (requests.length <= 10) {
      console.log('Service Worker: Cache has few entries, skipping cleanup');
      return;
    }
    
    // 获取所有缓存条目及其时间戳
    const entries = [];
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
        console.log(`Service Worker: Deleted old cache entry (${(entries[i].imageSize / 1024 / 1024).toFixed(2)}MB)`);
      } catch (error) {
        console.warn('Service Worker: Error deleting cache entry:', error);
      }
    }
    
    console.log(`Service Worker: Cache cleanup completed, deleted ${deletedCount} entries, freed ${(freedSpace / 1024 / 1024).toFixed(2)}MB`);
    
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

self.addEventListener('install', event => {
  console.log('Service Worker installed');
  
  const installPromises = [];
  
  // Load failed domains from database
  installPromises.push(loadFailedDomains());
  
  // Only pre-cache static files in production
  if (!isDevelopment) {
    installPromises.push(
      caches.open(STATIC_CACHE_NAME)
        .then(cache => {
          console.log('Caching static files');
          return cache.addAll(STATIC_FILES);
        })
        .catch(err => console.log('Cache pre-loading failed:', err))
    );
  }
  
  event.waitUntil(Promise.all(installPromises));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('Service Worker activated');

  // 迁移旧的图片缓存并清理过期缓存
  event.waitUntil(
    caches.keys().then(async cacheNames => {
      // 查找旧的版本化图片缓存
      const legacyImageCaches = cacheNames.filter(name =>
        name.startsWith('drawnix-images-v') && name !== IMAGE_CACHE_NAME
      );

      // 如果存在旧的图片缓存,迁移到新的固定名称缓存
      if (legacyImageCaches.length > 0) {
        console.log('Migrating legacy image caches to new cache name:', legacyImageCaches);

        const newImageCache = await caches.open(IMAGE_CACHE_NAME);

        // 迁移所有旧缓存中的数据
        for (const legacyCacheName of legacyImageCaches) {
          try {
            const legacyCache = await caches.open(legacyCacheName);
            const requests = await legacyCache.keys();

            console.log(`Migrating ${requests.length} images from ${legacyCacheName}`);

            for (const request of requests) {
              const response = await legacyCache.match(request);
              if (response) {
                await newImageCache.put(request, response);
              }
            }

            // 迁移完成后删除旧缓存
            await caches.delete(legacyCacheName);
            console.log(`Deleted legacy cache: ${legacyCacheName}`);
          } catch (error) {
            console.warn(`Failed to migrate cache ${legacyCacheName}:`, error);
          }
        }

        console.log('Image cache migration completed');
      }

      // 清理其他不需要的缓存
      return Promise.all(
        cacheNames.map(cacheName => {
          // 保留当前版本的缓存
          const isCurrentCache = cacheName === CACHE_NAME ||
                                 cacheName === IMAGE_CACHE_NAME ||
                                 cacheName === STATIC_CACHE_NAME;

          if (!isCurrentCache) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
          return null;
        })
      );
    }).then(() => {
      console.log(`Service Worker v${APP_VERSION} activated`);
      return self.clients.claim();
    })
  );
});

// Handle messages from main thread
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    // Notify clients that SW has been updated
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({ type: 'SW_UPDATED' });
      });
    });
  } else if (event.data && event.data.type === 'CLEAN_EXPIRED_CACHE') {
    // 页面加载完成时清理过期缓存
    console.log('Service Worker: Received cache cleanup request from main thread');
    cleanExpiredImageCache().catch(error => {
      console.warn('Service Worker: Cache cleanup failed:', error);
    });
  }
});

// 清理过期的图片缓存
async function cleanExpiredImageCache() {
  try {
    console.log('Service Worker: Starting expired image cache cleanup');
    const cache = await caches.open(IMAGE_CACHE_NAME);
    const requests = await cache.keys();
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30天
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const request of requests) {
      try {
        const response = await cache.match(request);
        if (response) {
          const cacheDate = response.headers.get('sw-cache-date');
          if (cacheDate) {
            const cacheTime = parseInt(cacheDate);
            const cacheAge = now - cacheTime;
            
            if (cacheAge > maxAge) {
              await cache.delete(request);
              cleanedCount++;
              console.log('Service Worker: Cleaned expired cached image:', request.url);
            }
          }
          // 旧的没有时间戳的缓存保留，在访问时会自动添加时间戳
        }
      } catch (error) {
        console.warn('Service Worker: Error checking cache entry:', request.url, error);
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`Service Worker: Image cache cleanup completed, removed ${cleanedCount} expired entries`);
    } else {
      console.log('Service Worker: No expired cache entries found');
    }
    
    // 向主线程报告清理结果
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({ 
        type: 'CACHE_CLEANUP_COMPLETE', 
        cleanedCount 
      });
    });
  } catch (error) {
    console.warn('Service Worker: Error during image cache cleanup:', error);
  }
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 检查是否要求绕过Service Worker
  if (url.searchParams.has('bypass_sw') || url.searchParams.has('direct_fetch')) {
    console.log('Service Worker: 检测到绕过参数，直接通过请求:', url.href);
    // 直接通过，不拦截
    return;
  }

  // 完全不拦截备用域名，让浏览器直接处理
  if (url.hostname === 'cdn.i666.fun') {
    console.log('Service Worker: 备用域名请求直接通过，不拦截:', url.href);
    return; // 直接返回，让浏览器处理
  }

  // 放行火山引擎域名（seedream 模型图片），让浏览器直接用 <img> 标签加载
  // 这些域名不支持 CORS，但 <img> 标签可以直接加载
  if (url.hostname.endsWith('.volces.com') || url.hostname.endsWith('.volccdn.com')) {
    console.log('Service Worker: 火山引擎域名请求直接通过，不拦截:', url.href);
    return; // 直接返回，让浏览器处理
  }

  // 拦截视频请求以支持 Range 请求
  if (isVideoRequest(url, event.request)) {
    console.log('Service Worker: Intercepting video request:', url.href);
    event.respondWith(handleVideoRequest(event.request));
    return;
  }

  // 拦截外部图片请求（非同源且为图片格式）
  if (url.origin !== location.origin && isImageRequest(url, event.request)) {
    console.log('Service Worker: Intercepting external image request:', url.href);
    event.respondWith(handleImageRequest(event.request));
    return;
  }

  // Handle static file requests with cache-first strategy
  // Exclude XHR/fetch API requests - only handle navigation and static resources
  if (event.request.method === 'GET' &&
      event.request.destination !== '' &&
      event.request.destination !== 'empty') {
    event.respondWith(handleStaticRequest(event.request));
  }
});

// Utility function to perform fetch with retries
async function fetchWithRetry(request, maxRetries = 2) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Fetch attempt ${attempt + 1}/${maxRetries + 1} for:`, request.url);
      const response = await fetch(request);

      if (response.ok || response.status < 500) {
        // Consider 4xx errors as final (don't retry), only retry on 5xx or network errors
        return response;
      }

      if (attempt < maxRetries) {
        console.warn(`Fetch attempt ${attempt + 1} failed with status ${response.status}, retrying...`);
        lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
        // Wait before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        continue;
      }

      return response;
    } catch (error) {
      console.warn(`Fetch attempt ${attempt + 1} failed:`, error.message);
      lastError = error;

      if (attempt < maxRetries) {
        // Wait before retrying (exponential backoff: 1s, 2s, 4s...)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }

  throw lastError;
}

// 处理视频请求,支持 Range 请求以实现视频 seek 功能
async function handleVideoRequest(request) {
  const url = new URL(request.url);
  const requestId = Math.random().toString(36).substring(2, 10);
  console.log(`Service Worker [Video-${requestId}]: Handling video request:`, url.href);

  try {
    // 检查请求是否包含 Range header
    const rangeHeader = request.headers.get('range');
    console.log(`Service Worker [Video-${requestId}]: Range header:`, rangeHeader);

    // 创建去重键（移除缓存破坏参数）
    const dedupeUrl = new URL(url);
    const cacheBreakingParams = ['_t', 'cache_buster', 'v', 'timestamp', 'nocache', '_cb', 't', 'retry', 'rand'];
    cacheBreakingParams.forEach(param => dedupeUrl.searchParams.delete(param));
    const dedupeKey = dedupeUrl.toString();

    // 检查是否有相同视频正在下载
    if (pendingVideoRequests.has(dedupeKey)) {
      const existingEntry = pendingVideoRequests.get(dedupeKey);
      existingEntry.count = (existingEntry.count || 1) + 1;
      const waitTime = Date.now() - existingEntry.timestamp;
      
      console.log(`Service Worker [Video-${requestId}]: 发现重复视频请求 (等待${waitTime}ms)，复用下载Promise:`, dedupeKey);
      console.log(`Service Worker [Video-${requestId}]: 重复请求计数: ${existingEntry.count}`);
      
      // 等待视频下载完成
      const videoBlob = await existingEntry.promise;
      
      // 使用缓存的blob响应Range请求
      return createVideoResponse(videoBlob, rangeHeader, requestId);
    }

    // 检查是否已有缓存的视频Blob
    if (videoBlobCache.has(dedupeKey)) {
      const cacheEntry = videoBlobCache.get(dedupeKey);
      console.log(`Service Worker [Video-${requestId}]: 使用缓存的视频Blob (缓存时间: ${Math.round((Date.now() - cacheEntry.timestamp) / 1000)}秒)`);
      
      // 更新访问时间
      cacheEntry.timestamp = Date.now();
      
      return createVideoResponse(cacheEntry.blob, rangeHeader, requestId);
    }

    // 创建新的视频下载Promise
    console.log(`Service Worker [Video-${requestId}]: 开始下载新视频:`, dedupeKey);
    
    const downloadPromise = (async () => {
      // 构建请求选项
      const fetchOptions = {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        cache: 'default' // 使用浏览器默认缓存策略
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
        console.log(`Service Worker [Video-${requestId}]: 服务器原生支持Range请求，直接返回`);
        return null; // 返回null表示不缓存，直接使用服务器响应
      }

      // 下载完整视频
      console.log(`Service Worker [Video-${requestId}]: 开始下载完整视频...`);
      const videoBlob = await response.blob();
      const videoSizeMB = videoBlob.size / (1024 * 1024);
      console.log(`Service Worker [Video-${requestId}]: 视频下载完成 (大小: ${videoSizeMB.toFixed(2)}MB)`);

      // 缓存视频Blob（仅缓存小于50MB的视频）
      if (videoSizeMB < 50) {
        videoBlobCache.set(dedupeKey, {
          blob: videoBlob,
          timestamp: Date.now()
        });
        console.log(`Service Worker [Video-${requestId}]: 视频已缓存到内存`);
      } else {
        console.log(`Service Worker [Video-${requestId}]: 视频过大(${videoSizeMB.toFixed(2)}MB)，不缓存`);
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
        const totalTime = Date.now() - entry.timestamp;
        console.log(`Service Worker [Video-${requestId}]: 视频下载完成 (耗时${totalTime}ms，请求计数: ${entry.count})`);
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
        mode: 'cors',
        credentials: 'omit'
      };
      return await fetch(url, fetchOptions);
    }

    // 使用下载的blob响应Range请求
    return createVideoResponse(videoBlob, rangeHeader, requestId);

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
function createVideoResponse(videoBlob, rangeHeader, requestId) {
  const videoSize = videoBlob.size;

  // 如果没有Range请求，返回完整视频
  if (!rangeHeader) {
    console.log(`Service Worker [Video-${requestId}]: 返回完整视频 (大小: ${(videoSize / 1024 / 1024).toFixed(2)}MB)`);
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

  console.log(`Service Worker [Video-${requestId}]: Range请求: ${start}-${end} / ${videoSize} (${((end - start + 1) / 1024).toFixed(2)}KB)`);

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

async function handleStaticRequest(request) {
  try {
    // In development mode, always fetch from network first with retry logic
    if (isDevelopment) {
      console.log('Development mode: fetching from network', request.url);
      return await fetchWithRetry(request);
    }
    
    // Production mode: try cache first for static files
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Fetch from network with retry logic and cache for future use
    const response = await fetchWithRetry(request);
    
    // Cache successful responses (only in production)
    if (response && response.status === 200 && !isDevelopment) {
      const cache = await caches.open(STATIC_CACHE_NAME);
      cache.put(request, response.clone());
    }
    
    return response;
  } catch (error) {
    console.error('Static request failed after retries:', error);
    
    // Try to return a cached version if available (only in production)
    if (!isDevelopment) {
      const cachedResponse = await caches.match(request);
      if (cachedResponse) {
        return cachedResponse;
      }
      
      // Return a basic offline page for navigation requests
      if (request.mode === 'navigate') {
        return caches.match('/index.html');
      }
    }
    
    throw error;
  }
}

async function handleImageRequest(request) {
  try {
    // 生成唯一的请求ID用于追踪
    const requestId = Math.random().toString(36).substring(2, 10);

    console.log(`Service Worker [${requestId}]: Intercepting image request at ${new Date().toISOString()}:`, request.url);
    
    // 创建原始URL（不带缓存破坏参数）用于缓存键和去重键
    const originalUrl = new URL(request.url);
    const cacheBreakingParams = ['_t', 'cache_buster', 'v', 'timestamp', 'nocache', '_cb', 't', 'retry', 'rand', '_force', 'bypass_sw', 'direct_fetch'];
    cacheBreakingParams.forEach(param => originalUrl.searchParams.delete(param));
    const originalRequest = new Request(originalUrl.toString(), {
      method: request.method,
      headers: request.headers,
      mode: request.mode,
      credentials: request.credentials
    });
    
    const dedupeKey = originalUrl.toString();
    
    // 检查是否有相同的请求正在进行
    if (pendingImageRequests.has(dedupeKey)) {
      const existingEntry = pendingImageRequests.get(dedupeKey);
      existingEntry.count = (existingEntry.count || 1) + 1;
      const waitTime = Date.now() - existingEntry.timestamp;
      
      console.log(`Service Worker [${requestId}]: 发现重复请求 (等待${waitTime}ms)，返回已有Promise:`, dedupeKey);
      console.log(`Service Worker [${requestId}]: 重复请求计数: ${existingEntry.count}`, dedupeKey);
      
      // 为重复请求添加标记，便于追踪
      existingEntry.duplicateRequestIds = existingEntry.duplicateRequestIds || [];
      existingEntry.duplicateRequestIds.push(requestId);
      
      return existingEntry.promise;
    }
    
    // 创建请求处理Promise并存储到去重字典
    const requestPromise = handleImageRequestInternal(originalRequest, request.url, dedupeKey, requestId);
    
    // 将Promise存储到去重字典中，包含时间戳和计数
    pendingImageRequests.set(dedupeKey, {
      promise: requestPromise,
      timestamp: Date.now(),
      count: 1,
      originalRequestId: requestId,
      duplicateRequestIds: []
    });
    
    console.log(`Service Worker [${requestId}]: 创建新的请求处理Promise:`, dedupeKey);
    
    // 请求完成后从字典中移除
    requestPromise.finally(() => {
      const entry = pendingImageRequests.get(dedupeKey);
      if (entry) {
        const totalTime = Date.now() - entry.timestamp;
        const allRequestIds = [entry.originalRequestId, ...entry.duplicateRequestIds];
        console.log(`Service Worker [${requestId}]: 请求完成 (耗时${totalTime}ms，总计数: ${entry.count}，涉及请求IDs: [${allRequestIds.join(', ')}]):`, dedupeKey);
        pendingImageRequests.delete(dedupeKey);
      }
    });
    
    return requestPromise;
    
  } catch (error) {
    console.error('Service Worker fetch error:', error);
    throw error;
  }
}

// 实际的图片请求处理逻辑
async function handleImageRequestInternal(originalRequest, requestUrl, dedupeKey, requestId) {
  try {
    console.log(`Service Worker [${requestId}]: 开始处理图片请求:`, dedupeKey);
    
    // 首先尝试从缓存获取，同时验证缓存是否过期
    const cache = await caches.open(IMAGE_CACHE_NAME);
    const cachedResponse = await cache.match(originalRequest);
    
    if (cachedResponse) {
      // 检查缓存是否过期（30天 = 30 * 24 * 60 * 60 * 1000 毫秒）
      const cacheDate = cachedResponse.headers.get('sw-cache-date');
      if (cacheDate) {
        const cacheTime = parseInt(cacheDate);
        const now = Date.now();
        const cacheAge = now - cacheTime;
        const maxAge = 30 * 24 * 60 * 60 * 1000; // 30天
        
        if (cacheAge < maxAge) {
          console.log(`Service Worker [${requestId}]: Returning cached image (age:`, Math.round(cacheAge / (24 * 60 * 60 * 1000)), 'days):', requestUrl);
          
          // 再次访问时延长缓存时间 - 创建新的响应并更新缓存
          const responseClone = cachedResponse.clone();
          const blob = await responseClone.blob();
          
          const refreshedResponse = new Response(blob, {
            status: cachedResponse.status,
            statusText: cachedResponse.statusText,
            headers: {
              ...Object.fromEntries(cachedResponse.headers.entries()),
              'sw-cache-date': now.toString() // 更新访问时间为当前时间
            }
          });
          
          // 用新时间戳重新缓存（使用原始URL作为键）
          await cache.put(originalRequest, refreshedResponse.clone());
          console.log(`Service Worker [${requestId}]: Cache expiry extended by 30 days for:`, requestUrl);
          
          return refreshedResponse;
        } else {
          console.log(`Service Worker [${requestId}]: Cached image expired, removing from cache:`, requestUrl);
          await cache.delete(originalRequest);
        }
      } else {
        // 旧的缓存没有时间戳，为其添加时间戳并延长
        console.log(`Service Worker [${requestId}]: Adding timestamp to legacy cached image:`, requestUrl);
        const responseClone = cachedResponse.clone();
        const blob = await responseClone.blob();
        
        const refreshedResponse = new Response(blob, {
          status: cachedResponse.status,
          statusText: cachedResponse.statusText,
          headers: {
            ...Object.fromEntries(cachedResponse.headers.entries()),
            'sw-cache-date': Date.now().toString()
          }
        });
        
        await cache.put(originalRequest, refreshedResponse.clone());
        return refreshedResponse;
      }
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
        console.log(`Service Worker [${requestId}]: ${domainConfig.hostname}已标记为失败域名，直接使用备用URL:`, fallbackUrl);
      } else {
        console.log(`Service Worker [${requestId}]: 检测到${domainConfig.hostname}域名，准备备用URL:`, fallbackUrl);
      }
    }
    
    // 尝试多种获取方式，每种方式都支持重试和域名切换
    let response;
    let fetchOptions = [
      // 1. 优先尝试no-cors模式（可以绕过CORS限制）
      { 
        method: 'GET',
        mode: 'no-cors', 
        cache: 'no-cache',
        credentials: 'omit',
        referrerPolicy: 'no-referrer'
      },
      // 2. 尝试cors模式  
      { 
        method: 'GET',
        mode: 'cors', 
        cache: 'no-cache',
        credentials: 'omit',
        referrerPolicy: 'no-referrer'
      },
      // 3. 最基本的设置
      { 
        method: 'GET',
        cache: 'no-cache'
      }
    ];
    
    // 尝试不同的URL和不同的fetch选项
    let urlsToTry;
    
    if (shouldUseFallbackDirectly) {
      // 如果域名已被标记为失败，直接使用备用URL
      urlsToTry = [fallbackUrl];
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
        console.log(`Service Worker [${requestId}]: 原始URL失败，尝试备用域名:`, currentUrl);
      }
      
      for (let options of fetchOptions) {
        try {
          console.log(`Service Worker [${requestId}]: Trying fetch with options (${isUsingFallback ? 'fallback' : 'original'} URL, mode: ${options.mode || 'default'}):`, options);
          
          // Use retry logic for each fetch attempt
          let lastError;
          for (let attempt = 0; attempt <= 2; attempt++) {
            try {
              console.log(`Service Worker [${requestId}]: Fetch attempt ${attempt + 1}/3 with options on ${isUsingFallback ? 'fallback' : 'original'} URL`);
              response = await fetch(currentUrl, options);

              if (response && response.status !== 0) {
                console.log(`Service Worker [${requestId}]: Fetch successful with status: ${response.status} from ${isUsingFallback ? 'fallback' : 'original'} URL`);
                break;
              }
            } catch (fetchError) {
              console.warn(`Service Worker [${requestId}]: Fetch attempt ${attempt + 1} failed on ${isUsingFallback ? 'fallback' : 'original'} URL:`, fetchError);
              lastError = fetchError;

              if (attempt < 2) {
                // Wait before retrying (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
              }
            }
          }

          if (response && response.status !== 0) {
            break;
          }

          if (lastError) {
            console.warn(`Service Worker [${requestId}]: All fetch attempts failed with options on ${isUsingFallback ? 'fallback' : 'original'} URL:`, options, lastError);
            finalError = lastError;
          }
        } catch (fetchError) {
          console.warn(`Service Worker [${requestId}]: Fetch failed with options on ${isUsingFallback ? 'fallback' : 'original'} URL:`, options, fetchError);
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
          console.warn(`Service Worker [${requestId}]: 标记${domainConfig.hostname}为失败域名，后续请求将直接使用备用域名`);
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
      console.log('Got opaque response, creating transparent CORS response');
      // 对于opaque响应，我们创建一个透明的CORS响应
      const corsResponse = new Response(response.body, {
        status: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': 'image/png',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': '*',
          'Cache-Control': 'max-age=2592000', // 30天
          'sw-cache-date': Date.now().toString() // 添加缓存时间戳
        }
      });
      
      // 尝试缓存响应，处理存储限制错误
      try {
        await cache.put(originalRequest, corsResponse.clone());
        console.log('Service Worker: Opaque response cached with 30-day expiry and timestamp');
      } catch (cacheError) {
        console.warn('Service Worker: Failed to cache opaque response (可能超出存储限制):', cacheError);
        // 尝试清理一些旧缓存后重试
        await cleanOldCacheEntries(cache);
        try {
          await cache.put(originalRequest, corsResponse.clone());
          console.log('Service Worker: Opaque response cached after cleanup');
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
      console.log(`Service Worker: Image size: ${imageSizeMB.toFixed(2)}MB`);
      
      // 如果图片超过5MB，记录警告但仍尝试缓存
      if (imageSizeMB > 5) {
        console.warn(`Service Worker: Large image detected (${imageSizeMB.toFixed(2)}MB), 可能影响缓存性能`);
      }
      
      const corsResponse = new Response(blob, {
        status: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': response.headers.get('Content-Type') || 'image/png',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': '*',
          'Cache-Control': 'max-age=2592000', // 30天
          'sw-cache-date': Date.now().toString(), // 添加缓存时间戳
          'sw-image-size': blob.size.toString() // 添加图片大小信息
        }
      });
      
      // 尝试缓存响应，处理存储限制错误
      try {
        await cache.put(originalRequest, corsResponse.clone());
        console.log(`Service Worker: Normal response cached (${imageSizeMB.toFixed(2)}MB) with 30-day expiry and timestamp`);
      } catch (cacheError) {
        console.warn(`Service Worker: Failed to cache normal response (${imageSizeMB.toFixed(2)}MB, 可能超出存储限制):`, cacheError);
        // 尝试清理一些旧缓存后重试
        await cleanOldCacheEntries(cache);
        try {
          await cache.put(originalRequest, corsResponse.clone());
          console.log(`Service Worker: Normal response cached after cleanup (${imageSizeMB.toFixed(2)}MB)`);
        } catch (retryError) {
          console.error('Service Worker: Still failed to cache after cleanup:', retryError);
        }
      }
      
      return corsResponse;
    }
    
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    
  } catch (error) {
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
      console.log('Service Worker: 图片加载失败，返回错误状态码以触发前端重试');
      
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