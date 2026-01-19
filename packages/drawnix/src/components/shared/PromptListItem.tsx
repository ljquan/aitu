/**
 * PromptListItem 组件
 *
 * 可复用的提示词列表项组件
 * - 支持置顶/取消置顶
 * - 支持删除
 * - 悬停时显示操作按钮
 * - 支持预设标识
 */

import React from 'react';
import { Pin, PinOff, X, Lightbulb } from 'lucide-react';
import './prompt-list-item.scss';

export interface PromptListItemProps {
  /** 提示词内容 */
  content: string;
  /** 是否已置顶 */
  pinned?: boolean;
  /** 是否是预设提示词 */
  isPreset?: boolean;
  /** 点击提示词的回调 */
  onClick?: () => void;
  /** 置顶/取消置顶的回调 */
  onTogglePin?: () => void;
  /** 删除的回调 */
  onDelete?: () => void;
  /** 语言 */
  language?: 'zh' | 'en';
  /** 是否禁用 */
  disabled?: boolean;
}

export const PromptListItem: React.FC<PromptListItemProps> = ({
  content,
  pinned = false,
  isPreset = false,
  onClick,
  onTogglePin,
  onDelete,
  language = 'zh',
  disabled = false,
}) => {
  const handleTogglePin = (e: React.MouseEvent) => {
    e.stopPropagation();
    onTogglePin?.();
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.();
  };

  return (
    <div
      className={`prompt-list-item ${pinned ? 'prompt-list-item--pinned' : ''} ${isPreset ? 'prompt-list-item--preset' : ''} ${disabled ? 'prompt-list-item--disabled' : ''}`}
      onClick={disabled ? undefined : onClick}
      title={content}
    >
      {/* 置顶标识 */}
      {pinned && (
        <div className="prompt-list-item__pin-badge">
          <Pin size={10} />
        </div>
      )}

      {/* 预设标识 */}
      {isPreset && (
        <div className="prompt-list-item__preset-badge">
          <Lightbulb size={10} />
        </div>
      )}
      
      {/* 提示词内容 */}
      <span className="prompt-list-item__text">
        {content}
      </span>
      
      {/* 操作按钮 */}
      <div className="prompt-list-item__actions">
        {/* 置顶/取消置顶按钮 */}
        {onTogglePin && (
          <button
            type="button"
            className="prompt-list-item__action"
            onClick={handleTogglePin}
            title={pinned
              ? (language === 'zh' ? '取消置顶' : 'Unpin')
              : (language === 'zh' ? '置顶' : 'Pin')
            }
          >
            {pinned ? <PinOff size={14} /> : <Pin size={14} />}
          </button>
        )}
        
        {/* 删除按钮 */}
        {onDelete && (
          <button
            type="button"
            className="prompt-list-item__action prompt-list-item__action--delete"
            onClick={handleDelete}
            title={language === 'zh' ? '删除' : 'Delete'}
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
};

export default PromptListItem;
