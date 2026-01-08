/**
 * 尺寸下拉选择器组件
 *
 * 显示在 AI 输入框底部栏，在 ModelDropdown 右侧
 * 根据当前选中的模型动态显示可用的尺寸选项
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import {
  getSizeOptionsForModel,
  getDefaultSizeForModel,
} from '../../constants/model-config';
import './size-dropdown.scss';

export interface SizeDropdownProps {
  /** 当前选中的尺寸 */
  selectedSize: string;
  /** 选择尺寸回调 */
  onSelect: (size: string) => void;
  /** 当前选中的模型 ID */
  modelId: string;
  /** 语言 */
  language?: 'zh' | 'en';
}

/**
 * 尺寸下拉选择器
 */
export const SizeDropdown: React.FC<SizeDropdownProps> = ({
  selectedSize,
  onSelect,
  modelId,
  language = 'zh',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 根据模型获取可用的尺寸选项
  const sizeOptions = useMemo(() => {
    return getSizeOptionsForModel(modelId);
  }, [modelId]);

  // 当模型切换时，检查当前尺寸是否仍然有效
  useEffect(() => {
    if (sizeOptions.length === 0) return;

    const isCurrentSizeValid = sizeOptions.some(opt => opt.value === selectedSize);
    if (!isCurrentSizeValid) {
      // 当前尺寸不在新选项中，重置为默认值
      const defaultSize = getDefaultSizeForModel(modelId);
      onSelect(defaultSize);
    }
  }, [modelId, sizeOptions, selectedSize, onSelect]);

  // 获取当前选中尺寸的显示标签
  const currentLabel = useMemo(() => {
    const option = sizeOptions.find(opt => opt.value === selectedSize);
    return option?.label || selectedSize;
  }, [sizeOptions, selectedSize]);

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

  // 选择尺寸
  const handleSelect = useCallback((size: string) => {
    onSelect(size);
    setIsOpen(false);
  }, [onSelect]);

  // 如果没有可用选项，不渲染
  if (sizeOptions.length === 0) {
    return null;
  }

  return (
    <div className="size-dropdown" ref={containerRef}>
      {/* 触发按钮 */}
      <button
        className={`size-dropdown__trigger ${isOpen ? 'size-dropdown__trigger--open' : ''}`}
        onClick={handleToggle}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        title={language === 'zh' ? '选择尺寸' : 'Select Size'}
      >
        <span className="size-dropdown__label">{currentLabel}</span>
        <ChevronDown size={14} className="size-dropdown__icon" />
      </button>

      {/* 下拉菜单 */}
      {isOpen && (
        <div
          className="size-dropdown__menu"
          role="listbox"
          aria-label={language === 'zh' ? '选择尺寸' : 'Select Size'}
        >
          <div className="size-dropdown__header">
            {language === 'zh' ? '选择尺寸' : 'Select Size'}
          </div>
          <div className="size-dropdown__list">
            {sizeOptions.map((option) => {
              const isSelected = option.value === selectedSize;
              return (
                <div
                  key={option.value}
                  className={`size-dropdown__item ${isSelected ? 'size-dropdown__item--selected' : ''}`}
                  onClick={() => handleSelect(option.value)}
                  role="option"
                  aria-selected={isSelected}
                >
                  <span className="size-dropdown__item-label">{option.label}</span>
                  {isSelected && (
                    <Check size={14} className="size-dropdown__item-check" />
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

export default SizeDropdown;
