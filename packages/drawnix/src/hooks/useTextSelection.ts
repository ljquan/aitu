/**
 * useTextSelection Hook
 * 
 * 实现文本选择和复制功能，同时阻止事件冒泡到 document
 * 解决 ATTACHED_ELEMENT_CLASS_NAME 导致的复制问题
 */

import { useEffect, useRef, RefObject } from 'react';

interface UseTextSelectionOptions {
  /**
   * 是否启用自动复制功能
   * @default true
   */
  enableCopy?: boolean;
  
  /**
   * 是否阻止 pointerup 事件冒泡
   * @default true
   */
  stopPropagation?: boolean;
}

type TextInputElement = HTMLTextAreaElement | HTMLInputElement;

/**
 * 自定义 Hook，用于处理文本输入框的选择和复制功能
 * 
 * 功能：
 * 1. 监听 Ctrl+C / Cmd+C 复制快捷键
 * 2. 监听右键菜单复制操作
 * 3. 阻止 pointerup 等事件冒泡，避免影响画板选中状态
 * 
 * @param elementRef - 要监听的元素引用（必须是 textarea 或 input）
 * @param options - 配置选项
 */
export function useTextSelection(
  elementRef: RefObject<TextInputElement>,
  options: UseTextSelectionOptions = {}
) {
  const { enableCopy = true, stopPropagation = true } = options;
  
  // 保存最近的文本选择
  const lastSelectionRef = useRef<{
    text: string;
    start: number;
    end: number;
  } | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    // 阻止事件冒泡的处理器
    const handleStopPropagation = (e: Event) => {
      if (stopPropagation) {
        e.stopPropagation();
      }
    };

    // 处理键盘复制事件 (Ctrl+C / Cmd+C)
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCopyShortcut = (e.ctrlKey || e.metaKey) && e.key === 'c';
      
      if (enableCopy && isCopyShortcut) {
        // 获取当前选中的文本
        const target = e.target as TextInputElement;
        const selectedText = target.value.substring(
          target.selectionStart || 0,
          target.selectionEnd || 0
        );

        if (selectedText) {
          // 使用 Clipboard API 复制
          navigator.clipboard.writeText(selectedText).then(() => {
            console.log('Text copied via keyboard shortcut:', selectedText);
          }).catch(err => {
            console.error('Failed to copy text:', err);
            // 降级：使用 document.execCommand (已废弃但仍然有效)
            // eslint-disable-next-line deprecation/deprecation
            try {
              document.execCommand('copy');
            } catch (execError) {
              console.error('execCommand copy also failed:', execError);
            }
          });
        }
      }

      // 阻止事件冒泡
      if (stopPropagation) {
        e.stopPropagation();
      }
    };

    // 处理右键菜单复制（浏览器原生支持）
    const handleCopy = (e: ClipboardEvent) => {
      if (enableCopy) {
        const target = e.target as TextInputElement;
        const selectedText = target.value.substring(
          target.selectionStart || 0,
          target.selectionEnd || 0
        );

        if (selectedText && e.clipboardData) {
          e.clipboardData.setData('text/plain', selectedText);
          e.preventDefault(); // 阻止默认行为，使用我们自己的复制逻辑
          console.log('Text copied via context menu:', selectedText);
        }
      }

      // 阻止事件冒泡
      if (stopPropagation) {
        e.stopPropagation();
      }
    };

    // 保存文本选择状态
    const handleSelectionChange = () => {
      const start = element.selectionStart || 0;
      const end = element.selectionEnd || 0;
      
      if (start !== end) {
        lastSelectionRef.current = {
          text: element.value.substring(start, end),
          start,
          end
        };
      }
    };

    // 添加事件监听器
    element.addEventListener('pointerdown', handleStopPropagation);
    element.addEventListener('pointerup', handleStopPropagation);
    element.addEventListener('pointermove', handleStopPropagation);
    element.addEventListener('mousedown', handleStopPropagation);
    element.addEventListener('mouseup', handleStopPropagation);
    element.addEventListener('click', handleStopPropagation);
    element.addEventListener('keydown', handleKeyDown);
    element.addEventListener('copy', handleCopy);
    element.addEventListener('select', handleSelectionChange);

    // 清理函数
    return () => {
      element.removeEventListener('pointerdown', handleStopPropagation);
      element.removeEventListener('pointerup', handleStopPropagation);
      element.removeEventListener('pointermove', handleStopPropagation);
      element.removeEventListener('mousedown', handleStopPropagation);
      element.removeEventListener('mouseup', handleStopPropagation);
      element.removeEventListener('click', handleStopPropagation);
      element.removeEventListener('keydown', handleKeyDown);
      element.removeEventListener('copy', handleCopy);
      element.removeEventListener('select', handleSelectionChange);
    };
  }, [elementRef, enableCopy, stopPropagation]);

  return {
    lastSelection: lastSelectionRef.current,
  };
}
