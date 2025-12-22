/**
 * SideDrawer Component
 *
 * 通用侧边抽屉组件，支持多种布局模式
 * 用于统一 ProjectDrawer、ToolboxDrawer、TaskQueuePanel 等抽屉组件的基础结构
 */

import React, { useCallback, useEffect } from 'react';
import { Button } from 'tdesign-react';
import { CloseIcon } from 'tdesign-icons-react';
import './side-drawer.scss';

export type DrawerPosition = 'toolbar-right' | 'screen-left';
export type DrawerWidth = 'narrow' | 'medium' | 'wide' | 'responsive';

export interface SideDrawerProps {
  /** 是否打开抽屉 */
  isOpen: boolean;
  /** 关闭抽屉回调 */
  onClose: () => void;
  /** 抽屉标题 */
  title: React.ReactNode;
  /** 标题右侧副标题/计数 */
  subtitle?: React.ReactNode;
  /** 头部右侧操作区（关闭按钮之前） */
  headerActions?: React.ReactNode;
  /** 头部下方的筛选/搜索区域 */
  filterSection?: React.ReactNode;
  /** 抽屉内容 */
  children: React.ReactNode;
  /** 底部区域 */
  footer?: React.ReactNode;
  /** 抽屉位置 */
  position?: DrawerPosition;
  /** 抽屉宽度 */
  width?: DrawerWidth;
  /** 自定义宽度（覆盖 width 预设） */
  customWidth?: string | number;
  /** 是否显示背景遮罩 */
  showBackdrop?: boolean;
  /** 点击遮罩是否关闭 */
  closeOnBackdropClick?: boolean;
  /** 按 ESC 键是否关闭 */
  closeOnEsc?: boolean;
  /** 自定义 z-index */
  zIndex?: number;
  /** 自定义类名 */
  className?: string;
  /** 头部自定义类名 */
  headerClassName?: string;
  /** 内容区自定义类名 */
  contentClassName?: string;
  /** 底部区自定义类名 */
  footerClassName?: string;
  /** 是否显示关闭按钮 */
  showCloseButton?: boolean;
  /** 关闭按钮大小 */
  closeButtonSize?: 'small' | 'medium' | 'large';
}

/**
 * 通用侧边抽屉组件
 */
export const SideDrawer: React.FC<SideDrawerProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  headerActions,
  filterSection,
  children,
  footer,
  position = 'toolbar-right',
  width = 'narrow',
  customWidth,
  showBackdrop = false,
  closeOnBackdropClick = true,
  closeOnEsc = true,
  zIndex,
  className = '',
  headerClassName = '',
  contentClassName = '',
  footerClassName = '',
  showCloseButton = true,
  closeButtonSize = 'small',
}) => {
  // ESC 键关闭
  useEffect(() => {
    if (!isOpen || !closeOnEsc) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeOnEsc, onClose]);

  // 点击遮罩关闭
  const handleBackdropClick = useCallback(() => {
    if (closeOnBackdropClick) {
      onClose();
    }
  }, [closeOnBackdropClick, onClose]);

  // 构建类名
  const drawerClassName = [
    'side-drawer',
    `side-drawer--${position}`,
    `side-drawer--${width}`,
    isOpen ? 'side-drawer--open' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  // 构建样式
  const drawerStyle: React.CSSProperties = {};
  if (customWidth) {
    drawerStyle.width = typeof customWidth === 'number' ? `${customWidth}px` : customWidth;
  }
  if (zIndex !== undefined) {
    drawerStyle.zIndex = zIndex;
  }

  return (
    <>
      {/* 抽屉主体 */}
      <div className={drawerClassName} style={drawerStyle}>
        {/* Header */}
        <div className={`side-drawer__header ${headerClassName}`}>
          <div className="side-drawer__header-left">
            <h3 className="side-drawer__title">{title}</h3>
            {subtitle && <span className="side-drawer__subtitle">{subtitle}</span>}
          </div>
          <div className="side-drawer__header-right">
            {headerActions}
            {showCloseButton && (
              <Button
                variant="text"
                size={closeButtonSize}
                icon={<CloseIcon />}
                onClick={onClose}
                title="关闭"
                className="side-drawer__close-btn"
              />
            )}
          </div>
        </div>

        {/* Filter Section (optional) */}
        {filterSection && (
          <div className="side-drawer__filter">{filterSection}</div>
        )}

        {/* Content */}
        <div className={`side-drawer__content ${contentClassName}`}>{children}</div>

        {/* Footer (optional) */}
        {footer && (
          <div className={`side-drawer__footer ${footerClassName}`}>{footer}</div>
        )}
      </div>

      {/* Backdrop */}
      {showBackdrop && isOpen && (
        <div
          className="side-drawer__backdrop"
          onClick={handleBackdropClick}
          style={zIndex !== undefined ? { zIndex: zIndex - 1 } : undefined}
        />
      )}
    </>
  );
};

export default SideDrawer;
