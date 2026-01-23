/**
 * 模型下拉选择器组件
 *
 * 展示分两种：
 * 1. minimal (默认): 显示在 AI 输入框左下角，以 #shortCode 形式显示当前模型
 * 2. form: 表单下拉框风格，支持输入搜索过滤
 */

import React, { useState, useCallback, useRef, useEffect, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import {
  IMAGE_MODELS,
  getModelConfig,
  type ModelConfig,
} from '../../constants/model-config';
import './model-dropdown.scss';
import { ModelHealthBadge } from '../shared/ModelHealthBadge';

export interface ModelDropdownProps {
  /** 当前选中的模型 ID */
  selectedModel: string;
  /** 选择模型回调 */
  onSelect: (modelId: string) => void;
  /** 语言 */
  language?: 'zh' | 'en';
  /** 模型列表（可选，默认为图片模型） */
  models?: ModelConfig[];
  /** 下拉菜单弹出方向（可选，默认为 up） */
  placement?: 'up' | 'down';
  /** 自定义标题（可选，仅用于 minimal 变体） */
  header?: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 展示变体：'minimal' (AI 输入框风格) 或 'form' (表单下拉框风格) */
  variant?: 'minimal' | 'form';
  /** 占位符 (仅用于 variant="form") */
  placeholder?: string;
}

/**
 * 模型下拉选择器
 */
export const ModelDropdown: React.FC<ModelDropdownProps> = ({
  selectedModel,
  onSelect,
  language = 'zh',
  models = IMAGE_MODELS,
  placement = 'up',
  header,
  disabled = false,
  variant = 'minimal',
  placeholder,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 确保高亮项可见
  useEffect(() => {
    if (isOpen && listRef.current) {
      const highlightedElement = listRef.current.children[highlightedIndex] as HTMLElement;
      if (highlightedElement) {
        const listContainer = listRef.current;
        const itemTop = highlightedElement.offsetTop;
        const itemHeight = highlightedElement.offsetHeight;
        const containerScrollTop = listContainer.scrollTop;
        const containerHeight = listContainer.offsetHeight;
        const containerPaddingTop = 4; // 与 SCSS 中的 padding 一致

        if (highlightedIndex === 0) {
          // 强制滚回到最顶部，处理 padding
          listContainer.scrollTop = 0;
        } else if (itemTop - containerPaddingTop < containerScrollTop) {
          // 在上方不可见
          listContainer.scrollTop = itemTop - containerPaddingTop;
        } else if (itemTop + itemHeight > containerScrollTop + containerHeight) {
          // 在下方不可见
          listContainer.scrollTop = itemTop + itemHeight - containerHeight + containerPaddingTop;
        }
      }
    }
  }, [highlightedIndex, isOpen]);

  // 获取当前模型配置
  const currentModel = getModelConfig(selectedModel);
  // 使用 shortCode 或默认简写
  const shortCode = currentModel?.shortCode || 'img';

  // 当外部选中的模型变化时，同步搜索框内容（仅 form 变体）
  useEffect(() => {
    if (variant === 'form' && !isOpen) {
      setSearchQuery(currentModel?.label || selectedModel);
    }
  }, [selectedModel, currentModel, variant, isOpen]);

  // 过滤模型列表
  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) return models;

    // 如果输入内容与当前选中模型的标签完全一致，且菜单刚打开，则显示所有模型
    const currentLabel = currentModel?.label || selectedModel;
    if (searchQuery === currentLabel && isOpen && !triggerInputRef.current?.matches(':focus-visible')) {
      // 这里的逻辑有点复杂，简化一下：如果输入框文字没有被手动修改过（或者说还是初始值），则不过滤
    }

    const query = searchQuery.toLowerCase().trim();
    return models.filter(m =>
      m.id.toLowerCase().includes(query) ||
      m.label.toLowerCase().includes(query) ||
      m.shortLabel?.toLowerCase().includes(query) ||
      m.shortCode?.toLowerCase().includes(query) ||
      m.description?.toLowerCase().includes(query)
    );
  }, [models, searchQuery]);

  // 当过滤结果变化时，重置高亮索引
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredModels]);

  // 切换下拉菜单
  const handleToggle = useCallback(() => {
    if (disabled) return;
    setIsOpen(prev => {
      const next = !prev;
      if (variant === 'form') {
        if (next) {
          // 打开时清空搜索，展示全部模型
          setSearchQuery('');
        } else {
          // 关闭时恢复当前模型标签
          setSearchQuery(currentModel?.label || selectedModel);
        }
      }
      return next;
    });
  }, [disabled, variant, currentModel, selectedModel]);

  // 选择模型
  const handleSelect = useCallback((modelId: string) => {
    const model = getModelConfig(modelId);
    onSelect(modelId);
    setIsOpen(false);
    if (variant === 'form') {
      setSearchQuery(model?.label || modelId);
    } else {
      setSearchQuery('');
    }
  }, [onSelect, variant]);

  // 键盘导航
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (!isOpen) {
      // 下拉框未打开时，按空格或回车打开
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (event.key === 'Escape') {
      setIsOpen(false);
      if (variant === 'form') {
        setSearchQuery(currentModel?.label || selectedModel);
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (filteredModels.length > 0) {
        setHighlightedIndex(prev =>
          prev < filteredModels.length - 1 ? prev + 1 : 0
        );
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (filteredModels.length > 0) {
        setHighlightedIndex(prev =>
          prev > 0 ? prev - 1 : filteredModels.length - 1
        );
      }
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      const targetModel = filteredModels[highlightedIndex];
      if (targetModel) {
        event.preventDefault();
        handleSelect(targetModel.id);
      } else if (variant === 'form' && searchQuery.trim()) {
        // 如果是表单变体且有输入，但没有匹配的模型，则使用输入的内容
        event.preventDefault();
        handleSelect(searchQuery.trim());
      }
    }
  }, [isOpen, filteredModels, highlightedIndex, handleSelect, variant, currentModel, selectedModel, searchQuery]);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      // 需要同时检查 containerRef 和 dropdownRef
      // 因为菜单通过 Portal 渲染到 body，不在 containerRef 内部
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // 自动聚焦
  useEffect(() => {
    if (isOpen && variant === 'form') {
      triggerInputRef.current?.focus();
      triggerInputRef.current?.select();
    }
  }, [isOpen, variant]);

  const renderTrigger = () => {
    if (variant === 'minimal') {
      return (
        <button
          className={`model-dropdown__trigger model-dropdown__trigger--minimal ${isOpen ? 'model-dropdown__trigger--open' : ''}`}
          onClick={handleToggle}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          title={currentModel?.shortLabel || currentModel?.label || selectedModel}
          disabled={disabled}
        >
          <span className="model-dropdown__at">#</span>
          <span className="model-dropdown__code">{shortCode}</span>
          <ModelHealthBadge modelId={selectedModel} />
          <ChevronDown size={14} className={`model-dropdown__chevron ${isOpen ? 'model-dropdown__chevron--open' : ''}`} />
        </button>
      );
    }

    return (
      <div
        className={`model-dropdown__trigger model-dropdown__trigger--form ${isOpen ? 'model-dropdown__trigger--open' : ''}`}
        onClick={() => {
          if (!isOpen) {
            setIsOpen(true);
            setSearchQuery('');
          }
        }}
      >
        <div className="model-dropdown__form-content">
          <ModelHealthBadge modelId={selectedModel} />
          <input
            ref={triggerInputRef}
            type="text"
            className="model-dropdown__form-input"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (!isOpen) setIsOpen(true);
            }}
            placeholder={placeholder || (language === 'zh' ? '选择或输入模型' : 'Select or enter model')}
            disabled={disabled}
          />
        </div>
        <ChevronDown
          size={16}
          className={`model-dropdown__chevron ${isOpen ? 'model-dropdown__chevron--open' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            handleToggle();
          }}
        />
      </div>
    );
  };

  const [portalPosition, setPortalPosition] = useState({ top: 0, left: 0, width: 0, bottom: 0 });

  // 渲染菜单内容
  const renderMenu = () => {
    if (!isOpen) return null;

    const isPortalled = variant === 'form' || placement === 'down' || placement === 'up';

    const menu = (
      <div
        className={`model-dropdown__menu model-dropdown__menu--${placement} ${variant === 'form' ? 'model-dropdown__menu--form' : ''} ${isPortalled ? 'model-dropdown__menu--portalled' : ''}`}
        ref={dropdownRef}
        role="listbox"
        aria-label={language === 'zh' ? '选择模型' : 'Select Model'}
        onClick={(e) => e.stopPropagation()}
        style={isPortalled ? {
          position: 'fixed',
          zIndex: 10000,
          left: portalPosition.left,
          width: variant === 'form' ? portalPosition.width : 'auto',
          top: placement === 'down' ? portalPosition.bottom + 4 : 'auto',
          bottom: placement === 'up' ? window.innerHeight - portalPosition.top + 4 : 'auto',
          visibility: portalPosition.width === 0 ? 'hidden' : 'visible',
        } : {
          zIndex: 1000,
        }}
      >
        {header && variant === 'minimal' && !searchQuery && (
          <div className="model-dropdown__header">{header}</div>
        )}

        <div className="model-dropdown__list" ref={listRef}>
          {filteredModels.length > 0 ? (
            filteredModels.map((model, index) => {
              const isSelected = model.id === selectedModel;
              const isHighlighted = index === highlightedIndex;
              return (
                <div
                  key={model.id}
                  className={`model-dropdown__item ${isSelected ? 'model-dropdown__item--selected' : ''} ${isHighlighted ? 'model-dropdown__item--highlighted' : ''}`}
                  onClick={() => handleSelect(model.id)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  role="option"
                  aria-selected={isSelected}
                >
                  <div className="model-dropdown__item-content">
                    <div className="model-dropdown__item-name">
                      <span className="model-dropdown__item-code">#{model.shortCode}</span>
                      <span className="model-dropdown__item-label">
                        {model.shortLabel || model.label}
                      </span>
                      {model.isVip && (
                        <span className="model-dropdown__item-vip">VIP</span>
                      )}
                      <ModelHealthBadge modelId={model.id} />
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
            })
          ) : (
            <div className="model-dropdown__empty">
              {language === 'zh' ? '未找到匹配的模型' : 'No matching models'}
            </div>
          )}
        </div>
      </div>
    );

    if (isPortalled) {
      return createPortal(menu, document.body);
    }

    return menu;
  };

  // 计算菜单位置（仅当使用 Portal 时）
  useLayoutEffect(() => {
    if (isOpen && (variant === 'form' || placement === 'down' || placement === 'up')) {
      const updatePosition = () => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        setPortalPosition({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          bottom: rect.bottom
        });
      };

      updatePosition();

      // 监听窗口缩放和滚动，动态更新位置
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);

      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
      };
    } else {
      setPortalPosition({ top: 0, left: 0, width: 0, bottom: 0 });
    }
  }, [isOpen, placement, variant]);

  return (
    <div
      className={`model-dropdown model-dropdown--variant-${variant} ${disabled ? 'model-dropdown--disabled' : ''}`}
      ref={containerRef}
      onKeyDown={handleKeyDown}
    >
      {renderTrigger()}
      {renderMenu()}
    </div>
  );
};

export default ModelDropdown;
