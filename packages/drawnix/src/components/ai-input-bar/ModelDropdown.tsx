/**
 * 模型下拉选择器组件
 *
 * 显示在 AI 输入框左下角，以 @shortCode 形式显示当前模型
 * 点击后弹出模型列表供选择
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Check } from 'lucide-react';
import {
  IMAGE_MODELS,
  getModelConfig,
} from '../../constants/model-config';
import './model-dropdown.scss';

export interface ModelDropdownProps {
  /** 当前选中的模型 ID */
  selectedModel: string;
  /** 选择模型回调 */
  onSelect: (modelId: string) => void;
  /** 语言 */
  language?: 'zh' | 'en';
}

/**
 * 模型下拉选择器
 */
export const ModelDropdown: React.FC<ModelDropdownProps> = ({
  selectedModel,
  onSelect,
  language = 'zh',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 获取当前模型配置
  const currentModel = getModelConfig(selectedModel);
  // 使用 shortCode 或默认简写
  const shortCode = currentModel?.shortCode || 'img';

  // 点击外部关闭下拉菜单
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // ESC 键关闭
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // 切换下拉菜单
  const handleToggle = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  // 选择模型
  const handleSelect = useCallback((modelId: string) => {
    onSelect(modelId);
    setIsOpen(false);
  }, [onSelect]);

  return (
    <div className="model-dropdown" ref={containerRef}>
      {/* 触发按钮 - 显示 @shortCode */}
      <button
        className={`model-dropdown__trigger ${isOpen ? 'model-dropdown__trigger--open' : ''}`}
        onClick={handleToggle}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        title={currentModel?.shortLabel || currentModel?.label || selectedModel}
      >
        <span className="model-dropdown__at">@</span>
        <span className="model-dropdown__code">{shortCode}</span>
      </button>

      {/* 下拉菜单 */}
      {isOpen && (
        <div
          className="model-dropdown__menu"
          ref={dropdownRef}
          role="listbox"
          aria-label={language === 'zh' ? '选择模型' : 'Select Model'}
        >
          <div className="model-dropdown__header">
            {language === 'zh' ? '选择图片模型' : 'Select Image Model'}
          </div>
          <div className="model-dropdown__list">
            {IMAGE_MODELS.map((model) => {
              const isSelected = model.id === selectedModel;
              return (
                <div
                  key={model.id}
                  className={`model-dropdown__item ${isSelected ? 'model-dropdown__item--selected' : ''}`}
                  onClick={() => handleSelect(model.id)}
                  role="option"
                  aria-selected={isSelected}
                >
                  <div className="model-dropdown__item-content">
                    <div className="model-dropdown__item-name">
                      <span className="model-dropdown__item-code">@{model.shortCode}</span>
                      <span className="model-dropdown__item-label">
                        {model.shortLabel || model.label}
                      </span>
                      {model.isVip && (
                        <span className="model-dropdown__item-vip">VIP</span>
                      )}
                    </div>
                    {model.description && (
                      <div className="model-dropdown__item-desc">
                        {model.description}
                      </div>
                    )}
                  </div>
                  {isSelected && (
                    <Check size={16} className="model-dropdown__item-check" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ModelDropdown;
