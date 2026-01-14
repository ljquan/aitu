/**
 * 透明度条滑块组件
 * 支持 0-100% 透明度调节，显示棋盘格背景
 */

import React, { useRef, useCallback, useEffect, useState } from 'react';
import type { AlphaSliderProps } from './types';
import { removeAlphaFromHex } from './utils';

export const AlphaSlider: React.FC<AlphaSliderProps> = ({
  alpha,
  color,
  onChange,
  disabled = false,
}) => {
  const sliderRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // 计算指示器位置
  const indicatorPosition = alpha;

  // 获取不带透明度的颜色
  const baseColor = removeAlphaFromHex(color);

  // 渐变背景样式
  const gradientStyle = {
    background: `linear-gradient(to right, transparent 0%, ${baseColor} 100%)`,
  };

  // 从位置计算透明度值
  const calculateAlpha = useCallback((clientX: number) => {
    if (!sliderRef.current) return;

    const rect = sliderRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const newAlpha = Math.round((x / rect.width) * 100);

    onChange(newAlpha);
  }, [onChange]);

  // 鼠标按下
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    setIsDragging(true);
    calculateAlpha(e.clientX);
  }, [disabled, calculateAlpha]);

  // 触摸开始
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return;
    e.preventDefault();
    setIsDragging(true);
    const touch = e.touches[0];
    calculateAlpha(touch.clientX);
  }, [disabled, calculateAlpha]);

  // 全局鼠标移动和释放
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      calculateAlpha(e.clientX);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      calculateAlpha(touch.clientX);
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
  }, [isDragging, calculateAlpha]);

  return (
    <div
      ref={sliderRef}
      className="ucp-alpha-slider"
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
    >
      {/* 棋盘格背景 */}
      <div className="ucp-alpha-slider__checkerboard" />
      {/* 透明度渐变 */}
      <div className="ucp-alpha-slider__gradient" style={gradientStyle} />
      {/* 选择指示器 */}
      <div
        className="ucp-alpha-slider__indicator"
        style={{ left: `${indicatorPosition}%` }}
      />
    </div>
  );
};

export default AlphaSlider;
