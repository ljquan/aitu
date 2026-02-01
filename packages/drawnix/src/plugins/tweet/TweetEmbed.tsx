/**
 * Tweet Embed Component
 *
 * Twitter/X 推文嵌入组件
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ExternalLink, RefreshCw, MessageCircle } from 'lucide-react';
import { getTweetUrl } from '../../types/tweet.types';
import './tweet.scss';

interface TweetEmbedProps {
  /** 推文 ID */
  tweetId: string;
  /** 作者用户名 */
  authorHandle?: string;
  /** 原始 URL */
  originalUrl?: string;
  /** 主题 */
  theme?: 'light' | 'dark';
  /** 是否只读 */
  readonly?: boolean;
}

/**
 * Twitter Widget 脚本加载状态
 */
let twitterWidgetLoaded = false;
let twitterWidgetLoading = false;

/**
 * 加载 Twitter Widget 脚本
 */
function loadTwitterWidget(): Promise<void> {
  if (twitterWidgetLoaded) {
    return Promise.resolve();
  }

  if (twitterWidgetLoading) {
    // 等待加载完成
    return new Promise((resolve) => {
      const checkLoaded = setInterval(() => {
        if (twitterWidgetLoaded) {
          clearInterval(checkLoaded);
          resolve();
        }
      }, 100);
    });
  }

  twitterWidgetLoading = true;

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://platform.twitter.com/widgets.js';
    script.async = true;
    script.onload = () => {
      twitterWidgetLoaded = true;
      twitterWidgetLoading = false;
      resolve();
    };
    script.onerror = () => {
      twitterWidgetLoading = false;
      reject(new Error('Failed to load Twitter widget'));
    };
    document.body.appendChild(script);
  });
}

/**
 * 推文嵌入组件
 */
export const TweetEmbed: React.FC<TweetEmbedProps> = ({
  tweetId,
  authorHandle,
  originalUrl,
  theme = 'light',
  readonly = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [embedHtml, setEmbedHtml] = useState<string | null>(null);

  const tweetUrl = originalUrl || getTweetUrl(tweetId, authorHandle);

  // 加载推文
  const loadTweet = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // 尝试使用 Twitter Widget
      await loadTwitterWidget();

      if (containerRef.current && (window as any).twttr) {
        // 清除之前的内容
        const tweetContainer = containerRef.current.querySelector('.tweet-embed-tweet');
        if (tweetContainer) {
          tweetContainer.innerHTML = '';
        }

        // 创建推文嵌入
        await (window as any).twttr.widgets.createTweet(
          tweetId,
          tweetContainer,
          {
            theme,
            conversation: 'none',
            cards: 'visible',
            width: 'auto',
          }
        );

        setIsLoading(false);
      }
    } catch (err) {
      console.error('Failed to load tweet:', err);
      // 降级到简单卡片显示
      setEmbedHtml(null);
      setError('无法加载推文，请点击在新窗口中打开');
      setIsLoading(false);
    }
  }, [tweetId, theme]);

  // 初始加载
  useEffect(() => {
    loadTweet();
  }, [loadTweet]);

  // 在新窗口中打开
  const handleOpenExternal = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(tweetUrl, '_blank', 'noopener,noreferrer');
  }, [tweetUrl]);

  // 重新加载
  const handleReload = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    loadTweet();
  }, [loadTweet]);

  return (
    <div className={`tweet-embed-container tweet-embed-theme-${theme}`} ref={containerRef}>
      {/* 标题栏 */}
      <div className="tweet-embed-header">
        <div className="tweet-embed-logo">
          {/* X/Twitter Logo */}
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </div>
        <div className="tweet-embed-title">
          @{authorHandle || 'tweet'}的推文
        </div>
        <button
          className="tweet-embed-btn"
          onClick={handleReload}
          title="重新加载"
        >
          <RefreshCw size={14} />
        </button>
        <button
          className="tweet-embed-btn"
          onClick={handleOpenExternal}
          title="在新窗口中打开"
        >
          <ExternalLink size={14} />
        </button>
      </div>

      {/* 推文内容 */}
      <div className="tweet-embed-content">
        <div className="tweet-embed-tweet" />

        {/* 加载状态 */}
        {isLoading && (
          <div className="tweet-embed-loading">
            <div className="tweet-embed-spinner" />
            <span>加载推文中...</span>
          </div>
        )}

        {/* 错误状态 - 显示简单卡片 */}
        {error && !isLoading && (
          <div className="tweet-embed-fallback" onClick={handleOpenExternal}>
            <MessageCircle size={32} />
            <div className="tweet-embed-fallback-info">
              <div className="tweet-embed-fallback-author">
                @{authorHandle || 'Unknown'}
              </div>
              <div className="tweet-embed-fallback-text">
                点击查看推文内容...
              </div>
            </div>
            <div className="tweet-embed-fallback-hint">
              点击在新窗口中打开
            </div>
          </div>
        )}
      </div>

      {/* 底部 */}
      <div className="tweet-embed-footer">
        <span className="tweet-embed-id">Tweet ID: {tweetId}</span>
        <span className="tweet-embed-hint">双击打开</span>
      </div>
    </div>
  );
};

export default TweetEmbed;
