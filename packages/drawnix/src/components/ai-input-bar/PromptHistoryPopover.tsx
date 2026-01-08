/**
 * PromptHistoryPopover 组件
 *
 * 历史提示词悬浮面板
 * - 三个点图标按钮
 * - 鼠标悬浮时显示历史提示词列表
 * - 支持置顶/取消置顶
 * - 点击提示词回填到输入框
 * - 支持删除历史记录
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { MoreHorizontal, Pin, PinOff, X } from 'lucide-react';
import { usePromptHistory } from '../../hooks/usePromptHistory';
import './prompt-history-popover.scss';

interface PromptHistoryPopoverProps {
  /** 选择提示词后的回调 */
  onSelectPrompt: (content: string) => void;
  /** 语言 */
  language: 'zh' | 'en';
}

export const PromptHistoryPopover: React.FC<PromptHistoryPopoverProps> = ({
  onSelectPrompt,
  language,
}) => {
  const { history, removeHistory, togglePinHistory, refreshHistory } = usePromptHistory();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const leaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current);
    };
  }, []);

  // 处理鼠标进入
  const handleMouseEnter = useCallback(() => {
    // 清除离开定时器
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
    // 延迟显示面板（避免误触）
    hoverTimeoutRef.current = setTimeout(() => {
      // 打开前刷新历史记录，确保显示最新数据
      refreshHistory();
      setIsOpen(true);
    }, 150);
  }, [refreshHistory]);

  // 处理鼠标离开
  const handleMouseLeave = useCallback(() => {
    // 清除进入定时器
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    // 延迟关闭面板（允许鼠标移动到面板上）
    leaveTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 200);
  }, []);

  // 处理选择提示词
  const handleSelectPrompt = useCallback((content: string) => {
    onSelectPrompt(content);
    setIsOpen(false);
  }, [onSelectPrompt]);

  // 处理删除
  const handleDelete = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    removeHistory(id);
  }, [removeHistory]);

  // 处理置顶切换
  const handleTogglePin = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    togglePinHistory(id);
  }, [togglePinHistory]);

  // 如果没有历史记录，不显示按钮
  if (history.length === 0) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="prompt-history-popover"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* 三个点图标按钮 */}
      <button
        className="prompt-history-popover__trigger"
        title={language === 'zh' ? '历史提示词' : 'Prompt History'}
        data-track="ai_input_click_history"
      >
        <MoreHorizontal size={18} />
      </button>

      {/* 历史提示词面板 */}
      {isOpen && (
        <div className="prompt-history-popover__panel">
          <div className="prompt-history-popover__header">
            <span>{language === 'zh' ? '历史提示词' : 'Prompt History'}</span>
            <span className="prompt-history-popover__count">
              {history.length}
            </span>
          </div>
          <div className="prompt-history-popover__list">
            {history.map((item) => (
              <div
                key={item.id}
                className={`prompt-history-popover__item ${item.pinned ? 'prompt-history-popover__item--pinned' : ''}`}
                onClick={() => handleSelectPrompt(item.content)}
              >
                {/* 置顶标识 */}
                {item.pinned && (
                  <div className="prompt-history-popover__item-pin-badge">
                    <Pin size={10} />
                  </div>
                )}
                {/* 提示词内容 */}
                <span className="prompt-history-popover__item-text">
                  {item.content}
                </span>
                {/* 操作按钮 */}
                <div className="prompt-history-popover__item-actions">
                  {/* 置顶/取消置顶按钮 */}
                  <button
                    className="prompt-history-popover__item-action"
                    onClick={(e) => handleTogglePin(e, item.id)}
                    title={item.pinned
                      ? (language === 'zh' ? '取消置顶' : 'Unpin')
                      : (language === 'zh' ? '置顶' : 'Pin')
                    }
                  >
                    {item.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                  </button>
                  {/* 删除按钮 */}
                  <button
                    className="prompt-history-popover__item-action prompt-history-popover__item-action--delete"
                    onClick={(e) => handleDelete(e, item.id)}
                    title={language === 'zh' ? '删除' : 'Delete'}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PromptHistoryPopover;
