/**
 * ToolItem Component
 *
 * 单个工具项组件 - 展示工具信息和图标
 */

import React from 'react';
import { ToolDefinition } from '../../types/toolbox.types';

export interface ToolItemProps {
  /** 工具定义 */
  tool: ToolDefinition;
  /** 点击回调 */
  onClick: () => void;
}

/**
 * 工具项组件
 */
export const ToolItem: React.FC<ToolItemProps> = ({ tool, onClick }) => {
  return (
    <div
      className="tool-item"
      onClick={onClick}
      data-track="toolbox_click_tool"
      data-tool-id={tool.id}
    >
      <div className="tool-item__icon">{tool.icon || '🔧'}</div>
      <div className="tool-item__content">
        <div className="tool-item__name">{tool.name}</div>
        {tool.description && (
          <div className="tool-item__description">{tool.description}</div>
        )}
      </div>
    </div>
  );
};
