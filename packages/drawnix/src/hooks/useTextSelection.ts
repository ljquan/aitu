/**
 * useTextSelection Hook
 *
 * 实现文本选择和复制功能，同时阻止事件冒泡到 document
 * 解决 ATTACHED_ELEMENT_CLASS_NAME 导致的复制问题
 *
 * 支持的元素类型：
 * - textarea / input：使用 selectionStart/selectionEnd
 * - div / span 等：使用 window.getSelection() API
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
type SelectableElement = HTMLElement;

/**
 * 判断元素是否为表单输入元素（textarea 或 input）
 */
function isTextInputElement(element: HTMLElement): element is TextInputElement {
  return element.tagName === 'TEXTAREA' || element.tagName === 'INPUT';
}

/**
 * 从表单元素获取选中的文本
 */
function getSelectedTextFromInput(element: TextInputElement): string {
  const start = element.selectionStart || 0;
  const end = element.selectionEnd || 0;
  return element.value.substring(start, end);
}

/**
 * 从普通元素获取选中的文本（使用 window.getSelection）
 */
function getSelectedTextFromElement(element: HTMLElement): string {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return '';
  }

  // 检查选区是否在目标元素内
  const range = selection.getRangeAt(0);
  if (!element.contains(range.commonAncestorContainer)) {
    return '';
  }

  return selection.toString();
}

/**
 * 获取元素内选中的文本（自动判断元素类型）
 */
function getSelectedText(element: HTMLElement): string {
  if (isTextInputElement(element)) {
    return getSelectedTextFromInput(element);
  }
  return getSelectedTextFromElement(element);
}

/**
 * 自定义 Hook，用于处理文本元素的选择和复制功能
 *
 * 功能：
 * 1. 监听 Ctrl+C / Cmd+C 复制快捷键
 * 2. 监听右键菜单复制操作
 * 3. 阻止 pointerup 等事件冒泡，避免影响画板选中状态
 *
 * @param elementRef - 要监听的元素引用（支持 div、textarea、input 等）
 * @param options - 配置选项
 */
export function useTextSelection(
  elementRef: RefObject<SelectableElement>,
  options: UseTextSelectionOptions = {}
) {
  const { enableCopy = true, stopPropagation = true } = options;

  // 保存最近的文本选择
  const lastSelectionRef = useRef<{
    text: string;
    start?: number;
    end?: number;
  } | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    /**
     * 检查目标元素是否为交互元素（按钮、链接、输入框等）
     * 这些元素需要正常接收点击事件，不应该阻止冒泡
     */
    const isInteractiveElement = (target: EventTarget | null): boolean => {
      if (!target || !(target instanceof HTMLElement)) return false;

      const interactiveTags = ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL'];
      if (interactiveTags.includes(target.tagName)) return true;

      // 检查是否有点击相关的属性
      if (target.onclick || target.getAttribute('role') === 'button') return true;

      // 检查父元素是否为交互元素（处理按钮内的图标等）
      const closestInteractive = target.closest('button, a, [role="button"], [onclick]');
      if (closestInteractive) return true;

      return false;
    };

    /**
     * 检查当前是否有文本被选中
     */
    const hasTextSelection = (): boolean => {
      const selection = window.getSelection();
      return selection !== null && selection.toString().length > 0;
    };

    // 阻止事件冒泡的处理器（仅在有文本选择且目标不是交互元素时）
    const handleStopPropagation = (e: Event) => {
      if (!stopPropagation) return;

      // 如果目标是交互元素，不阻止冒泡
      if (isInteractiveElement(e.target)) return;

      // 只有在有文本选择时才阻止冒泡
      if (hasTextSelection()) {
        e.stopPropagation();
      }
    };

    // 处理 pointerdown/mousedown - 这些在选择开始时触发，此时可能还没有选择
    // 我们需要允许用户开始选择，但不应该阻止交互元素的点击
    const handlePointerDown = (e: Event) => {
      if (!stopPropagation) return;
      if (isInteractiveElement(e.target)) return;
      e.stopPropagation();
    };

    // 处理键盘复制/剪切事件 (Ctrl+C / Cmd+C, Ctrl+X / Cmd+X)
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCopyShortcut = (e.ctrlKey || e.metaKey) && e.key === 'c';
      const isCutShortcut = (e.ctrlKey || e.metaKey) && e.key === 'x';

      if (enableCopy && (isCopyShortcut || isCutShortcut)) {
        // 获取当前选中的文本
        const selectedText = getSelectedText(element);

        if (selectedText) {
          // 使用 Clipboard API 复制
          navigator.clipboard.writeText(selectedText).then(() => {
            // console.log(`Text ${isCutShortcut ? 'cut' : 'copied'} via keyboard shortcut:`, selectedText);
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

        // 只对复制/剪切快捷键阻止冒泡，其他按键需要传递给 React 的 onKeyDown
        if (stopPropagation) {
          e.stopPropagation();
        }
      }
      // 注意：不再对所有按键调用 stopPropagation()
      // 这样 Enter 等按键可以正常触发 React 的 onKeyDown
    };

    // 处理右键菜单复制（浏览器原生支持）
    const handleCopy = (e: ClipboardEvent) => {
      if (enableCopy) {
        const selectedText = getSelectedText(element);

        if (selectedText && e.clipboardData) {
          e.clipboardData.setData('text/plain', selectedText);
          e.preventDefault(); // 阻止默认行为，使用我们自己的复制逻辑
          // console.log('Text copied via context menu:', selectedText);
        }
      }

      // 阻止事件冒泡
      if (stopPropagation) {
        e.stopPropagation();
      }
    };

    // 处理右键菜单剪切
    const handleCut = (e: ClipboardEvent) => {
      if (enableCopy) {
        const selectedText = getSelectedText(element);

        if (selectedText && e.clipboardData) {
          e.clipboardData.setData('text/plain', selectedText);
          // console.log('Text cut via context menu:', selectedText);
          // 不阻止默认行为，让浏览器删除选中的文本
        }
      }

      // 阻止事件冒泡
      if (stopPropagation) {
        e.stopPropagation();
      }
    };

    // 保存文本选择状态
    const handleSelectionChange = () => {
      if (isTextInputElement(element)) {
        // 表单元素：使用 selectionStart/selectionEnd
        const start = element.selectionStart || 0;
        const end = element.selectionEnd || 0;

        if (start !== end) {
          lastSelectionRef.current = {
            text: element.value.substring(start, end),
            start,
            end
          };
        }
      } else {
        // 普通元素：使用 window.getSelection
        const selectedText = getSelectedTextFromElement(element);
        if (selectedText) {
          lastSelectionRef.current = {
            text: selectedText
          };
        }
      }
    };

    // 监听 document 的 selectionchange 事件（用于普通元素）
    const handleDocumentSelectionChange = () => {
      if (!isTextInputElement(element)) {
        handleSelectionChange();
      }
    };

    // 添加事件监听器
    // pointerdown/mousedown 使用特殊处理器，允许交互元素正常工作
    element.addEventListener('pointerdown', handlePointerDown);
    element.addEventListener('mousedown', handlePointerDown);
    // pointerup/mouseup/click 只在有选择时阻止冒泡
    element.addEventListener('pointerup', handleStopPropagation);
    element.addEventListener('pointermove', handleStopPropagation);
    element.addEventListener('mouseup', handleStopPropagation);
    element.addEventListener('click', handleStopPropagation);
    element.addEventListener('keydown', handleKeyDown as EventListener);
    element.addEventListener('copy', handleCopy as EventListener);
    element.addEventListener('cut', handleCut as EventListener);

    // 表单元素监听 select 事件，普通元素监听 document 的 selectionchange
    if (isTextInputElement(element)) {
      element.addEventListener('select', handleSelectionChange);
    } else {
      document.addEventListener('selectionchange', handleDocumentSelectionChange);
    }

    // 清理函数
    return () => {
      element.removeEventListener('pointerdown', handlePointerDown);
      element.removeEventListener('mousedown', handlePointerDown);
      element.removeEventListener('pointerup', handleStopPropagation);
      element.removeEventListener('pointermove', handleStopPropagation);
      element.removeEventListener('mouseup', handleStopPropagation);
      element.removeEventListener('click', handleStopPropagation);
      element.removeEventListener('keydown', handleKeyDown as EventListener);
      element.removeEventListener('copy', handleCopy as EventListener);
      element.removeEventListener('cut', handleCut as EventListener);

      if (isTextInputElement(element)) {
        element.removeEventListener('select', handleSelectionChange);
      } else {
        document.removeEventListener('selectionchange', handleDocumentSelectionChange);
      }
    };
  }, [elementRef, enableCopy, stopPropagation]);

  return {
    lastSelection: lastSelectionRef.current,
  };
}
