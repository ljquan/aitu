/**
 * LazyImage Component
 *
 * A lazy-loading image component that only loads images when they enter the viewport.
 * Reduces memory usage and improves performance for large lists.
 */

import React, { memo, useRef, useState, useEffect, useCallback } from 'react';
import { Loading } from 'tdesign-react';
import './lazy-image.scss';

export interface LazyImageProps {
  /** Image source URL */
  src: string;
  /** Alt text for accessibility */
  alt: string;
  /** Optional placeholder element */
  placeholder?: React.ReactNode;
  /** CSS class name */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
  /** Object fit mode */
  objectFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  /** Root margin for IntersectionObserver (default: '200px') */
  rootMargin?: string;
  /** Whether to show loading indicator (default: true) */
  showLoading?: boolean;
  /** Whether to show error state (default: true) */
  showError?: boolean;
  /** Callback when image loads successfully */
  onLoad?: () => void;
  /** Callback when image fails to load */
  onError?: () => void;
  /** Callback when image is clicked */
  onClick?: () => void;
}

/**
 * LazyImage component with IntersectionObserver-based lazy loading
 */
export const LazyImage = memo(function LazyImage({
  src,
  alt,
  placeholder,
  className = '',
  style,
  objectFit = 'cover',
  rootMargin = '200px',
  showLoading = true,
  showError = true,
  onLoad,
  onError,
  onClick,
}: LazyImageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Reset state when src changes
  useEffect(() => {
    setIsLoaded(false);
    setHasError(false);
    setIsLoading(false);
  }, [src]);

  // IntersectionObserver setup
  useEffect(() => {
    if (isVisible) return;

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
        threshold: 0,
      }
    );

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [isVisible, rootMargin]);

  // Load image when visible
  useEffect(() => {
    if (!isVisible || !src || isLoaded || hasError) return;

    setIsLoading(true);

    const img = new Image();

    img.onload = () => {
      setIsLoading(false);
      setIsLoaded(true);
      onLoad?.();
    };

    img.onerror = () => {
      setIsLoading(false);
      setHasError(true);
      onError?.();
    };

    img.src = src;

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [isVisible, src, isLoaded, hasError, onLoad, onError]);

  const handleRetry = useCallback(() => {
    setHasError(false);
    setIsLoaded(false);
    setIsLoading(false);
    // Force re-trigger by toggling visibility
    setIsVisible(false);
    requestAnimationFrame(() => setIsVisible(true));
  }, []);

  return (
    <div
      ref={containerRef}
      className={`lazy-image ${className}`}
      style={style}
      onClick={onClick}
    >
      {/* Placeholder or loading state */}
      {!isLoaded && !hasError && (
        <div className="lazy-image__placeholder">
          {placeholder || (
            showLoading && isLoading ? (
              <Loading size="small" />
            ) : (
              <div className="lazy-image__skeleton" />
            )
          )}
        </div>
      )}

      {/* Error state */}
      {hasError && showError && (
        <div className="lazy-image__error" onClick={handleRetry}>
          <span className="lazy-image__error-icon">⚠️</span>
          <span className="lazy-image__error-text">加载失败</span>
          <span className="lazy-image__error-retry">点击重试</span>
        </div>
      )}

      {/* Loaded image */}
      {isLoaded && (
        <img
          src={src}
          alt={alt}
          className="lazy-image__img"
          style={{ objectFit }}
          loading="lazy"
          decoding="async"
        />
      )}
    </div>
  );
});

export default LazyImage;
