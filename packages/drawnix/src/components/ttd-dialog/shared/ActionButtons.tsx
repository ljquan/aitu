import React from 'react';

interface ActionButtonsProps {
  language: 'zh' | 'en';
  type: 'image' | 'video';
  isGenerating: boolean;
  isLoading?: boolean;
  hasGenerated: boolean;
  canGenerate: boolean;
  onGenerate: () => void;
  onReset: () => void;
}

export const ActionButtons: React.FC<ActionButtonsProps> = ({
  language,
  type,
  isGenerating,
  isLoading = false,
  hasGenerated,
  canGenerate,
  onGenerate,
  onReset
}) => {
  return (
    <div className="section-actions">
      <button
        onClick={onGenerate}
        disabled={isGenerating || !canGenerate}
        className={`action-button primary ${isGenerating ? 'loading' : ''}`}
      >
        {isGenerating
          ? (language === 'zh' ? '生成中...' : 'Generating...')
          : hasGenerated
          ? (language === 'zh' ? '重新生成' : 'Regenerate')
          : (language === 'zh' ? `生成${type === 'video' ? '视频' : ''}` : `Generate${type === 'video' ? ' Video' : ''}`)}
      </button>
      
      <button
        onClick={onReset}
        disabled={isGenerating}
        className="action-button secondary"
      >
        {language === 'zh' ? '重置' : 'Reset'}
      </button>
    </div>
  );
};