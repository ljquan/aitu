import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  PlaitBoard,
  PlaitElement,
  getRectangleByElements,
} from '@plait/core';
import { extractTextFromElement } from '../../utils/selection-utils';
import { scrollToPoint } from '../../utils/selection-utils';
import { setSearchHighlightQuery } from '@plait-board/react-text';
import { useI18n } from '../../i18n';
import { Search as SearchIcon, X, ChevronUp, ChevronDown } from 'lucide-react';
import './canvas-search.scss';

interface CanvasSearchProps {
  open: boolean;
  onClose: () => void;
  board: PlaitBoard | null;
}

interface SearchMatch {
  element: PlaitElement;
  text: string;
  path: number[];
}

/** 递归遍历画布元素，提取带文本的元素 */
function collectTextElements(
  elements: PlaitElement[],
  board: PlaitBoard,
  basePath: number[] = [],
): SearchMatch[] {
  const results: SearchMatch[] = [];

  for (let i = 0; i < elements.length; i++) {
    const element = elements[i];
    const path = [...basePath, i];

    const text = extractTextFromElement(element, board);
    if (text) {
      results.push({ element, text, path });
    }

    // 递归子元素
    if (element.children && Array.isArray(element.children)) {
      results.push(...collectTextElements(element.children as PlaitElement[], board, path));
    }
  }

  return results;
}

export const CanvasSearch: React.FC<CanvasSearchProps> = ({ open, onClose, board }) => {
  const { language } = useI18n();
  const isZh = language === 'zh';

  const [query, setQuery] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // 搜索所有匹配
  const matches = useMemo(() => {
    if (!query.trim() || !board) return [];

    const allTextElements = collectTextElements(board.children, board);
    const regex = new RegExp(escapeRegex(query), 'gi');

    return allTextElements.filter(({ text }) => regex.test(text));
  }, [query, board]);

  // 同步搜索关键词到全局 store（驱动文本高亮）
  useEffect(() => {
    setSearchHighlightQuery(query.trim());
  }, [query]);

  // 打开时聚焦，关闭时清除高亮
  useEffect(() => {
    if (open) {
      setQuery('');
      setCurrentIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setSearchHighlightQuery('');
    }
  }, [open]);

  // 组件卸载时清除高亮
  useEffect(() => {
    return () => {
      setSearchHighlightQuery('');
    };
  }, []);

  // 导航到当前匹配项
  const navigateToMatch = useCallback(
    (index: number) => {
      if (matches.length === 0) return;
      const safeIndex = ((index % matches.length) + matches.length) % matches.length;
      setCurrentIndex(safeIndex);

      const match = matches[safeIndex];
      if (!match) return;

      try {
        const rect = getRectangleByElements(board, [match.element], false);
        const centerX = rect.x + rect.width / 2;
        const centerY = rect.y + rect.height / 2;
        scrollToPoint(board, [centerX, centerY]);
      } catch {
        // 静默处理
      }
    },
    [board, matches],
  );

  // 首次匹配时自动导航
  useEffect(() => {
    if (matches.length > 0 && query.trim()) {
      navigateToMatch(0);
    }
  }, [matches, query]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
          navigateToMatch(currentIndex - 1);
        } else {
          navigateToMatch(currentIndex + 1);
        }
      }
    },
    [onClose, navigateToMatch, currentIndex],
  );

  const handleQueryChange = useCallback((value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setQuery(value);
      setCurrentIndex(0);
    }, 200);
  }, []);

  if (!open || !board) return null;

  return (
    <div className="canvas-search" onKeyDown={handleKeyDown}>
      <div className="canvas-search__icon">
        <SearchIcon size={14} />
      </div>
      <input
        ref={inputRef}
        className="canvas-search__input"
        type="text"
        placeholder={isZh ? '搜索画布内容...' : 'Search canvas...'}
        defaultValue=""
        onChange={(e) => handleQueryChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      {query && matches.length > 0 && (
        <span className="canvas-search__count">
          {currentIndex + 1} / {matches.length}
        </span>
      )}
      {query && matches.length === 0 && (
        <span className="canvas-search__count canvas-search__count--empty">
          {isZh ? '无结果' : 'No results'}
        </span>
      )}
      <div className="canvas-search__actions">
        <button
          className="canvas-search__btn"
          onClick={() => navigateToMatch(currentIndex - 1)}
          disabled={matches.length === 0}
          title={isZh ? '上一个 (Shift+Enter)' : 'Previous (Shift+Enter)'}
        >
          <ChevronUp size={14} />
        </button>
        <button
          className="canvas-search__btn"
          onClick={() => navigateToMatch(currentIndex + 1)}
          disabled={matches.length === 0}
          title={isZh ? '下一个 (Enter)' : 'Next (Enter)'}
        >
          <ChevronDown size={14} />
        </button>
        <button className="canvas-search__btn" onClick={onClose} title="ESC">
          <X size={14} />
        </button>
      </div>
    </div>
  );
};

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
