import React from 'react';
import './GenerationToolLayout.scss';

interface GenerationToolLayoutProps {
  children: React.ReactNode;
  className?: string;
  /** 是否在侧栏显示任务列表 */
  showSidebar?: boolean;
}

/**
 * AI 生成工具的统一布局组件
 * 
 * 确保在 Dialog, WinBox 和 Canvas 等不同容器下具有一致的 Padding 和响应式行为
 */
export const GenerationToolLayout: React.FC<GenerationToolLayoutProps> = ({
  children,
  className = '',
  showSidebar = true,
}) => {
  return (
    <div className={`generation-tool-layout ${className} ${!showSidebar ? 'no-sidebar' : ''}`}>
      {children}
    </div>
  );
};
