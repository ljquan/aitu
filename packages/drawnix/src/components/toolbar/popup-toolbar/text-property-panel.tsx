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
  setTextFontWeight,
  setTextAlign,
  setTextLineHeight,
  setTextLetterSpacing,
  getTextCustomMarks,
  getTextAlign,
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
import { LS_KEYS_TO_MIGRATE } from '../../../constants/storage-keys';
import { kvStorageService } from '../../../services/kv-storage-service';
import './text-property-panel.scss';

const RECENT_COLORS_KEY = LS_KEYS_TO_MIGRATE.RECENT_TEXT_COLORS;
const CUSTOM_GRADIENTS_KEY = LS_KEYS_TO_MIGRATE.CUSTOM_GRADIENTS;

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
  
  // 新增文本属性状态
  const [fontWeight, setFontWeight] = useState<number>(400);
  const [textAlignState, setTextAlignState] = useState<'left' | 'center' | 'right'>('left');
  const [lineHeight, setLineHeight] = useState<number>(1.5);
  const [letterSpacing, setLetterSpacing] = useState<number>(0);

  // 阴影状态
  const [shadowEnabled, setShadowEnabled] = useState(false);
  const [selectedShadowPreset, setSelectedShadowPreset] = useState<string | null>(null);
  const [shadowConfig, setShadowConfig] = useState({
    color: 'rgba(0, 0, 0, 0.5)',
    offsetX: 2,
    offsetY: 2,
    blur: 4,
  });
  
  // 渐变状态
  const [gradientEnabled, setGradientEnabled] = useState(false);
  const [selectedGradientPreset, setSelectedGradientPreset] = useState<string | null>(null);
  const [gradientAngle, setGradientAngle] = useState(135);
  const [gradientStops, setGradientStops] = useState([
    { color: '#FF6B6B', position: 0 },
    { color: '#4ECDC4', position: 100 },
  ]);
  const [showGradientEditor, setShowGradientEditor] = useState(false);
  
  // 自定义渐变预设
  const [customGradients, setCustomGradients] = useState<Array<{ id: string; css: string }>>([]);
  
  // 颜色状态 - 用于受控的 ColorPickerPanel
  const [colorValue, setColorValue] = useState(currentColor || '#000000');
  
  // 最近使用的颜色
  const [recentColors, setRecentColors] = useState<string[]>([]);

  // 从 IndexedDB 加载颜色和渐变数据
  useEffect(() => {
    let mounted = true;
    Promise.all([
      kvStorageService.get<string[]>(RECENT_COLORS_KEY),
      kvStorageService.get<Array<{ id: string; css: string }>>(CUSTOM_GRADIENTS_KEY),
    ]).then(([colors, gradients]) => {
      if (!mounted) return;
      if (colors) setRecentColors(colors);
      if (gradients) setCustomGradients(gradients);
    }).catch((e) => {
      console.warn('Failed to load color/gradient data:', e);
    });
    return () => { mounted = false; };
  }, []);

  // 面板打开时,从文本 marks 中读取当前样式进行反显
  useEffect(() => {
    if (isOpen) {
      const marks = getTextCustomMarks(board);

      // 反显渐变
      if (marks['text-gradient']) {
        setGradientEnabled(true);
        const matchedPreset = GRADIENT_PRESETS.find(preset => {
          const presetCSS = generateGradientCSS(preset.config);
          return presetCSS === marks['text-gradient'];
        });
        if (matchedPreset) {
          setSelectedGradientPreset(matchedPreset.id);
        } else {
          setSelectedGradientPreset(null);
        }
      } else {
        setGradientEnabled(false);
        setSelectedGradientPreset(null);
      }

      // 反显阴影
      if (marks['text-shadow']) {
        setShadowEnabled(true);
        const shadowValue = marks['text-shadow'];
        let matchedKey: string | null = null;
        for (const [key, preset] of Object.entries(SHADOW_PRESETS.textShadow)) {
          const presetCSS = generateTextShadowCSS(preset);
          if (presetCSS === shadowValue) {
            matchedKey = key;
            break;
          }
        }
        if (matchedKey) {
          setSelectedShadowPreset(matchedKey);
        } else {
          setSelectedShadowPreset(null);
        }
      } else {
        setShadowEnabled(false);
        setSelectedShadowPreset(null);
      }

      // 反显字体
      if (marks['font-family']) {
        setSelectedFont(marks['font-family']);
      }

      // 反显字重
      if (marks['font-weight']) {
        setFontWeight(Number(marks['font-weight']));
      }

      // 反显行高
      if (marks['line-height']) {
        setLineHeight(Number(marks['line-height']));
      }

      // 反显字间距
      if (marks['letter-spacing']) {
        const value = String(marks['letter-spacing']).replace('px', '');
        setLetterSpacing(Number(value));
      }

      // 反显文本对齐
      const align = getTextAlign(board);
      setTextAlignState(align);
    }
  }, [isOpen, board]);

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
      const panelWidth = 320;
      const panelHeight = 520;
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
      // 保存到 IndexedDB
      kvStorageService.set(RECENT_COLORS_KEY, updated).catch((e) => {
        console.warn('Failed to save recent colors:', e);
      });
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
    setShadowConfig({
      color: preset.color,
      offsetX: preset.offsetX,
      offsetY: preset.offsetY,
      blur: preset.blur,
    });
    const shadowCSS = generateTextShadowCSS(preset);
    setTextShadow(board, shadowCSS);
  }, [board]);

  // 处理阴影配置变更
  const handleShadowConfigChange = useCallback((key: keyof typeof shadowConfig, value: number | string) => {
    const newConfig = { ...shadowConfig, [key]: value };
    setShadowConfig(newConfig);
    setSelectedShadowPreset(null);
    const shadowCSS = `${newConfig.offsetX}px ${newConfig.offsetY}px ${newConfig.blur}px ${newConfig.color}`;
    setTextShadow(board, shadowCSS);
  }, [board, shadowConfig]);

  // 处理渐变预设选择
  const handleGradientPresetSelect = useCallback((presetKey: string, preset: GradientConfig) => {
    setSelectedGradientPreset(presetKey);
    setGradientEnabled(true);
    setGradientAngle(preset.angle);
    setGradientStops(preset.stops);
    const gradientCSS = generateGradientCSS(preset);
    setTextGradient(board, gradientCSS);
  }, [board]);

  // 处理自定义渐变选择
  const handleCustomGradientSelect = useCallback((gradientCSS: string, id: string) => {
    setSelectedGradientPreset(`custom-${id}`);
    setGradientEnabled(true);
    setTextGradient(board, gradientCSS);
  }, [board]);

  // 应用当前渐变配置
  const applyGradientConfig = useCallback(() => {
    const config: GradientConfig = {
      type: 'linear',
      angle: gradientAngle,
      stops: gradientStops,
      target: 'text',
    };
    const gradientCSS = generateGradientCSS(config);
    setTextGradient(board, gradientCSS);
    setSelectedGradientPreset(null);
  }, [board, gradientAngle, gradientStops]);

  // 保存当前渐变到快捷选择
  const saveCurrentGradient = useCallback(() => {
    const config: GradientConfig = {
      type: 'linear',
      angle: gradientAngle,
      stops: gradientStops,
      target: 'text',
    };
    const gradientCSS = generateGradientCSS(config);
    const newGradient = {
      id: `custom-${Date.now()}`,
      css: gradientCSS,
    };
    const updated = [newGradient, ...customGradients].slice(0, 8);
    setCustomGradients(updated);
    kvStorageService.set(CUSTOM_GRADIENTS_KEY, updated).catch((e) => {
      console.warn('Failed to save custom gradients:', e);
    });
  }, [gradientAngle, gradientStops, customGradients]);

  // 删除自定义渐变
  const deleteCustomGradient = useCallback((id: string) => {
    const updated = customGradients.filter(g => g.id !== id);
    setCustomGradients(updated);
    kvStorageService.set(CUSTOM_GRADIENTS_KEY, updated).catch((e) => {
      console.warn('Failed to save custom gradients:', e);
    });
  }, [customGradients]);

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

  // 处理字重变更
  const handleFontWeightChange = useCallback((weight: number) => {
    setFontWeight(weight);
    setTextFontWeight(board, weight);
  }, [board]);

  // 处理文本对齐变更
  const handleTextAlignChange = useCallback((align: 'left' | 'center' | 'right') => {
    setTextAlignState(align);
    setTextAlign(board, align);
  }, [board]);

  // 处理行高变更
  const handleLineHeightChange = useCallback((height: number) => {
    setLineHeight(height);
    setTextLineHeight(board, height);
  }, [board]);

  // 处理字间距变更
  const handleLetterSpacingChange = useCallback((spacing: number) => {
    setLetterSpacing(spacing);
    setTextLetterSpacing(board, spacing);
  }, [board]);

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

  // 字重下拉状态
  const [isWeightDropdownOpen, setIsWeightDropdownOpen] = useState(false);

  // 字重选项
  const fontWeightOptions = [
    { value: 100, label: 'Thin', labelZh: '极细' },
    { value: 200, label: 'Extra Light', labelZh: '特细' },
    { value: 300, label: 'Light', labelZh: '细体' },
    { value: 400, label: 'Regular', labelZh: '常规' },
    { value: 500, label: 'Medium', labelZh: '中等' },
    { value: 600, label: 'Semi Bold', labelZh: '半粗' },
    { value: 700, label: 'Bold', labelZh: '粗体' },
    { value: 800, label: 'Extra Bold', labelZh: '特粗' },
    { value: 900, label: 'Black', labelZh: '黑体' },
  ];

  // 获取当前字重的显示名称
  const getWeightDisplayName = useCallback((weight: number) => {
    const option = fontWeightOptions.find(o => o.value === weight);
    return option ? (language === 'zh' ? option.labelZh : option.label) : String(weight);
  }, [language]);

  // 合并字体列表
  const allFonts = [...SYSTEM_FONTS, ...GOOGLE_FONTS];

  // 根据 font family 获取显示名称
  const getDisplayName = useCallback((fontFamily: string) => {
    const font = allFonts.find(f => f.family === fontFamily);
    return font?.displayName || fontFamily;
  }, [allFonts]);

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
          {/* 基础文字属性 - 紧凑行内布局 */}
          <div className="text-property-panel__section">
            <div className="text-property-panel__section-content">
              {/* 字号 - 滑条 */}
              <div className="inline-control">
                <label className="inline-control__label">{language === 'zh' ? '字号' : 'Size'}</label>
                <div className="inline-control__slider-group">
                  <input
                    type="range"
                    className="inline-control__slider"
                    value={fontSizeInput}
                    min={8}
                    max={100}
                    step={1}
                    onChange={(e) => {
                      setFontSizeInput(e.target.value);
                      handleFontSizeChange(e.target.value);
                    }}
                  />
                  <span className="inline-control__value">{fontSizeInput}</span>
                </div>
              </div>

              {/* 字体 - 自定义下拉 */}
              <div className="inline-control inline-control--dropdown">
                <label className="inline-control__label">{language === 'zh' ? '字体' : 'Font'}</label>
                <div className="custom-dropdown">
                  <div
                    className={classNames('custom-dropdown__trigger', { 'is-expanded': isFontDropdownOpen })}
                    onClick={() => {
                      setIsFontDropdownOpen(!isFontDropdownOpen);
                      setIsWeightDropdownOpen(false);
                    }}
                  >
                    <span
                      className="custom-dropdown__value"
                      style={{ fontFamily: `'${selectedFont}', sans-serif` }}
                    >
                      {getDisplayName(selectedFont)}
                    </span>
                    <svg className="custom-dropdown__arrow" width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div className={classNames('custom-dropdown__menu custom-dropdown__menu--font', { 'is-open': isFontDropdownOpen })}>
                    {allFonts.map((font) => (
                      <div
                        key={font.family}
                        className={classNames('custom-dropdown__item custom-dropdown__item--font', {
                          'is-active': selectedFont === font.family,
                        })}
                        onClick={() => {
                          handleFontSelect(font);
                          setIsFontDropdownOpen(false);
                        }}
                      >
                        <span className="custom-dropdown__item-label">{font.displayName}</span>
                        <span
                          className="custom-dropdown__item-preview"
                          style={{ fontFamily: `'${font.family}', sans-serif` }}
                        >
                          {font.previewText}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 字重 - 自定义下拉 */}
              <div className="inline-control inline-control--dropdown">
                <label className="inline-control__label">{language === 'zh' ? '字重' : 'Weight'}</label>
                <div className="custom-dropdown">
                  <div
                    className={classNames('custom-dropdown__trigger', { 'is-expanded': isWeightDropdownOpen })}
                    onClick={() => {
                      setIsWeightDropdownOpen(!isWeightDropdownOpen);
                      setIsFontDropdownOpen(false);
                    }}
                  >
                    <span className="custom-dropdown__value" style={{ fontWeight: fontWeight }}>
                      {getWeightDisplayName(fontWeight)}
                    </span>
                    <svg className="custom-dropdown__arrow" width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div className={classNames('custom-dropdown__menu', { 'is-open': isWeightDropdownOpen })}>
                    {fontWeightOptions.map((option) => (
                      <div
                        key={option.value}
                        className={classNames('custom-dropdown__item', {
                          'is-active': fontWeight === option.value,
                        })}
                        onClick={() => {
                          handleFontWeightChange(option.value);
                          setIsWeightDropdownOpen(false);
                        }}
                      >
                        <span
                          className="custom-dropdown__item-label"
                          style={{ fontWeight: option.value }}
                        >
                          {language === 'zh' ? option.labelZh : option.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 对齐 */}
              <div className="inline-control">
                <label className="inline-control__label">{language === 'zh' ? '对齐' : 'Align'}</label>
                <div className="align-buttons align-buttons--compact">
                  <button
                    className={classNames('align-buttons__btn', { 'is-active': textAlignState === 'left' })}
                    onClick={() => handleTextAlignChange('left')}
                    title={language === 'zh' ? '左对齐' : 'Align Left'}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M2 3h12v2H2V3zm0 4h8v2H2V7zm0 4h12v2H2v-2z"/>
                    </svg>
                  </button>
                  <button
                    className={classNames('align-buttons__btn', { 'is-active': textAlignState === 'center' })}
                    onClick={() => handleTextAlignChange('center')}
                    title={language === 'zh' ? '居中对齐' : 'Align Center'}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M2 3h12v2H2V3zm2 4h8v2H4V7zm-2 4h12v2H2v-2z"/>
                    </svg>
                  </button>
                  <button
                    className={classNames('align-buttons__btn', { 'is-active': textAlignState === 'right' })}
                    onClick={() => handleTextAlignChange('right')}
                    title={language === 'zh' ? '右对齐' : 'Align Right'}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M2 3h12v2H2V3zm4 4h8v2H6V7zm-4 4h12v2H2v-2z"/>
                    </svg>
                  </button>
                </div>
              </div>

              {/* 行高 - 滑条 */}
              <div className="inline-control">
                <label className="inline-control__label">{language === 'zh' ? '行高' : 'Line'}</label>
                <div className="inline-control__slider-group">
                  <input
                    type="range"
                    className="inline-control__slider"
                    value={lineHeight}
                    min={0.8}
                    max={3}
                    step={0.1}
                    onChange={(e) => handleLineHeightChange(Number(e.target.value))}
                  />
                  <span className="inline-control__value">{lineHeight.toFixed(1)}</span>
                </div>
              </div>

              {/* 字间距 - 滑条 */}
              <div className="inline-control">
                <label className="inline-control__label">{language === 'zh' ? '字距' : 'Spacing'}</label>
                <div className="inline-control__slider-group">
                  <input
                    type="range"
                    className="inline-control__slider"
                    value={letterSpacing}
                    min={-2}
                    max={10}
                    step={0.5}
                    onChange={(e) => handleLetterSpacingChange(Number(e.target.value))}
                  />
                  <span className="inline-control__value">{letterSpacing}px</span>
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
                  kvStorageService.set(RECENT_COLORS_KEY, colors).catch((e) => {
                    console.warn('Failed to save recent colors:', e);
                  });
                }}
                swatchColors={null}
              />
            </div>
          </div>

          {/* 阴影效果 */}
          <div className="text-property-panel__section">
            <div className="text-property-panel__section-content">
              {/* 阴影开关 */}
              <div className="inline-control">
                <label className="inline-control__label">{language === 'zh' ? '阴影' : 'Shadow'}</label>
                <div
                  className={classNames('toggle-switch__control toggle-switch__control--inline', { 'is-active': shadowEnabled })}
                  onClick={toggleShadow}
                />
              </div>
              
              {shadowEnabled && (
                <>
                  {/* 阴影预设 */}
                  <div className="effect-presets">
                    {Object.entries(SHADOW_PRESETS.textShadow).map(([key, preset]) => (
                      <div
                        key={key}
                        className={classNames('effect-presets__item', {
                          'is-active': selectedShadowPreset === key,
                        })}
                        onClick={() => handleShadowPresetSelect(key, preset)}
                        title={key}
                      >
                        <span style={{ textShadow: generateTextShadowCSS(preset) }}>Aa</span>
                      </div>
                    ))}
                  </div>
                  
                  {/* 阴影细节配置 */}
                  <div className="effect-config">
                    {/* 阴影颜色 */}
                    <div className="inline-control">
                      <label className="inline-control__label">{language === 'zh' ? '颜色' : 'Color'}</label>
                      <div className="inline-control__color-group">
                        <input
                          type="color"
                          className="inline-control__color-input"
                          value={shadowConfig.color.startsWith('rgba') 
                            ? `#${shadowConfig.color.match(/\d+/g)?.slice(0, 3).map(n => parseInt(n).toString(16).padStart(2, '0')).join('') || '000000'}`
                            : shadowConfig.color}
                          onChange={(e) => {
                            // 转换为 rgba 格式，保留当前透明度
                            const hex = e.target.value;
                            const r = parseInt(hex.slice(1, 3), 16);
                            const g = parseInt(hex.slice(3, 5), 16);
                            const b = parseInt(hex.slice(5, 7), 16);
                            // 从当前 color 提取 alpha
                            const alphaMatch = shadowConfig.color.match(/[\d.]+\)$/);
                            const alpha = alphaMatch ? parseFloat(alphaMatch[0]) : 0.5;
                            handleShadowConfigChange('color', `rgba(${r}, ${g}, ${b}, ${alpha})`);
                          }}
                        />
                        <input
                          type="range"
                          className="inline-control__slider inline-control__slider--short"
                          value={(() => {
                            const alphaMatch = shadowConfig.color.match(/[\d.]+\)$/);
                            return alphaMatch ? parseFloat(alphaMatch[0]) * 100 : 50;
                          })()}
                          min={0}
                          max={100}
                          step={5}
                          title={language === 'zh' ? '透明度' : 'Opacity'}
                          onChange={(e) => {
                            const alpha = Number(e.target.value) / 100;
                            // 从当前 color 提取 RGB
                            const rgbMatch = shadowConfig.color.match(/\d+/g);
                            if (rgbMatch && rgbMatch.length >= 3) {
                              const [r, g, b] = rgbMatch.slice(0, 3);
                              handleShadowConfigChange('color', `rgba(${r}, ${g}, ${b}, ${alpha})`);
                            }
                          }}
                        />
                        <span className="inline-control__value inline-control__value--narrow">
                          {(() => {
                            const alphaMatch = shadowConfig.color.match(/[\d.]+\)$/);
                            return alphaMatch ? Math.round(parseFloat(alphaMatch[0]) * 100) : 50;
                          })()}%
                        </span>
                      </div>
                    </div>
                    <div className="inline-control">
                      <label className="inline-control__label">{language === 'zh' ? 'X偏移' : 'X'}</label>
                      <div className="inline-control__slider-group">
                        <input
                          type="range"
                          className="inline-control__slider"
                          value={shadowConfig.offsetX}
                          min={-20}
                          max={20}
                          step={1}
                          onChange={(e) => handleShadowConfigChange('offsetX', Number(e.target.value))}
                        />
                        <span className="inline-control__value">{shadowConfig.offsetX}px</span>
                      </div>
                    </div>
                    <div className="inline-control">
                      <label className="inline-control__label">{language === 'zh' ? 'Y偏移' : 'Y'}</label>
                      <div className="inline-control__slider-group">
                        <input
                          type="range"
                          className="inline-control__slider"
                          value={shadowConfig.offsetY}
                          min={-20}
                          max={20}
                          step={1}
                          onChange={(e) => handleShadowConfigChange('offsetY', Number(e.target.value))}
                        />
                        <span className="inline-control__value">{shadowConfig.offsetY}px</span>
                      </div>
                    </div>
                    <div className="inline-control">
                      <label className="inline-control__label">{language === 'zh' ? '模糊' : 'Blur'}</label>
                      <div className="inline-control__slider-group">
                        <input
                          type="range"
                          className="inline-control__slider"
                          value={shadowConfig.blur}
                          min={0}
                          max={30}
                          step={1}
                          onChange={(e) => handleShadowConfigChange('blur', Number(e.target.value))}
                        />
                        <span className="inline-control__value">{shadowConfig.blur}px</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 渐变效果 */}
          <div className="text-property-panel__section">
            <div className="text-property-panel__section-content">
              {/* 渐变开关 */}
              <div className="inline-control">
                <label className="inline-control__label">{language === 'zh' ? '渐变' : 'Gradient'}</label>
                <div
                  className={classNames('toggle-switch__control toggle-switch__control--inline', { 'is-active': gradientEnabled })}
                  onClick={toggleGradient}
                />
              </div>
              
              {gradientEnabled && (
                <>
                  {/* 渐变预设 */}
                  <div className="effect-presets">
                    {GRADIENT_PRESETS.slice(0, 8).map((preset) => (
                      <div
                        key={preset.id}
                        className={classNames('effect-presets__item effect-presets__item--gradient', {
                          'is-active': selectedGradientPreset === preset.id,
                        })}
                        onClick={() => handleGradientPresetSelect(preset.id, preset.config)}
                        title={preset.nameZh || preset.name}
                        style={{ background: generateGradientCSS(preset.config) }}
                      />
                    ))}
                  </div>
                  
                  {/* 自定义渐变 */}
                  {customGradients.length > 0 && (
                    <div className="effect-presets effect-presets--custom">
                      <span className="effect-presets__label">{language === 'zh' ? '自定义' : 'Custom'}</span>
                      <div className="effect-presets__list">
                        {customGradients.map((gradient) => (
                          <div
                            key={gradient.id}
                            className={classNames('effect-presets__item effect-presets__item--gradient effect-presets__item--deletable', {
                              'is-active': selectedGradientPreset === `custom-${gradient.id}`,
                            })}
                            onClick={() => handleCustomGradientSelect(gradient.css, gradient.id)}
                            style={{ background: gradient.css }}
                          >
                            <button
                              className="effect-presets__delete"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteCustomGradient(gradient.id);
                              }}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* 渐变编辑器切换 */}
                  <button
                    className="effect-editor-toggle"
                    onClick={() => setShowGradientEditor(!showGradientEditor)}
                  >
                    {showGradientEditor 
                      ? (language === 'zh' ? '收起编辑器' : 'Hide Editor')
                      : (language === 'zh' ? '自定义渐变' : 'Custom Gradient')
                    }
                    <svg 
                      className={classNames('effect-editor-toggle__arrow', { 'is-expanded': showGradientEditor })}
                      width="12" height="12" viewBox="0 0 12 12" fill="none"
                    >
                      <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                  
                  {/* 渐变编辑器 */}
                  {showGradientEditor && (
                    <div className="gradient-editor">
                      {/* 渐变预览 */}
                      <div 
                        className="gradient-editor__preview"
                        style={{ 
                          background: `linear-gradient(${gradientAngle}deg, ${gradientStops.map(s => `${s.color} ${s.position}%`).join(', ')})` 
                        }}
                      />
                      
                      {/* 角度 */}
                      <div className="inline-control">
                        <label className="inline-control__label">{language === 'zh' ? '角度' : 'Angle'}</label>
                        <div className="inline-control__slider-group">
                          <input
                            type="range"
                            className="inline-control__slider"
                            value={gradientAngle}
                            min={0}
                            max={360}
                            step={15}
                            onChange={(e) => {
                              setGradientAngle(Number(e.target.value));
                              setSelectedGradientPreset(null);
                            }}
                            onMouseUp={applyGradientConfig}
                          />
                          <span className="inline-control__value">{gradientAngle}°</span>
                        </div>
                      </div>
                      
                      {/* 色标 */}
                      <div className="gradient-editor__stops">
                        {gradientStops.map((stop, index) => (
                          <div key={index} className="gradient-editor__stop">
                            <input
                              type="color"
                              className="gradient-editor__stop-color"
                              value={stop.color}
                              onChange={(e) => {
                                const newStops = [...gradientStops];
                                newStops[index] = { ...stop, color: e.target.value };
                                setGradientStops(newStops);
                                setSelectedGradientPreset(null);
                                setTimeout(applyGradientConfig, 100);
                              }}
                            />
                            <input
                              type="range"
                              className="gradient-editor__stop-position"
                              value={stop.position}
                              min={0}
                              max={100}
                              step={5}
                              onChange={(e) => {
                                const newStops = [...gradientStops];
                                newStops[index] = { ...stop, position: Number(e.target.value) };
                                setGradientStops(newStops);
                                setSelectedGradientPreset(null);
                              }}
                              onMouseUp={applyGradientConfig}
                            />
                            <span className="gradient-editor__stop-value">{stop.position}%</span>
                            {gradientStops.length > 2 && (
                              <button
                                className="gradient-editor__stop-delete"
                                onClick={() => {
                                  const newStops = gradientStops.filter((_, i) => i !== index);
                                  setGradientStops(newStops);
                                  setSelectedGradientPreset(null);
                                  setTimeout(applyGradientConfig, 0);
                                }}
                              >
                                ×
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      
                      {/* 操作按钮 */}
                      <div className="gradient-editor__actions">
                        <button
                          className="gradient-editor__btn"
                          onClick={() => {
                            const lastStop = gradientStops[gradientStops.length - 1];
                            const newPosition = Math.min(100, lastStop.position + 25);
                            setGradientStops([...gradientStops, { color: '#FFFFFF', position: newPosition }]);
                          }}
                          disabled={gradientStops.length >= 5}
                        >
                          {language === 'zh' ? '添加色标' : 'Add Stop'}
                        </button>
                        <button
                          className="gradient-editor__btn gradient-editor__btn--primary"
                          onClick={saveCurrentGradient}
                        >
                          {language === 'zh' ? '保存渐变' : 'Save'}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default TextPropertyPanel;
