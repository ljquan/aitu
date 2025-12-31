import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTutorialVersion, appendVersion } from './useTutorialVersion';
import './macos-frame.scss';

interface MacOSFrameProps {
  children?: React.ReactNode;
  /** 视频源地址 */
  videoSrc?: string;
  /** 图片源地址 */
  imageSrc?: string;
  /** 图片 alt 文本 */
  imageAlt?: string;
  /** 自定义类名 */
  className?: string;
}

/**
 * macOS 风格窗口外壳组件
 * 支持视频/图片内容，带有红绿灯按钮装饰
 */
export const MacOSFrame: React.FC<MacOSFrameProps> = ({
  children,
  videoSrc,
  imageSrc,
  imageAlt = '',
  className = '',
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const version = useTutorialVersion();

  // 添加版本参数到 URL（仅对本地资源）
  const versionedVideoSrc = useMemo(() => {
    if (!videoSrc || !version) return videoSrc;
    // 只对 /tutorial/ 路径的本地资源添加版本
    if (videoSrc.startsWith('/tutorial/')) {
      return appendVersion(videoSrc, version);
    }
    return videoSrc;
  }, [videoSrc, version]);

  const versionedImageSrc = useMemo(() => {
    if (!imageSrc || !version) return imageSrc;
    if (imageSrc.startsWith('/tutorial/')) {
      return appendVersion(imageSrc, version);
    }
    return imageSrc;
  }, [imageSrc, version]);

  // 视频加载处理
  useEffect(() => {
    if (versionedVideoSrc && videoRef.current) {
      const video = videoRef.current;

      const handleCanPlay = () => setIsLoading(false);
      const handleError = () => {
        setIsLoading(false);
        setHasError(true);
      };

      video.addEventListener('canplay', handleCanPlay);
      video.addEventListener('error', handleError);

      return () => {
        video.removeEventListener('canplay', handleCanPlay);
        video.removeEventListener('error', handleError);
      };
    }
  }, [versionedVideoSrc]);

  // 图片加载处理
  const handleImageLoad = () => setIsLoading(false);
  const handleImageError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  return (
    <div className={`macos-frame ${className}`}>
      {/* 标题栏 - 红绿灯按钮 */}
      <div className="macos-frame__titlebar">
        <div className="macos-frame__button macos-frame__button--close" />
        <div className="macos-frame__button macos-frame__button--minimize" />
        <div className="macos-frame__button macos-frame__button--maximize" />
      </div>

      {/* 内容区域 */}
      <div className="macos-frame__content">
        {/* 加载状态骨架屏 */}
        {isLoading && (versionedVideoSrc || versionedImageSrc) && (
          <div className="macos-frame__skeleton">
            <motion.div
              className="macos-frame__skeleton-shimmer"
              animate={{ x: ['-100%', '100%'] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
            />
          </div>
        )}

        {/* 错误状态 */}
        {hasError && (
          <div className="macos-frame__error">
            <span>加载失败</span>
          </div>
        )}

        {/* 视频内容 */}
        {versionedVideoSrc && !hasError && (
          <video
            ref={videoRef}
            src={versionedVideoSrc}
            autoPlay
            loop
            muted
            playsInline
            className={`macos-frame__video ${isLoading ? 'macos-frame__video--loading' : ''}`}
          />
        )}

        {/* 图片内容 */}
        {versionedImageSrc && !versionedVideoSrc && !hasError && (
          <img
            src={versionedImageSrc}
            alt={imageAlt}
            onLoad={handleImageLoad}
            onError={handleImageError}
            className={`macos-frame__image ${isLoading ? 'macos-frame__image--loading' : ''}`}
          />
        )}

        {/* 自定义内容（如动画演示） */}
        {children && !videoSrc && !imageSrc && (
          <div className="macos-frame__custom">
            {children}
          </div>
        )}
      </div>

      {/* 内发光效果 */}
      <div className="macos-frame__glow" />
    </div>
  );
};
