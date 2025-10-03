import React from 'react';
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
  return (
    <div className="form-field">
      <div className="form-label-with-icon">
        <label className="form-label">
          {language === 'zh' ? `${type === 'image' ? '图像' : '视频'}描述` : `${type === 'image' ? 'Image' : 'Video'} Description`}
        </label>
        <div className="preset-tooltip-container">
          <button
            type="button"
            className="preset-icon-button"
            disabled={disabled}
          >
            💡
          </button>
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
                  onClick={() => {
                    onPromptChange(preset);
                    onError?.(null);
                  }}
                  disabled={disabled}
                >
                  {preset}
                </button>
              ))}
            </div>
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