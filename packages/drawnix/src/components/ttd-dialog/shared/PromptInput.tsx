import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getPromptExample } from './ai-generation-utils';
import { CharacterMentionPopup } from '../../character/CharacterMentionPopup';
import { useMention } from '../../../hooks/useMention';
import { Z_INDEX } from '../../../constants/z-index';
import { promptStorageService } from '../../../services/prompt-storage-service';
import { PromptListPanel, type PromptItem } from '../../shared';

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

  // 处理后的提示词列表（排序和过滤，转换为 PromptItem 格式）
  const promptItems: PromptItem[] = useMemo(() => {
    const sorted = promptStorageService.sortPrompts(type, presetPrompts);
    return sorted.map((content, index) => ({
      id: `preset-${index}-${content.slice(0, 20)}`,
      content,
      pinned: promptStorageService.isPinned(type, content),
    }));
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
        const tooltipElement = document.querySelector('.preset-prompt-panel-portal');
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

  // 选择提示词
  const handleSelect = useCallback((content: string) => {
    onPromptChange(content);
    onError?.(null);
    setIsPresetOpen(false);
  }, [onPromptChange, onError]);

  // 置顶/取消置顶提示词
  const handleTogglePin = useCallback((id: string) => {
    const item = promptItems.find(p => p.id === id);
    if (!item) return;
    
    if (item.pinned) {
      promptStorageService.unpinPrompt(type, item.content);
    } else {
      promptStorageService.pinPrompt(type, item.content);
    }
    setUpdateTrigger(prev => prev + 1);
  }, [type, promptItems]);

  // 删除提示词
  const handleDelete = useCallback((id: string) => {
    const item = promptItems.find(p => p.id === id);
    if (!item) return;
    
    promptStorageService.deletePrompt(type, item.content);
    setUpdateTrigger(prev => prev + 1);
  }, [type, promptItems]);

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

    const title = language === 'zh' 
      ? `${type === 'image' ? '图片' : '视频'}描述预设` 
      : `${type === 'image' ? 'Image' : 'Video'} Description Presets`;

    const tooltipContent = (
      <div
        className="preset-prompt-panel-portal"
        style={{
          position: 'fixed',
          top: tooltipPosition.top,
          left: tooltipPosition.left,
          transform: 'translate(-100%, -100%)',
          zIndex: Z_INDEX.DIALOG_POPOVER,
        }}
      >
        <PromptListPanel
          title={title}
          items={promptItems}
          onSelect={handleSelect}
          onTogglePin={handleTogglePin}
          onDelete={handleDelete}
          language={language}
          disabled={disabled}
          showCount={true}
        />
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
