/**
 * RetryImage Component
 *
 * An image component that automatically retries loading on failure.
 * Features:
 * - Retries up to 5 times with exponential backoff
 * - Automatically bypasses Service Worker on timeout or repeated failures
 * - Shows skeleton loading state during download
 * - Smooth fade-in animation when loaded
 * - Lazy loading and async decoding for performance
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';

export interface RetryImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  /** Image source URL */
  src: string;
  /** Alt text for accessibility */
  alt: string;
  /** Maximum number of retry attempts (default: 5) */
  maxRetries?: number;
  /** Initial retry delay in ms (default: 1000) */
  initialRetryDelay?: number;
  /** Callback when image loads successfully */
  onLoadSuccess?: () => void;
  /** Callback when all retries fail */
  onLoadFailure?: (error: Error) => void;
  /** Optional fallback element to display on failure */
  fallback?: React.ReactNode;
  /** Show skeleton loading state (default: true) */
  showSkeleton?: boolean;
  /** Number of retries before bypassing SW (default: 2) */
  bypassSWAfterRetries?: number;
}

/**
 * Skeleton loading component
 */
const ImageSkeleton: React.FC<{ className?: string; style?: React.CSSProperties }> = ({
  className,
  style,
}) => (
  <div
    className={className}
    style={{
      ...style,
      background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s infinite',
      borderRadius: '8px',
      minHeight: '100px',
      width: '100%',
    }}
  >
    <style>
      {`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}
    </style>
  </div>
);

/**
 * Add bypass_sw parameter to URL to skip Service Worker interception
 */
function addBypassSWParam(url: string): string {
  try {
    const urlObj = new URL(url, window.location.origin);
    // 避免重复添加
    if (!urlObj.searchParams.has('bypass_sw')) {
      urlObj.searchParams.set('bypass_sw', '1');
    }
    return urlObj.toString();
  } catch {
    // 如果 URL 解析失败，直接拼接
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}bypass_sw=1`;
  }
}

/**
 * RetryImage component - displays an image with automatic retry on load failure
 */
export const RetryImage: React.FC<RetryImageProps> = ({
  src,
  alt,
  maxRetries = 5,
  initialRetryDelay = 1000,
  onLoadSuccess,
  onLoadFailure,
  fallback,
  showSkeleton = true,
  bypassSWAfterRetries = 2,
  ...imgProps
}) => {
  const [imageSrc, setImageSrc] = useState<string>(src);
  const [retryCount, setRetryCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);
  const [bypassSW, setBypassSW] = useState<boolean>(false);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate exponential backoff delay
  const getRetryDelay = useCallback(
    (attemptNumber: number): number => {
      return initialRetryDelay * Math.pow(2, attemptNumber);
    },
    [initialRetryDelay]
  );

  // Handle image load success
  const handleLoad = useCallback(() => {
    setIsLoading(false);
    setHasError(false);
    onLoadSuccess?.();
  }, [onLoadSuccess]);

  // Handle image load error with retry logic
  const handleError = useCallback(() => {
    if (retryCount < maxRetries) {
      const delay = getRetryDelay(retryCount);
      const nextRetryCount = retryCount + 1;
      
      // 检查是否应该绕过 SW
      const shouldBypassSW = nextRetryCount >= bypassSWAfterRetries && !bypassSW;
      
      if (shouldBypassSW) {
        console.log(`[RetryImage] 重试 ${nextRetryCount} 次后绕过 SW:`, src);
        setBypassSW(true);
      }
      
      // Schedule retry
      retryTimeoutRef.current = setTimeout(() => {
        setRetryCount(nextRetryCount);
        
        // 构建重试 URL
        let retryUrl = src;
        
        // 如果需要绕过 SW，添加 bypass_sw 参数
        if (shouldBypassSW || bypassSW) {
          retryUrl = addBypassSWParam(retryUrl);
        }
        
        // 添加时间戳强制刷新
        const separator = retryUrl.includes('?') ? '&' : '?';
        retryUrl = `${retryUrl}${separator}_retry=${Date.now()}`;
        
        setImageSrc(retryUrl);
      }, delay);
    } else {
      // All retries exhausted
      setIsLoading(false);
      setHasError(true);
      const error = new Error(`Failed to load image after ${maxRetries} retries`);
      onLoadFailure?.(error);
    }
  }, [retryCount, maxRetries, src, getRetryDelay, onLoadFailure, bypassSW, bypassSWAfterRetries]);

  // Reset state when src changes
  useEffect(() => {
    setImageSrc(src);
    setRetryCount(0);
    setIsLoading(true);
    setHasError(false);
    setBypassSW(false);
    
    // Clear any pending retry timeouts
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [src]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  // Render fallback if all retries failed
  if (hasError && fallback) {
    return <>{fallback}</>;
  }

  // Render image with skeleton loading state
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Skeleton shown while loading */}
      {isLoading && showSkeleton && (
        <ImageSkeleton
          className={imgProps.className}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            ...imgProps.style,
          }}
        />
      )}
      {/* Actual image with fade-in effect */}
      <img
        {...imgProps}
        src={imageSrc}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={handleLoad}
        onError={handleError}
        style={{
          ...imgProps.style,
          opacity: isLoading ? 0 : 1,
          transition: 'opacity 0.3s ease-out',
          width: '100%',
          height: '100%'
        }}
      />
    </div>
  );
};
