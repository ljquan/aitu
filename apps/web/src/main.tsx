import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import App from './app/app';

// 修复权限策略违规警告
import './utils/permissions-policy-fix';

// 初始化 Web Vitals 和 Page Report 监控
import { initWebVitals } from '../../../packages/drawnix/src/services/web-vitals-service';
import { initPageReport } from '../../../packages/drawnix/src/services/page-report-service';
import { initPreventPinchZoom } from '../../../packages/drawnix/src/services/prevent-pinch-zoom-service';

// ===== 立即初始化防止双指缩放 =====
// 必须在任何其他代码之前执行，确保事件监听器最先注册
let cleanupPinchZoom: (() => void) | undefined;
if (typeof window !== 'undefined') {
  cleanupPinchZoom = initPreventPinchZoom();
  console.log('[Main] Pinch zoom prevention initialized immediately');
}

// 初始化性能监控
if (typeof window !== 'undefined') {
  // 等待 PostHog 加载完成后初始化监控
  const initMonitoring = () => {
    if (window.posthog) {
      console.log('[Monitoring] PostHog loaded, initializing Web Vitals and Page Report');
      initWebVitals();
      initPageReport();
    } else {
      console.log('[Monitoring] Waiting for PostHog to load...');
      setTimeout(initMonitoring, 500);
    }
  };

  // 延迟初始化，确保 PostHog 已加载
  setTimeout(initMonitoring, 1000);
}

// 注册Service Worker来处理CORS问题和PWA功能
if ('serviceWorker' in navigator) {
  const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  
  // 新版本是否已准备好
  let newVersionReady = false;
  // 等待中的新 Worker
  let pendingWorker: ServiceWorker | null = null;
  
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
                pendingWorker = newWorker;
                
                // 在开发模式下自动激活新的Service Worker
                if (isDevelopment) {
                  console.log('Development mode: activating new Service Worker immediately');
                  newWorker.postMessage({ type: 'SKIP_WAITING' });
                } else {
                  // 生产模式：新版本已安装，等待 SW 自己决定升级时机
                  // SW 会在没有活跃请求时自动升级
                  console.log('Production mode: New version installed, SW will upgrade when idle');
                  newVersionReady = true;
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
    } else if (event.data && event.data.type === 'SW_NEW_VERSION_READY') {
      // Service Worker 通知新版本已准备好
      console.log(`Main: New version v${event.data.version} ready, waiting for idle to upgrade`);
      newVersionReady = true;
    } else if (event.data && event.data.type === 'SW_UPGRADING') {
      // Service Worker 正在升级
      console.log(`Main: Service Worker upgrading to v${event.data.version}`);
    } else if (event.data && event.data.type === 'UPGRADE_STATUS') {
      // 升级状态响应
      console.log('Main: Upgrade status:', event.data);
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
  
  // 页面卸载前，如果有等待中的升级，触发升级
  window.addEventListener('beforeunload', () => {
    if (newVersionReady && pendingWorker) {
      console.log('Main: Page unloading, triggering pending upgrade');
      pendingWorker.postMessage({ type: 'SKIP_WAITING' });
    }
  });
  
  // 页面隐藏时（用户切换标签页），如果有等待中的升级，触发升级
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && newVersionReady && pendingWorker) {
      console.log('Main: Page hidden, triggering pending upgrade');
      pendingWorker.postMessage({ type: 'SKIP_WAITING' });
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
