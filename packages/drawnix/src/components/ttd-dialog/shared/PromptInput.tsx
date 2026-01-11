import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getPromptExample } from './ai-generation-utils';
import { CharacterMentionPopup } from '../../character/CharacterMentionPopup';
import { useMention } from '../../../hooks/useMention';
import { Z_INDEX } from '../../../constants/z-index';
import { promptStorageService } from '../../../services/prompt-storage-service';

interface PromptInputProps {
  prompt: string;
  onPromptChange: (prompt: string) => void;
  presetPrompts: string[];
  language: 'zh' | 'en';
  type: 'image' | 'video';
  disabled?: boolean;
  onError?: (error: string | null) => void;
  /** Whether to enable character @ mention feature */
  enableMention?: boolean;
  /** Video model provider (sora, veo, etc.) - used to determine if @ mention should be enabled */
  videoProvider?: 'sora' | 'veo' | string;
}

export const PromptInput: React.FC<PromptInputProps> = ({
  prompt,
  onPromptChange,
  presetPrompts,
  language,
  type,
  disabled = false,
  onError,
  enableMention = true,
  videoProvider,
}) => {
  const [isPresetOpen, setIsPresetOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);
  const [updateTrigger, setUpdateTrigger] = useState(0); // 用于触发重新渲染

  // 处理后的提示词列表（排序和过滤）
  const sortedPrompts = useMemo(() => {
    return promptStorageService.sortPrompts(type, presetPrompts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, presetPrompts, updateTrigger]);

  // Use mention hook for @ functionality
  // Only enable for video type with Sora provider (@ mention is a Sora-specific feature)
  const isMentionEnabled = enableMention && type === 'video' && videoProvider === 'sora';
  const {
    mentionState,
    textareaRef,
    handleTextChange,
    handleKeyDown,
    handleCharacterSelect,
    closeMentionPopup,
  } = useMention({
    enabled: isMentionEnabled,
    onPromptChange,
    prompt,
  });

  // 计算 tooltip 位置
  const updateTooltipPosition = useCallback(() => {
    if (buttonRef.current && isPresetOpen) {
      const rect = buttonRef.current.getBoundingClientRect();
      // 在按钮上方显示，右对齐
      setTooltipPosition({
        top: rect.top - 4, // 在按钮上方 4px
        left: rect.right, // 右对齐
      });
    }
  }, [isPresetOpen]);

  // 打开时计算位置
  useEffect(() => {
    if (isPresetOpen) {
      updateTooltipPosition();
      // 监听滚动和窗口变化
      window.addEventListener('scroll', updateTooltipPosition, true);
      window.addEventListener('resize', updateTooltipPosition);
      return () => {
        window.removeEventListener('scroll', updateTooltipPosition, true);
        window.removeEventListener('resize', updateTooltipPosition);
      };
    }
  }, [isPresetOpen, updateTooltipPosition]);

  // 点击外部关闭弹窗
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // 检查点击是否在按钮或 tooltip 内
      if (containerRef.current && !containerRef.current.contains(target)) {
        // 还需要检查是否点击了 portal 中的 tooltip
        const tooltipElement = document.querySelector('.preset-tooltip-portal');
        if (!tooltipElement?.contains(target)) {
          setIsPresetOpen(false);
        }
      }
    };

    if (isPresetOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isPresetOpen]);

  const handlePresetClick = (preset: string) => {
    onPromptChange(preset);
    onError?.(null);
    setIsPresetOpen(false); // 点击提示词后关闭弹窗
  };

  // 置顶/取消置顶提示词
  const handlePinToggle = useCallback((e: React.MouseEvent, preset: string) => {
    e.stopPropagation();
    const isPinned = promptStorageService.isPinned(type, preset);
    if (isPinned) {
      promptStorageService.unpinPrompt(type, preset);
    } else {
      promptStorageService.pinPrompt(type, preset);
    }
    setUpdateTrigger(prev => prev + 1);
  }, [type]);

  // 删除提示词
  const handleDelete = useCallback((e: React.MouseEvent, preset: string) => {
    e.stopPropagation();
    promptStorageService.deletePrompt(type, preset);
    setUpdateTrigger(prev => prev + 1);
  }, [type]);

  // Handle textarea change
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    handleTextChange(value, cursorPos);
    onError?.(null);
  }, [handleTextChange, onError]);

  // Close mention popup when type changes
  useEffect(() => {
    if (type !== 'video') {
      closeMentionPopup();
    }
  }, [type, closeMentionPopup]);

  // 渲染 tooltip 内容
  const renderTooltipContent = () => {
    if (!isPresetOpen || !tooltipPosition) return null;

    const tooltipContent = (
      <div
        className="preset-tooltip preset-tooltip-portal"
        style={{
          position: 'fixed',
          top: tooltipPosition.top,
          left: tooltipPosition.left,
          transform: 'translate(-100%, -100%)',
          zIndex: Z_INDEX.DIALOG_POPOVER,
        }}
      >
        <div className="preset-header">
          {language === 'zh' ? `${type === 'image' ? '图片' : '视频'}描述预设` : `${type === 'image' ? 'Image' : 'Video'} Description Presets`}
        </div>
        <div className="preset-list">
          {sortedPrompts.map((preset, index) => {
            const isPinned = promptStorageService.isPinned(type, preset);
            return (
              <div
                key={index}
                className={`preset-item-wrapper ${isPinned ? 'pinned' : ''}`}
              >
                <button
                  type="button"
                  className="preset-item"
                  data-track="ai_click_prompt_preset"
                  onClick={() => handlePresetClick(preset)}
                  disabled={disabled}
                  title={preset}
                >
                  {isPinned && <span className="pin-indicator">📌</span>}
                  <span className="preset-text">{preset}</span>
                </button>
                <div className="preset-actions">
                  <button
                    type="button"
                    className={`preset-action-btn pin-btn ${isPinned ? 'active' : ''}`}
                    onClick={(e) => handlePinToggle(e, preset)}
                    title={language === 'zh' ? (isPinned ? '取消置顶' : '置顶') : (isPinned ? 'Unpin' : 'Pin')}
                  >
                    {isPinned ? '📌' : '📍'}
                  </button>
                  <button
                    type="button"
                    className="preset-action-btn delete-btn"
                    onClick={(e) => handleDelete(e, preset)}
                    title={language === 'zh' ? '删除' : 'Delete'}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );

    return createPortal(tooltipContent, document.body);
  };

  return (
    <div className="form-field">
      <div className="form-label-with-icon">
      <label className="form-label">
        {language === 'zh' ? `${type === 'image' ? '图片' : '视频'}描述` : `${type === 'image' ? 'Image' : 'Video'} Description`}
      </label>
      <div className="textarea-with-preset">
        <div className="preset-tooltip-container" ref={containerRef}>
          <button
            ref={buttonRef}
            type="button"
            className="preset-icon-button"
            disabled={disabled}
            onClick={() => setIsPresetOpen(!isPresetOpen)}
          >
            💡
          </button>
          {renderTooltipContent()}
        </div>
        </div>
      </div>
      <textarea
        ref={textareaRef}
        className="form-textarea"
        value={prompt}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={getPromptExample(language, type, videoProvider)}
        rows={4}
        disabled={disabled}
      />

      {/* Character mention popup - rendered in portal style with fixed position */}
      {isMentionEnabled && (
        <CharacterMentionPopup
          visible={mentionState.visible}
          query={mentionState.query}
          position={mentionState.position}
          showBelow={mentionState.showBelow}
          selectedIndex={mentionState.selectedIndex}
          onSelect={handleCharacterSelect}
          onClose={closeMentionPopup}
        />
      )}
    </div>
  );
};
