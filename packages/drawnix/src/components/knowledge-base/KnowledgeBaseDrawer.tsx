/**
 * KnowledgeBaseDrawer - 知识库抽屉主组件
 *
 * 使用 BaseDrawer 作为容器，内部复用 KnowledgeBaseContent
 */

import React from 'react';
import { BaseDrawer } from '../side-drawer';
import KnowledgeBaseContent from './KnowledgeBaseContent';

interface KnowledgeBaseDrawerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export const KnowledgeBaseDrawer: React.FC<KnowledgeBaseDrawerProps> = ({
  isOpen,
  onOpenChange,
}) => {
  return (
    <BaseDrawer
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      position="toolbar-right"
      width="wide"
      storageKey="kb-drawer-width"
      title="知识库"
      resizable
    >
      {isOpen && <KnowledgeBaseContent />}
    </BaseDrawer>
  );
};
