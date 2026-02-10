/**
 * KBNoteEditor - 知识库笔记编辑器
 *
 * 标题编辑 + Markdown 编辑器 + 标签选择
 * 自动保存（500ms 防抖）
 * 支持语音朗读、导出 Markdown
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Volume2, VolumeX, Download } from 'lucide-react';
import { MarkdownEditor, MarkdownEditorRef } from '../MarkdownEditor';
import { KBTagSelector } from './KBTagSelector';
import { useTextToSpeech } from './useTextToSpeech';
import { knowledgeBaseService } from '../../services/knowledge-base-service';
import type { KBNote, KBTag, KBTagWithCount } from '../../types/knowledge-base.types';

interface KBNoteEditorProps {
  note: KBNote | null;
  allTags: KBTagWithCount[];
  noteTags: KBTag[];
  onUpdateNote: (id: string, updates: { title?: string; content?: string }) => void;
  onSetNoteTags: (noteId: string, tagIds: string[]) => void;
  onCreateTag: (name: string) => Promise<KBTag>;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const KBNoteEditor: React.FC<KBNoteEditorProps> = ({
  note,
  allTags,
  noteTags,
  onUpdateNote,
  onSetNoteTags,
  onCreateTag,
}) => {
  const [title, setTitle] = useState('');
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<MarkdownEditorRef>(null);
  const currentNoteIdRef = useRef<string | null>(null);

  const { isSpeaking, isPaused, isSupported, speak, pause, resume, stop } =
    useTextToSpeech();

  // 标签 IDs
  const selectedTagIds = useMemo(() => noteTags.map((t) => t.id), [noteTags]);

  // 切换笔记时重置标题和语音
  useEffect(() => {
    if (note) {
      setTitle(note.title);
      currentNoteIdRef.current = note.id;
    } else {
      setTitle('');
      currentNoteIdRef.current = null;
    }
    stop();
  }, [note?.id, stop]); // eslint-disable-line react-hooks/exhaustive-deps

  // 标题变化时防抖保存
  const handleTitleChange = useCallback(
    (newTitle: string) => {
      setTitle(newTitle);
      if (!note) return;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        onUpdateNote(note.id, { title: newTitle });
      }, 500);
    },
    [note, onUpdateNote]
  );

  // 内容变化时防抖保存
  const handleContentChange = useCallback(
    (content: string) => {
      if (!note) return;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        onUpdateNote(note.id, { content });
      }, 500);
    },
    [note, onUpdateNote]
  );

  // 标签变化
  const handleTagsChange = useCallback(
    (tagIds: string[]) => {
      if (!note) return;
      onSetNoteTags(note.id, tagIds);
    },
    [note, onSetNoteTags]
  );

  // 语音朗读切换
  const handleSpeechToggle = useCallback(() => {
    if (!note) return;
    if (isSpeaking) {
      if (isPaused) {
        resume();
      } else {
        pause();
      }
    } else {
      speak(note.content);
    }
  }, [note, isSpeaking, isPaused, speak, pause, resume]);

  // 导出 Markdown
  const handleExportMarkdown = useCallback(async () => {
    if (!note) return;
    const result = await knowledgeBaseService.exportNoteAsMarkdown(note.id);
    if (!result) return;

    const blob = new Blob([result.content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [note]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  if (!note) {
    return (
      <div className="kb-note-editor kb-note-editor--empty">
        <div className="kb-note-editor__placeholder">
          选择一篇笔记开始编辑，或创建新笔记
        </div>
      </div>
    );
  }

  return (
    <div className="kb-note-editor" key={note.id}>
      {/* 标题行 */}
      <div className="kb-note-editor__title-row">
        <input
          className="kb-note-editor__title"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="笔记标题"
        />
        <div className="kb-note-editor__actions">
          {isSupported && (
            <button
              className={`kb-note-editor__action-btn ${isSpeaking ? 'kb-note-editor__action-btn--active' : ''}`}
              onClick={handleSpeechToggle}
              title={isSpeaking ? (isPaused ? '继续朗读' : '暂停朗读') : '语音朗读'}
            >
              {isSpeaking && !isPaused ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
          )}
          {isSpeaking && (
            <button
              className="kb-note-editor__action-btn kb-note-editor__action-btn--danger"
              onClick={stop}
              title="停止朗读"
            >
              ■
            </button>
          )}
          <button
            className="kb-note-editor__action-btn"
            onClick={handleExportMarkdown}
            title="导出 Markdown"
          >
            <Download size={14} />
          </button>
        </div>
      </div>

      {/* 元数据 */}
      <div className="kb-note-editor__meta">
        <span>创建: {formatDate(note.createdAt)}</span>
        <span>更新: {formatDate(note.updatedAt)}</span>
      </div>

      {/* 标签 */}
      <div className="kb-note-editor__tags">
        <KBTagSelector
          allTags={allTags}
          selectedTagIds={selectedTagIds}
          onSelectedChange={handleTagsChange}
          onCreateTag={onCreateTag}
        />
      </div>

      {/* Markdown 编辑器 */}
      <div className="kb-note-editor__content">
        <MarkdownEditor
          ref={editorRef}
          markdown={note.content}
          onChange={handleContentChange}
          placeholder="开始写点什么..."
          showModeSwitch={true}
        />
      </div>
    </div>
  );
};
