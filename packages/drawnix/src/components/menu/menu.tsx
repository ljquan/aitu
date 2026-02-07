import { Island } from '../island';
import React, { useRef, useEffect, useCallback } from 'react';
import { MenuContentPropsContext } from './common';
import classNames from 'classnames';
import './menu.scss';

const Menu = ({
  children,
  className = '',
  onSelect,
  style,
  onClose,
}: {
  children?: React.ReactNode;
  className?: string;
  /**
   * Called when any menu item is selected (clicked on).
   */
  onSelect?: (event: Event) => void;
  /**
   * Called when Escape key is pressed.
   */
  onClose?: () => void;
  style?: React.CSSProperties;
}) => {
  const newClassName = classNames(`menu ${className}`).trim();
  const containerRef = useRef<HTMLDivElement>(null);

  // 获取所有可聚焦的菜单项
  const getFocusableItems = useCallback(() => {
    if (!containerRef.current) return [];
    return Array.from(
      containerRef.current.querySelectorAll<HTMLButtonElement>(
        'button.menu-item:not([disabled])'
      )
    );
  }, []);

  // 键盘导航处理
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const items = getFocusableItems();
      if (items.length === 0) return;

      const currentIndex = items.findIndex(
        (item) => item === document.activeElement
      );

      switch (event.key) {
        case 'ArrowDown': {
          event.preventDefault();
          const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
          items[nextIndex]?.focus();
          break;
        }
        case 'ArrowUp': {
          event.preventDefault();
          const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
          items[prevIndex]?.focus();
          break;
        }
        case 'Home': {
          event.preventDefault();
          items[0]?.focus();
          break;
        }
        case 'End': {
          event.preventDefault();
          items[items.length - 1]?.focus();
          break;
        }
        case 'Escape': {
          event.preventDefault();
          onClose?.();
          break;
        }
        case 'Enter':
        case ' ': {
          // 显式触发当前聚焦按钮的点击事件
          if (currentIndex >= 0 && items[currentIndex]) {
            event.preventDefault();
            items[currentIndex].click();
          }
          break;
        }
      }
    },
    [getFocusableItems, onClose]
  );

  // 菜单打开时自动聚焦第一个菜单项
  useEffect(() => {
    const items = getFocusableItems();
    if (items.length > 0) {
      // 延迟聚焦，确保 DOM 已渲染
      requestAnimationFrame(() => {
        items[0]?.focus();
      });
    }
  }, [getFocusableItems]);

  return (
    <MenuContentPropsContext.Provider value={{ onSelect }}>
      <div
        className={newClassName}
        style={style}
        data-testid="menu"
        onKeyDown={handleKeyDown}
        ref={containerRef}
        role="menu"
      >
        {
          <Island className="menu-container" padding={2}>
            {children}
          </Island>
        }
      </div>
    </MenuContentPropsContext.Provider>
  );
};
Menu.displayName = 'Menu';

export default Menu;
