/**
 * 工具栏右键菜单组件
 * 支持快速切换按钮的显示/隐藏状态和上下移动
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Menu from '../menu/menu';
import MenuItem from '../menu/menu-item';
import MenuSeparator from '../menu/menu-separator';
import { useI18n } from '../../i18n';
import { useToolbarConfig } from '../../hooks/use-toolbar-config';
import { Z_INDEX } from '../../constants/z-index';

interface ContextMenuPosition {
  x: number;
  y: number;
}

interface ToolbarContextMenuProps {
  /** 子元素 */
  children: React.ReactNode;
  /** 按钮 ID */
  buttonId: string;
  /** 是否可见（在主工具栏中） */
  isVisible: boolean;
  /** 按钮在可见列表中的索引 */
  visibleIndex?: number;
  /** 是否禁用右键菜单 */
  disabled?: boolean;
}

export const ToolbarContextMenu: React.FC<ToolbarContextMenuProps> = ({
  children,
  buttonId,
  isVisible,
  visibleIndex = -1,
  disabled = false,
}) => {
  const { t } = useI18n();
  const { hideButton, showButton, resetToDefault, visibleButtons, reorderButton } = useToolbarConfig();
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<ContextMenuPosition>({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // 使用捕获阶段阻止右键触发的 pointerdown 事件
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const handlePointerDownCapture = (e: PointerEvent) => {
      if (e.button === 2) {
        // 右键点击时阻止事件继续传播到子元素
        e.stopPropagation();
      }
    };

    // 在捕获阶段拦截事件
    wrapper.addEventListener('pointerdown', handlePointerDownCapture, true);

    return () => {
      wrapper.removeEventListener('pointerdown', handlePointerDownCapture, true);
    };
  }, []);

  // 处理右键点击
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;

      e.preventDefault();
      e.stopPropagation();

      setPosition({ x: e.clientX, y: e.clientY });
      setIsOpen(true);
    },
    [disabled]
  );

  // 关闭菜单
  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  // 切换按钮显示状态
  const handleToggleVisibility = useCallback(() => {
    if (isVisible) {
      hideButton(buttonId);
    } else {
      showButton(buttonId);
    }
    handleClose();
  }, [isVisible, buttonId, hideButton, showButton, handleClose]);

  // 上移按钮
  const handleMoveUp = useCallback(() => {
    if (visibleIndex > 0) {
      reorderButton(visibleIndex, visibleIndex - 1, true);
    }
    handleClose();
  }, [visibleIndex, reorderButton, handleClose]);

  // 下移按钮
  const handleMoveDown = useCallback(() => {
    if (visibleIndex >= 0 && visibleIndex < visibleButtons.length - 1) {
      reorderButton(visibleIndex, visibleIndex + 1, true);
    }
    handleClose();
  }, [visibleIndex, visibleButtons.length, reorderButton, handleClose]);

  // 置顶按钮
  const handleMoveToTop = useCallback(() => {
    if (visibleIndex > 0) {
      reorderButton(visibleIndex, 0, true);
    }
    handleClose();
  }, [visibleIndex, reorderButton, handleClose]);

  // 置底按钮
  const handleMoveToBottom = useCallback(() => {
    if (visibleIndex >= 0 && visibleIndex < visibleButtons.length - 1) {
      reorderButton(visibleIndex, visibleButtons.length - 1, true);
    }
    handleClose();
  }, [visibleIndex, visibleButtons.length, reorderButton, handleClose]);

  // 重置为默认配置
  const handleResetToDefault = useCallback(() => {
    resetToDefault();
    handleClose();
  }, [resetToDefault, handleClose]);

  // 点击外部关闭菜单
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleClose]);

  // 调整菜单位置，确保不超出视口
  useEffect(() => {
    if (!isOpen || !menuRef.current) return;

    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let newX = position.x;
    let newY = position.y;

    // 检查右边界
    if (position.x + rect.width > viewportWidth) {
      newX = viewportWidth - rect.width - 8;
    }

    // 检查下边界
    if (position.y + rect.height > viewportHeight) {
      newY = viewportHeight - rect.height - 8;
    }

    if (newX !== position.x || newY !== position.y) {
      setPosition({ x: newX, y: newY });
    }
  }, [isOpen, position]);

  // 计算是否可以上移/下移
  const canMoveUp = isVisible && visibleIndex > 0;
  const canMoveDown = isVisible && visibleIndex >= 0 && visibleIndex < visibleButtons.length - 1;

  return (
    <>
      <div ref={wrapperRef} onContextMenu={handleContextMenu}>{children}</div>
      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            className="toolbar-context-menu"
            style={{
              position: 'fixed',
              left: position.x,
              top: position.y,
              zIndex: Z_INDEX.DROPDOWN_PORTAL,
            }}
          >
            <Menu>
              {isVisible && (
                <>
                  <MenuItem onSelect={handleMoveUp} disabled={!canMoveUp}>
                    {t('toolbar.moveUp')}
                  </MenuItem>
                  <MenuItem onSelect={handleMoveDown} disabled={!canMoveDown}>
                    {t('toolbar.moveDown')}
                  </MenuItem>
                  <MenuItem onSelect={handleMoveToTop} disabled={!canMoveUp}>
                    {t('toolbar.moveToTop')}
                  </MenuItem>
                  <MenuItem onSelect={handleMoveToBottom} disabled={!canMoveDown}>
                    {t('toolbar.moveToBottom')}
                  </MenuItem>
                  <MenuSeparator />
                </>
              )}
              <MenuItem onSelect={handleToggleVisibility}>
                {isVisible ? t('toolbar.rightClickToHide') : t('toolbar.doubleClickToShow')}
              </MenuItem>
              <MenuSeparator />
              <MenuItem onSelect={handleResetToDefault}>
                {t('toolbar.resetToDefault')}
              </MenuItem>
            </Menu>
          </div>,
          document.body
        )}
    </>
  );
};

export default ToolbarContextMenu;
