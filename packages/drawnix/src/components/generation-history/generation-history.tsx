import React, { useState } from 'react';
import { HistoryIcon } from 'tdesign-icons-react';
import { useI18n } from '../../i18n';
import './generation-history.scss';

// 通用历史记录项接口
export interface BaseHistoryItem {
  id: string;
  prompt: string;
  timestamp: number;
}

// 图片历史记录项接口
export interface ImageHistoryItem extends BaseHistoryItem {
  type: 'image';
  imageUrl: string;
  width: number;
  height: number;
}

// 视频历史记录项接口（适配图片格式）
export interface VideoHistoryItem extends BaseHistoryItem {
  type: 'video';
  imageUrl: string; // 视频缩略图URL，适配图片格式
  width: number;    // 视频宽度，适配图片格式
  height: number;   // 视频高度，适配图片格式
  // 视频特有字段
  previewUrl: string;
  downloadUrl?: string;
}

// 联合类型
export type HistoryItem = ImageHistoryItem | VideoHistoryItem;

export interface GenerationHistoryProps {
  historyItems: HistoryItem[];
  onSelectFromHistory: (item: HistoryItem) => void;
  position?: {
    bottom?: string;
    right?: string;
    top?: string;
    left?: string;
  };
  className?: string;
}

export const GenerationHistory: React.FC<GenerationHistoryProps> = ({
  historyItems,
  onSelectFromHistory,
  position = { bottom: '8px', right: '8px' },
  className = ''
}) => {
  const { language } = useI18n();
  const [showHistoryPopover, setShowHistoryPopover] = useState(false);

  if (historyItems.length === 0) {
    return null;
  }

  const renderHistoryItem = (item: HistoryItem) => {
    return (
      <div
        key={item.id}
        className="history-item"
        onClick={() => {
          onSelectFromHistory(item);
          setShowHistoryPopover(false);
        }}
      >
        <div className="history-item-media">
          {item.type === 'image' ? (
            <img
              src={item.imageUrl}
              alt="History item"
              className="history-item-image"
              loading="lazy"
            />
          ) : (
            // 视频类型，使用统一的 imageUrl 字段
            item.imageUrl ? (
              <div className="history-video-thumbnail">
                <img
                  src={item.imageUrl}
                  alt="Video thumbnail"
                  className="history-item-image"
                  loading="lazy"
                />
                <div className="video-play-overlay">
                  <div className="play-icon">▶</div>
                </div>
              </div>
            ) : (
              <div className="history-item-image history-video-placeholder">
                <div className="placeholder-icon">🎬</div>
              </div>
            )
          )}
        </div>
        <div className="history-item-info">
          <div className="history-item-prompt" title={item.prompt}>
            {item.prompt.length > 25 
              ? `${item.prompt.slice(0, 25)}...` 
              : item.prompt}
          </div>
          <div className="history-item-time">
            {new Date(item.timestamp).toLocaleDateString()}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div 
      className={`generation-history-container ${className}`}
      style={{
        position: 'absolute',
        bottom: position.bottom,
        right: position.right,
        top: position.top,
        left: position.left,
        zIndex: 10
      }}
    >
      <button
        className="history-icon-button"
        onClick={() => setShowHistoryPopover(!showHistoryPopover)}
        onMouseEnter={() => setShowHistoryPopover(true)}
        title={language === 'zh' ? '查看生成历史' : 'View generation history'}
      >
        <HistoryIcon />
      </button>
      {showHistoryPopover && (
        <div
          className="history-popover"
          onMouseLeave={() => setShowHistoryPopover(false)}
        >
          <div className="history-popover-header">
            <span className="history-title">
              {language === 'zh' ? '生成历史' : 'Generation History'}
            </span>
            <button
              className="history-close-button"
              onClick={() => setShowHistoryPopover(false)}
            >
              ×
            </button>
          </div>
          <div className="history-list">
            {historyItems.slice(0, 10).map(renderHistoryItem)}
          </div>
          {historyItems.length > 10 && (
            <div className="history-more-info">
              {language === 'zh' 
                ? `还有 ${historyItems.length - 10} 个项目...`
                : `${historyItems.length - 10} more items...`
              }
            </div>
          )}
        </div>
      )}
    </div>
  );
};