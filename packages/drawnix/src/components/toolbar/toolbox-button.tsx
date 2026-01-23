/**
 * Toolbox Button Component
 *
 * 工具箱按钮 - 用于打开/关闭工具箱抽屉
 */

import React from 'react';
import { ToolButton } from '../tool-button';
import { ToolboxIcon } from '../icons';

export interface ToolboxButtonProps {
  /** 是否打开 */
  isOpen: boolean;
  /** 点击回调 */
  onClick: () => void;
}

/**
 * 工具箱按钮组件
 */
export const ToolboxButton: React.FC<ToolboxButtonProps> = ({
  isOpen,
  onClick,
}) => {
  return (
    <ToolButton
      type="icon"
      visible={true}
      selected={isOpen}
      icon={<ToolboxIcon size={20} />}
      title="工具箱"
      aria-label="打开工具箱"
      data-track="toolbar_click_toolbox"
      onPointerDown={onClick}
    />
  );
};
