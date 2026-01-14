/**
 * 色相/饱和度面板组件
 * 二维选择面板，X轴为饱和度，Y轴为明度
 */

import React, { useRef, useCallback, useEffect, useState } from 'react';
import type { HSPanelProps } from './types';
import { hsvToHex } from './utils';

export const HSPanel: React.FC<HSPanelProps> = ({
  hue,
  saturation,
  value,
  onChange,
  disabled = false,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // 计算指示器位置
  const indicatorStyle = {
    left: `${saturation}%`,
    top: `${100 - value}%`,
  };

  // 计算面板背景色（纯色相）
  const panelBackground = hsvToHex({ h: hue, s: 100, v: 100 });

  // 从鼠标/触摸位置计算饱和度和明度
  const calculateSV = useCallback((clientX: number, clientY: number) => {
    if (!panelRef.current) return;

    const rect = panelRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(clientY - rect.top, rect.height));

    const newSaturation = Math.round((x / rect.width) * 100);
    const newValue = Math.round(100 - (y / rect.height) * 100);

    onChange(newSaturation, newValue);
  }, [onChange]);

  // 鼠标按下
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    setIsDragging(true);
    calculateSV(e.clientX, e.clientY);
  }, [disabled, calculateSV]);

  // 触摸开始
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return;
    e.preventDefault();
    setIsDragging(true);
    const touch = e.touches[0];
    calculateSV(touch.clientX, touch.clientY);
  }, [disabled, calculateSV]);

  // 全局鼠标移动和释放
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      calculateSV(e.clientX, e.clientY);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      calculateSV(touch.clientX, touch.clientY);
    };

    const handleTouchEnd = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging, calculateSV]);

  return (
    <div
      ref={panelRef}
      className="ucp-hs-panel"
      style={{ backgroundColor: panelBackground }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
    >
      {/* 白色渐变层（从左到右） */}
      <div className="ucp-hs-panel__white-gradient" />
      {/* 黑色渐变层（从下到上） */}
      <div className="ucp-hs-panel__black-gradient" />
      {/* 选择指示器 */}
      <div
        className="ucp-hs-panel__indicator"
        style={indicatorStyle}
      />
    </div>
  );
};

export default HSPanel;
