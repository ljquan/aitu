// Service Worker for PWA functionality and handling CORS issues with external images
// Version will be replaced during build process
const APP_VERSION = '0.0.3';
const CACHE_NAME = `drawnix-v${APP_VERSION}`;
const IMAGE_CACHE_NAME = `drawnix-images-v${APP_VERSION}`;
const STATIC_CACHE_NAME = `drawnix-static-v${APP_VERSION}`;

// Detect development mode
const isDevelopment = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

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
  
  // Only pre-cache static files in production
  if (!isDevelopment) {
    event.waitUntil(
      caches.open(STATIC_CACHE_NAME)
        .then(cache => {
          console.log('Caching static files');
          return cache.addAll(STATIC_FILES);
        })
        .catch(err => console.log('Cache pre-loading failed:', err))
    );
  }
  
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('Service Worker activated');
  
  // Clean up old caches - delete all caches that don't match current version
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Keep current version caches, delete all others
          if (cacheName !== CACHE_NAME && cacheName !== IMAGE_CACHE_NAME && cacheName !== STATIC_CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
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
  }
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // 拦截对 google.datas.systems 图片的请求
  if (url.hostname === 'google.datas.systems' && url.pathname.includes('response_images')) {
    event.respondWith(handleImageRequest(event.request));
    return;
  }
  
  // Handle static file requests with cache-first strategy
  if (event.request.method === 'GET') {
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
    console.log('Service Worker intercepting image request:', request.url);
    
    // 首先尝试从缓存获取
    const cache = await caches.open(IMAGE_CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      console.log('Serving image from cache:', request.url);
      return cachedResponse;
    }
    
    // 尝试多种获取方式，每种方式都支持重试
    let response;
    let fetchOptions = [
      // 1. 尝试no-cors模式
      { mode: 'no-cors', cache: 'no-cache' },
      // 2. 尝试cors模式  
      { mode: 'cors', cache: 'no-cache' },
      // 3. 默认设置
      { cache: 'no-cache' }
    ];
    
    for (let options of fetchOptions) {
      try {
        console.log(`Trying fetch with options:`, options);
        
        // Use retry logic for each fetch attempt
        let lastError;
        for (let attempt = 0; attempt <= 2; attempt++) {
          try {
            console.log(`Fetch attempt ${attempt + 1}/3 with options:`, options);
            response = await fetch(request.url, options);
            
            if (response && response.status !== 0) {
              console.log(`Fetch successful with status: ${response.status}`);
              break;
            }
          } catch (fetchError) {
            console.warn(`Fetch attempt ${attempt + 1} failed:`, fetchError);
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
          console.warn(`All fetch attempts failed with options:`, options, lastError);
        }
      } catch (fetchError) {
        console.warn(`Fetch failed with options:`, options, fetchError);
        continue;
      }
    }
    
    if (!response || response.status === 0) {
      throw new Error('All fetch attempts failed');
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
          'Cache-Control': 'max-age=31536000'
        }
      });
      
      // 缓存响应
      await cache.put(request, corsResponse.clone());
      console.log('Opaque response cached with CORS headers');
      
      return corsResponse;
    }
    
    // 处理正常响应
    if (response.ok) {
      const responseClone = response.clone();
      const blob = await responseClone.blob();
      
      const corsResponse = new Response(blob, {
        status: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': response.headers.get('Content-Type') || 'image/png',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': '*',
          'Cache-Control': 'max-age=31536000'
        }
      });
      
      await cache.put(request, corsResponse.clone());
      console.log('Normal response cached with CORS headers');
      
      return corsResponse;
    }
    
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    
  } catch (error) {
    console.error('Service Worker fetch error:', error);
    
    // 返回一个占位符图片
    const placeholderSvg = `
      <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#f0f0f0"/>
        <text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="#666">
          图片加载失败
        </text>
        <text x="50%" y="70%" text-anchor="middle" dy=".3em" fill="#999" font-size="12">
          ${error.message}
        </text>
      </svg>
    `;
    
    return new Response(placeholderSvg, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}