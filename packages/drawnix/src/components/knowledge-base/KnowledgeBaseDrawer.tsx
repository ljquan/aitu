/**
 * KnowledgeBaseDrawer - 知识库弹窗主组件
 *
 * 使用居中弹窗展示，内部复用 KnowledgeBaseContent
 */

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import KnowledgeBaseContent from './KnowledgeBaseContent';
import './knowledge-base-modal.scss';

interface KnowledgeBaseDrawerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** 初始打开的笔记 ID，打开弹窗后自动定位到该笔记 */
  initialNoteId?: string | null;
}

export const KnowledgeBaseDrawer: React.FC<KnowledgeBaseDrawerProps> = ({
  isOpen,
  onOpenChange,
  initialNoteId,
}) => {
  // ESC 键关闭
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onOpenChange]);

  if (!isOpen) return null;

  return createPortal(
    <div className="kb-modal-overlay" onMouseDown={() => onOpenChange(false)}>
      <div
        className="kb-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="kb-modal__header">
          <span className="kb-modal__title">知识库</span>
          <button
            className="kb-modal__close"
            onClick={() => onOpenChange(false)}
            aria-label="关闭知识库"
          >
            <X size={18} />
          </button>
        </div>
        {/* 内容区 */}
        <div className="kb-modal__body">
          <KnowledgeBaseContent initialNoteId={initialNoteId} />
        </div>
      </div>
    </div>,
    document.body
  );
};
