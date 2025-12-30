/**
 * PromptSuggestionPanel Component
 * 
 * 提示词选择面板组件
 * 在输入框聚焦时显示，支持预设提示词和历史提示词
 * 支持根据输入内容动态匹配过滤
 * 支持键盘导航（上下键选择，Enter 确认）
 */

import React, { useMemo, useCallback, useRef, useEffect, useState } from 'react';
import { History, Lightbulb, X } from 'lucide-react';

export interface PromptItem {
  id: string;
  content: string;
  source: 'preset' | 'history';
  timestamp?: number;
}

interface PromptSuggestionPanelProps {
  /** 是否可见 */
  visible: boolean;
  /** 提示词列表 */
  prompts: PromptItem[];
  /** 过滤关键词 */
  filterKeyword: string;
  /** 选择提示词回调 */
  onSelect: (prompt: PromptItem) => void;
  /** 关闭面板回调 */
  onClose: () => void;
  /** 删除历史记录回调 */
  onDeleteHistory?: (id: string) => void;
  /** 语言 */
  language?: 'zh' | 'en';
}

/**
 * 提示词选择面板
 */
export const PromptSuggestionPanel: React.FC<PromptSuggestionPanelProps> = ({
  visible,
  prompts,
  filterKeyword,
  onSelect,
  onClose,
  onDeleteHistory,
  language = 'zh',
}) => {
  // console.log('[PromptSuggestionPanel] render, visible:', visible, 'prompts.length:', prompts.length);
  const panelRef = useRef<HTMLDivElement>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  // 过滤提示词
  const filteredPrompts = useMemo(() => {
    const keyword = filterKeyword.trim().toLowerCase();
    
    // 如果没有输入内容，显示所有提示词
    if (!keyword) {
      return prompts;
    }
    
    // 过滤逻辑：
    // 1. 过滤掉与输入内容完全相同的提示词
    // 2. 只保留包含输入关键词的提示词（模糊匹配）
    return prompts.filter(prompt => {
      const content = prompt.content.trim().toLowerCase();
      
      // 排除完全相同的
      if (content === keyword) {
        return false;
      }
      
      // 包含关键词的保留
      return content.includes(keyword);
    });
  }, [prompts, filterKeyword]);

  // 分组：历史提示词和预设提示词
  const { historyPrompts, presetPrompts } = useMemo(() => {
    const history = filteredPrompts.filter(p => p.source === 'history');
    const preset = filteredPrompts.filter(p => p.source === 'preset');
    return { historyPrompts: history, presetPrompts: preset };
  }, [filteredPrompts]);

  // 合并后的列表（用于键盘导航）
  const allFilteredPrompts = useMemo(() => {
    return [...historyPrompts, ...presetPrompts];
  }, [historyPrompts, presetPrompts]);

  // 重置高亮索引当过滤结果变化时
  useEffect(() => {
    setHighlightedIndex(0);
  }, [allFilteredPrompts.length]);

  // 处理点击外部关闭
  useEffect(() => {
    if (!visible) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        // 检查是否点击的是输入框
        const target = event.target as HTMLElement;
        if (target.closest('.ai-input-bar__input')) {
          return;
        }
        onClose();
      }
    };

    // 延迟添加监听，避免立即触发
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [visible, onClose]);

  // 键盘事件监听
  useEffect(() => {
    if (!visible || allFilteredPrompts.length === 0) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // console.log('[PromptSuggestionPanel] handleKeyDown called, key:', event.key);
      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault();
          event.stopPropagation();
          setHighlightedIndex(prev =>
            prev <= 0 ? allFilteredPrompts.length - 1 : prev - 1
          );
          break;
        case 'ArrowDown':
          event.preventDefault();
          event.stopPropagation();
          setHighlightedIndex(prev =>
            prev >= allFilteredPrompts.length - 1 ? 0 : prev + 1
          );
          break;
        case 'Tab':
          // Tab 键选择当前高亮项
          if (allFilteredPrompts[highlightedIndex]) {
            event.preventDefault();
            event.stopPropagation();
            onSelect(allFilteredPrompts[highlightedIndex]);
          }
          break;
        case 'Enter':
          // Enter 键：不拦截，让 AIInputBar 处理发送逻辑
          // 用户可以用 Tab 键选择提示词
          // console.log('[PromptSuggestionPanel] Enter key - not intercepting');
          break;
        case 'Escape':
          event.preventDefault();
          event.stopPropagation();
          onClose();
          break;
      }
    };

    // 使用 capture 阶段捕获事件
    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [visible, allFilteredPrompts, highlightedIndex, onSelect, onClose]);

  // 滚动高亮项到可见区域
  useEffect(() => {
    if (!visible || allFilteredPrompts.length === 0) return;
    
    const highlightedElement = panelRef.current?.querySelector(
      `.prompt-suggestion-panel__item--highlighted`
    );
    if (highlightedElement) {
      highlightedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [highlightedIndex, visible, allFilteredPrompts.length]);

  // 处理删除历史记录
  const handleDeleteHistory = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onDeleteHistory?.(id);
  }, [onDeleteHistory]);

  // 截断显示文本
  const truncateText = (text: string, maxLength: number = 80) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  // 获取全局索引
  const getGlobalIndex = (source: 'history' | 'preset', localIndex: number) => {
    if (source === 'history') {
      return localIndex;
    }
    return historyPrompts.length + localIndex;
  };

  if (!visible) return null;

  // 如果没有匹配的提示词，不显示面板
  const hasResults = filteredPrompts.length > 0;
  if (!hasResults) return null;

  return (
    <div 
      ref={panelRef}
      className="prompt-suggestion-panel"
    >
      {/* 面板内容 */}
      <div className="prompt-suggestion-panel__content">
        {/* 历史提示词 */}
        {historyPrompts.length > 0 && (
              <div className="prompt-suggestion-panel__section">
                <div className="prompt-suggestion-panel__section-header">
                  <History size={14} />
                  <span>{language === 'zh' ? '历史记录' : 'History'}</span>
                </div>
                <div className="prompt-suggestion-panel__list">
                  {historyPrompts.map((prompt, index) => (
                    <div
                      key={prompt.id}
                      className={`prompt-suggestion-panel__item prompt-suggestion-panel__item--history ${
                        getGlobalIndex('history', index) === highlightedIndex ? 'prompt-suggestion-panel__item--highlighted' : ''
                      }`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => onSelect(prompt)}
                      onMouseEnter={() => setHighlightedIndex(getGlobalIndex('history', index))}
                    >
                      <span className="prompt-suggestion-panel__item-text">
                        {truncateText(prompt.content)}
                      </span>
                      {onDeleteHistory && (
                        <button
                          className="prompt-suggestion-panel__item-delete"
                          onClick={(e) => handleDeleteHistory(e, prompt.id)}
                          title={language === 'zh' ? '删除' : 'Delete'}
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 预设提示词 */}
            {presetPrompts.length > 0 && (
              <div className="prompt-suggestion-panel__section">
                <div className="prompt-suggestion-panel__section-header">
                  <Lightbulb size={14} />
                  <span>{language === 'zh' ? '推荐提示词' : 'Suggestions'}</span>
                </div>
                <div className="prompt-suggestion-panel__list">
                  {presetPrompts.map((prompt, index) => (
                    <div
                      key={prompt.id}
                      className={`prompt-suggestion-panel__item ${
                        getGlobalIndex('preset', index) === highlightedIndex ? 'prompt-suggestion-panel__item--highlighted' : ''
                      }`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => onSelect(prompt)}
                      onMouseEnter={() => setHighlightedIndex(getGlobalIndex('preset', index))}
                    >
                      <span className="prompt-suggestion-panel__item-text">
                        {truncateText(prompt.content)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
      </div>
    </div>
  );
};

export default PromptSuggestionPanel;
