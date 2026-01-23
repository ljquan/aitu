/**
 * Tool Adapters
 * 
 * 工具适配器组件，用于在不同场景（弹窗、WinBox、画布）中使用 AI 生成组件
 * 解决原始组件样式（height: 80vh 等）在不同容器中的兼容性问题
 */

import React, { lazy, Suspense, CSSProperties } from 'react';

// 懒加载原始组件
const AIImageGenerationOriginal = lazy(() => import('../ttd-dialog/ai-image-generation'));
const AIVideoGenerationOriginal = lazy(() => import('../ttd-dialog/ai-video-generation'));
const BatchImageGenerationOriginal = lazy(() => import('../ttd-dialog/batch-image-generation'));

/**
 * 加载中占位组件
 */
const LoadingFallback: React.FC<{ message?: string }> = ({ message = '加载中...' }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    minHeight: 200,
    color: '#999',
    fontSize: 14,
  }}>
    {message}
  </div>
);

/**
 * 工具容器样式
 * 覆盖原始组件的 height: 80vh，使其适应父容器
 */
const containerStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  boxSizing: 'border-box',
};

/**
 * 样式覆盖 CSS
 * 通过 style 标签注入，覆盖原始组件的固定高度样式
 */
const StyleOverride: React.FC = () => (
  <style>{`
    /* 工具适配器样式覆盖 */
    .tool-adapter-container .ai-image-generation-container,
    .tool-adapter-container .ai-video-generation-container,
    .tool-adapter-container .batch-image-generation {
      height: 100% !important;
      max-height: 100% !important;
      overflow: auto !important;
    }
    
    .tool-adapter-container .main-content {
      flex: 1;
      min-height: 0;
      overflow: auto;
    }
    
    .tool-adapter-container .ai-image-generation-section {
      flex: 2;
      min-width: 280px;
      overflow-y: auto;
      padding: 16px;
    }
    
    .tool-adapter-container .task-sidebar {
      flex: 3;
      min-width: 240px;
      overflow-y: auto;
    }
    
    /* 移动端和小容器适配 */
    @media (max-width: 768px), (max-height: 600px) {
      .tool-adapter-container .main-content {
        flex-direction: column;
        gap: 12px;
      }
      
      .tool-adapter-container .ai-image-generation-section,
      .tool-adapter-container .task-sidebar {
        flex: none;
        width: 100%;
        max-height: none;
      }
      
      .tool-adapter-container .task-sidebar {
        max-height: 200px;
      }
    }
    
    /* 确保表单区域有正确的内边距 */
    .tool-adapter-container .ai-image-generation-form {
      padding: 16px;
    }
    
    /* 确保操作按钮区域始终可见 */
    .tool-adapter-container .section-actions {
      padding: 12px 0;
      background: #fff;
      position: sticky;
      bottom: 0;
      z-index: 10;
    }
  `}</style>
);

/**
 * AI 图片生成适配器
 * 用于 WinBox 和画布场景
 */
export const AIImageGenerationAdapter: React.FC<any> = (props) => {
  return (
    <div className="tool-adapter-container" style={containerStyle}>
      <StyleOverride />
      <Suspense fallback={<LoadingFallback />}>
        <AIImageGenerationOriginal {...props} />
      </Suspense>
    </div>
  );
};

/**
 * AI 视频生成适配器
 * 用于 WinBox 和画布场景
 */
export const AIVideoGenerationAdapter: React.FC<any> = (props) => {
  return (
    <div className="tool-adapter-container" style={containerStyle}>
      <StyleOverride />
      <Suspense fallback={<LoadingFallback />}>
        <AIVideoGenerationOriginal {...props} />
      </Suspense>
    </div>
  );
};

/**
 * 批量图片生成适配器
 * 用于 WinBox 和画布场景
 */
export const BatchImageGenerationAdapter: React.FC<any> = (props) => {
  return (
    <div className="tool-adapter-container" style={containerStyle}>
      <StyleOverride />
      <Suspense fallback={<LoadingFallback />}>
        <BatchImageGenerationOriginal {...props} />
      </Suspense>
    </div>
  );
};

export default {
  AIImageGenerationAdapter,
  AIVideoGenerationAdapter,
  BatchImageGenerationAdapter,
};
