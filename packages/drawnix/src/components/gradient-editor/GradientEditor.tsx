/**
 * 公共渐变编辑器组件
 * Common Gradient Editor Component
 * 
 * 用于填充面板和文字渐变的统一渐变配置组件
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import classNames from 'classnames';
import { useI18n } from '../../i18n';
import { useColorHistory } from '../../hooks/useColorHistory';
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
  /** 自定义预设列表 */
  customPresets?: GradientFillPreset[];
  /** 紧凑模式（隐藏标签页，只显示自定义编辑器） */
  compact?: boolean;
}

type GradientTab = 'presets' | 'custom' | 'history';

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

export const GradientEditor: React.FC<GradientEditorProps> = ({
  value,
  onChange,
  showPresets = true,
  showHistory = true,
  presetCategories,
  customPresets,
  compact = false,
}) => {
  const { language } = useI18n();
  const { gradients: historyGradients, addGradient: saveToHistory } = useColorHistory();
  
  const [activeTab, setActiveTab] = useState<GradientTab>(showPresets ? 'presets' : 'custom');
  const [gradient, setGradient] = useState<GradientFillConfig>(
    value || DEFAULT_LINEAR_GRADIENT
  );
  const [selectedStopIndex, setSelectedStopIndex] = useState(0);

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
      updateGradient({ stops: newStops });
    },
    [gradient.stops, updateGradient]
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

  // 使用的预设列表
  const presets = customPresets || GRADIENT_FILL_PRESETS;

  // 渲染预设面板
  const renderPresetsPanel = () => (
    <div className="ge-presets-panel">
      {categories.map(({ key, label }) => {
        const categoryPresets = presets.filter((p) => p.category === key);
        if (categoryPresets.length === 0) return null;

        return (
          <div key={key} className="ge-preset-category">
            <div className="ge-category-title">{label}</div>
            <div className="ge-preset-grid">
              {categoryPresets.map((preset) => (
                <button
                  key={preset.id}
                  className="ge-preset-item"
                  onClick={() => applyPreset(preset)}
                  title={language === 'zh' ? preset.nameZh : preset.name}
                >
                  <div
                    className="ge-preset-preview"
                    style={{ background: generateGradientCSS(preset.config) }}
                  />
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  // 渲染历史记录面板
  const renderHistoryPanel = () => (
    <div className="ge-history-panel">
      {historyGradients.length === 0 ? (
        <div className="ge-history-empty">
          {language === 'zh' ? '暂无历史记录' : 'No history yet'}
        </div>
      ) : (
        <div className="ge-history-grid">
          {historyGradients.map((item) => (
            <button
              key={item.id}
              className="ge-history-item"
              onClick={() => applyGradient(item.config)}
            >
              <div
                className="ge-history-preview"
                style={{ background: generateGradientCSS(item.config) }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );

  // 渲染自定义编辑器
  const renderCustomEditor = () => (
    <div className="ge-custom-editor">
      {/* 渐变类型 */}
      <div className="ge-control-section">
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

      {/* 渐变预览和色标 */}
      <div className="ge-control-section">
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

        {/* 渐变条与色标 */}
        <div className="ge-gradient-bar-container">
          <div className="ge-gradient-bar" style={{ background: previewCSS }} />
          <div className="ge-stops-track">
            {gradient.stops.map((stop, index) => (
              <button
                key={index}
                className={classNames('ge-stop-handle', {
                  selected: selectedStopIndex === index,
                })}
                style={{
                  left: `${stop.offset * 100}%`,
                  backgroundColor: stop.color,
                }}
                onClick={() => setSelectedStopIndex(index)}
              />
            ))}
          </div>
        </div>

        {/* 选中色标的编辑 */}
        {gradient.stops[selectedStopIndex] && (
          <div className="ge-stop-editor">
            <div className="ge-stop-color">
              <input
                type="color"
                value={gradient.stops[selectedStopIndex].color}
                onChange={(e) => updateStop(selectedStopIndex, { color: e.target.value })}
                className="ge-color-input"
              />
              <span className="ge-color-value">
                {gradient.stops[selectedStopIndex].color.toUpperCase()}
              </span>
            </div>
            <div className="ge-stop-position">
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(gradient.stops[selectedStopIndex].offset * 100)}
                onChange={(e) =>
                  updateStop(selectedStopIndex, { offset: Number(e.target.value) / 100 })
                }
                className="ge-position-slider"
              />
            </div>
          </div>
        )}
      </div>

      {/* 角度控制 (仅线性渐变) */}
      {gradient.type === 'linear' && (
        <div className="ge-control-section">
          <div className="ge-section-header">
            <span className="ge-section-title">
              {language === 'zh' ? '旋转' : 'Rotation'}
            </span>
            <div className="ge-angle-input-wrapper">
              <input
                type="number"
                min={0}
                max={360}
                value={(gradient as LinearGradientConfig).angle}
                onChange={(e) => updateGradient({ angle: Number(e.target.value) })}
                className="ge-angle-input"
              />
            </div>
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

      {/* 中心点控制 (仅径向渐变) */}
      {gradient.type === 'radial' && (
        <div className="ge-control-section">
          <div className="ge-section-title">
            {language === 'zh' ? '中心点' : 'Center'}
          </div>
          <div className="ge-center-controls">
            <div className="ge-center-control">
              <label>X</label>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round((gradient as RadialGradientConfig).centerX * 100)}
                onChange={(e) =>
                  updateGradient({ centerX: Number(e.target.value) / 100 })
                }
                className="ge-center-slider"
              />
              <span className="ge-center-value">
                {Math.round((gradient as RadialGradientConfig).centerX * 100)}%
              </span>
            </div>
            <div className="ge-center-control">
              <label>Y</label>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round((gradient as RadialGradientConfig).centerY * 100)}
                onChange={(e) =>
                  updateGradient({ centerY: Number(e.target.value) / 100 })
                }
                className="ge-center-slider"
              />
              <span className="ge-center-value">
                {Math.round((gradient as RadialGradientConfig).centerY * 100)}%
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // 紧凑模式：只显示自定义编辑器
  if (compact) {
    return (
      <div className="gradient-editor gradient-editor--compact">
        {renderCustomEditor()}
      </div>
    );
  }

  // 计算显示的 tabs
  const tabs: { value: GradientTab; label: string }[] = [];
  if (showPresets) {
    tabs.push({ value: 'presets', label: language === 'zh' ? '预设' : 'Presets' });
  }
  tabs.push({ value: 'custom', label: language === 'zh' ? '自定义' : 'Custom' });
  if (showHistory && historyGradients.length > 0) {
    tabs.push({ value: 'history', label: language === 'zh' ? '历史' : 'History' });
  }

  return (
    <div className="gradient-editor">
      {tabs.length > 1 && (
        <div className="ge-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              className={classNames('ge-tab', { active: activeTab === tab.value })}
              onClick={() => setActiveTab(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
      <div className="ge-content">
        {activeTab === 'presets' && renderPresetsPanel()}
        {activeTab === 'custom' && renderCustomEditor()}
        {activeTab === 'history' && renderHistoryPanel()}
      </div>
    </div>
  );
};

export default GradientEditor;
