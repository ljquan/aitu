/**
 * RetryImage Component
 *
 * An image component that automatically retries loading on failure.
 * Retries up to 5 times with exponential backoff.
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
  ...imgProps
}) => {
  const [imageSrc, setImageSrc] = useState<string>(src);
  const [retryCount, setRetryCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);
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
      
      // Schedule retry
      retryTimeoutRef.current = setTimeout(() => {
        setRetryCount((prev) => prev + 1);
        // Force reload by appending timestamp
        setImageSrc(`${src}${src.includes('?') ? '&' : '?'}_retry=${Date.now()}`);
      }, delay);
    } else {
      // All retries exhausted
      setIsLoading(false);
      setHasError(true);
      const error = new Error(`Failed to load image after ${maxRetries} retries`);
      onLoadFailure?.(error);
    }
  }, [retryCount, maxRetries, src, getRetryDelay, onLoadFailure]);

  // Reset state when src changes
  useEffect(() => {
    setImageSrc(src);
    setRetryCount(0);
    setIsLoading(true);
    setHasError(false);
    
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

  // Render image with retry logic
  return (
    <img
      {...imgProps}
      src={imageSrc}
      alt={alt}
      onLoad={handleLoad}
      onError={handleError}
      style={{
        ...imgProps.style,
        opacity: isLoading ? 0.7 : 1,
        transition: 'opacity 0.3s ease-out',
      }}
    />
  );
};
