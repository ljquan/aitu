/**
 * 渐变填充面板组件
 * Gradient Fill Panel Component
 */

import React, { useState, useCallback, useMemo } from 'react';
import classNames from 'classnames';
import { useI18n } from '../../i18n';
import type {
  GradientFillConfig,
  GradientFillStop,
  LinearGradientConfig,
  RadialGradientConfig,
  GradientFillPreset,
} from '../../types/fill.types';
import {
  DEFAULT_LINEAR_GRADIENT,
  DEFAULT_RADIAL_GRADIENT,
  GRADIENT_FILL_PRESETS,
} from '../../types/fill.types';
import './gradient-fill-panel.scss';

export interface GradientFillPanelProps {
  value?: GradientFillConfig;
  onChange?: (config: GradientFillConfig) => void;
}

type GradientTab = 'presets' | 'custom';

/**
 * 生成渐变 CSS
 */
function generateGradientCSS(config: GradientFillConfig): string {
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

export const GradientFillPanel: React.FC<GradientFillPanelProps> = ({
  value,
  onChange,
}) => {
  const { language } = useI18n();
  const [activeTab, setActiveTab] = useState<GradientTab>('presets');
  const [gradient, setGradient] = useState<GradientFillConfig>(
    value || DEFAULT_LINEAR_GRADIENT
  );
  const [selectedStopIndex, setSelectedStopIndex] = useState(0);

  // 应用渐变
  const applyGradient = useCallback(
    (config: GradientFillConfig) => {
      setGradient(config);
      onChange?.(config);
    },
    [onChange]
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
  const presetCategories = useMemo(
    () => [
      { key: 'basic', label: language === 'zh' ? '基础' : 'Basic' },
      { key: 'colorful', label: language === 'zh' ? '多彩' : 'Colorful' },
      { key: 'sunset', label: language === 'zh' ? '日落' : 'Sunset' },
      { key: 'nature', label: language === 'zh' ? '自然' : 'Nature' },
      { key: 'metal', label: language === 'zh' ? '金属' : 'Metal' },
    ],
    [language]
  );

  // 渲染预设面板
  const renderPresetsPanel = () => (
    <div className="gfp-presets-panel">
      {presetCategories.map(({ key, label }) => {
        const presets = GRADIENT_FILL_PRESETS.filter((p) => p.category === key);
        if (presets.length === 0) return null;

        return (
          <div key={key} className="gfp-preset-category">
            <div className="gfp-category-title">{label}</div>
            <div className="gfp-preset-grid">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  className="gfp-preset-item"
                  onClick={() => applyPreset(preset)}
                  title={language === 'zh' ? preset.nameZh : preset.name}
                >
                  <div
                    className="gfp-preset-preview"
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

  // 渲染自定义编辑器
  const renderCustomEditor = () => (
    <div className="gfp-custom-editor">
      {/* 渐变类型 */}
      <div className="gfp-control-section">
        <div className="gfp-type-buttons">
          <button
            className={classNames('gfp-type-btn', { active: gradient.type === 'linear' })}
            onClick={() => switchGradientType('linear')}
          >
            {language === 'zh' ? '线性' : 'Linear'}
          </button>
          <button
            className={classNames('gfp-type-btn', { active: gradient.type === 'radial' })}
            onClick={() => switchGradientType('radial')}
          >
            {language === 'zh' ? '径向' : 'Radial'}
          </button>
        </div>
      </div>

      {/* 渐变预览和色标 */}
      <div className="gfp-control-section">
        <div className="gfp-section-header">
          <span className="gfp-section-title">
            {language === 'zh' ? '颜色' : 'Colors'}
          </span>
          <div className="gfp-stop-actions">
            <button
              className="gfp-action-btn"
              onClick={addStop}
              disabled={gradient.stops.length >= 8}
              title={language === 'zh' ? '添加色标' : 'Add stop'}
            >
              +
            </button>
            <button
              className="gfp-action-btn"
              onClick={() => removeStop(selectedStopIndex)}
              disabled={gradient.stops.length <= 2}
              title={language === 'zh' ? '删除色标' : 'Remove stop'}
            >
              −
            </button>
          </div>
        </div>

        {/* 渐变条与色标 */}
        <div className="gfp-gradient-bar-container">
          <div className="gfp-gradient-bar" style={{ background: previewCSS }} />
          <div className="gfp-stops-track">
            {gradient.stops.map((stop, index) => (
              <button
                key={index}
                className={classNames('gfp-stop-handle', {
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
          <div className="gfp-stop-editor">
            <div className="gfp-stop-color">
              <input
                type="color"
                value={gradient.stops[selectedStopIndex].color}
                onChange={(e) => updateStop(selectedStopIndex, { color: e.target.value })}
                className="gfp-color-input"
              />
              <span className="gfp-color-value">
                {gradient.stops[selectedStopIndex].color.toUpperCase()}
              </span>
            </div>
            <div className="gfp-stop-position">
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(gradient.stops[selectedStopIndex].offset * 100)}
                onChange={(e) =>
                  updateStop(selectedStopIndex, { offset: Number(e.target.value) / 100 })
                }
                className="gfp-position-slider"
              />
            </div>
          </div>
        )}
      </div>

      {/* 角度控制 (仅线性渐变) */}
      {gradient.type === 'linear' && (
        <div className="gfp-control-section">
          <div className="gfp-section-header">
            <span className="gfp-section-title">
              {language === 'zh' ? '旋转' : 'Rotation'}
            </span>
            <div className="gfp-angle-input-wrapper">
              <input
                type="number"
                min={0}
                max={360}
                value={(gradient as LinearGradientConfig).angle}
                onChange={(e) => updateGradient({ angle: Number(e.target.value) })}
                className="gfp-angle-input"
              />
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={360}
            value={(gradient as LinearGradientConfig).angle}
            onChange={(e) => updateGradient({ angle: Number(e.target.value) })}
            className="gfp-angle-slider"
          />
        </div>
      )}

      {/* 中心点控制 (仅径向渐变) */}
      {gradient.type === 'radial' && (
        <div className="gfp-control-section">
          <div className="gfp-section-title">
            {language === 'zh' ? '中心点' : 'Center'}
          </div>
          <div className="gfp-center-controls">
            <div className="gfp-center-control">
              <label>X</label>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round((gradient as RadialGradientConfig).centerX * 100)}
                onChange={(e) =>
                  updateGradient({ centerX: Number(e.target.value) / 100 })
                }
                className="gfp-center-slider"
              />
              <span className="gfp-center-value">
                {Math.round((gradient as RadialGradientConfig).centerX * 100)}%
              </span>
            </div>
            <div className="gfp-center-control">
              <label>Y</label>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round((gradient as RadialGradientConfig).centerY * 100)}
                onChange={(e) =>
                  updateGradient({ centerY: Number(e.target.value) / 100 })
                }
                className="gfp-center-slider"
              />
              <span className="gfp-center-value">
                {Math.round((gradient as RadialGradientConfig).centerY * 100)}%
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="gradient-fill-panel">
      <div className="gfp-tabs">
        <button
          className={classNames('gfp-tab', { active: activeTab === 'presets' })}
          onClick={() => setActiveTab('presets')}
        >
          {language === 'zh' ? '预设' : 'Presets'}
        </button>
        <button
          className={classNames('gfp-tab', { active: activeTab === 'custom' })}
          onClick={() => setActiveTab('custom')}
        >
          {language === 'zh' ? '自定义' : 'Custom'}
        </button>
      </div>
      <div className="gfp-content">
        {activeTab === 'presets' && renderPresetsPanel()}
        {activeTab === 'custom' && renderCustomEditor()}
      </div>
    </div>
  );
};

export default GradientFillPanel;
