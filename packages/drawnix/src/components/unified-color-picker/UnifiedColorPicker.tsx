/**
 * UnifiedColorPicker 统一取色器组件
 * 整合色相/饱和度面板、色相条、透明度条、预设颜色、吸管工具和 HEX 输入
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import classNames from 'classnames';
import type { UnifiedColorPickerProps } from './types';
import { HSPanel } from './HSPanel';
import { HueSlider } from './HueSlider';
import { AlphaSlider } from './AlphaSlider';
import { PresetColors } from './PresetColors';
import { HexInput } from './HexInput';
import { EyeDropper } from './EyeDropper';
import { useRecentColors } from './RecentColorsContext';
import { CLASSIC_COLORS } from '../../constants/color';
import {
  hexToHsv,
  hsvToHex,
  getAlphaFromHex,
  setAlphaToHex,
  removeAlphaFromHex,
  isValidHex,
  isLightColor,
} from './utils';
import './unified-color-picker.scss';

/** 默认颜色 */
const DEFAULT_COLOR = '#000000';

export const UnifiedColorPicker: React.FC<UnifiedColorPickerProps> = ({
  value,
  onChange,
  onOpacityChange,
  showAlpha = true,
  showEyeDropper = true,
  showPresets = true,
  showRecentColors = true,
  showHexInput = true,
  presetColors,
  className,
  disabled = false,
}) => {
  // 最近使用颜色
  const { recentColors, addRecentColor } = useRecentColors();
  
  // 缓存首次渲染时的最近使用颜色，避免选择颜色时顺序变化
  const [initialRecentColors] = useState(() => [...recentColors]);

  // 解析初始颜色
  const initialColor = value && isValidHex(value) ? value : DEFAULT_COLOR;
  const initialHsv = hexToHsv(initialColor);
  const initialAlpha = getAlphaFromHex(initialColor);

  // 内部状态
  const [hsv, setHsv] = useState(initialHsv);
  const [alpha, setAlpha] = useState(initialAlpha);

  // 当外部 value 变化时同步内部状态
  useEffect(() => {
    if (value && isValidHex(value)) {
      const newHsv = hexToHsv(value);
      const newAlpha = getAlphaFromHex(value);
      setHsv(newHsv);
      setAlpha(newAlpha);
    }
  }, [value]);

  // 计算当前颜色（不带透明度）
  const currentHex = useMemo(() => hsvToHex(hsv), [hsv]);

  // 计算当前完整颜色（带透明度）
  const currentFullColor = useMemo(() => {
    if (alpha < 100) {
      return setAlphaToHex(currentHex, alpha);
    }
    return currentHex;
  }, [currentHex, alpha]);

  // 使用的预设颜色
  const displayPresetColors = presetColors || CLASSIC_COLORS;

  // 上一次的透明度值，用于检测透明度是否真的变化了
  const prevAlphaRef = React.useRef(initialAlpha);

  // 通知颜色变化（只在透明度真正变化时调用 onOpacityChange）
  const notifyChange = useCallback((hex: string, newAlpha: number, forceOpacityChange = false) => {
    const fullColor = newAlpha < 100 ? setAlphaToHex(hex, newAlpha) : hex;
    onChange?.(fullColor);
    // 只在透明度真正变化时调用 onOpacityChange
    if (forceOpacityChange || newAlpha !== prevAlphaRef.current) {
      onOpacityChange?.(newAlpha);
      prevAlphaRef.current = newAlpha;
    }
  }, [onChange, onOpacityChange]);

  // 处理饱和度/明度变化
  const handleSVChange = useCallback((saturation: number, value: number) => {
    const newHsv = { ...hsv, s: saturation, v: value };
    setHsv(newHsv);
    const newHex = hsvToHex(newHsv);
    notifyChange(newHex, alpha);
  }, [hsv, alpha, notifyChange]);

  // 处理色相变化
  const handleHueChange = useCallback((hue: number) => {
    const newHsv = { ...hsv, h: hue };
    setHsv(newHsv);
    const newHex = hsvToHex(newHsv);
    notifyChange(newHex, alpha);
  }, [hsv, alpha, notifyChange]);

  // 处理透明度变化
  const handleAlphaChange = useCallback((newAlpha: number) => {
    setAlpha(newAlpha);
    notifyChange(currentHex, newAlpha, true); // 强制调用 onOpacityChange
  }, [currentHex, notifyChange]);

  // 处理 HEX 输入变化
  const handleHexChange = useCallback((hex: string) => {
    if (isValidHex(hex)) {
      const newHsv = hexToHsv(hex);
      setHsv(newHsv);
      notifyChange(hex, alpha);
    }
  }, [alpha, notifyChange]);

  // 处理预设颜色选择
  const handlePresetSelect = useCallback((color: string) => {
    if (isValidHex(color)) {
      const newHsv = hexToHsv(color);
      const newAlpha = getAlphaFromHex(color);
      setHsv(newHsv);
      setAlpha(newAlpha);
      notifyChange(removeAlphaFromHex(color), newAlpha);
    } else {
      // NO_COLOR 等特殊值直接传递
      onChange?.(color);
    }
  }, [notifyChange, onChange]);

  // 处理最近颜色选择
  const handleRecentSelect = useCallback((color: string) => {
    handlePresetSelect(color);
  }, [handlePresetSelect]);

  // 处理吸管取色
  const handleEyeDropperPick = useCallback((color: string) => {
    if (isValidHex(color)) {
      const newHsv = hexToHsv(color);
      setHsv(newHsv);
      setAlpha(100);
      notifyChange(color, 100);
      addRecentColor(color);
    }
  }, [notifyChange, addRecentColor]);

  // 颜色变化时添加到最近使用
  useEffect(() => {
    // 只在用户操作后添加，避免初始化时添加
    const timer = setTimeout(() => {
      if (currentHex && currentHex !== DEFAULT_COLOR) {
        addRecentColor(currentHex);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [currentHex, addRecentColor]);

  return (
    <div className={classNames('unified-color-picker', className, { disabled })}>
      {/* 色相/饱和度面板 */}
      <HSPanel
        hue={hsv.h}
        saturation={hsv.s}
        value={hsv.v}
        onChange={handleSVChange}
        disabled={disabled}
      />

      {/* 色相条 */}
      <HueSlider
        hue={hsv.h}
        onChange={handleHueChange}
        disabled={disabled}
      />

      {/* 透明度条 */}
      {showAlpha && (
        <AlphaSlider
          alpha={alpha}
          color={currentHex}
          onChange={handleAlphaChange}
          disabled={disabled}
        />
      )}

      {/* 预设颜色 */}
      {showPresets && (
        <PresetColors
          colors={displayPresetColors}
          selectedColor={currentHex}
          onSelect={handlePresetSelect}
          disabled={disabled}
        />
      )}

      {/* 最近使用颜色 */}
      {showRecentColors && initialRecentColors.length > 0 && (
        <div className="unified-color-picker__recent">
          <div className="unified-color-picker__recent-label">最近使用</div>
          <div className="unified-color-picker__recent-colors">
            {initialRecentColors.map((color, index) => {
              const isLight = isLightColor(color);
              return (
                <button
                  key={`${color}-${index}`}
                  className={classNames('unified-color-picker__recent-item', {
                    'unified-color-picker__recent-item--selected':
                      removeAlphaFromHex(color).toUpperCase() === currentHex.toUpperCase(),
                    'unified-color-picker__recent-item--light': isLight,
                  })}
                  style={{ backgroundColor: color }}
                  onClick={() => handleRecentSelect(color)}
                  disabled={disabled}
                  title={color}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* 底部工具栏 */}
      <div className="unified-color-picker__footer">
        {/* 吸管工具 */}
        {showEyeDropper && (
          <EyeDropper
            onPick={handleEyeDropperPick}
            disabled={disabled}
          />
        )}

        {/* HEX 输入 */}
        {showHexInput && (
          <HexInput
            value={currentHex}
            alpha={alpha}
            onColorChange={handleHexChange}
            onAlphaChange={handleAlphaChange}
            showAlpha={showAlpha}
            disabled={disabled}
          />
        )}
      </div>
    </div>
  );
};

export default UnifiedColorPicker;
