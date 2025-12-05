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
            console.log('New Service Worker found, installing...');
            
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('New Service Worker installed, waiting to activate...');
                
                // 在开发模式下自动激活新的Service Worker
                if (isDevelopment) {
                  console.log('Development mode: activating new Service Worker immediately');
                  newWorker.postMessage({ type: 'SKIP_WAITING' });
                } else {
                  // 生产模式：延迟激活，给用户提示
                  console.log('Production mode: New version available, will reload after current operations complete');
                  
                  // 延迟 5 秒后静默刷新页面以应用更新
                  // 这样用户当前的操作不会被打断
                  setTimeout(() => {
                    console.log('Applying new version update...');
                    newWorker.postMessage({ type: 'SKIP_WAITING' });
                  }, 5000);
                }
              }
            });
          }
        });
        
        // 定期检查更新（每 5 分钟检查一次）
        setInterval(() => {
          console.log('Checking for updates...');
          registration.update().catch(error => {
            console.warn('Update check failed:', error);
          });
        }, 5 * 60 * 1000);
        
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
      console.log('Service Worker updated, reloading page...');
      
      // 等待一小段时间，确保新的Service Worker已经完全接管
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } else if (event.data && event.data.type === 'CACHE_CLEANUP_COMPLETE') {
      const { cleanedCount } = event.data;
      if (cleanedCount > 0) {
        console.log(`Main: Cache cleanup completed, removed ${cleanedCount} expired entries`);
      }
    }
  });
  
  // 监听controller变化（新的Service Worker接管）
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('Service Worker controller changed');
    
    // 延迟刷新，确保新Service Worker的缓存已准备好
    setTimeout(() => {
      console.log('Reloading page to use new Service Worker...');
      window.location.reload();
    }, 1000);
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
