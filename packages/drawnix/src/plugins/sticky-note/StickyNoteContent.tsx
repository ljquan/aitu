/**
 * Sticky Note Content Component
 *
 * 便利贴内容组件，支持 Markdown 渲染和编辑
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  StickyNoteColor,
  STICKY_NOTE_TEXT_COLORS,
} from '../../types/sticky-note.types';
import './sticky-note.scss';

interface StickyNoteContentProps {
  /** Markdown 内容 */
  content: string;
  /** 背景颜色 */
  backgroundColor: StickyNoteColor;
  /** 是否处于编辑模式 */
  isEditing?: boolean;
  /** 内容变化回调 */
  onContentChange?: (content: string) => void;
  /** 编辑模式变化回调 */
  onEditingChange?: (isEditing: boolean) => void;
  /** 是否只读 */
  readonly?: boolean;
}

/**
 * 简单的 Markdown 渲染器
 * 支持: 标题、粗体、斜体、列表、链接、代码
 */
function renderMarkdown(content: string): React.ReactNode {
  if (!content) return null;

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const key = `line-${i}`;

    // 空行
    if (!line.trim()) {
      elements.push(<br key={key} />);
      continue;
    }

    // 标题
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = parseInlineMarkdown(headingMatch[2]);
      const HeadingTag = `h${level}` as keyof JSX.IntrinsicElements;
      elements.push(
        <HeadingTag key={key} className={`sticky-note-heading sticky-note-h${level}`}>
          {text}
        </HeadingTag>
      );
      continue;
    }

    // 无序列表
    const ulMatch = line.match(/^[-*]\s+(.+)$/);
    if (ulMatch) {
      elements.push(
        <li key={key} className="sticky-note-list-item">
          {parseInlineMarkdown(ulMatch[1])}
        </li>
      );
      continue;
    }

    // 有序列表
    const olMatch = line.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      elements.push(
        <li key={key} className="sticky-note-list-item sticky-note-ordered">
          {parseInlineMarkdown(olMatch[1])}
        </li>
      );
      continue;
    }

    // 普通段落
    elements.push(
      <p key={key} className="sticky-note-paragraph">
        {parseInlineMarkdown(line)}
      </p>
    );
  }

  return <>{elements}</>;
}

/**
 * 解析行内 Markdown 格式
 */
function parseInlineMarkdown(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let keyIndex = 0;

  while (remaining.length > 0) {
    // 代码 `code`
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      parts.push(
        <code key={`code-${keyIndex++}`} className="sticky-note-code">
          {codeMatch[1]}
        </code>
      );
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // 粗体 **bold** 或 __bold__
    const boldMatch = remaining.match(/^(\*\*|__)(.+?)\1/);
    if (boldMatch) {
      parts.push(
        <strong key={`bold-${keyIndex++}`}>{boldMatch[2]}</strong>
      );
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // 斜体 *italic* 或 _italic_
    const italicMatch = remaining.match(/^(\*|_)(.+?)\1/);
    if (italicMatch) {
      parts.push(
        <em key={`italic-${keyIndex++}`}>{italicMatch[2]}</em>
      );
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // 链接 [text](url)
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      parts.push(
        <a
          key={`link-${keyIndex++}`}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="sticky-note-link"
        >
          {linkMatch[1]}
        </a>
      );
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // 普通文本（取下一个特殊字符前的所有内容）
    const nextSpecial = remaining.search(/[`*_\[]/);
    if (nextSpecial === -1) {
      parts.push(remaining);
      break;
    } else if (nextSpecial === 0) {
      // 如果特殊字符不能被解析，就当普通字符处理
      parts.push(remaining[0]);
      remaining = remaining.slice(1);
    } else {
      parts.push(remaining.slice(0, nextSpecial));
      remaining = remaining.slice(nextSpecial);
    }
  }

  return <>{parts}</>;
}

/**
 * 便利贴内容组件
 */
export const StickyNoteContent: React.FC<StickyNoteContentProps> = ({
  content,
  backgroundColor,
  isEditing = false,
  onContentChange,
  onEditingChange,
  readonly = false,
}) => {
  const [localContent, setLocalContent] = useState(content);
  const [editing, setEditing] = useState(isEditing);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const textColor = STICKY_NOTE_TEXT_COLORS[backgroundColor] || '#1F2937';

  // 同步外部 content 变化
  useEffect(() => {
    if (!editing) {
      setLocalContent(content);
    }
  }, [content, editing]);

  // 进入编辑模式时聚焦
  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      // 将光标移到末尾
      textareaRef.current.selectionStart = textareaRef.current.value.length;
      textareaRef.current.selectionEnd = textareaRef.current.value.length;
    }
  }, [editing]);

  // 双击进入编辑模式
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (readonly) return;
    e.stopPropagation();
    setEditing(true);
    onEditingChange?.(true);
  }, [readonly, onEditingChange]);

  // 失焦退出编辑模式
  const handleBlur = useCallback(() => {
    setEditing(false);
    onEditingChange?.(false);
    if (localContent !== content) {
      onContentChange?.(localContent);
    }
  }, [localContent, content, onContentChange, onEditingChange]);

  // 内容变化
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLocalContent(e.target.value);
  }, []);

  // 键盘事件
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Escape 退出编辑模式
    if (e.key === 'Escape') {
      e.preventDefault();
      setEditing(false);
      onEditingChange?.(false);
      if (localContent !== content) {
        onContentChange?.(localContent);
      }
    }
    // 阻止事件冒泡到画布
    e.stopPropagation();
  }, [localContent, content, onContentChange, onEditingChange]);

  return (
    <div
      className="sticky-note-container"
      style={{
        backgroundColor,
        color: textColor,
      }}
      onDoubleClick={handleDoubleClick}
    >
      {/* 标题栏 */}
      <div className="sticky-note-header">
        <div className="sticky-note-title">便签</div>
        {!readonly && (
          <div className="sticky-note-hint">
            {editing ? '按 Esc 完成编辑' : '双击编辑'}
          </div>
        )}
      </div>

      {/* 内容区域 */}
      <div className="sticky-note-body">
        {editing ? (
          <textarea
            ref={textareaRef}
            className="sticky-note-editor"
            value={localContent}
            onChange={handleChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder="输入内容，支持 Markdown 格式..."
            style={{ color: textColor }}
          />
        ) : (
          <div className="sticky-note-content">
            {localContent ? (
              renderMarkdown(localContent)
            ) : (
              <p className="sticky-note-placeholder">双击编辑内容...</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default StickyNoteContent;
