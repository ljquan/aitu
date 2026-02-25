import { PlaitBoard, Transforms } from '@plait/core';
import { PlaitCard } from '../types/card.types';
import { MessagePlugin } from 'tdesign-react';

export const openCardInKnowledgeBase = async (board: PlaitBoard, cardElement: PlaitCard, language: 'zh' | 'en' = 'zh') => {
  if (!cardElement) return;

  // 如果 Card 已关联笔记，直接打开知识库并定位
  if (cardElement.noteId) {
    window.dispatchEvent(new CustomEvent('kb:open', { detail: { noteId: cardElement.noteId } }));
    return;
  }

  // 否则先在知识库中创建新笔记，再关联
  try {
    const { knowledgeBaseService } = await import('../services/knowledge-base-service');
    await knowledgeBaseService.initialize();

    // 找到或创建"笔记"目录
    const dirs = await knowledgeBaseService.getAllDirectories();
    let noteDir = dirs.find((d: any) => d.name === '笔记');
    if (!noteDir) {
      noteDir = await knowledgeBaseService.createDirectory('笔记');
    }

    // 创建新笔记，标题取 Card title，内容取 Card body
    const title = cardElement.title || '新笔记';
    const content = cardElement.body || '';
    const note = await knowledgeBaseService.createNote(title, noteDir.id);
    if (content) {
      await knowledgeBaseService.updateNote(note.id, { content });
    }

    // 将 noteId 写回 Card 元素
    const elementIndex = board.children.findIndex((child: any) => child.id === cardElement.id);
    if (elementIndex >= 0) {
      Transforms.setNode(board, { noteId: note.id } as any, [elementIndex]);
    }

    // 打开知识库并定位到新笔记
    window.dispatchEvent(new CustomEvent('kb:open', { detail: { noteId: note.id } }));
  } catch (error) {
    console.error('Failed to create note for card:', error);
    MessagePlugin.error(language === 'zh' ? '无法打开知识库笔记' : 'Failed to open knowledge base note');
  }
};
