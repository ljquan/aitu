/**
 * ToolItem Component
 *
 * 单个工具项组件 - 展示工具信息和图标
 */

import React, { useState, useCallback } from 'react';
import { Button } from 'tdesign-react';
import { DeleteIcon } from 'tdesign-icons-react';
import { ToolDefinition } from '../../types/toolbox.types';
import { BUILT_IN_TOOLS } from '../../constants/built-in-tools';

export interface ToolItemProps {
  /** 工具定义 */
  tool: ToolDefinition;
  /** 点击回调 */
  onClick: () => void;
  /** 删除回调（仅自定义工具） */
  onDelete?: (tool: ToolDefinition) => void;
}

/**
 * 工具项组件
 */
export const ToolItem: React.FC<ToolItemProps> = ({
  tool,
  onClick,
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
   * 处理工具项点击
   */
  const handleClick = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    // 如果操作按钮已显示（移动端），先隐藏操作按钮，不触发插入
    if (showActions) {
      e.preventDefault();
      e.stopPropagation();
      setShowActions(false);
      return;
    }

    // 否则正常触发插入
    onClick();
  }, [showActions, onClick]);

  // 清理定时器
  React.useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  // 决定是否显示操作按钮（PC 悬停 或 移动端长按）
  const shouldShowActions = isCustomTool && (hovered || showActions);

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

      {/* 删除按钮（PC 悬停显示 / 移动端长按显示） */}
      {shouldShowActions && (
        <div className="tool-item__actions">
          <Button
            variant="text"
            size="small"
            icon={<DeleteIcon />}
            onClick={handleDelete}
            title="删除工具"
            data-track="toolbox_click_delete_tool"
          />
        </div>
      )}
    </div>
  );
};
