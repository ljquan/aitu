/**
 * 提示词按钮组件
 * 
 * 在文本元素的 popup-toolbar 上显示提示词选择按钮
 * 点击后展开提示词选择面板，选择后将提示词填入文本内容
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Lightbulb, History, X } from 'lucide-react';
import { PlaitBoard, getSelectedElements, Transforms, ATTACHED_ELEMENT_CLASS_NAME, Point } from '@plait/core';
import { MindElement } from '@plait/mind';
import { PlaitDrawElement, isDrawElementsIncludeText } from '@plait/draw';
import { Popover, PopoverTrigger, PopoverContent } from '../../popover/popover';
import { ToolButton } from '../../tool-button';
import { AI_IMAGE_PROMPTS } from '../../../constants/prompts';
import { usePromptHistory } from '../../../hooks/usePromptHistory';
import './prompt-button.scss';

// 文本宽度计算常量
const TEXT_CHAR_WIDTH = 14; // 每个字符的估算宽度（中文字符）
const TEXT_PADDING = 16; // 文本框内边距
const TEXT_MIN_WIDTH = 60; // 最小宽度
const TEXT_MAX_WIDTH = 400; // 最大宽度
const TEXT_LINE_HEIGHT = 24; // 行高

/**
 * 估算文本内容所需的宽度和高度
 * @param text 文本内容
 * @returns 估算的宽度和高度
 */
function estimateTextDimensions(text: string): { width: number; height: number } {
  // 按行分割
  const lines = text.split('\n');
  
  // 计算最长行的宽度
  let maxLineWidth = 0;
  for (const line of lines) {
    // 估算每行宽度：中文字符占 TEXT_CHAR_WIDTH，英文/数字占一半
    let lineWidth = 0;
    for (const char of line) {
      // 判断是否为 ASCII 字符（英文、数字、标点）
      if (char.charCodeAt(0) < 128) {
        lineWidth += TEXT_CHAR_WIDTH * 0.6;
      } else {
        lineWidth += TEXT_CHAR_WIDTH;
      }
    }
    maxLineWidth = Math.max(maxLineWidth, lineWidth);
  }
  
  // 添加内边距，并限制在最小和最大宽度之间
  const width = Math.min(
    TEXT_MAX_WIDTH,
    Math.max(TEXT_MIN_WIDTH, maxLineWidth + TEXT_PADDING * 2)
  );
  
  // 如果宽度被限制，需要重新计算行数
  const effectiveWidth = width - TEXT_PADDING * 2;
  let totalLines = 0;
  for (const line of lines) {
    let lineWidth = 0;
    let lineCount = 1;
    for (const char of line) {
      const charWidth = char.charCodeAt(0) < 128 ? TEXT_CHAR_WIDTH * 0.6 : TEXT_CHAR_WIDTH;
      lineWidth += charWidth;
      if (lineWidth > effectiveWidth) {
        lineCount++;
        lineWidth = charWidth;
      }
    }
    totalLines += lineCount;
  }
  
  // 计算高度
  const height = Math.max(TEXT_LINE_HEIGHT, totalLines * TEXT_LINE_HEIGHT + TEXT_PADDING);
  
  return { width, height };
}

interface PopupPromptButtonProps {
  board: PlaitBoard;
  language: 'zh' | 'en';
  title?: string;
}

interface PromptItem {
  id: string;
  content: string;
  scene?: string;
  source: 'preset' | 'history';
  timestamp?: number;
}

export const PopupPromptButton: React.FC<PopupPromptButtonProps> = ({
  board,
  language,
  title,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const { history, addHistory, removeHistory } = usePromptHistory();
  const listRef = useRef<HTMLDivElement>(null);

  // 合并预设提示词和历史提示词
  const allPrompts = useMemo((): PromptItem[] => {
    // AI_IMAGE_PROMPTS 现在是字符串数组
    const presetPrompts: PromptItem[] = AI_IMAGE_PROMPTS[language].map((content, index) => ({
      id: `preset_${index}`,
      content: content,
      source: 'preset' as const,
    }));

    const historyPrompts: PromptItem[] = history.map(item => ({
      id: item.id,
      content: item.content,
      source: 'history' as const,
      timestamp: item.timestamp,
    }));

    return [...historyPrompts, ...presetPrompts];
  }, [language, history]);

  // 分组提示词
  const { historyPrompts, presetPrompts } = useMemo(() => {
    const historyItems = allPrompts.filter(p => p.source === 'history');
    const presetItems = allPrompts.filter(p => p.source === 'preset');
    return { historyPrompts: historyItems, presetPrompts: presetItems };
  }, [allPrompts]);

  // 获取全局索引
  const getGlobalIndex = useCallback((source: 'history' | 'preset', localIndex: number) => {
    if (source === 'history') return localIndex;
    return historyPrompts.length + localIndex;
  }, [historyPrompts.length]);

  // 重置高亮索引
  useEffect(() => {
    if (isOpen) {
      setHighlightedIndex(0);
    }
  }, [isOpen]);

  // 处理选择提示词 - 将提示词填入到选中的文本元素中
  const handleSelectPrompt = useCallback((prompt: PromptItem) => {
    // 保存到历史记录
    addHistory(prompt.content);
    
    // 关闭弹窗
    setIsOpen(false);
    
    // 获取选中的元素
    const selectedElements = getSelectedElements(board);
    if (selectedElements.length === 0) return;

    // 构建符合 Plait 规范的文本结构
    // Plait 使用 Slate 风格的文本节点，需要包含 type: 'paragraph'
    const buildNewText = (content: string) => ({
      type: 'paragraph',
      children: [{ text: content }],
    });

    // 估算新文本的尺寸
    const { width: newWidth, height: newHeight } = estimateTextDimensions(prompt.content);

    // 更新选中元素的文本内容
    for (const element of selectedElements) {
      const path = board.children.findIndex(child => child.id === element.id);
      if (path < 0) continue;

      // 准备更新的属性
      const updates: Record<string, unknown> = {};

      // 1. MindElement - 文本存储在 data 属性中（Slate 节点数组）
      // MindElement 不需要调整宽度，它会自动适应
      if (MindElement.isMindElement(board, element)) {
        const newData = [buildNewText(prompt.content)];
        Transforms.setNode(board, { data: newData }, [path]);
        continue;
      }

      // 2. PlaitText 元素 - 文本存储在 text 属性中，需要调整 points
      if (PlaitDrawElement.isText && PlaitDrawElement.isText(element)) {
        updates.text = buildNewText(prompt.content);
        
        // 调整元素的 points 以适应新的文本宽度
        if ('points' in element && Array.isArray(element.points) && element.points.length >= 2) {
          const points = element.points as Point[];
          const [start] = points;
          // 保持左上角位置不变，调整右下角以适应新的宽度和高度
          const newPoints: Point[] = [
            start,
            [start[0] + newWidth, start[1] + newHeight],
          ];
          updates.points = newPoints;
        }
        
        Transforms.setNode(board, updates, [path]);
        continue;
      }

      // 3. 其他带文本的 Draw 元素
      if (PlaitDrawElement.isDrawElement(element) && isDrawElementsIncludeText([element])) {
        // 如果有 text 属性，更新 text（优先级高于 data）
        if ('text' in element && element.text) {
          updates.text = buildNewText(prompt.content);
          
          // 调整元素的 points
          if ('points' in element && Array.isArray(element.points) && element.points.length >= 2) {
            const points = element.points as Point[];
            const [start] = points;
            const newPoints: Point[] = [
              start,
              [start[0] + newWidth, start[1] + newHeight],
            ];
            updates.points = newPoints;
          }
          
          Transforms.setNode(board, updates, [path]);
          continue;
        }
        // 如果有 data 属性（Slate 节点数组），更新 data
        if ('data' in element && Array.isArray(element.data)) {
          updates.data = [buildNewText(prompt.content)];
          
          // 调整元素的 points
          if ('points' in element && Array.isArray(element.points) && element.points.length >= 2) {
            const points = element.points as Point[];
            const [start] = points;
            const newPoints: Point[] = [
              start,
              [start[0] + newWidth, start[1] + newHeight],
            ];
            updates.points = newPoints;
          }
          
          Transforms.setNode(board, updates, [path]);
          continue;
        }
      }

      // 4. 兜底：检查 text 属性
      if ('text' in element && element.text) {
        updates.text = buildNewText(prompt.content);
        
        // 调整元素的 points
        if ('points' in element && Array.isArray(element.points) && element.points.length >= 2) {
          const points = element.points as Point[];
          const [start] = points;
          const newPoints: Point[] = [
            start,
            [start[0] + newWidth, start[1] + newHeight],
          ];
          updates.points = newPoints;
        }
        
        Transforms.setNode(board, updates, [path]);
        continue;
      }

      // 5. 兜底：检查 textContent 属性
      if ('textContent' in element) {
        Transforms.setNode(board, { textContent: prompt.content }, [path]);
      }
    }
  }, [board, addHistory]);

  // 处理删除历史
  const handleDeleteHistory = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    removeHistory(id);
  }, [removeHistory]);

  // 键盘事件处理
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (allPrompts.length === 0) {
        if (event.key === 'Escape') {
          event.preventDefault();
          setIsOpen(false);
        }
        return;
      }

      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault();
          setHighlightedIndex(prev =>
            prev <= 0 ? allPrompts.length - 1 : prev - 1
          );
          break;
        case 'ArrowDown':
          event.preventDefault();
          setHighlightedIndex(prev =>
            prev >= allPrompts.length - 1 ? 0 : prev + 1
          );
          break;
        case 'Enter':
          event.preventDefault();
          if (allPrompts[highlightedIndex]) {
            handleSelectPrompt(allPrompts[highlightedIndex]);
          }
          break;
        case 'Escape':
          event.preventDefault();
          setIsOpen(false);
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, allPrompts, highlightedIndex, handleSelectPrompt]);

  // 滚动高亮项到可见区域
  useEffect(() => {
    if (!isOpen || allPrompts.length === 0) return;
    
    const highlightedElement = listRef.current?.querySelector(
      '.popup-prompt-panel__item--highlighted'
    );
    if (highlightedElement) {
      highlightedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [highlightedIndex, isOpen, allPrompts.length]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen} placement="top" sideOffset={8}>
      <PopoverTrigger asChild>
        <ToolButton
          className="prompt-button"
          type="icon"
          icon={<Lightbulb size={16} />}
          visible={true}
          title={title || (language === 'zh' ? '提示词' : 'Prompts')}
          aria-label={title || (language === 'zh' ? '提示词' : 'Prompts')}
          onPointerUp={() => setIsOpen(!isOpen)}
        />
      </PopoverTrigger>
      <PopoverContent 
        className={`popup-prompt-panel ${ATTACHED_ELEMENT_CLASS_NAME}`}
        onMouseDown={(e) => e.preventDefault()}
      >
        <div ref={listRef} className="popup-prompt-panel__content">
          {/* 历史提示词 */}
          {historyPrompts.length > 0 && (
            <div className="popup-prompt-panel__section">
              <div className="popup-prompt-panel__section-header">
                <History size={14} />
                <span>{language === 'zh' ? '历史记录' : 'History'}</span>
              </div>
              <div className="popup-prompt-panel__list">
                {historyPrompts.map((item, index) => (
                  <div
                    key={item.id}
                    className={`popup-prompt-panel__item popup-prompt-panel__item--history ${
                      getGlobalIndex('history', index) === highlightedIndex 
                        ? 'popup-prompt-panel__item--highlighted' 
                        : ''
                    }`}
                    onClick={() => handleSelectPrompt(item)}
                    onMouseEnter={() => setHighlightedIndex(getGlobalIndex('history', index))}
                  >
                    <span className="popup-prompt-panel__item-text">
                      {item.content}
                    </span>
                    <button
                      className="popup-prompt-panel__item-delete"
                      onClick={(e) => handleDeleteHistory(e, item.id)}
                      title={language === 'zh' ? '删除' : 'Delete'}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 预设提示词 */}
          {presetPrompts.length > 0 && (
            <div className="popup-prompt-panel__section">
              <div className="popup-prompt-panel__section-header">
                <Lightbulb size={14} />
                <span>{language === 'zh' ? '推荐提示词' : 'Suggestions'}</span>
              </div>
              <div className="popup-prompt-panel__list">
                {presetPrompts.map((item, index) => (
                  <div
                    key={item.id}
                    className={`popup-prompt-panel__item ${
                      getGlobalIndex('preset', index) === highlightedIndex 
                        ? 'popup-prompt-panel__item--highlighted' 
                        : ''
                    }`}
                    onClick={() => handleSelectPrompt(item)}
                    onMouseEnter={() => setHighlightedIndex(getGlobalIndex('preset', index))}
                  >
                    <span className="popup-prompt-panel__item-text">
                      {item.content}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default PopupPromptButton;
