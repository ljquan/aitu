// Service Worker for handling CORS issues with external images
const CACHE_NAME = 'drawnix-images-v1';

self.addEventListener('install', event => {
  console.log('Service Worker installed');
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('Service Worker activated');
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // 拦截对 google.datas.systems 图片的请求
  if (url.hostname === 'google.datas.systems' && url.pathname.includes('response_images')) {
    event.respondWith(handleImageRequest(event.request));
  }
});

async function handleImageRequest(request) {
  try {
    console.log('Service Worker intercepting image request:', request.url);
    
    // 首先尝试从缓存获取
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      console.log('Serving image from cache:', request.url);
      return cachedResponse;
    }
    
    // 尝试多种获取方式
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
        response = await fetch(request.url, options);
        
        if (response && response.status !== 0) {
          console.log(`Fetch successful with status: ${response.status}`);
          break;
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