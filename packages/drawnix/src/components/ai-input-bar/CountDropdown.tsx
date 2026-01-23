import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import { ATTACHED_ELEMENT_CLASS_NAME } from '@plait/core';
import { useI18n } from '../../i18n';
import { KeyboardDropdown } from './KeyboardDropdown';

export interface CountDropdownProps {
  value: number;
  onSelect: (count: number) => void;
  disabled?: boolean;
  /** 受控的打开状态 */
  isOpen?: boolean;
  /** 打开状态变化回调 */
  onOpenChange?: (open: boolean) => void;
}

const COUNT_OPTIONS = [1, 2, 3, 4, 5, 10, 20];

export const CountDropdown: React.FC<CountDropdownProps> = ({
  value,
  onSelect,
  disabled = false,
  isOpen: controlledIsOpen,
  onOpenChange,
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  // 支持受控和非受控模式
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const setIsOpen = useCallback((open: boolean | ((prev: boolean) => boolean)) => {
    if (typeof open === 'function') {
      // 函数式更新：需要使用当前状态计算新值
      const currentIsOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
      const newValue = open(currentIsOpen);
      setInternalIsOpen(newValue);
      onOpenChange?.(newValue);
    } else {
      setInternalIsOpen(open);
      onOpenChange?.(open);
    }
  }, [controlledIsOpen, internalIsOpen, onOpenChange]);

  const { language } = useI18n();
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // 打开时重置高亮索引到当前选中项
  useEffect(() => {
    if (isOpen) {
      const currentIndex = COUNT_OPTIONS.indexOf(value);
      setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0);
    }
  }, [isOpen, value]);

  // 确保高亮项可见
  useEffect(() => {
    if (isOpen && listRef.current) {
      const highlightedElement = listRef.current.children[highlightedIndex] as HTMLElement;
      if (highlightedElement) {
        highlightedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); // 阻止触发输入框失焦
    if (disabled) return;
    setIsOpen(!isOpen);
  }, [disabled, isOpen, setIsOpen]);

  const handleSelect = useCallback((count: number) => {
    onSelect(count);
    setIsOpen(false);
  }, [onSelect]);

  const handleOpenKey = useCallback((key: string) => {
    if (key === 'Escape') {
      setIsOpen(false);
      return true;
    }

    if (key === 'ArrowDown') {
      setHighlightedIndex(prev => (prev < COUNT_OPTIONS.length - 1 ? prev + 1 : 0));
      return true;
    }

    if (key === 'ArrowUp') {
      setHighlightedIndex(prev => (prev > 0 ? prev - 1 : COUNT_OPTIONS.length - 1));
      return true;
    }

    if (key === 'Enter' || key === ' ' || key === 'Tab') {
      handleSelect(COUNT_OPTIONS[highlightedIndex]);
      return true;
    }

    return false;
  }, [highlightedIndex, handleSelect]);

  return (
    <KeyboardDropdown
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      disabled={disabled}
      openKeys={['Enter', ' ', 'ArrowDown', 'ArrowUp']}
      onOpenKey={handleOpenKey}
    >
      {({ containerRef, menuRef, portalPosition, handleTriggerKeyDown }) => (
        <div className="count-dropdown" ref={containerRef}>
          <button
            className={`count-dropdown__trigger ${isOpen ? 'count-dropdown__trigger--open' : ''}`}
            onMouseDown={handleToggle}
            onKeyDown={handleTriggerKeyDown}
            disabled={disabled}
            type="button"
            title={`${language === 'zh' ? '生成数量' : 'Count'}: ${value} (↑↓ Tab)`}
          >
            <span className="count-dropdown__label">
              {value}{language === 'zh' ? '个' : ''}
            </span>
            <ChevronDown size={14} className={`count-dropdown__chevron ${isOpen ? 'count-dropdown__chevron--open' : ''}`} />
          </button>
          {isOpen && createPortal(
            <div
              ref={menuRef}
              className={`count-dropdown__menu ${ATTACHED_ELEMENT_CLASS_NAME}`}
              style={{
                position: 'fixed',
                zIndex: 10000,
                left: portalPosition.left,
                bottom: window.innerHeight - portalPosition.top + 8,
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="count-dropdown__header">
                <span>{language === 'zh' ? '生成数量 (↑↓ Tab)' : 'Count (↑↓ Tab)'}</span>
              </div>
              <div ref={listRef} className="count-dropdown__list">
                {COUNT_OPTIONS.map((count, index) => {
                  const isSelected = count === value;
                  const isHighlighted = index === highlightedIndex;
                  return (
                    <div
                      key={count}
                      className={`count-dropdown__item ${isSelected ? 'count-dropdown__item--selected' : ''} ${isHighlighted ? 'count-dropdown__item--highlighted' : ''}`}
                      onClick={() => handleSelect(count)}
                      onMouseEnter={() => setHighlightedIndex(index)}
                    >
                      <span className="count-dropdown__item-label">
                        {count}{language === 'zh' ? '个' : (count > 1 ? ' items' : ' item')}
                      </span>
                      {isSelected && <Check size={14} className="count-dropdown__item-check" />}
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
