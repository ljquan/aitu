/**
 * 渐变选择器按钮组件
 * Gradient Picker Button Component
 */

import React, { useState, useCallback } from 'react';
import classNames from 'classnames';
import { ToolButton } from '../../tool-button';
import { Popover, PopoverContent, PopoverTrigger } from '../../popover/popover';
import { Island } from '../../island';
import { ATTACHED_ELEMENT_CLASS_NAME, PlaitBoard } from '@plait/core';
import { useI18n } from '../../../i18n';
import { GRADIENT_PRESETS } from '../../../constants/text-effects';
import type { GradientConfig, GradientStop, GradientTarget } from '../../../types/text-effects.types';
import { generateGradientCSS } from '../../../utils/text-effects-utils';
import { setTextGradient } from '../../../transforms/property';
import { GradientIcon } from '../../icons';
import './gradient-picker-button.scss';

export interface PopupGradientPickerButtonProps {
  board: PlaitBoard;
  currentGradient?: GradientConfig;
  title: string;
  onGradientChange?: (gradient: GradientConfig) => void;
}

type GradientTab = 'presets' | 'custom';

const DEFAULT_GRADIENT: GradientConfig = {
  type: 'linear',
  angle: 135,
  stops: [
    { color: '#FFD700', position: 0 },
    { color: '#FFA500', position: 100 },
  ],
  target: 'text',
};

export const PopupGradientPickerButton: React.FC<PopupGradientPickerButtonProps> = ({
  board,
  currentGradient,
  title,
  onGradientChange,
}) => {
  const { language } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<GradientTab>('presets');
  const [gradient, setGradient] = useState<GradientConfig>(currentGradient || DEFAULT_GRADIENT);
  const [selectedStopIndex, setSelectedStopIndex] = useState(0);

  const container = PlaitBoard.getBoardContainer(board);

  // 应用渐变
  const applyGradient = useCallback((config: GradientConfig) => {
    setGradient(config);
    
    // 应用渐变到选中的文本
    const gradientCSS = generateGradientCSS(config);
    setTextGradient(board, gradientCSS);
    
    onGradientChange?.(config);
  }, [board, onGradientChange]);

  // 应用预设
  const applyPreset = useCallback((preset: typeof GRADIENT_PRESETS[0]) => {
    const config = { ...preset.config, target: gradient.target };
    applyGradient(config);
  }, [gradient.target, applyGradient]);

  // 更新渐变属性
  const updateGradient = useCallback((updates: Partial<GradientConfig>) => {
    const newGradient = { ...gradient, ...updates };
    applyGradient(newGradient);
  }, [gradient, applyGradient]);

  // 更新色标
  const updateStop = useCallback((index: number, updates: Partial<GradientStop>) => {
    const newStops = [...gradient.stops];
    newStops[index] = { ...newStops[index], ...updates };
    updateGradient({ stops: newStops });
  }, [gradient.stops, updateGradient]);

  // 添加色标
  const addStop = useCallback(() => {
    if (gradient.stops.length >= 8) return;
    
    const newPosition = 50;
    const newColor = '#888888';
    const newStops = [...gradient.stops, { color: newColor, position: newPosition }]
      .sort((a, b) => a.position - b.position);
    
    updateGradient({ stops: newStops });
    setSelectedStopIndex(newStops.findIndex(s => s.position === newPosition));
  }, [gradient.stops, updateGradient]);

  // 删除色标
  const removeStop = useCallback((index: number) => {
    if (gradient.stops.length <= 2) return;
    
    const newStops = gradient.stops.filter((_, i) => i !== index);
    updateGradient({ stops: newStops });
    setSelectedStopIndex(Math.min(selectedStopIndex, newStops.length - 1));
  }, [gradient.stops, selectedStopIndex, updateGradient]);

  // 渲染预设面板
  const renderPresetsPanel = () => {
    const categories = [
      { key: 'festival', label: language === 'zh' ? '节日' : 'Festival' },
      { key: 'metal', label: language === 'zh' ? '金属' : 'Metal' },
      { key: 'nature', label: language === 'zh' ? '自然' : 'Nature' },
    ];

    return (
      <div className="presets-panel">
        {categories.map(({ key, label }) => (
          <div key={key} className="preset-category">
            <div className="category-title">{label}</div>
            <div className="preset-grid">
              {GRADIENT_PRESETS.filter(p => p.category === key).map((preset) => (
                <button
                  key={preset.id}
                  className="preset-item"
                  onClick={() => applyPreset(preset)}
                  title={language === 'zh' ? preset.nameZh : preset.name}
                >
                  <div
                    className="preset-preview"
                    style={{ background: generateGradientCSS(preset.config) }}
                  />
                  <span className="preset-name">
                    {language === 'zh' ? preset.nameZh : preset.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // 渲染自定义编辑器
  const renderCustomEditor = () => (
    <div className="custom-editor">
      {/* 渐变预览 */}
      <div className="gradient-preview-section">
        <div
          className="gradient-preview"
          style={{ background: generateGradientCSS(gradient) }}
        />
      </div>

      {/* 渐变类型 */}
      <div className="control-section">
        <div className="section-title">{language === 'zh' ? '渐变类型' : 'Type'}</div>
        <div className="type-buttons">
          <button
            className={classNames('type-btn', { active: gradient.type === 'linear' })}
            onClick={() => updateGradient({ type: 'linear' })}
          >
            {language === 'zh' ? '线性' : 'Linear'}
          </button>
          <button
            className={classNames('type-btn', { active: gradient.type === 'radial' })}
            onClick={() => updateGradient({ type: 'radial' })}
          >
            {language === 'zh' ? '径向' : 'Radial'}
          </button>
        </div>
      </div>

      {/* 角度控制 (仅线性渐变) */}
      {gradient.type === 'linear' && (
        <div className="control-section">
          <div className="section-header">
            <span className="section-title">{language === 'zh' ? '角度' : 'Angle'}</span>
            <span className="section-value">{gradient.angle}°</span>
          </div>
          <input
            type="range"
            min={0}
            max={360}
            value={gradient.angle}
            onChange={(e) => updateGradient({ angle: Number(e.target.value) })}
            className="angle-slider"
          />
          <div className="angle-presets">
            {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
              <button
                key={angle}
                className={classNames('angle-preset', { active: gradient.angle === angle })}
                onClick={() => updateGradient({ angle })}
              >
                {angle}°
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 应用目标 */}
      <div className="control-section">
        <div className="section-title">{language === 'zh' ? '应用到' : 'Apply to'}</div>
        <div className="target-buttons">
          {(['text', 'fill', 'stroke'] as GradientTarget[]).map((target) => (
            <button
              key={target}
              className={classNames('target-btn', { active: gradient.target === target })}
              onClick={() => updateGradient({ target })}
            >
              {target === 'text' && (language === 'zh' ? '文字' : 'Text')}
              {target === 'fill' && (language === 'zh' ? '填充' : 'Fill')}
              {target === 'stroke' && (language === 'zh' ? '描边' : 'Stroke')}
            </button>
          ))}
        </div>
      </div>

      {/* 色标编辑器 */}
      <div className="control-section">
        <div className="section-header">
          <span className="section-title">{language === 'zh' ? '色标' : 'Color Stops'}</span>
          <button
            className="add-stop-btn"
            onClick={addStop}
            disabled={gradient.stops.length >= 8}
          >
            +
          </button>
        </div>
        
        {/* 渐变条与色标 */}
        <div className="gradient-bar-container">
          <div
            className="gradient-bar"
            style={{ background: generateGradientCSS({ ...gradient, angle: 90 }) }}
          />
          <div className="stops-track">
            {gradient.stops.map((stop, index) => (
              <button
                key={index}
                className={classNames('stop-handle', { selected: selectedStopIndex === index })}
                style={{
                  left: `${stop.position}%`,
                  backgroundColor: stop.color,
                }}
                onClick={() => setSelectedStopIndex(index)}
              />
            ))}
          </div>
        </div>

        {/* 选中色标的编辑 */}
        {gradient.stops[selectedStopIndex] && (
          <div className="stop-editor">
            <div className="stop-color">
              <input
                type="color"
                value={gradient.stops[selectedStopIndex].color}
                onChange={(e) => updateStop(selectedStopIndex, { color: e.target.value })}
                className="color-input"
              />
              <span className="color-value">{gradient.stops[selectedStopIndex].color}</span>
            </div>
            <div className="stop-position">
              <input
                type="range"
                min={0}
                max={100}
                value={gradient.stops[selectedStopIndex].position}
                onChange={(e) => updateStop(selectedStopIndex, { position: Number(e.target.value) })}
                className="position-slider"
              />
              <span className="position-value">{gradient.stops[selectedStopIndex].position}%</span>
            </div>
            {gradient.stops.length > 2 && (
              <button
                className="remove-stop-btn"
                onClick={() => removeStop(selectedStopIndex)}
              >
                ×
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Popover
      sideOffset={12}
      open={isOpen}
      onOpenChange={setIsOpen}
      placement="top"
    >
      <PopoverTrigger asChild>
        <ToolButton
          className={classNames('property-button', 'gradient-picker-button')}
          selected={isOpen}
          visible={true}
          icon={<GradientIcon />}
          type="button"
          title={title}
          aria-label={title}
          onPointerUp={() => setIsOpen(!isOpen)}
        />
      </PopoverTrigger>
      <PopoverContent container={container}>
        <Island padding={4} className={classNames(ATTACHED_ELEMENT_CLASS_NAME, 'gradient-picker-panel')}>
          <div className="gradient-tabs">
            <button
              className={classNames('gradient-tab', { active: activeTab === 'presets' })}
              onClick={() => setActiveTab('presets')}
            >
              {language === 'zh' ? '预设' : 'Presets'}
            </button>
            <button
              className={classNames('gradient-tab', { active: activeTab === 'custom' })}
              onClick={() => setActiveTab('custom')}
            >
              {language === 'zh' ? '自定义' : 'Custom'}
            </button>
          </div>
          <div className="gradient-content">
            {activeTab === 'presets' && renderPresetsPanel()}
            {activeTab === 'custom' && renderCustomEditor()}
          </div>
        </Island>
      </PopoverContent>
    </Popover>
  );
};

export default PopupGradientPickerButton;
