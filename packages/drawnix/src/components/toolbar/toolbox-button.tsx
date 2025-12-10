/**
 * Toolbox Button Component
 *
 * 工具箱按钮 - 用于打开/关闭工具箱抽屉
 */

import React from 'react';
import { ToolButton } from '../tool-button';
import { ToolIcon } from '../icons';

export interface ToolboxButtonProps {
  /** 是否打开 */
  isOpen: boolean;
  /** 点击回调 */
  onClick: () => void;
}

/**
 * 工具箱图标 - 工具箱样式
 */
const ToolboxIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* 工具箱主体 */}
    <rect
      x="2"
      y="6"
      width="16"
      height="11"
      rx="1.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    {/* 工具箱顶盖 */}
    <path
      d="M3.5 6V4.5C3.5 3.67157 4.17157 3 5 3h10c.8284 0 1.5.67157 1.5 1.5V6"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* 提手 */}
    <path
      d="M7 3V4.5C7 5.32843 7.67157 6 8.5 6h3C12.3284 6 13 5.32843 13 4.5V3"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* 工具箱中间隔板 */}
    <path
      d="M2 10h5.5c.2761 0 .5.2239.5.5v0c0 .2761-.2239.5-.5.5H7.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M18 10h-5.5c-.2761 0-.5.2239-.5.5v0c0 .2761.2239.5.5.5h.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    {/* 工具（扳手和螺丝刀） */}
    <circle cx="6" cy="13.5" r="0.8" fill="currentColor" />
    <circle cx="10" cy="13.5" r="0.8" fill="currentColor" />
    <circle cx="14" cy="13.5" r="0.8" fill="currentColor" />
  </svg>
);

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
      icon={<ToolboxIcon />}
      title="工具箱"
      aria-label="打开工具箱"
      data-track="toolbar_click_toolbox"
      onPointerDown={onClick}
    />
  );
};
