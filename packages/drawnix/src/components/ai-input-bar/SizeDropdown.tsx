/**
 * 尺寸下拉选择器组件
 *
 * 显示在 AI 输入框底部栏，在 ModelDropdown 右侧
 * 根据当前选中的模型动态显示可用的尺寸选项
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import {
  getSizeOptionsForModel,
  getDefaultSizeForModel,
} from '../../constants/model-config';
import './size-dropdown.scss';
import { KeyboardDropdown } from './KeyboardDropdown';

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
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

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

  // 打开时重置高亮索引到当前选中项
  useEffect(() => {
    if (isOpen) {
      const currentIndex = sizeOptions.findIndex(opt => opt.value === selectedSize);
      setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0);
    }
  }, [isOpen, selectedSize, sizeOptions]);

  // 确保高亮项可见
  useEffect(() => {
    if (isOpen && listRef.current) {
      const highlightedElement = listRef.current.children[highlightedIndex] as HTMLElement;
      if (highlightedElement) {
        highlightedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  // 获取当前选中尺寸的显示标签（触发器显示精简版）
  const triggerLabel = useMemo(() => {
    const option = sizeOptions.find(opt => opt.value === selectedSize);
    if (!option) return selectedSize;

    // 如果包含括号，去掉括号内容以节省空间
    // 例如 "横屏 16:9 (1280x720)" -> "横屏 16:9"
    return option.label.split('(')[0].trim();
  }, [sizeOptions, selectedSize]);

  // 获取完整标签用于 tooltip 或其他地方
  const fullLabel = useMemo(() => {
    const option = sizeOptions.find(opt => opt.value === selectedSize);
    return option?.label || selectedSize;
  }, [sizeOptions, selectedSize]);

  // 切换下拉菜单
  const handleToggle = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  // 选择尺寸
  const handleSelect = useCallback((size: string) => {
    onSelect(size);
    setIsOpen(false);
  }, [onSelect]);

  const handleOpenKey = useCallback((key: string) => {
    if (key === 'Escape') {
      setIsOpen(false);
      return true;
    }

    if (key === 'ArrowDown') {
      setHighlightedIndex(prev => (prev < sizeOptions.length - 1 ? prev + 1 : 0));
      return true;
    } else if (key === 'ArrowUp') {
      setHighlightedIndex(prev => (prev > 0 ? prev - 1 : sizeOptions.length - 1));
      return true;
    } else if (key === 'Enter' || key === ' ' || key === 'Tab') {
      if (sizeOptions[highlightedIndex]) {
        handleSelect(sizeOptions[highlightedIndex].value);
      }
      return true;
    }

    return false;
  }, [sizeOptions, highlightedIndex, handleSelect]);

  // 如果没有可用选项，不渲染
  if (sizeOptions.length === 0) {
    return null;
  }

  return (
    <KeyboardDropdown
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      openKeys={['Enter', ' ', 'ArrowDown', 'ArrowUp']}
      onOpenKey={handleOpenKey}
    >
      {({ containerRef, menuRef, portalPosition, handleTriggerKeyDown }) => (
        <div className="size-dropdown" ref={containerRef}>
          {/* 触发按钮 */}
          <button
            className={`size-dropdown__trigger ${isOpen ? 'size-dropdown__trigger--open' : ''}`}
            onClick={handleToggle}
            onKeyDown={handleTriggerKeyDown}
            type="button"
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            title={`${fullLabel} (↑↓ Tab)`}
          >
            <span className="size-dropdown__label">{triggerLabel}</span>
            <ChevronDown size={14} className={`size-dropdown__icon ${isOpen ? 'size-dropdown__icon--open' : ''}`} />
          </button>
          {isOpen && createPortal(
            <div
              ref={menuRef}
              className="size-dropdown__menu"
              style={{
                position: 'fixed',
                zIndex: 10000,
                left: portalPosition.left,
                bottom: window.innerHeight - portalPosition.top + 8,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="size-dropdown__header">
                {language === 'zh' ? '选择尺寸' : 'Select Size'}
              </div>
              <div className="size-dropdown__list" ref={listRef}>
                {sizeOptions.map((option, index) => {
                  const isSelected = option.value === selectedSize;
                  const isHighlighted = index === highlightedIndex;
                  return (
                    <div
                      key={option.value}
                      className={`size-dropdown__item ${isSelected ? 'size-dropdown__item--selected' : ''} ${isHighlighted ? 'size-dropdown__item--highlighted' : ''}`}
                      onClick={() => handleSelect(option.value)}
                      onMouseEnter={() => setHighlightedIndex(index)}
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
            </div>,
            document.body
          )}
        </div>
      )}
    </KeyboardDropdown>
  );
};

export default SizeDropdown;
