/**
 * ToolItem Component
 *
 * 单个工具项组件 - 展示工具信息和图标
 */

import React, { useState, useCallback } from 'react';
import { Button, Tooltip } from 'tdesign-react';
import { DeleteIcon, AddIcon, JumpIcon } from 'tdesign-icons-react';
import { ToolDefinition } from '../../types/toolbox.types';
import { BUILT_IN_TOOLS } from '../../constants/built-in-tools';

export interface ToolItemProps {
  /** 工具定义 */
  tool: ToolDefinition;
  /** 插入到画布回调 */
  onInsert: (tool: ToolDefinition) => void;
  /** 在窗口中打开回调 */
  onOpenWindow: (tool: ToolDefinition) => void;
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
  onDelete
}) => {
  const [hovered, setHovered] = useState(false);
  const [showActions, setShowActions] = useState(false); // 移动端长按后保持显示
  const [isLongPressing, setIsLongPressing] = useState(false); // 长按中状态
  const longPressTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // 判断是否为内置工具（内置工具不能编辑/删除）
  const isBuiltInTool = BUILT_IN_TOOLS.some(t => t.id === tool.id);
  const isCustomTool = !isBuiltInTool;

  /**
   * 处理删除按钮点击
   */
  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止冒泡
    if (onDelete) {
      onDelete(tool);
    }
  }, [tool, onDelete]);

  /**
   * 处理触摸开始（长按）
   */
  const handleTouchStart = useCallback(() => {
    if (!isCustomTool) return;

    setIsLongPressing(true); // 开始长按视觉反馈

    // 设置长按定时器（500ms）
    longPressTimerRef.current = setTimeout(() => {
      setShowActions(true);
      setIsLongPressing(false); // 长按完成，取消反馈
    }, 500);
  }, [isCustomTool]);

  /**
   * 处理触摸结束/取消
   */
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    // 清除长按定时器
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    setIsLongPressing(false); // 停止长按反馈

    // 如果操作按钮已显示，不触发点击事件
    if (showActions) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
  }, [showActions]);

  /**
   * 处理插入到画布按钮点击
   */
  const handleInsert = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onInsert(tool);
  }, [tool, onInsert]);

  /**
   * 处理在窗口中打开按钮点击
   */
  const handleOpenWindow = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onOpenWindow(tool);
  }, [tool, onOpenWindow]);

  /**
   * 处理工具项点击 - 默认为插入到画布
   */
  const handleClick = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    // 如果操作按钮已显示（移动端），先隐藏操作按钮，不触发动作
    if (showActions) {
      e.preventDefault();
      e.stopPropagation();
      setShowActions(false);
      return;
    }

    // 否则正常触发插入到画布（默认行为）
    onInsert(tool);
  }, [showActions, tool, onInsert]);

  // 清理定时器
  React.useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  // 决定是否显示操作按钮（PC 悬停 或 移动端长按）
    // 现在所有工具都有操作按钮（插入/窗口），不仅仅是自定义工具
  const shouldShowActions = hovered || showActions;

  return (
    <div
      className={`tool-item ${isLongPressing ? 'tool-item--long-pressing' : ''}`}
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
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

      {/* 操作按钮（PC 悬停显示 / 移动端长按显示） */}
      {(hovered || showActions) && (
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
      )}
    </div>
  );
};
