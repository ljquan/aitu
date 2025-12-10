import React, { useState, useRef, useEffect } from 'react';
import { getPromptExample } from './ai-generation-utils';

interface PromptInputProps {
  prompt: string;
  onPromptChange: (prompt: string) => void;
  presetPrompts: string[];
  language: 'zh' | 'en';
  type: 'image' | 'video';
  disabled?: boolean;
  onError?: (error: string | null) => void;
}

export const PromptInput: React.FC<PromptInputProps> = ({
  prompt,
  onPromptChange,
  presetPrompts,
  language,
  type,
  disabled = false,
  onError
}) => {
  const [isPresetOpen, setIsPresetOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
        className="form-textarea"
        value={prompt}
        onChange={(e) => {
          onPromptChange(e.target.value);
          onError?.(null);
        }}
        placeholder={getPromptExample(language, type)}
        rows={4}
        disabled={disabled}
      />
    </div>
  );
};