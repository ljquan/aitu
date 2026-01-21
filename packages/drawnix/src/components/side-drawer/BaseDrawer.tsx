import React, { useState, useCallback, useEffect } from 'react';
import { SideDrawer, SideDrawerProps } from './SideDrawer';

export interface BaseDrawerProps extends Omit<SideDrawerProps, 'customWidth' | 'onWidthChange'> {
  /** 存储宽度的 localStorage key */
  storageKey?: string;
  /** 默认宽度 */
  defaultWidth?: number;
}

/**
 * BaseDrawer Component
 * 
 * 在 SideDrawer 基础上增加了宽度持久化存储功能。
 * 可以通过 storageKey 独立控制每个抽屉的宽度。
 */
export const BaseDrawer: React.FC<BaseDrawerProps> = ({
  storageKey,
  defaultWidth,
  minWidth = 300,
  maxWidth = 1024,
  resizable = true,
  ...props
}) => {
  // 抽屉宽度状态
  const [drawerWidth, setDrawerWidth] = useState<number | undefined>(() => {
    if (!storageKey) return undefined;
    try {
      const cached = localStorage.getItem(storageKey);
      if (cached) {
        const width = parseInt(cached, 10);
        if (!isNaN(width) && width >= minWidth && width <= maxWidth) {
          return width;
        }
      }
    } catch {
      // 忽略 localStorage 错误
    }
    return undefined;
  });

  // 宽度变化处理
  const handleWidthChange = useCallback((width: number) => {
    setDrawerWidth(width);
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, String(width));
      } catch {
        // 忽略 localStorage 错误
      }
    }
  }, [storageKey]);

  // 如果 storageKey 变化，重新加载宽度（虽然通常不会变化）
  useEffect(() => {
    if (!storageKey) return;
    try {
      const cached = localStorage.getItem(storageKey);
      if (cached) {
        const width = parseInt(cached, 10);
        if (!isNaN(width) && width >= minWidth && width <= maxWidth) {
          setDrawerWidth(width);
        }
      }
    } catch {
      // 忽略 localStorage 错误
    }
  }, [storageKey, minWidth, maxWidth]);

  return (
    <SideDrawer
      {...props}
      resizable={resizable}
      minWidth={minWidth}
      maxWidth={maxWidth}
      customWidth={drawerWidth || defaultWidth}
      onWidthChange={handleWidthChange}
    />
  );
};

export default BaseDrawer;
