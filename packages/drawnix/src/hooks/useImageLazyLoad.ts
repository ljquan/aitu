/**
 * useImageLazyLoad Hook
 *
 * A hook for lazy loading images using IntersectionObserver.
 * Only loads images when they enter the viewport.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseImageLazyLoadOptions {
  /** The image source URL */
  src: string;
  /** Root margin for IntersectionObserver (default: '200px') */
  rootMargin?: string;
  /** Threshold for IntersectionObserver (default: 0) */
  threshold?: number;
  /** Whether to start loading immediately (default: false) */
  immediate?: boolean;
}

export interface UseImageLazyLoadReturn {
  /** Ref to attach to the container element */
  containerRef: React.RefObject<HTMLDivElement>;
  /** Whether the image is currently loading */
  isLoading: boolean;
  /** Whether the image has loaded successfully */
  isLoaded: boolean;
  /** Whether there was an error loading the image */
  hasError: boolean;
  /** The actual src to use (empty until visible) */
  loadedSrc: string;
  /** Manually trigger load */
  triggerLoad: () => void;
  /** Retry loading after error */
  retry: () => void;
}

/**
 * Hook for lazy loading images
 *
 * @example
 * ```tsx
 * const { containerRef, isLoading, isLoaded, loadedSrc } = useImageLazyLoad({
 *   src: imageUrl,
 *   rootMargin: '200px',
 * });
 *
 * return (
 *   <div ref={containerRef}>
 *     {isLoading && <Skeleton />}
 *     {loadedSrc && <img src={loadedSrc} alt="..." />}
 *   </div>
 * );
 * ```
 */
export function useImageLazyLoad(options: UseImageLazyLoadOptions): UseImageLazyLoadReturn {
  const { src, rootMargin = '200px', threshold = 0, immediate = false } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(immediate);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [loadedSrc, setLoadedSrc] = useState('');

  // Reset state when src changes
  useEffect(() => {
    setIsLoaded(false);
    setHasError(false);
    setLoadedSrc('');
    if (!immediate) {
      setIsVisible(false);
    }
  }, [src, immediate]);

  // IntersectionObserver setup
  useEffect(() => {
    if (immediate || isVisible) return;

    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin,
        threshold,
      }
    );

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [immediate, isVisible, rootMargin, threshold]);

  // Load image when visible
  useEffect(() => {
    if (!isVisible || !src || isLoaded) return;

    setIsLoading(true);
    setHasError(false);

    const img = new Image();

    img.onload = () => {
      setIsLoading(false);
      setIsLoaded(true);
      setLoadedSrc(src);
    };

    img.onerror = () => {
      setIsLoading(false);
      setHasError(true);
    };

    img.src = src;

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [isVisible, src, isLoaded]);

  const triggerLoad = useCallback(() => {
    setIsVisible(true);
  }, []);

  const retry = useCallback(() => {
    setHasError(false);
    setIsLoaded(false);
    setLoadedSrc('');
    setIsVisible(true);
  }, []);

  return {
    containerRef,
    isLoading,
    isLoaded,
    hasError,
    loadedSrc,
    triggerLoad,
    retry,
  };
}

/**
 * Batch preload images for smoother scrolling
 */
export function preloadImages(urls: string[]): Promise<void[]> {
  return Promise.all(
    urls.map(
      (url) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => resolve(); // Don't fail on error
          img.src = url;
        })
    )
  );
}
