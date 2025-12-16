/**
 * ToolList Component
 *
 * 工具列表组件 - 按分类展示工具
 */

import React from 'react';
import { ToolDefinition } from '../../types/toolbox.types';
import { TOOL_CATEGORY_LABELS } from '../../constants/built-in-tools';
import { ToolItem } from './ToolItem';

export interface ToolListProps {
  /** 按分类分组的工具列表 */
  toolsByCategory: Record<string, ToolDefinition[]>;
  /** 工具点击回调 */
  onToolClick: (tool: ToolDefinition) => void;
  /** 删除工具回调（仅自定义工具） */
  onToolDelete?: (tool: ToolDefinition) => void;
}

/**
 * 工具列表组件
 */
export const ToolList: React.FC<ToolListProps> = ({
  toolsByCategory,
  onToolClick,
  onToolDelete,
}) => {
  const categories = Object.keys(toolsByCategory);

  if (categories.length === 0) {
    return (
      <div className="tool-list__empty">
        <p>暂无工具</p>
      </div>
    );
  }

  return (
    <div className="tool-list">
      {categories.map((category) => {
        const tools = toolsByCategory[category];
        if (!tools || tools.length === 0) {
          return null;
        }

        return (
          <div key={category} className="tool-list__category">
            <h4 className="tool-list__category-title">
              {TOOL_CATEGORY_LABELS[category] || category}
            </h4>
            <div className="tool-list__items">
              {tools.map((tool) => (
                <ToolItem
                  key={tool.id}
                  tool={tool}
                  onClick={() => onToolClick(tool)}
                  onDelete={onToolDelete}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
