import React, { useRef, useEffect, useCallback } from 'react';

const DEFAULT_FONT_SIZE = 14;
const DEFAULT_FONT_FAMILY = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Noto Sans', 'Noto Sans CJK SC', 'Microsoft Yahei', 'Hiragino Sans GB', Arial, sans-serif`;

interface InlineTextEditorProps {
  screenPosition: [number, number];
  zoom: number;
  onCommit: (text: string) => void;
}

/**
 * 内联文本编辑器
 *
 * 双击画布空白区域时，在双击位置显示一个无边框的编辑光标，
 * 用户可以直接输入文字。输入完成（失焦或按 Escape）后创建 Plait 文本元素。
 */
export const InlineTextEditor: React.FC<InlineTextEditorProps> = ({
  screenPosition,
  zoom,
  onCommit,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const committedRef = useRef(false);

  const commit = useCallback(() => {
    if (committedRef.current) return;
    committedRef.current = true;
    const text = editorRef.current?.textContent || '';
    onCommit(text);
  }, [onCommit]);

  // 自动聚焦
  useEffect(() => {
    const el = editorRef.current;
    if (el) {
      el.focus();
    }
  }, []);

  // 点击外部提交
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (editorRef.current && !editorRef.current.contains(e.target as Node)) {
        commit();
      }
    };

    // 延迟添加监听，避免双击事件立即触发
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleMouseDown);
    }, 50);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [commit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // 阻止事件冒泡到 Plait board 的全局键盘处理器
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      commit();
    }
    // Enter（不带 Shift）也提交
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commit();
    }
  }, [commit]);

  // 阻止所有键盘和鼠标事件冒泡，防止 Plait board 拦截
  const stopPropagation = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
  }, []);

  const scaledFontSize = DEFAULT_FONT_SIZE * zoom;

  return (
    <div
      ref={editorRef}
      contentEditable
      suppressContentEditableWarning
      onKeyDown={handleKeyDown}
      onKeyUp={stopPropagation}
      onMouseDown={stopPropagation}
      onPointerDown={stopPropagation}
      onBlur={commit}
      style={{
        position: 'fixed',
        left: screenPosition[0],
        top: screenPosition[1] - scaledFontSize / 2,
        minWidth: 1,
        minHeight: scaledFontSize,
        fontSize: scaledFontSize,
        fontFamily: DEFAULT_FONT_FAMILY,
        lineHeight: 1.4,
        color: '#333',
        background: 'transparent',
        border: 'none',
        outline: 'none',
        padding: 0,
        margin: 0,
        whiteSpace: 'pre',
        zIndex: 10000,
        caretColor: '#333',
      }}
    />
  );
};
