import React, { useState, useRef, useEffect } from 'react';
import './smart-image.scss';

interface SmartImageProps {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  onLoad?: () => void;
  onError?: (error: Error) => void;
  maxRetries?: number;
  retryDelay?: number;
  showRetryButton?: boolean;
  language?: 'zh' | 'en';
  loading?: 'lazy' | 'eager';
  decoding?: 'async' | 'auto' | 'sync';
  bypassServiceWorker?: boolean; // 是否绕过Service Worker
}

interface LoadAttempt {
  url: string;
  timestamp: number;
  attempt: number;
}

export const SmartImage: React.FC<SmartImageProps> = ({
  src,
  alt,
  className = '',
  style,
  onLoad,
  onError,
  maxRetries = 3,
  retryDelay = 2000,
  showRetryButton = true,
  language = 'zh',
  loading = 'lazy',
  decoding = 'async',
  bypassServiceWorker = false
}) => {
  // 组件实例ID，用于调试
  const instanceId = useRef(Math.random().toString(36).substring(7));
  
  const [currentSrc, setCurrentSrc] = useState(src);
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  
  const imgRef = useRef<HTMLImageElement>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loadAttemptsRef = useRef<LoadAttempt[]>([]);
  
  // 调试日志：组件挂载
  useRef(() => {
    console.log(`SmartImage[${instanceId.current}]: 组件挂载`, { src, alt });
    return true;
  }).current;

  // 生成带缓存破坏参数的URL
  const generateUrlWithCacheBuster = (originalUrl: string, attempt: number): string => {
    try {
      const url = new URL(originalUrl, window.location.href);
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 11);
      
      // 第一次尝试不添加参数，保持原始URL以便缓存命中
      if (attempt === 0) {
        return originalUrl;
      } else if (attempt === 1) {
        // 第二次尝试使用不同的参数名
        url.searchParams.set('cache_buster', timestamp.toString());
        url.searchParams.set('v', randomId);
      } else if (attempt === 2) {
        // 第三次尝试更激进的参数
        url.searchParams.set('timestamp', timestamp.toString());
        url.searchParams.set('nocache', '1');
        url.searchParams.set('_cb', randomId);
      } else {
        // 超过3次的极端情况，使用所有可能的参数
        url.searchParams.set('t', timestamp.toString());
        url.searchParams.set('v', timestamp.toString());
        url.searchParams.set('timestamp', timestamp.toString());
        url.searchParams.set('cache_buster', timestamp.toString());
        url.searchParams.set('nocache', '1');
        url.searchParams.set('retry', attempt.toString());
        url.searchParams.set('rand', randomId);
        url.searchParams.set('_force', Date.now().toString());
      }
      
      // 如果设置了绕过Service Worker，添加特殊参数
      if (bypassServiceWorker) {
        url.searchParams.set('bypass_sw', '1');
        url.searchParams.set('direct_fetch', timestamp.toString());
      }
      
      const newUrl = url.toString();
      console.log(`SmartImage: Generated URL for attempt ${attempt}:`, newUrl);
      return newUrl;
    } catch (error) {
      console.warn('Failed to generate cache-busted URL, using original:', error);
      // 如果URL解析失败，至少添加时间戳参数
      const separator = originalUrl.includes('?') ? '&' : '?';
      const timestamp = Date.now();
      const fallbackUrl = `${originalUrl}${separator}_t=${timestamp}&retry=${attempt}`;
      console.log(`SmartImage: Fallback URL for attempt ${attempt}:`, fallbackUrl);
      return fallbackUrl;
    }
  };

  // 记录加载尝试
  const recordLoadAttempt = (url: string, attempt: number) => {
    loadAttemptsRef.current.push({
      url,
      timestamp: Date.now(),
      attempt
    });
    
    // 只保留最近10次尝试记录
    if (loadAttemptsRef.current.length > 10) {
      loadAttemptsRef.current = loadAttemptsRef.current.slice(-10);
    }
  };

  // 执行重试逻辑
  const performRetry = (attempt: number = retryCount + 1) => {
    if (attempt > maxRetries) {
      setLoadState('error');
      setIsRetrying(false);
      console.error(`SmartImage: 图片加载最终失败，已重试${maxRetries}次:`, src);
      if (onError) {
        onError(new Error(`图片加载失败，已重试${maxRetries}次`));
      }
      return;
    }

    setIsRetrying(true);
    setRetryCount(attempt);
    
    const newUrl = generateUrlWithCacheBuster(src, attempt);
    recordLoadAttempt(newUrl, attempt);
    
    console.log(`SmartImage: 尝试加载图片 (第${attempt}/${maxRetries}次)`, {
      original: src,
      generated: newUrl,
      attempt,
      maxRetries
    });
    
    // 使用setTimeout添加延迟，让CDN有时间准备
    const delay = attempt === 1 ? 500 : retryDelay * Math.pow(1.5, attempt - 1); // 指数退避，第一次重试也有小延迟
    
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }
    
    retryTimeoutRef.current = setTimeout(() => {
      console.log(`SmartImage: 实际设置新URL (延迟${delay}ms后):`, newUrl);
      setCurrentSrc(newUrl);
      setLoadState('loading');
      setIsRetrying(false);
    }, delay);
  };

  // 手动重试按钮
  const handleManualRetry = () => {
    if (isRetrying) return;
    performRetry();
  };

  // 检测是否为Service Worker返回的占位符图片
  const isPlaceholderImage = (imgElement: HTMLImageElement): boolean => {
    // 检查图片尺寸是否为Service Worker占位符的默认尺寸
    if (imgElement.naturalWidth === 400 && imgElement.naturalHeight === 300) {
      // 进一步检查：创建canvas读取像素数据
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return false;
        
        canvas.width = imgElement.naturalWidth;
        canvas.height = imgElement.naturalHeight;
        ctx.drawImage(imgElement, 0, 0);
        
        // 检查左上角像素是否为灰色背景 (#f0f0f0)
        const imageData = ctx.getImageData(0, 0, 1, 1);
        const [r, g, b] = imageData.data;
        
        // #f0f0f0 转换为RGB是 (240, 240, 240)
        const isGrayBackground = r === 240 && g === 240 && b === 240;
        
        if (isGrayBackground) {
          console.warn('SmartImage: 检测到Service Worker占位符图片');
          return true;
        }
      } catch (error) {
        console.warn('SmartImage: 无法检测占位符图片，可能存在跨域限制', error);
        // 如果跨域检测失败，仍然基于尺寸判断
        return true;
      }
    }
    
    return false;
  };

  // 处理图片加载成功
  const handleImageLoad = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const imgElement = event.currentTarget;
    
    console.log('SmartImage: 图片加载完成', {
      src: currentSrc,
      naturalWidth: imgElement.naturalWidth,
      naturalHeight: imgElement.naturalHeight,
      complete: imgElement.complete
    });
    
    // 检测是否为占位符图片
    if (isPlaceholderImage(imgElement)) {
      console.warn('SmartImage: 检测到占位符图片，触发重试逻辑');
      // 将占位符图片视为加载失败，触发重试
      handleImageError(event);
      return;
    }
    
    console.log('SmartImage: 真实图片加载成功', currentSrc);
    setLoadState('loaded');
    setIsRetrying(false);
    if (onLoad) {
      onLoad();
    }
  };

  // 处理图片加载失败
  const handleImageError = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const imgElement = event.currentTarget;
    console.warn('SmartImage: 图片加载失败', {
      src: currentSrc,
      naturalWidth: imgElement.naturalWidth,
      naturalHeight: imgElement.naturalHeight,
      complete: imgElement.complete,
      retryCount: `${retryCount}/${maxRetries}`,
      timestamp: new Date().toISOString()
    });
    
    if (retryCount < maxRetries) {
      console.log(`SmartImage: 开始自动重试 (${retryCount + 1}/${maxRetries})`);
      // 自动重试
      performRetry();
    } else {
      // 超过最大重试次数
      console.error('SmartImage: 达到最大重试次数，设置为错误状态');
      setLoadState('error');
      setIsRetrying(false);
      if (onError) {
        onError(new Error(`图片加载失败，已重试${maxRetries}次`));
      }
    }
  };

  // 当src变化时重置状态
  useEffect(() => {
    const effectTimestamp = Date.now();
    console.log(`SmartImage[${instanceId.current}]: src变化检测 (${new Date().toISOString()})`, { 
      src, 
      currentSrc, 
      isRetrying, 
      alt, 
      effectTimestamp 
    });
    
    // 只有在src真正变化且不在重试中时才重置
    if (src && !isRetrying) {
      // 检查是否是新的src（去掉缓存破坏参数后比较）
      const normalizedSrc = src.split('?')[0]; // 获取不带参数的URL
      const normalizedCurrentSrc = currentSrc ? currentSrc.split('?')[0] : '';
      
      if (normalizedSrc !== normalizedCurrentSrc) {
        console.log(`SmartImage[${instanceId.current}]: 检测到新的源URL，重置状态`, { 
          alt,
          normalizedSrc, 
          normalizedCurrentSrc,
          originalSrc: src,
          originalCurrentSrc: currentSrc,
          timestamp: new Date().toISOString()
        });
        
        // 使用原始URL（第一次不加缓存破坏参数）
        const initialUrl = generateUrlWithCacheBuster(src, 0);
        setCurrentSrc(initialUrl);
        setLoadState('loading');
        setRetryCount(0);
        loadAttemptsRef.current = [];
        
        console.log(`SmartImage[${instanceId.current}]: 设置初始URL:`, { 
          alt, 
          initialUrl, 
          timestamp: new Date().toISOString() 
        });
        
        if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current);
          retryTimeoutRef.current = null;
        }
      } else {
        console.log(`SmartImage[${instanceId.current}]: 相同的URL，跳过重置:`, { 
          alt,
          normalizedSrc, 
          normalizedCurrentSrc 
        });
      }
    } else {
      console.log(`SmartImage[${instanceId.current}]: 跳过处理 (src: ${!!src}, isRetrying: ${isRetrying})`);
    }
  }, [src, isRetrying]); // 移除currentSrc依赖，避免循环

  // 清理定时器
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className={`smart-image-container ${className}`} style={style}>
      {/* 主图片 */}
      <img
        ref={imgRef}
        src={currentSrc}
        alt={alt}
        className={`smart-image ${loadState}`}
        loading={loading}
        decoding={decoding}
        onLoad={(e) => handleImageLoad(e)}
        onError={(e) => handleImageError(e)}
        style={{
          display: loadState === 'loaded' ? 'block' : 'none'
        }}
      />
      
      {/* 加载状态 */}
      {loadState === 'loading' && (
        <div className="smart-image-loading">
          <div className="loading-spinner"></div>
          <div className="loading-text">
            {isRetrying 
              ? (language === 'zh' 
                  ? `重试中... (${retryCount}/${maxRetries})` 
                  : `Retrying... (${retryCount}/${maxRetries})`)
              : (language === 'zh' ? '加载中...' : 'Loading...')
            }
          </div>
        </div>
      )}
      
      {/* 错误状态和重试按钮 */}
      {loadState === 'error' && (
        <div className="smart-image-error">
          <div className="error-icon">⚠️</div>
          <div className="error-text">
            {language === 'zh' ? '图片加载失败' : 'Failed to load image'}
          </div>
          {showRetryButton && (
            <button
              className="retry-button"
              onClick={handleManualRetry}
              disabled={isRetrying}
            >
              {isRetrying 
                ? (language === 'zh' ? '重试中...' : 'Retrying...')
                : (language === 'zh' ? '重试' : 'Retry')
              }
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default SmartImage;