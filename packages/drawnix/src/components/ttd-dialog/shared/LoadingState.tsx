import React from 'react';

interface LoadingStateProps {
  language: 'zh' | 'en';
  type: 'image' | 'video';
  isGenerating?: boolean;
  isLoading?: boolean;
  hasContent?: boolean;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  language,
  type,
  isGenerating = false,
  isLoading = false,
  hasContent = false
}) => {
  if (isGenerating) {
    return (
      <div className="preview-loading">
        <div className="loading-spinner"></div>
        <div className="loading-text">
          {language === 'zh' 
            ? `正在生成${type === 'image' ? '图像' : '视频'}...` 
            : `Generating ${type}...`}
        </div>
      </div>
    );
  }
  
  if (isLoading) {
    return (
      <div className="preview-loading">
        <div className="loading-spinner"></div>
        <div className="loading-text">
          {language === 'zh' 
            ? `正在加载${type === 'image' ? '图像' : '视频'}...` 
            : `Loading ${type}...`}
        </div>
      </div>
    );
  }
  
  // 如果有内容，不显示占位符
  if (hasContent) {
    return null;
  }
  
  return (
    <div className="preview-placeholder">
      <div className="placeholder-icon">{type === 'image' ? '🖼️' : '🎬'}</div>
      <div className="placeholder-text">
        {language === 'zh' 
          ? `${type === 'image' ? '图像' : '视频'}将在这里显示` 
          : `${type === 'image' ? 'Image' : 'Video'} will be displayed here`}
      </div>
    </div>
  );
};