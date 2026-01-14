/**
 * 色相条滑块组件
 * 水平色相选择条，覆盖 0-360 度色相范围
 */

import React, { useRef, useCallback, useEffect, useState } from 'react';
import type { HueSliderProps } from './types';

export const HueSlider: React.FC<HueSliderProps> = ({
  hue,
  onChange,
  disabled = false,
}) => {
  const sliderRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // 计算指示器位置
  const indicatorPosition = (hue / 360) * 100;

  // 从位置计算色相值
  const calculateHue = useCallback((clientX: number) => {
    if (!sliderRef.current) return;

    const rect = sliderRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const newHue = Math.round((x / rect.width) * 360);

    onChange(newHue);
  }, [onChange]);

  // 鼠标按下
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    setIsDragging(true);
    calculateHue(e.clientX);
  }, [disabled, calculateHue]);

  // 触摸开始
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return;
    e.preventDefault();
    setIsDragging(true);
    const touch = e.touches[0];
    calculateHue(touch.clientX);
  }, [disabled, calculateHue]);

  // 全局鼠标移动和释放
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      calculateHue(e.clientX);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      calculateHue(touch.clientX);
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
  }, [isDragging, calculateHue]);

  return (
    <div
      ref={sliderRef}
      className="ucp-hue-slider"
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
    >
      {/* 色相渐变背景 */}
      <div className="ucp-hue-slider__track" />
      {/* 选择指示器 */}
      <div
        className="ucp-hue-slider__indicator"
        style={{ left: `${indicatorPosition}%` }}
      />
    </div>
  );
};

export default HueSlider;
