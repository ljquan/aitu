/**
 * 公共渐变编辑器组件
 * Common Gradient Editor Component
 *
 * 用于填充面板和文字渐变的统一渐变配置组件
 * 参考设计：线性/径向切换 + 可拖拽色标条 + 原点预设 + 预设快捷选择
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import classNames from 'classnames';
import { ATTACHED_ELEMENT_CLASS_NAME } from '@plait/core';
import { useI18n } from '../../i18n';
import { useColorHistory } from '../../hooks/useColorHistory';
import { UnifiedColorPicker } from '../unified-color-picker';
import { Popover, PopoverContent, PopoverTrigger } from '../popover/popover';
import { Island } from '../island';
import type {
  GradientFillConfig,
  GradientFillStop,
  LinearGradientConfig,
  RadialGradientConfig,
  GradientFillPreset,
} from '../../types/fill.types';
import {
  DEFAULT_LINEAR_GRADIENT,
  GRADIENT_FILL_PRESETS,
} from '../../types/fill.types';
import './gradient-editor.scss';

export interface GradientEditorProps {
  /** 当前渐变配置 */
  value?: GradientFillConfig;
  /** 渐变变更回调 */
  onChange?: (config: GradientFillConfig) => void;
  /** 是否显示预设面板 */
  showPresets?: boolean;
  /** 是否显示历史记录 */
  showHistory?: boolean;
  /** 预设分类（可自定义显示哪些分类） */
  presetCategories?: string[];
  /** 自定义预设列表（GradientFillPreset[] 或 CSS 字符串数组） */
  customPresets?: GradientFillPreset[] | string[];
  /** 紧凑模式（隐藏标签页，只显示自定义编辑器） */
  compact?: boolean;
  /** 内联模式（更紧凑的布局，适合嵌入其他面板） */
  inline?: boolean;
  /** 保存预设回调 */
  onSavePreset?: () => void;
  /** 删除预设回调（仅当 customPresets 为 CSS 字符串数组时有效） */
  onDeletePreset?: (index: number) => void;
}

/**
 * 生成渐变 CSS
 */
export function generateGradientCSS(config: GradientFillConfig): string {
  const stopsStr = config.stops
    .map((stop) => `${stop.color} ${Math.round(stop.offset * 100)}%`)
    .join(', ');

  if (config.type === 'linear') {
    return `linear-gradient(${config.angle}deg, ${stopsStr})`;
  } else {
    const cx = Math.round(config.centerX * 100);
    const cy = Math.round(config.centerY * 100);
    return `radial-gradient(circle at ${cx}% ${cy}%, ${stopsStr})`;
  }
}

/**
 * 从 CSS 渐变字符串解析配置
 */
function parseGradientCSSToConfig(css: string): GradientFillConfig {
  // 匹配线性渐变: linear-gradient(135deg, #color1 0%, #color2 100%)
  const linearMatch = css.match(/linear-gradient\((\d+)deg,\s*(.+)\)/);
  if (linearMatch) {
    const angle = parseInt(linearMatch[1], 10);
    const stopsStr = linearMatch[2];
    const stops = parseStopsFromCSS(stopsStr);
    return {
      type: 'linear',
      angle,
      stops: stops.length >= 2 ? stops : [
        { color: '#FF6B6B', offset: 0 },
        { color: '#4ECDC4', offset: 1 },
      ],
    };
  }

  // 匹配径向渐变: radial-gradient(circle at 50% 50%, #color1 0%, #color2 100%)
  const radialMatch = css.match(/radial-gradient\(circle(?:\s+at\s+(\d+)%\s+(\d+)%)?,\s*(.+)\)/);
  if (radialMatch) {
    const centerX = radialMatch[1] ? parseInt(radialMatch[1], 10) / 100 : 0.5;
    const centerY = radialMatch[2] ? parseInt(radialMatch[2], 10) / 100 : 0.5;
    const stopsStr = radialMatch[3];
    const stops = parseStopsFromCSS(stopsStr);
    return {
      type: 'radial',
      centerX,
      centerY,
      stops: stops.length >= 2 ? stops : [
        { color: '#FF6B6B', offset: 0 },
        { color: '#4ECDC4', offset: 1 },
      ],
    };
  }

  // 默认返回
  return DEFAULT_LINEAR_GRADIENT;
}

/**
 * 从 CSS 色标字符串解析色标数组
 */
function parseStopsFromCSS(stopsStr: string): GradientFillStop[] {
  const stops: GradientFillStop[] = [];
  const stopRegex = /(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))\s+(\d+)%/g;
  let match;
  while ((match = stopRegex.exec(stopsStr)) !== null) {
    stops.push({
      color: match[1],
      offset: parseInt(match[2], 10) / 100,
    });
  }
  return stops;
}

/** 径向渐变原点预设 */
const RADIAL_ORIGIN_PRESETS = [
  { key: 'left', labelZh: '左', labelEn: 'Left', x: 0, y: 0.5 },
  { key: 'center', labelZh: '中心', labelEn: 'Center', x: 0.5, y: 0.5 },
  { key: 'top-left', labelZh: '左上', labelEn: 'Top left', x: 0, y: 0 },
  { key: 'top', labelZh: '上', labelEn: 'Top', x: 0.5, y: 0 },
  { key: 'right', labelZh: '右', labelEn: 'Right', x: 1, y: 0.5 },
  { key: 'bottom', labelZh: '下', labelEn: 'Bottom', x: 0.5, y: 1 },
];

export const GradientEditor: React.FC<GradientEditorProps> = ({
  value,
  onChange,
  showPresets = true,
  showHistory = true,
  presetCategories,
  customPresets,
  compact = false,
  inline = false,
  onSavePreset,
  onDeletePreset,
}) => {
  const { language } = useI18n();
  const { gradients: historyGradients, addGradient: saveToHistory } = useColorHistory();

  const [gradient, setGradient] = useState<GradientFillConfig>(
    value || DEFAULT_LINEAR_GRADIENT
  );
  const [selectedStopIndex, setSelectedStopIndex] = useState(0);
  const [activeColorPickerIndex, setActiveColorPickerIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const gradientBarRef = useRef<HTMLDivElement>(null);

  // 同步外部 value 变化
  useEffect(() => {
    if (value) {
      setGradient(value);
    }
  }, [value]);

  // 应用渐变
  const applyGradient = useCallback(
    (config: GradientFillConfig) => {
      setGradient(config);
      onChange?.(config);
      // 保存到历史记录
      saveToHistory(config);
    },
    [onChange, saveToHistory]
  );

  // 应用预设
  const applyPreset = useCallback(
    (preset: GradientFillPreset) => {
      applyGradient(preset.config);
    },
    [applyGradient]
  );

  // 更新渐变属性
  const updateGradient = useCallback(
    (updates: Partial<GradientFillConfig>) => {
      const newGradient = { ...gradient, ...updates } as GradientFillConfig;
      applyGradient(newGradient);
    },
    [gradient, applyGradient]
  );

  // 切换渐变类型
  const switchGradientType = useCallback(
    (type: 'linear' | 'radial') => {
      if (gradient.type === type) return;

      if (type === 'linear') {
        const newConfig: LinearGradientConfig = {
          type: 'linear',
          angle: 90,
          stops: gradient.stops,
        };
        applyGradient(newConfig);
      } else {
        const newConfig: RadialGradientConfig = {
          type: 'radial',
          centerX: 0.5,
          centerY: 0.5,
          stops: gradient.stops,
        };
        applyGradient(newConfig);
      }
    },
    [gradient, applyGradient]
  );

  // 更新色标
  const updateStop = useCallback(
    (index: number, updates: Partial<GradientFillStop>) => {
      const newStops = [...gradient.stops];
      newStops[index] = { ...newStops[index], ...updates };
      // 根据 offset 排序
      newStops.sort((a, b) => a.offset - b.offset);
      // 更新选中的索引（可能因排序而改变）
      const newIndex = newStops.findIndex(
        (s) => s.color === (updates.color ?? gradient.stops[index].color)
      );
      if (newIndex !== -1 && newIndex !== selectedStopIndex) {
        setSelectedStopIndex(newIndex);
      }
      updateGradient({ stops: newStops });
    },
    [gradient.stops, selectedStopIndex, updateGradient]
  );

  // 添加色标
  const addStop = useCallback(() => {
    if (gradient.stops.length >= 8) return;

    const newOffset = 0.5;
    const newColor = '#888888';
    const newStops = [...gradient.stops, { color: newColor, offset: newOffset }].sort(
      (a, b) => a.offset - b.offset
    );

    updateGradient({ stops: newStops });
    setSelectedStopIndex(newStops.findIndex((s) => s.offset === newOffset));
  }, [gradient.stops, updateGradient]);

  // 删除色标
  const removeStop = useCallback(
    (index: number) => {
      if (gradient.stops.length <= 2) return;

      const newStops = gradient.stops.filter((_, i) => i !== index);
      updateGradient({ stops: newStops });
      setSelectedStopIndex(Math.min(selectedStopIndex, newStops.length - 1));
    },
    [gradient.stops, selectedStopIndex, updateGradient]
  );

  // 处理色标拖拽
  const handleStopDrag = useCallback(
    (e: React.MouseEvent | MouseEvent, index: number) => {
      if (!gradientBarRef.current) return;

      const rect = gradientBarRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const offset = x / rect.width;

      updateStop(index, { offset });
    },
    [updateStop]
  );

  // 鼠标按下开始拖拽
  const handleStopMouseDown = useCallback(
    (e: React.MouseEvent, index: number) => {
      e.preventDefault();
      e.stopPropagation();
      setSelectedStopIndex(index);
      
      const startX = e.clientX;
      const startY = e.clientY;
      let hasMoved = false;
      const moveThreshold = 3; // 移动超过 3px 才算拖拽

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = Math.abs(moveEvent.clientX - startX);
        const deltaY = Math.abs(moveEvent.clientY - startY);
        
        if (deltaX > moveThreshold || deltaY > moveThreshold) {
          hasMoved = true;
          setIsDragging(true);
          handleStopDrag(moveEvent, index);
        }
      };

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        
        // 如果没有移动，则是点击行为，打开颜色选择器
        if (!hasMoved) {
          setActiveColorPickerIndex(index);
        }
        
        // 延迟重置 isDragging，避免影响其他逻辑
        setTimeout(() => {
          setIsDragging(false);
        }, 0);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [handleStopDrag]
  );

  // 点击渐变条添加色标
  const handleBarClick = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging || gradient.stops.length >= 8) return;

      // 检查点击目标是否是渐变条本身（不是色标按钮或其他元素）
      const target = e.target as HTMLElement;
      if (target !== gradientBarRef.current) return;

      if (!gradientBarRef.current) return;

      const rect = gradientBarRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const offset = Math.max(0, Math.min(x / rect.width, 1));

      // 找到左右两个最近的色标，插值生成新颜色
      const sortedStops = [...gradient.stops].sort((a, b) => a.offset - b.offset);
      let leftStop = sortedStops[0];
      let rightStop = sortedStops[sortedStops.length - 1];

      for (let i = 0; i < sortedStops.length - 1; i++) {
        if (sortedStops[i].offset <= offset && sortedStops[i + 1].offset >= offset) {
          leftStop = sortedStops[i];
          rightStop = sortedStops[i + 1];
          break;
        }
      }

      // 简单地使用左侧色标的颜色
      const newColor = leftStop.color;

      const newStops = [...gradient.stops, { color: newColor, offset }].sort(
        (a, b) => a.offset - b.offset
      );

      updateGradient({ stops: newStops });
      const newIndex = newStops.findIndex((s) => s.offset === offset);
      setSelectedStopIndex(newIndex);
    },
    [isDragging, gradient.stops, updateGradient]
  );

  // 预览 CSS
  const previewCSS = useMemo(() => generateGradientCSS(gradient), [gradient]);

  // 预设分类
  const categories = useMemo(() => {
    const defaultCategories = [
      { key: 'basic', label: language === 'zh' ? '基础' : 'Basic' },
      { key: 'colorful', label: language === 'zh' ? '多彩' : 'Colorful' },
      { key: 'sunset', label: language === 'zh' ? '日落' : 'Sunset' },
      { key: 'nature', label: language === 'zh' ? '自然' : 'Nature' },
      { key: 'metal', label: language === 'zh' ? '金属' : 'Metal' },
    ];

    if (presetCategories) {
      return defaultCategories.filter((c) => presetCategories.includes(c.key));
    }
    return defaultCategories;
  }, [language, presetCategories]);

  // 使用的预设列表（转换为统一格式）
  const presets: GradientFillPreset[] = useMemo(() => {
    if (!customPresets) return GRADIENT_FILL_PRESETS;
    
    // 检查是否为 CSS 字符串数组
    if (customPresets.length > 0 && typeof customPresets[0] === 'string') {
      // CSS 字符串数组转换为 GradientFillPreset
      return (customPresets as string[]).map((css, index) => ({
        id: `custom-${index}`,
        name: `Custom ${index + 1}`,
        nameZh: `自定义 ${index + 1}`,
        category: 'custom',
        config: parseGradientCSSToConfig(css),
        css,
      }));
    }
    
    return customPresets as GradientFillPreset[];
  }, [customPresets]);

  // 获取当前径向渐变原点的激活状态
  const getActiveOrigin = useCallback(() => {
    if (gradient.type !== 'radial') return null;
    const { centerX, centerY } = gradient as RadialGradientConfig;
    return RADIAL_ORIGIN_PRESETS.find(
      (p) => Math.abs(p.x - centerX) < 0.01 && Math.abs(p.y - centerY) < 0.01
    )?.key;
  }, [gradient]);

  // 检查是否使用 CSS 字符串数组作为自定义预设
  const isCustomCSSPresets = useMemo(() => {
    return customPresets && customPresets.length > 0 && typeof customPresets[0] === 'string';
  }, [customPresets]);

  // 当前渐变的 CSS（用于比较选中态）
  const currentGradientCSS = useMemo(() => generateGradientCSS(gradient), [gradient]);

  // 判断预设是否被选中（通过比较 CSS 字符串）
  const isPresetSelected = useCallback((presetCSS: string) => {
    return currentGradientCSS === presetCSS;
  }, [currentGradientCSS]);

  // 渲染预设快捷选择（底部圆形预设）
  const renderQuickPresets = () => {
    // 预设列表：自定义预设（新保存的在前）+ 内置预设
    const builtinPresets = GRADIENT_FILL_PRESETS.slice(0, 10);
    const customPresetItems = isCustomCSSPresets ? presets : [];
    
    return (
      <div className="ge-quick-presets">
        <div className="ge-quick-presets-header">
          <span className="ge-quick-presets-title">
            {language === 'zh' ? '预设' : 'Presets'}
          </span>
        </div>
        <div className="ge-quick-presets-grid">
          {/* 自定义预设（放在最前面，支持删除） */}
          {customPresetItems.map((preset, index) => {
            const presetCSS = (preset as GradientFillPreset & { css?: string }).css || generateGradientCSS(preset.config);
            return (
              <button
                key={preset.id}
                className={classNames('ge-quick-preset-item ge-quick-preset-item--custom', {
                  'ge-quick-preset-item--selected': isPresetSelected(presetCSS),
                })}
                onClick={() => applyPreset(preset)}
                title={language === 'zh' ? preset.nameZh : preset.name}
              >
                <div
                  className="ge-quick-preset-preview"
                  style={{ background: presetCSS }}
                />
                {onDeletePreset && (
                  <button
                    className="ge-quick-preset-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeletePreset(index);
                    }}
                  >
                    ×
                  </button>
                )}
              </button>
            );
          })}
          {/* 内置预设 */}
          {builtinPresets.map((preset) => {
            const presetCSS = generateGradientCSS(preset.config);
            return (
              <button
                key={preset.id}
                className={classNames('ge-quick-preset-item', {
                  'ge-quick-preset-item--selected': isPresetSelected(presetCSS),
                })}
                onClick={() => applyPreset(preset)}
                title={language === 'zh' ? preset.nameZh : preset.name}
              >
                <div
                  className="ge-quick-preset-preview"
                  style={{ background: presetCSS }}
                />
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // 渲染自定义编辑器（主体部分）
  const renderCustomEditor = () => (
    <div className={classNames('ge-custom-editor', { 'ge-custom-editor--inline': inline })}>
      {/* 渐变类型切换 */}
      <div className="ge-type-section">
        <div className="ge-type-buttons">
          <button
            className={classNames('ge-type-btn', { active: gradient.type === 'linear' })}
            onClick={() => switchGradientType('linear')}
          >
            {language === 'zh' ? '线性' : 'Linear'}
          </button>
          <button
            className={classNames('ge-type-btn', { active: gradient.type === 'radial' })}
            onClick={() => switchGradientType('radial')}
          >
            {language === 'zh' ? '径向' : 'Radial'}
          </button>
        </div>
      </div>

      {/* 渐变颜色条和色标 */}
      <div className="ge-color-section">
        <div className="ge-section-header">
          <span className="ge-section-title">
            {language === 'zh' ? '颜色' : 'Colors'}
          </span>
          <div className="ge-stop-actions">
            <button
              className="ge-action-btn"
              onClick={addStop}
              disabled={gradient.stops.length >= 8}
              title={language === 'zh' ? '添加色标' : 'Add stop'}
            >
              +
            </button>
            <button
              className="ge-action-btn"
              onClick={() => removeStop(selectedStopIndex)}
              disabled={gradient.stops.length <= 2}
              title={language === 'zh' ? '删除色标' : 'Remove stop'}
            >
              −
            </button>
          </div>
        </div>

        {/* 渐变条与可拖拽色标 */}
        <div className="ge-gradient-bar-wrapper">
          {/* 渐变条 */}
          <div
            ref={gradientBarRef}
            className="ge-gradient-bar"
            style={{ background: `linear-gradient(90deg, ${gradient.stops.map((s) => `${s.color} ${Math.round(s.offset * 100)}%`).join(', ')})` }}
            onClick={handleBarClick}
          >
            {/* 所有色标（包括首尾） */}
            {gradient.stops.map((stop, index) => (
              <Popover
                key={index}
                open={activeColorPickerIndex === index}
                onOpenChange={(open) => setActiveColorPickerIndex(open ? index : null)}
              >
                <PopoverTrigger asChild>
                  <button
                    className={classNames('ge-stop-handle', {
                      selected: selectedStopIndex === index,
                    })}
                    style={{
                      left: `${stop.offset * 100}%`,
                      backgroundColor: stop.color,
                    }}
                    onMouseDown={(e) => {
                      handleStopMouseDown(e, index);
                    }}
                  />
                </PopoverTrigger>
                <PopoverContent>
                  <Island 
                    padding={4} 
                    className={"ge-color-picker-popover " + ATTACHED_ELEMENT_CLASS_NAME}
                  >
                    <UnifiedColorPicker
                      value={stop.color}
                      onChange={(color) => updateStop(index, { color })}
                      showAlpha={false}
                      showEyeDropper={true}
                      showPresets={true}
                      showRecentColors={true}
                      showHexInput={true}
                    />
                  </Island>
                </PopoverContent>
              </Popover>
            ))}
          </div>
        </div>
      </div>

      {/* 径向渐变原点选择 */}
      {gradient.type === 'radial' && (
        <div className="ge-origin-section">
          <span className="ge-section-title">
            {language === 'zh' ? '原点' : 'Origin'}
          </span>
          <div className="ge-origin-buttons">
            {RADIAL_ORIGIN_PRESETS.map((preset) => (
              <button
                key={preset.key}
                className={classNames('ge-origin-btn', {
                  active: getActiveOrigin() === preset.key,
                })}
                onClick={() =>
                  updateGradient({ centerX: preset.x, centerY: preset.y })
                }
              >
                {language === 'zh' ? preset.labelZh : preset.labelEn}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 线性渐变角度控制 */}
      {gradient.type === 'linear' && (
        <div className="ge-angle-section">
          <div className="ge-section-header">
            <span className="ge-section-title">
              {language === 'zh' ? '角度' : 'Angle'}
            </span>
            <span className="ge-angle-value">
              {(gradient as LinearGradientConfig).angle}°
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={360}
            value={(gradient as LinearGradientConfig).angle}
            onChange={(e) => updateGradient({ angle: Number(e.target.value) })}
            className="ge-angle-slider"
          />
        </div>
      )}

      {/* 保存当前渐变配置按钮 */}
      {onSavePreset && (
        <div className="ge-save-section">
          <button className="ge-save-btn" onClick={onSavePreset}>
            {language === 'zh' ? '保存' : 'Save'}
          </button>
        </div>
      )}

      {/* 快捷预设 */}
      {renderQuickPresets()}
    </div>
  );

  // 紧凑模式或内联模式：只显示自定义编辑器
  if (compact || inline) {
    return (
      <div
        className={classNames('gradient-editor', {
          'gradient-editor--compact': compact,
          'gradient-editor--inline': inline,
        })}
      >
        {renderCustomEditor()}
      </div>
    );
  }

  return (
    <div className="gradient-editor">
      {renderCustomEditor()}
    </div>
  );
};

export default GradientEditor;
