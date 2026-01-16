/**
 * 填充面板组件 - 整合纯色、渐变、图片三种填充模式
 * Fill Panel Component - Integrates solid, gradient, and image fill modes
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import classNames from 'classnames';
import { useI18n } from '../../i18n';
import { UnifiedColorPicker } from '../unified-color-picker';
import { GradientFillPanel } from './GradientFillPanel';
import { ImageFillPanel } from './ImageFillPanel';
import type {
  FillConfig,
  FillType,
  GradientFillConfig,
  ImageFillConfig,
} from '../../types/fill.types';
import {
  DEFAULT_LINEAR_GRADIENT,
  DEFAULT_IMAGE_FILL,
  isSolidFill,
  isFillConfig,
  stringToFillConfig,
} from '../../types/fill.types';
import './fill-panel.scss';

export interface FillPanelProps {
  /** 当前填充配置（支持旧的 string 格式和新的 FillConfig 格式） */
  value?: string | FillConfig;
  /** 纯色变更回调 */
  onSolidChange?: (color: string) => void;
  /** 透明度变更回调 */
  onOpacityChange?: (opacity: number) => void;
  /** 渐变变更回调 */
  onGradientChange?: (config: GradientFillConfig) => void;
  /** 图片填充变更回调 */
  onImageChange?: (config: ImageFillConfig) => void;
  /** 填充类型变更回调 */
  onFillTypeChange?: (type: FillType) => void;
  /** 是否显示关闭按钮 */
  showClose?: boolean;
  /** 关闭回调 */
  onClose?: () => void;
  /** 请求打开素材库的回调（用于将 Modal 渲染到 Popover 外部） */
  onOpenMediaLibrary?: () => void;
}

type TabType = 'solid' | 'gradient' | 'image';

const TABS: { value: TabType; labelZh: string; labelEn: string }[] = [
  { value: 'solid', labelZh: '纯色', labelEn: 'Solid' },
  { value: 'gradient', labelZh: '渐变', labelEn: 'Gradient' },
  { value: 'image', labelZh: '图片', labelEn: 'Image' },
];

export const FillPanel: React.FC<FillPanelProps> = ({
  value,
  onSolidChange,
  onOpacityChange,
  onGradientChange,
  onImageChange,
  onFillTypeChange,
  showClose = false,
  onClose,
  onOpenMediaLibrary,
}) => {
  const { language } = useI18n();

  // 解析当前值
  const currentConfig = useMemo((): FillConfig => {
    if (!value) {
      return { type: 'solid', solid: { color: '#FFFFFF' } };
    }
    if (isSolidFill(value)) {
      return stringToFillConfig(value);
    }
    if (isFillConfig(value)) {
      return value;
    }
    return { type: 'solid', solid: { color: '#FFFFFF' } };
  }, [value]);

  // 当前标签页
  const [activeTab, setActiveTab] = useState<TabType>(currentConfig.type);

  // 同步外部值变化到标签页状态
  useEffect(() => {
    setActiveTab(currentConfig.type);
  }, [currentConfig.type]);

  // 内部状态 - 保存每种类型的配置
  const [gradientConfig, setGradientConfig] = useState<GradientFillConfig>(
    currentConfig.gradient || DEFAULT_LINEAR_GRADIENT
  );
  const [imageConfig, setImageConfig] = useState<ImageFillConfig>(
    currentConfig.image || DEFAULT_IMAGE_FILL
  );

  // 同步外部值变化到渐变和图片配置状态
  useEffect(() => {
    if (currentConfig.gradient) {
      setGradientConfig(currentConfig.gradient);
    }
  }, [currentConfig.gradient]);

  useEffect(() => {
    if (currentConfig.image) {
      setImageConfig(currentConfig.image);
    }
  }, [currentConfig.image]);

  // 切换标签
  const handleTabChange = useCallback(
    (tab: TabType) => {
      setActiveTab(tab);
      onFillTypeChange?.(tab);
    },
    [onFillTypeChange]
  );

  // 处理纯色变更
  const handleSolidChange = useCallback(
    (color: string) => {
      onSolidChange?.(color);
    },
    [onSolidChange]
  );

  // 处理渐变变更
  const handleGradientChange = useCallback(
    (config: GradientFillConfig) => {
      setGradientConfig(config);
      onGradientChange?.(config);
    },
    [onGradientChange]
  );

  // 处理图片填充变更
  const handleImageChange = useCallback(
    (config: ImageFillConfig) => {
      setImageConfig(config);
      onImageChange?.(config);
    },
    [onImageChange]
  );

  // 获取纯色值
  const solidColor = useMemo(() => {
    if (isSolidFill(value)) return value;
    if (isFillConfig(value) && value.solid) return value.solid.color;
    return '#FFFFFF';
  }, [value]);

  return (
    <div className="fill-panel">
      {/* 头部 */}
      <div className="fill-panel__header">
        <span className="fill-panel__title">
          {language === 'zh' ? '填充' : 'Fill'}
        </span>
        {showClose && (
          <button className="fill-panel__close" onClick={onClose}>
            ×
          </button>
        )}
      </div>

      {/* 标签页 */}
      <div className="fill-panel__tabs">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            className={classNames('fill-panel__tab', { active: activeTab === tab.value })}
            onClick={() => handleTabChange(tab.value)}
          >
            {language === 'zh' ? tab.labelZh : tab.labelEn}
          </button>
        ))}
      </div>

      {/* 内容区域 */}
      <div className="fill-panel__content">
        {activeTab === 'solid' && (
          <div className="fill-panel__solid">
            <UnifiedColorPicker
              value={solidColor}
              onChange={handleSolidChange}
              onOpacityChange={onOpacityChange}
            />
          </div>
        )}

        {activeTab === 'gradient' && (
          <GradientFillPanel value={gradientConfig} onChange={handleGradientChange} />
        )}

        {activeTab === 'image' && (
          <ImageFillPanel 
            value={imageConfig} 
            onChange={handleImageChange}
            onOpenMediaLibrary={onOpenMediaLibrary}
            externalMediaLibraryControl={!!onOpenMediaLibrary}
          />
        )}
      </div>
    </div>
  );
};

export default FillPanel;
