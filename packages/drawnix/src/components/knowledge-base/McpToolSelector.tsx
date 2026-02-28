/**
 * McpToolSelector - Skill 输出类型选择器
 *
 * 用于 Skill 笔记中配置输出类型（文本/图片/视频）
 * 输出类型决定了 Skill 的执行路径和工具绑定
 */

import React from 'react';

interface McpToolSelectorProps {
  /** Skill 输出类型 */
  outputType?: 'image' | 'text' | 'video' | 'ppt';
  /** 输出类型变化回调 */
  onOutputTypeChange?: (outputType: 'image' | 'text' | 'video' | 'ppt' | undefined) => void;
  /** 是否只读模式 */
  readOnly?: boolean;
}

export const McpToolSelector: React.FC<McpToolSelectorProps> = ({
  outputType,
  onOutputTypeChange,
  readOnly = false,
}) => {

  return (
    <div className="mcp-tool-selector">
      {/* 输出类型选择 */}
      <div className="mcp-tool-selector__output-type">
        <span className="mcp-tool-selector__output-type-label">输出类型</span>
        <div className="mcp-tool-selector__output-type-options">
          {readOnly ? (
            <span className="mcp-tool-selector__output-type-value">
              {outputType === 'image' ? '图片' : outputType === 'video' ? '视频' : outputType === 'ppt' ? 'PPT' : '文本'}
            </span>
          ) : (
            <>
              <button
                className={`mcp-tool-selector__output-type-btn ${!outputType || outputType === 'text' ? 'mcp-tool-selector__output-type-btn--active' : ''}`}
                onClick={() => onOutputTypeChange?.(undefined)}
              >
                文本
              </button>
              <button
                className={`mcp-tool-selector__output-type-btn ${outputType === 'image' ? 'mcp-tool-selector__output-type-btn--active' : ''}`}
                onClick={() => onOutputTypeChange?.('image')}
              >
                图片
              </button>
              <button
                className={`mcp-tool-selector__output-type-btn ${outputType === 'video' ? 'mcp-tool-selector__output-type-btn--active' : ''}`}
                onClick={() => onOutputTypeChange?.('video')}
              >
                视频
              </button>
              <button
                className={`mcp-tool-selector__output-type-btn ${outputType === 'ppt' ? 'mcp-tool-selector__output-type-btn--active' : ''}`}
                onClick={() => onOutputTypeChange?.('ppt')}
              >
                PPT
              </button>
            </>
          )}
        </div>
      </div>


    </div>
  );
};
