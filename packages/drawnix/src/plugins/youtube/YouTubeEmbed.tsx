/**
 * YouTube Embed Component
 *
 * YouTube 视频嵌入组件
 */

import React, { useState, useCallback } from 'react';
import { Play, ExternalLink } from 'lucide-react';
import { getYouTubeEmbedUrl, getYouTubeThumbnail } from '../../types/youtube.types';
import './youtube.scss';

interface YouTubeEmbedProps {
  /** YouTube 视频 ID */
  videoId: string;
  /** 视频标题 */
  title?: string;
  /** 原始 URL */
  originalUrl?: string;
  /** 是否只读 */
  readonly?: boolean;
}

/**
 * YouTube 嵌入组件
 * 默认显示缩略图，点击后加载 iframe
 */
export const YouTubeEmbed: React.FC<YouTubeEmbedProps> = ({
  videoId,
  title,
  originalUrl,
  readonly = false,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [thumbnailError, setThumbnailError] = useState(false);

  const thumbnailUrl = getYouTubeThumbnail(videoId);
  const embedUrl = getYouTubeEmbedUrl(videoId);

  // 点击播放
  const handlePlay = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (readonly) return;
    setIsPlaying(true);
  }, [readonly]);

  // 在新窗口中打开
  const handleOpenExternal = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const url = originalUrl || `https://www.youtube.com/watch?v=${videoId}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [videoId, originalUrl]);

  // 缩略图加载失败
  const handleThumbnailError = useCallback(() => {
    setThumbnailError(true);
  }, []);

  return (
    <div className="youtube-embed-container">
      {/* 标题栏 */}
      <div className="youtube-embed-header">
        <div className="youtube-embed-logo">
          <svg viewBox="0 0 28 20" width="24" height="17">
            <path
              fill="#FF0000"
              d="M27.9727 3.12324C27.6435 1.89323 26.6768 0.926623 25.4468 0.597366C23.2197 0 14.285 0 14.285 0C14.285 0 5.35042 0 3.12323 0.597366C1.89323 0.926623 0.926623 1.89323 0.597366 3.12324C0 5.35042 0 10 0 10C0 10 0 14.6496 0.597366 16.8768C0.926623 18.1068 1.89323 19.0734 3.12323 19.4026C5.35042 20 14.285 20 14.285 20C14.285 20 23.2197 20 25.4468 19.4026C26.6768 19.0734 27.6435 18.1068 27.9727 16.8768C28.5701 14.6496 28.5701 10 28.5701 10C28.5701 10 28.5677 5.35042 27.9727 3.12324Z"
            />
            <path fill="#FFFFFF" d="M11.4253 14.2854L18.8477 10.0004L11.4253 5.71533V14.2854Z" />
          </svg>
        </div>
        <div className="youtube-embed-title" title={title || 'YouTube 视频'}>
          {title || 'YouTube 视频'}
        </div>
        <button
          className="youtube-embed-external-btn"
          onClick={handleOpenExternal}
          title="在新窗口中打开"
        >
          <ExternalLink size={14} />
        </button>
      </div>

      {/* 视频区域 */}
      <div className="youtube-embed-content">
        {isPlaying ? (
          // iframe 播放器
          <iframe
            src={embedUrl}
            title={title || 'YouTube video player'}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="youtube-embed-iframe"
          />
        ) : (
          // 缩略图预览
          <div className="youtube-embed-thumbnail" onClick={handlePlay}>
            {!thumbnailError ? (
              <img
                src={thumbnailUrl}
                alt={title || 'YouTube video thumbnail'}
                onError={handleThumbnailError}
              />
            ) : (
              <div className="youtube-embed-thumbnail-fallback">
                <svg viewBox="0 0 68 48" width="68" height="48">
                  <path
                    fill="#FF0000"
                    d="M66.52 7.74c-.78-2.93-2.49-5.41-5.42-6.19C55.79.13 34 0 34 0S12.21.13 6.9 1.55c-2.93.78-4.63 3.26-5.42 6.19C.06 13.05 0 24 0 24s.06 10.95 1.48 16.26c.78 2.93 2.49 5.41 5.42 6.19C12.21 47.87 34 48 34 48s21.79-.13 27.1-1.55c2.93-.78 4.64-3.26 5.42-6.19C67.94 34.95 68 24 68 24s-.06-10.95-1.48-16.26z"
                  />
                  <path fill="#FFF" d="M45 24L27 14v20" />
                </svg>
              </div>
            )}
            <div className="youtube-embed-play-overlay">
              <div className="youtube-embed-play-btn">
                <Play size={32} fill="white" />
              </div>
            </div>
            <div className="youtube-embed-hint">双击打开</div>
          </div>
        )}
      </div>

      {/* Video ID 显示 */}
      <div className="youtube-embed-footer">
        <span className="youtube-embed-video-id">Video ID: {videoId}</span>
      </div>
    </div>
  );
};

export default YouTubeEmbed;
