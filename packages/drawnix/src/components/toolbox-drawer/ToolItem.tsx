/**
 * ToolItem Component
 *
 * 单个工具项组件 - 展示工具信息和图标
 */

import React, { useState, useCallback } from 'react';
import { Button, Tooltip } from 'tdesign-react';
import { AddIcon, JumpIcon, DeleteIcon } from 'tdesign-icons-react';
import { ToolDefinition } from '../../types/toolbox.types';
import { BUILT_IN_TOOLS } from '../../constants/built-in-tools';

export interface ToolItemProps {
  /** 工具定义 */
  tool: ToolDefinition;
  /** 插入到画布回调 */
  onInsert?: (tool: ToolDefinition) => void;
  /** 在窗口中打开回调 */
  onOpenWindow?: (tool: ToolDefinition) => void;
  /** 点击卡片的回调（如果提供，则覆盖默认的 onInsert 行为） */
  onClick?: (tool: ToolDefinition) => void;
  /** 删除回调（仅自定义工具） */
  onDelete?: (tool: ToolDefinition) => void;
}

/**
 * 工具项组件
 */
export const ToolItem: React.FC<ToolItemProps> = ({
  tool,
  onInsert,
  onOpenWindow,
  onClick,
  onDelete
}) => {
  const [hovered, setHovered] = useState(false);

  // 判断是否为内置工具（内置工具不能编辑/删除）
  const isBuiltInTool = BUILT_IN_TOOLS.some(t => t.id === tool.id);
  const isCustomTool = !isBuiltInTool;

  /**
   * 处理删除按钮点击
   */
  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止冒泡
    onDelete?.(tool);
  }, [tool, onDelete]);

  /**
   * 处理插入到画布按钮点击
   */
  const handleInsert = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onInsert?.(tool);
  }, [tool, onInsert]);

  /**
   * 处理在窗口中打开按钮点击
   */
  const handleOpenWindow = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onOpenWindow?.(tool);
  }, [tool, onOpenWindow]);

  /**
   * 处理工具项卡片点击
   */
  const handleClick = useCallback(() => {
    if (onClick) {
      onClick(tool);
    } else {
      onInsert?.(tool);
    }
  }, [tool, onClick, onInsert]);

  return (
    <div
      className="tool-item"
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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

      {/* 操作按钮 - 始终显示 */}
      <div className="tool-item__actions">
        <Tooltip content="插入到画布">
          <Button
            variant="text"
            size="small"
            icon={<AddIcon />}
            onClick={handleInsert}
            data-track="toolbox_click_insert_tool"
          />
        </Tooltip>
        <Tooltip content="在窗口中打开">
          <Button
            variant="text"
            size="small"
            icon={<JumpIcon />}
            onClick={handleOpenWindow}
            style={{ color: '#E34D59' }}
            data-track="toolbox_click_open_window_tool"
          />
        </Tooltip>
        {isCustomTool && onDelete && (
          <Tooltip content="删除工具">
            <Button
              variant="text"
              size="small"
              icon={<DeleteIcon />}
              onClick={handleDelete}
              data-track="toolbox_click_delete_tool"
            />
          </Tooltip>
        )}
      </div>
    </div>
  );
};
