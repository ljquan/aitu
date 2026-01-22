/**
 * ToolItem Component
 *
 * 单个工具项组件 - 展示工具信息和图标
 */

import React, { useCallback } from 'react';
import { Button, Tooltip } from 'tdesign-react';
import { JumpIcon, DeleteIcon } from 'tdesign-icons-react';
import { InsertToCanvasIcon } from '../icons';
import { ToolDefinition } from '../../types/toolbox.types';
import { BUILT_IN_TOOLS } from '../../constants/built-in-tools';

export interface ToolItemProps {
  /** 工具定义 */
  tool: ToolDefinition;
  /** 插入到画布回调 */
  onInsert?: (tool: ToolDefinition) => void;
  /** 在窗口中打开回调 */
  onOpenWindow?: (tool: ToolDefinition) => void;
  /** 删除回调（仅自定义工具） */
  onDelete?: (tool: ToolDefinition) => void;
}

/**
 * 渲染图标组件，支持字符串和 React 组件
 */
const renderIcon = (icon: any) => {
  if (!icon) return '🔧';
  if (typeof icon === 'function') {
    const IconComponent = icon;
    return <IconComponent />;
  }
  return icon;
};

/**
 * 工具项组件
 */
export const ToolItem: React.FC<ToolItemProps> = ({
  tool,
  onInsert,
  onOpenWindow,
  onDelete
}) => {
  // 判断是否为内置工具（内置工具不能编辑/删除）
  const isBuiltInTool = BUILT_IN_TOOLS.some(t => t.id === tool.id);
  const isCustomTool = !isBuiltInTool;

  /**
   * 处理删除按钮点击
   */
  const handleDelete = useCallback(() => {
    onDelete?.(tool);
  }, [tool, onDelete]);

  /**
   * 处理插入到画布按钮点击
   */
  const handleInsert = useCallback(() => {
    onInsert?.(tool);
  }, [tool, onInsert]);

  /**
   * 处理在窗口中打开按钮点击
   */
  const handleOpenWindow = useCallback(() => {
    onOpenWindow?.(tool);
  }, [tool, onOpenWindow]);

  return (
    <div
      className="tool-item"
      data-track="toolbox_click_tool"
      data-tool-id={tool.id}
    >
      <div className="tool-item__icon">{renderIcon(tool.icon)}</div>
      <div className="tool-item__content">
        <div className="tool-item__name">{tool.name}</div>
        {tool.description && (
          <div className="tool-item__description">{tool.description}</div>
        )}
      </div>

      {/* 操作按钮 - 始终显示 */}
      <div className="tool-item__actions">
        {isCustomTool && onDelete && (
          <Tooltip content="删除工具" theme="light" placement="left">
            <Button
              variant="text"
              size="small"
              shape="square"
              icon={<DeleteIcon />}
              onClick={handleDelete}
              className="tool-item__action-btn tool-item__action-btn--delete"
              data-track="toolbox_click_delete_tool"
            />
          </Tooltip>
        )}
        <Tooltip content="插入到画布" theme="light" placement="left">
          <Button
            variant="text"
            size="small"
            shape="square"
            icon={<InsertToCanvasIcon size={16} />}
            onClick={handleInsert}
            className="tool-item__action-btn tool-item__action-btn--insert"
            data-track="toolbox_click_insert_tool"
          />
        </Tooltip>
        <Tooltip content="在窗口中打开" theme="light" placement="left">
          <Button
            variant="outline"
            size="small"
            shape="square"
            icon={<JumpIcon />}
            onClick={handleOpenWindow}
            className="tool-item__action-btn tool-item__action-btn--open-window"
            data-track="toolbox_click_open_window_tool"
          />
        </Tooltip>
      </div>
    </div>
  );
};
