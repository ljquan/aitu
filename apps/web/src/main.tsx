import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import App from './app/app';

// 修复权限策略违规警告
import './utils/permissions-policy-fix';

// 注册Service Worker来处理CORS问题和PWA功能
if ('serviceWorker' in navigator) {
  const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        console.log('Service Worker registered successfully:', registration);
        
        // 在开发模式下，强制更新Service Worker
        if (isDevelopment && registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        
        // 监听Service Worker更新
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // 在开发模式下自动激活新的Service Worker
                if (isDevelopment) {
                  newWorker.postMessage({ type: 'SKIP_WAITING' });
                }
              }
            });
          }
        });
        
        // 页面加载完成后延迟触发缓存清理，避免影响页面性能
        setTimeout(() => {
          if (navigator.serviceWorker.controller) {
            console.log('Main: Requesting cache cleanup from Service Worker');
            navigator.serviceWorker.controller.postMessage({ type: 'CLEAN_EXPIRED_CACHE' });
          }
        }, 3000); // 延迟3秒执行缓存清理
        
      })
      .catch(error => {
        console.log('Service Worker registration failed:', error);
      });
  });
  
  // 监听Service Worker消息
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data && event.data.type === 'SW_UPDATED') {
      if (isDevelopment) {
        // 开发模式下自动刷新页面
        window.location.reload();
      }
    } else if (event.data && event.data.type === 'CACHE_CLEANUP_COMPLETE') {
      const { cleanedCount } = event.data;
      if (cleanedCount > 0) {
        console.log(`Main: Cache cleanup completed, removed ${cleanedCount} expired entries`);
      }
    }
  });
}

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
