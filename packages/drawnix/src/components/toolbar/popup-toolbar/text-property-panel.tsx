/**
 * 文本属性面板组件
 * Text Property Panel Component
 * 
 * 从选中元素右侧滑出的属性设置面板，整合字体、字号、颜色、阴影、渐变等设置
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import classNames from 'classnames';
import { PlaitBoard } from '@plait/core';
import { FontSizes, TextTransforms } from '@plait/text-plugins';
import { useI18n } from '../../../i18n';
import { ColorPickerPanel } from 'tdesign-react';
import {
  setTextFontSize,
  setTextFontFamily,
  setTextShadow,
  setTextGradient,
} from '../../../transforms/property';
import {
  SYSTEM_FONTS,
  GOOGLE_FONTS,
  SHADOW_PRESETS,
  GRADIENT_PRESETS,
} from '../../../constants/text-effects';
import type { FontConfig, TextShadowConfig, GradientConfig } from '../../../types/text-effects.types';
import { generateTextShadowCSS, generateGradientCSS } from '../../../utils/text-effects-utils';
import { fontManagerService } from '../../../services/font-manager-service';
import './text-property-panel.scss';

export interface TextPropertyPanelProps {
  board: PlaitBoard;
  isOpen: boolean;
  onClose: () => void;
  currentFontSize?: string;
  currentFontFamily?: string;
  currentColor?: string;
  /** popup-toolbar 的位置信息，用于定位属性面板 */
  toolbarRect?: { top: number; left: number; width: number; height: number };
  /** 选中元素的位置信息，用于定位属性面板 */
  selectionRect?: { top: number; left: number; right: number; bottom: number; width: number; height: number };
}

const fontSizePresets = ['12', '14', '16', '18', '20', '24', '28', '32', '40', '48', '64', '72'];

export const TextPropertyPanel: React.FC<TextPropertyPanelProps> = ({
  board,
  isOpen,
  onClose,
  currentFontSize,
  currentFontFamily,
  currentColor,
  toolbarRect,
  selectionRect,
}) => {
  const { t, language } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [fontSizeInput, setFontSizeInput] = useState(currentFontSize || '16');
  const [isFontDropdownOpen, setIsFontDropdownOpen] = useState(false);
  const [selectedFont, setSelectedFont] = useState(currentFontFamily || 'PingFang SC');
  const [loadingFonts, setLoadingFonts] = useState<Set<string>>(new Set());
  
  // 阴影状态
  const [shadowEnabled, setShadowEnabled] = useState(false);
  const [selectedShadowPreset, setSelectedShadowPreset] = useState<string | null>(null);
  
  // 渐变状态
  const [gradientEnabled, setGradientEnabled] = useState(false);
  const [selectedGradientPreset, setSelectedGradientPreset] = useState<string | null>(null);
  
  // 颜色状态 - 用于受控的 ColorPickerPanel
  const [colorValue, setColorValue] = useState(currentColor || '#000000');
  
  // 最近使用的颜色
  const [recentColors, setRecentColors] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('aitu-recent-text-colors');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // 预加载 Google Fonts（当面板打开时）
  useEffect(() => {
    if (isOpen && !isFontDropdownOpen) {
      // 延迟预加载，避免阻塞 UI
      const timer = setTimeout(() => {
        GOOGLE_FONTS.forEach(font => {
          if (!fontManagerService.isFontLoaded(font.family)) {
            fontManagerService.loadGoogleFont(font.family).catch(err => {
              console.warn(`Failed to preload font ${font.family}:`, err);
            });
          }
        });
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isFontDropdownOpen]);

  // 计算面板位置 - 在选中元素右侧，且在 popup-toolbar 下方
  useEffect(() => {
    if (isOpen && toolbarRect && selectionRect) {
      const panelWidth = 280;
      const panelHeight = 480;
      const gap = 12; // 与选中元素的间距

      // 面板位置：选中元素右侧 + gap
      let panelLeft = selectionRect.right + gap;

      // 面板顶部：与 toolbar 底部对齐（toolbar 下方）
      let panelTop = toolbarRect.top + toolbarRect.height + 8;

      // 确保面板不超出视口右侧
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // 如果右侧空间不足，尝试放在左侧
      if (panelLeft + panelWidth > viewportWidth - 16) {
        panelLeft = selectionRect.left - panelWidth - gap;
        // 如果左侧也不够，强制放在右侧并调整到视口内
        if (panelLeft < 16) {
          panelLeft = viewportWidth - panelWidth - 16;
        }
      }

      // 确保面板不超出视口底部
      if (panelTop + panelHeight > viewportHeight - 16) {
        panelTop = Math.max(16, viewportHeight - panelHeight - 16);
      }

      setPosition({
        left: Math.max(16, panelLeft),
        top: Math.max(16, panelTop),
      });
    }
  }, [isOpen, toolbarRect, selectionRect]);

  // 处理字号变更
  const handleFontSizeChange = useCallback((size: string) => {
    const num = parseInt(size, 10);
    if (!isNaN(num) && num >= 8 && num <= 100) {
      setFontSizeInput(size);
      setTextFontSize(board, size as FontSizes);
    }
  }, [board]);

  // 处理字体选择
  const handleFontSelect = useCallback(async (font: FontConfig) => {
    setSelectedFont(font.family);
    setIsFontDropdownOpen(false);

    // 如果是 Google Font，使用字体管理服务加载
    if (font.source === 'google' && !fontManagerService.isFontLoaded(font.family)) {
      setLoadingFonts(prev => new Set(prev).add(font.family));
      try {
        await fontManagerService.loadGoogleFont(font.family);
      } catch (error) {
        console.error('Failed to load Google font:', error);
      } finally {
        setLoadingFonts(prev => {
          const next = new Set(prev);
          next.delete(font.family);
          return next;
        });
      }
    }

    setTextFontFamily(board, font.family);
  }, [board]);

  // 当 currentColor prop 变化时，同步更新本地状态
  useEffect(() => {
    if (currentColor) {
      setColorValue(currentColor);
    }
  }, [currentColor]);

  // 添加颜色到最近使用列表（去重，最多保存 10 个）
  const addToRecentColors = useCallback((color: string) => {
    if (!color) return;
    // 标准化颜色格式（移除空格，转小写）
    const normalizedColor = color.toLowerCase().replace(/\s/g, '');
    setRecentColors(prev => {
      // 去重：移除已存在的相同颜色
      const filtered = prev.filter(c => c.toLowerCase().replace(/\s/g, '') !== normalizedColor);
      // 添加到开头，最多保存 10 个
      const updated = [color, ...filtered].slice(0, 10);
      // 保存到 localStorage
      try {
        localStorage.setItem('aitu-recent-text-colors', JSON.stringify(updated));
      } catch (e) {
        console.warn('Failed to save recent colors:', e);
      }
      return updated;
    });
  }, []);

  // 面板关闭时，保存当前颜色到最近使用列表
  useEffect(() => {
    if (!isOpen && colorValue && colorValue !== '#000000') {
      addToRecentColors(colorValue);
    }
  }, [isOpen, colorValue, addToRecentColors]);

  // 处理颜色变更
  const handleColorChange = useCallback((color: string) => {
    // console.log('[handleColorChange] color:', color);
    // TDesign ColorPickerPanel 返回的颜色已包含透明度信息
    // 直接应用颜色，无需额外处理透明度
    setColorValue(color);
    TextTransforms.setTextColor(board, color);
  }, [board]);

  // 处理阴影预设选择
  const handleShadowPresetSelect = useCallback((presetKey: string, preset: TextShadowConfig) => {
    setSelectedShadowPreset(presetKey);
    setShadowEnabled(true);
    const shadowCSS = generateTextShadowCSS(preset);
    setTextShadow(board, shadowCSS);
  }, [board]);

  // 处理渐变预设选择
  const handleGradientPresetSelect = useCallback((presetKey: string, preset: GradientConfig) => {
    setSelectedGradientPreset(presetKey);
    setGradientEnabled(true);
    const gradientCSS = generateGradientCSS(preset);
    setTextGradient(board, gradientCSS);
  }, [board]);

  // 切换阴影开关
  const toggleShadow = useCallback(() => {
    const newEnabled = !shadowEnabled;
    setShadowEnabled(newEnabled);
    if (!newEnabled) {
      setTextShadow(board, null);
      setSelectedShadowPreset(null);
    }
  }, [board, shadowEnabled]);

  // 切换渐变开关
  const toggleGradient = useCallback(() => {
    const newEnabled = !gradientEnabled;
    setGradientEnabled(newEnabled);
    if (!newEnabled) {
      setTextGradient(board, null);
      setSelectedGradientPreset(null);
    }
  }, [board, gradientEnabled]);

  // 点击外部关闭 - 使用全局点击监听
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // 检查是否点击在面板内部
      if (panelRef.current && panelRef.current.contains(target)) {
        return;
      }

      // 检查是否点击在 popup-toolbar 上（通过 class 判断）
      const isToolbarClick = target.closest('.popup-toolbar') !== null;
      if (isToolbarClick) {
        return; // 不关闭面板，让 toolbar 按钮正常工作
      }

      // 点击在外部，关闭面板
      onClose();
    };

    // 延迟添加监听器，避免立即触发
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // 点击外部关闭（遮罩层）- 已废弃，使用全局监听代替
  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    // 遮罩层现在是 pointer-events: none，这个函数不会被调用
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  // 合并字体列表
  const allFonts = [...SYSTEM_FONTS, ...GOOGLE_FONTS];

  if (!isOpen) return null;

  return (
    <>
      {/* 遮罩层 - 用于点击外部关闭 */}
      <div 
        className="text-property-panel-overlay" 
        onClick={handleOverlayClick}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      />
      
      {/* 属性面板 */}
      <div
        ref={panelRef}
        className={classNames('text-property-panel', { 'is-open': isOpen })}
        style={{ top: position.top, left: position.left }}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="text-property-panel__header">
          <span className="text-property-panel__header-title">
            {t('propertyPanel.title')}
          </span>
          <button className="text-property-panel__header-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* 内容区 */}
        <div className="text-property-panel__content">
          {/* 字号设置 */}
          <div className="text-property-panel__section">
            <div className="text-property-panel__section-title">
              {t('propertyPanel.fontSize')}
            </div>
            <div className="text-property-panel__section-content">
              <div className="slider-control">
                <div className="slider-control__header">
                  <span className="slider-control__label">{language === 'zh' ? '字号' : 'Font Size'}</span>
                  <span className="slider-control__value">{fontSizeInput}</span>
                </div>
                <input
                  type="range"
                  className="slider-control__input"
                  value={fontSizeInput}
                  min={8}
                  max={100}
                  step={1}
                  onChange={(e) => {
                    setFontSizeInput(e.target.value);
                    handleFontSizeChange(e.target.value);
                  }}
                />
              </div>
            </div>
          </div>

          {/* 字体设置 */}
          <div className="text-property-panel__section">
            <div className="text-property-panel__section-title">
              {t('propertyPanel.fontFamily')}
            </div>
            <div className="text-property-panel__section-content">
              <div className="font-family-selector">
                <div
                  className={classNames('font-family-selector__current', {
                    'is-expanded': isFontDropdownOpen,
                  })}
                  onClick={() => setIsFontDropdownOpen(!isFontDropdownOpen)}
                >
                  <span
                    className="font-family-selector__current-name"
                    style={{ fontFamily: `'${selectedFont}', sans-serif` }}
                  >
                    {selectedFont}
                  </span>
                  <svg
                    className="font-family-selector__current-arrow"
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                  >
                    <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
                <div className={classNames('font-family-selector__dropdown', { 'is-open': isFontDropdownOpen })}>
                  <div className="font-family-selector__list">
                    {allFonts.map((font) => (
                      <div
                        key={font.family}
                        className={classNames('font-family-selector__item', {
                          'is-active': selectedFont === font.family,
                        })}
                        onClick={() => handleFontSelect(font)}
                      >
                        <div className="font-family-selector__item-name">
                          {font.displayName}
                          {loadingFonts.has(font.family) && ' ...'}
                        </div>
                        <div
                          className="font-family-selector__item-preview"
                          style={{ fontFamily: `'${font.family}', sans-serif` }}
                        >
                          {font.previewText}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 颜色设置 */}
          <div className="text-property-panel__section">
            <div className="text-property-panel__section-title">
              {t('propertyPanel.textColor')}
              {/* 拾色器按钮 */}
              {'EyeDropper' in window && (
                <button
                  className="eyedropper-btn"
                  onClick={async () => {
                    try {
                      // @ts-ignore - EyeDropper API
                      const eyeDropper = new window.EyeDropper();
                      const result = await eyeDropper.open();
                      if (result?.sRGBHex) {
                        handleColorChange(result.sRGBHex);
                        addToRecentColors(result.sRGBHex);
                      }
                    } catch (e) {
                      // console.log('EyeDropper cancelled or failed:', e);
                    }
                  }}
                  title={language === 'zh' ? '拾取屏幕颜色' : 'Pick screen color'}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.71 5.63l-2.34-2.34a1 1 0 0 0-1.41 0l-3.12 3.12-1.42-1.42-1.41 1.42 1.41 1.41-8.42 8.42V20h3.75l8.42-8.42 1.41 1.41 1.42-1.41-1.42-1.42 3.12-3.12a1 1 0 0 0 .01-1.41zM6.92 18H5v-1.92l8.42-8.42 1.92 1.92L6.92 18z"/>
                  </svg>
                </button>
              )}
            </div>
            <div className="text-property-panel__section-content text-color-picker">
              <ColorPickerPanel
                value={colorValue}
                onChange={(color: string) => handleColorChange(color)}
                colorModes={['monochrome']}
                format="HEX"
                enableAlpha={true}
                showPrimaryColorPreview={false}
                recentColors={recentColors}
                onRecentColorsChange={(colors: string[]) => {
                  setRecentColors(colors);
                  try {
                    localStorage.setItem('aitu-recent-text-colors', JSON.stringify(colors));
                  } catch (e) {
                    console.warn('Failed to save recent colors:', e);
                  }
                }}
                swatchColors={null}
              />
            </div>
          </div>

          {/* 阴影效果 */}
          <div className="text-property-panel__section">
            <div className="text-property-panel__section-title">
              {t('propertyPanel.shadowSettings')}
            </div>
            <div className="text-property-panel__section-content">
              <div className="toggle-switch">
                <span className="toggle-switch__label">
                  {language === 'zh' ? '启用阴影' : 'Enable Shadow'}
                </span>
                <div
                  className={classNames('toggle-switch__control', { 'is-active': shadowEnabled })}
                  onClick={toggleShadow}
                />
              </div>
              {shadowEnabled && (
                <div className="preset-grid" style={{ marginTop: '12px' }}>
                  {Object.entries(SHADOW_PRESETS.textShadow).map(([key, preset]) => (
                    <div
                      key={key}
                      className={classNames('preset-grid__item', {
                        'is-active': selectedShadowPreset === key,
                      })}
                      onClick={() => handleShadowPresetSelect(key, preset)}
                      title={key}
                    >
                      <span style={{ textShadow: generateTextShadowCSS(preset) }}>Aa</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 渐变效果 */}
          <div className="text-property-panel__section">
            <div className="text-property-panel__section-title">
              {t('propertyPanel.gradientSettings')}
            </div>
            <div className="text-property-panel__section-content">
              <div className="toggle-switch">
                <span className="toggle-switch__label">
                  {language === 'zh' ? '启用渐变' : 'Enable Gradient'}
                </span>
                <div
                  className={classNames('toggle-switch__control', { 'is-active': gradientEnabled })}
                  onClick={toggleGradient}
                />
              </div>
              {gradientEnabled && (
                <div className="preset-grid" style={{ marginTop: '12px' }}>
                  {GRADIENT_PRESETS.slice(0, 8).map((preset) => (
                    <div
                      key={preset.id}
                      className={classNames('preset-grid__item', {
                        'is-active': selectedGradientPreset === preset.id,
                      })}
                      onClick={() => handleGradientPresetSelect(preset.id, preset.config)}
                      title={preset.nameZh || preset.name}
                      style={{ background: generateGradientCSS(preset.config) }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default TextPropertyPanel;
