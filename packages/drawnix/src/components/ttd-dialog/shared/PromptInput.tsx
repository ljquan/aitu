import React, { useState, useRef, useEffect, useCallback } from 'react';
import { getPromptExample } from './ai-generation-utils';
import { CharacterMentionPopup } from '../../character/CharacterMentionPopup';
import { useMention } from '../../../hooks/useMention';

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

  // 点击外部关闭弹窗
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsPresetOpen(false);
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

  return (
    <div className="form-field">
      <div className="form-label-with-icon">
      <label className="form-label">
        {language === 'zh' ? `${type === 'image' ? '图像' : '视频'}描述` : `${type === 'image' ? 'Image' : 'Video'} Description`}
      </label>
      <div className="textarea-with-preset">
        <div className="preset-tooltip-container" ref={containerRef}>
          <button
            type="button"
            className="preset-icon-button"
            disabled={disabled}
            onClick={() => setIsPresetOpen(!isPresetOpen)}
          >
            💡
          </button>
          {isPresetOpen && (
            <div className="preset-tooltip">
              <div className="preset-header">
                {language === 'zh' ? '预设提示词' : 'Preset Prompts'}
              </div>
              <div className="preset-list">
                {presetPrompts.map((preset, index) => (
                  <button
                    key={index}
                    type="button"
                    className="preset-item"
                    data-track="ai_click_prompt_preset"
                    onClick={() => handlePresetClick(preset)}
                    disabled={disabled}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        </div>
      </div>
      <textarea
        ref={textareaRef}
        className="form-textarea"
        value={prompt}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={getPromptExample(language, type)}
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
