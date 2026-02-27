/**
 * Card 元素的 React 渲染组件
 *
 * 复用 MarkdownEditor 进行 Markdown 内容展示（只读模式）
 * Card 在画布上仅作只读展示，编辑通过知识库进行
 */
import React from 'react';
import { MarkdownEditor } from '../MarkdownEditor';
import { getTitleColor, getBodyColor } from '../../constants/card-colors';
import type { PlaitCard } from '../../types/card.types';

interface CardElementProps {
  element: PlaitCard;
}

/**
 * Card 内容组件 - 渲染标题 + MarkdownEditor 正文（只读）
 */
export const CardElement: React.FC<CardElementProps> = ({ element }) => {
  const hasTitle = !!(element.title && element.title.trim());
  const titleColor = getTitleColor(element.fillColor);
  const bodyColor = getBodyColor(element.fillColor);

  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 8,
        overflow: 'hidden',
        border: `1.5px solid ${titleColor}`,
        boxSizing: 'border-box',
        background: bodyColor,
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      {hasTitle && (
        <div
          style={{
            background: titleColor,
            color: '#fff',
            padding: '8px 12px',
            fontSize: 14,
            fontWeight: 600,
            lineHeight: '1.4',
            flexShrink: 0,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            cursor: 'move',
            pointerEvents: 'auto',
          }}
        >
          {element.title}
        </div>
      )}
      <div
        style={{
          pointerEvents: 'auto',
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <MarkdownEditor
          markdown={element.body}
          readOnly={true}
          showModeSwitch={false}
          className="card-markdown-viewer"
        />
      </div>
    </div>
  );
};
