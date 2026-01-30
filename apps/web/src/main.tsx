import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './app/app';
import { initCrashLogger } from './crash-logger';
import './utils/permissions-policy-fix';
import {
  initWebVitals,
  initPageReport,
  initPreventPinchZoom,
  runDatabaseCleanup,
  storageMigrationService,
  initPromptStorageCache,
  toolbarConfigService,
  memoryMonitorService,
  swChannelClient,
} from '@drawnix/drawnix';
import { sanitizeObject, sanitizeUrl } from '@aitu/utils';
import { initSWConsoleCapture } from './utils/sw-console-capture';

// ===== 初始化崩溃日志系统 =====
// 必须尽早初始化，以捕获启动阶段的内存状态和错误
console.log('[Main] Initializing crash logger...');
initCrashLogger();
console.log('[Main] Crash logger initialized');

// ===== 初始化 Sentry 错误监控 =====
// 必须在其他代码之前初始化，以捕获所有错误
Sentry.init({
  dsn: "https://a18e755345995baaa0e1972c4cf24497@o4510700882296832.ingest.us.sentry.io/4510700883869696",
  // 仅在生产环境启用
  enabled: import.meta.env.PROD,
  // 禁用自动 PII 收集，保护用户隐私
  sendDefaultPii: false,
  // 性能监控采样率（降低以减少数据量）
  tracesSampleRate: 0.1,
  // beforeSend 钩子：过滤敏感数据
  beforeSend(event) {
    // 过滤 extra 数据中的敏感信息
    if (event.extra) {
      event.extra = sanitizeObject(event.extra) as Record<string, unknown>;
    }
    
    // 过滤 contexts 中的敏感信息
    if (event.contexts) {
      event.contexts = sanitizeObject(event.contexts) as typeof event.contexts;
    }
    
    // 过滤 breadcrumbs 中的敏感信息
    if (event.breadcrumbs) {
      event.breadcrumbs = event.breadcrumbs.map(breadcrumb => ({
        ...breadcrumb,
        data: breadcrumb.data ? sanitizeObject(breadcrumb.data) as Record<string, unknown> : undefined,
        message: breadcrumb.message ? String(sanitizeObject(breadcrumb.message)) : undefined,
      }));
    }
    
    // 过滤请求数据中的敏感信息
    if (event.request) {
      if (event.request.headers) {
        event.request.headers = sanitizeObject(event.request.headers) as Record<string, string>;
      }
      if (event.request.data) {
        event.request.data = sanitizeObject(event.request.data);
      }
      // 清理 URL 中可能的敏感参数
      if (event.request.url) {
        event.request.url = sanitizeUrl(event.request.url);
      }
    }
    
    return event;
  },
});

// ===== 立即初始化防止双指缩放 =====
// 必须在任何其他代码之前执行，确保事件监听器最先注册
if (typeof window !== 'undefined') {
  initPreventPinchZoom();
  // console.log('[Main] Pinch zoom prevention initialized immediately');

  // 清理旧的冗余数据库（异步执行，不阻塞启动）
  runDatabaseCleanup().catch(error => {
    console.warn('[Main] Database cleanup failed:', error);
  });

  // 执行 LocalStorage 到 IndexedDB 的数据迁移（异步执行，不阻塞启动）
  storageMigrationService.runMigration().then(() => {
    // 迁移完成后初始化各服务的缓存
    return Promise.all([
      initPromptStorageCache(),
      toolbarConfigService.initializeAsync(),
    ]);
  }).catch(error => {
    console.warn('[Main] Storage migration/init failed:', error);
  });
}

// 初始化性能监控
if (typeof window !== 'undefined') {
  // 启动内存监控（延迟启动，避免影响首屏加载）
  setTimeout(() => {
    memoryMonitorService.start();
    // 打印初始内存状态
    memoryMonitorService.logMemoryStatus();
  }, 5000);

  // 等待 PostHog 加载完成后初始化监控
  const initMonitoring = () => {
    if (window.posthog) {
      // console.log('[Monitoring] PostHog loaded, initializing Web Vitals and Page Report');
      initWebVitals();
      initPageReport();
    } else {
      // console.log('[Monitoring] Waiting for PostHog to load...');
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
  // 用户是否已确认升级（只有用户确认后才触发刷新）
  let userConfirmedUpgrade = false;
  
  // Global reference to service worker registration
  let swRegistration: ServiceWorkerRegistration | null = null;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        // console.log('Service Worker registered successfully:', registration);
        swRegistration = registration;
        
        // 初始化控制台日志捕获，发送到 SW 调试面板
        initSWConsoleCapture();
        
        // 在开发模式下，强制检查更新并处理等待中的Worker
        if (isDevelopment) {
          // console.log('Development mode: forcing SW update check');
          registration.update().catch(err => console.warn('Forced update check failed:', err));
          
          if (registration.waiting) {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
        }
        
        // 监听Service Worker更新
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            // console.log('New Service Worker found, installing...');
            
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // console.log('New Service Worker installed, waiting for user confirmation...');
                pendingWorker = newWorker;
                
                // 在开发模式下自动激活新的Service Worker
                if (isDevelopment) {
                  // console.log('Development mode: activating new Service Worker immediately');
                  newWorker.postMessage({ type: 'SKIP_WAITING' });
                } else {
                  // 生产模式：新版本已安装，通知 UI 显示升级提示
                  // console.log('Production mode: New version installed, dispatching update event');
                  newVersionReady = true;
                  // 尝试获取新版本号，用于更新提示
                  fetch(`/version.json?t=${Date.now()}`)
                    .then(res => res.ok ? res.json() : null)
                    .then(data => {
                      window.dispatchEvent(new CustomEvent('sw-update-available', { 
                        detail: { version: data?.version || 'new' } 
                      }));
                    })
                    .catch(() => {
                      window.dispatchEvent(new CustomEvent('sw-update-available', { 
                        detail: { version: 'new' } 
                      }));
                    });
                }
              }
            });
          }
        });
        
        // 定期检查更新（每 5 分钟检查一次）
        setInterval(() => {
          // console.log('Checking for updates...');
          registration.update().catch(error => {
            console.warn('Update check failed:', error);
          });
        }, 5 * 60 * 1000);
        
        // 注意：不自动清理图片和视频缓存，这些是用户生成的内容
        // 只在用户手动操作时（如媒体库中删除）才清理
        
      })
      .catch(error => {
        // console.log('Service Worker registration failed:', error);
      });
  });
  
  // 设置 SW 事件处理器（通过 postmessage-duplex）
  const setupSWEventHandlers = () => {
    if (!swChannelClient.isInitialized()) {
      setTimeout(setupSWEventHandlers, 500);
      return;
    }
    
    swChannelClient.setEventHandlers({
      onSWUpdated: (event) => {
        // 只有用户主动确认升级后才刷新页面
        if (!userConfirmedUpgrade) {
          return;
        }
        // 等待一小段时间，确保新的Service Worker已经完全接管
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      },
      onSWNewVersionReady: (event) => {
        newVersionReady = true;
        window.dispatchEvent(new CustomEvent('sw-update-available', { 
          detail: { version: event.version } 
        }));
      },
      onSWActivated: (event) => {
        // 新 SW 已自动激活并接管页面
        console.log(`Service Worker v${event.version} 已激活`);
        window.dispatchEvent(new CustomEvent('sw-update-available', { 
          detail: { version: event.version, autoActivated: true } 
        }));
      },
    });
  };
  
  // 延迟初始化 SW 事件处理器，等待 swChannelClient 就绪
  setTimeout(setupSWEventHandlers, 1000);
  
  // 注册视频缩略图生成处理器（使用 postmessage-duplex 双工通讯）
  // SW 通过 publish('thumbnail:generate', { url }) 请求，主线程处理并直接返回结果
  const setupVideoThumbnailHandler = async () => {
    // 等待 swChannelClient 初始化
    if (!swChannelClient.isInitialized()) {
      setTimeout(setupVideoThumbnailHandler, 500);
      return;
    }
    
    swChannelClient.registerVideoThumbnailHandler(async (url) => {
      try {
        const { generateVideoThumbnailFromBlob } = await import('@drawnix/drawnix');
        
        // 从缓存获取视频 blob
        const cache = await caches.open('drawnix-images');
        const response = await cache.match(url);
        if (!response) {
          return { error: 'Video not found in cache' };
        }
        
        const videoBlob = await response.blob();
        
        // 生成预览图
        const thumbnailBlob = await generateVideoThumbnailFromBlob(videoBlob, 400);
        
        // 将 Blob 转换为 Data URL
        const thumbnailUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(thumbnailBlob);
        });
        
        return { thumbnailUrl };
      } catch (error) {
        console.warn('[Main] Failed to generate video thumbnail:', error);
        return { error: error instanceof Error ? error.message : String(error) };
      }
    });
  };
  
  setupVideoThumbnailHandler();
  
  // 监听controller变化（新的Service Worker接管）
  // 只有用户主动确认升级后才刷新页面
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // console.log('Service Worker controller changed');

    // 只有用户主动确认升级后才刷新页面
    if (!userConfirmedUpgrade) {
      // console.log('Controller changed but user has not confirmed upgrade, skipping reload');
      return;
    }

    // 延迟刷新，确保新Service Worker的缓存已准备好
    setTimeout(() => {
      // console.log('Reloading page to use new Service Worker...');
      window.location.reload();
    }, 1000);
  });
  
  // 监听用户确认升级事件
  window.addEventListener('user-confirmed-upgrade', () => {
    // 标记用户已确认升级，允许后续的 reload
    userConfirmedUpgrade = true;
    
    // 优先使用 pendingWorker
    if (pendingWorker) {
      pendingWorker.postMessage({ type: 'SKIP_WAITING' });
      return;
    }
    
    // 如果没有 pendingWorker，尝试查找 waiting 状态的 worker
    if (swRegistration && swRegistration.waiting) {
      swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
      return;
    }
    
    // 如果都没有 waiting worker，说明 SW 已经是最新的 active 状态
    // 这种情况通常发生在首次安装后，SW 直接 activate 了
    // 清除缓存并强制刷新
    
    // 清除旧的静态资源缓存以确保获取最新资源
    caches.keys().then(cacheNames => {
      const staticCaches = cacheNames.filter(name => name.startsWith('drawnix-static-v'));
      return Promise.all(staticCaches.map(name => caches.delete(name)));
    }).finally(() => {
      // 强制硬刷新（绕过缓存）
      window.location.href = window.location.href.split('?')[0] + '?_t=' + Date.now();
    });
  });
  
  // 页面卸载前，不再自动触发升级，必须用户手动确认
  // window.addEventListener('beforeunload', () => {
  //   if (newVersionReady && pendingWorker) {
  //     console.log('Main: Page unloading, triggering pending upgrade');
  //     pendingWorker.postMessage({ type: 'SKIP_WAITING' });
  //   }
  // });
  
  // 页面隐藏时，不再自动触发升级
  // document.addEventListener('visibilitychange', () => {
  //   if (document.visibilityState === 'hidden' && newVersionReady && pendingWorker) {
  //     console.log('Main: Page hidden, triggering pending upgrade');
  //     pendingWorker.postMessage({ type: 'SKIP_WAITING' });
  //   }
  // });
}

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
console.log('[Main] React root created, rendering App...');
root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
console.log('[Main] App rendering started');