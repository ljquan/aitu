/**
 * KBNoteEditor - 知识库笔记编辑器
 *
 * 标题编辑 + 来源信息（可折叠） + 标签选择 + Markdown 编辑器
 * 自动保存（500ms 防抖）
 * 支持语音朗读、导出 Markdown
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { SkillDSLParser } from '../ai-input-bar/skill-dsl-parser';
import {
  Volume2,
  VolumeX,
  Download,
  ChevronDown,
  ChevronRight,
  Globe,
  User,
  Calendar,
  ExternalLink,
  BookOpen,
  Lock,
} from 'lucide-react';
import { MarkdownEditor, MarkdownEditorRef } from '../MarkdownEditor';
import { KBTagSelector } from './KBTagSelector';
import { useTextToSpeech } from './useTextToSpeech';
import { knowledgeBaseService } from '../../services/knowledge-base-service';
import './knowledge-base-editor.scss';
import type { KBNote, KBTag, KBTagWithCount } from '../../types/knowledge-base.types';

interface KBNoteEditorProps {
  note: KBNote | null;
  allTags: KBTagWithCount[];
  noteTags: KBTag[];
  /** 是否只读模式（系统内置 Skill 笔记） */
  readOnly?: boolean;
  /** 是否在 Skill 目录下（用于显示 DSL 解析状态提示） */
  isSkillDirectory?: boolean;
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
  readOnly = false,
  isSkillDirectory = false,
  onUpdateNote,
  onSetNoteTags,
  onCreateTag,
}) => {
  const [title, setTitle] = useState('');
  const [metadataCollapsed, setMetadataCollapsed] = useState(false);
  /** DSL 解析状态：null=不显示, true=符合规范, false=不符合规范 */
  const [isDSLContent, setIsDSLContent] = useState<boolean | null>(null);
  const dslCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<MarkdownEditorRef>(null);
  const currentNoteIdRef = useRef<string | null>(null);

  const { isSpeaking, isPaused, isSupported, speak, pause, resume, stop } =
    useTextToSpeech();

  // 标签 IDs
  const selectedTagIds = useMemo(() => noteTags.map((t) => t.id), [noteTags]);

  // 笔记元数据
  const metadata = (note as any)?.metadata;
  const hasSourceInfo = metadata && (metadata.sourceUrl || metadata.author || metadata.domain);

  // 切换笔记时重置标题、语音和 DSL 状态
  useEffect(() => {
    if (note) {
      setTitle(note.title);
      currentNoteIdRef.current = note.id;
      // 切换笔记时立即检测 DSL 状态
      if (isSkillDirectory && !readOnly) {
        const content = note.content || '';
        setIsDSLContent(content.trim() ? SkillDSLParser.isDSLContent(content) : null);
      } else {
        setIsDSLContent(null);
      }
    } else {
      setTitle('');
      currentNoteIdRef.current = null;
      setIsDSLContent(null);
    }
    stop();
  }, [note?.id, stop, isSkillDirectory, readOnly]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // 内容变化时防抖保存，并在 Skill 目录下检测 DSL 状态
  const handleContentChange = useCallback(
    (content: string) => {
      if (!note) return;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        onUpdateNote(note.id, { content });
      }, 500);

      // Skill 目录下：debounce 500ms 检测 DSL 规范
      if (isSkillDirectory && !readOnly) {
        if (dslCheckTimeoutRef.current) clearTimeout(dslCheckTimeoutRef.current);
        dslCheckTimeoutRef.current = setTimeout(() => {
          if (!content.trim()) {
            setIsDSLContent(null);
          } else {
            setIsDSLContent(SkillDSLParser.isDSLContent(content));
          }
        }, 500);
      }
    },
    [note, onUpdateNote, isSkillDirectory, readOnly]
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
      if (dslCheckTimeoutRef.current) clearTimeout(dslCheckTimeoutRef.current);
    };
  }, []);

  if (!note) {
    return (
      <div className="kb-note-editor kb-note-editor--empty">
        <div className="kb-note-editor__placeholder">
          <div className="kb-note-editor__placeholder-icon">
            <BookOpen size={64} strokeWidth={1} />
          </div>
          <h3 className="kb-note-editor__placeholder-title">无笔记选中</h3>
          <p className="kb-note-editor__placeholder-text">
            选择左侧的一篇笔记开始编辑，或者创建一个新笔记
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`kb-note-editor ${readOnly ? 'kb-note-editor--readonly' : ''}`}>
      {/* 只读模式提示条 */}
      {readOnly && (
        <div className="kb-note-editor__readonly-banner">
          <Lock size={14} />
          <span>系统内置 Skill，不可修改</span>
        </div>
      )}
      {/* 标题行 */}
      <div className="kb-note-editor__title-row">
        <input
          className="kb-note-editor__title"
          value={title}
          onChange={(e) => !readOnly && handleTitleChange(e.target.value)}
          placeholder="笔记标题"
          readOnly={readOnly}
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

      {/* 来源信息区域 - 可折叠 */}
      {hasSourceInfo && (
        <div className={`kb-note-editor__metadata-section ${metadataCollapsed ? 'kb-note-editor__metadata-section--collapsed' : ''}`}>
          <button
            className="kb-note-editor__metadata-toggle"
            onClick={() => setMetadataCollapsed(!metadataCollapsed)}
            title={metadataCollapsed ? '展开来源信息' : '收起来源信息'}
          >
            {metadataCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            <span>来源信息</span>
          </button>

          {/* 折叠时显示简要信息 */}
          {metadataCollapsed && (
            <div className="kb-note-editor__metadata-collapsed">
              {metadata.author && (
                <span className="kb-note-editor__metadata-collapsed-item">
                  <User size={10} />
                  <span>{metadata.author}</span>
                </span>
              )}
              {metadata.sourceUrl && (
                <a
                  href={metadata.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="kb-note-editor__metadata-collapsed-link"
                  onClick={(e) => e.stopPropagation()}
                  title={metadata.sourceUrl}
                >
                  <ExternalLink size={10} />
                  <span>{metadata.domain || metadata.sourceUrl}</span>
                </a>
              )}
            </div>
          )}

          {/* 展开时显示完整信息 */}
          {!metadataCollapsed && (
            <div className="kb-note-editor__metadata-body">
              {/* 标签选择器 */}
              <div className="kb-note-editor__tags">
                <KBTagSelector
                  allTags={allTags}
                  selectedTagIds={selectedTagIds}
                  onSelectedChange={handleTagsChange}
                  onCreateTag={onCreateTag}
                />
              </div>

              {/* 元数据信息行 */}
              <div className="kb-note-editor__metadata-info">
                {metadata.domain && (
                  <span className="kb-note-editor__metadata-item">
                    {metadata.faviconUrl ? (
                      <img
                        src={metadata.faviconUrl}
                        alt=""
                        className="kb-note-editor__favicon"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <Globe size={12} />
                    )}
                    <span>{metadata.domain}</span>
                  </span>
                )}
                {metadata.author && (
                  <span className="kb-note-editor__metadata-item">
                    <User size={12} />
                    <span>{metadata.author}</span>
                  </span>
                )}
                {metadata.publishedAt && (
                  <span className="kb-note-editor__metadata-item">
                    <Calendar size={12} />
                    <span>{metadata.publishedAt}</span>
                  </span>
                )}
              </div>
              {metadata.sourceUrl && (
                <a
                  href={metadata.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="kb-note-editor__source-link"
                >
                  {metadata.sourceUrl}
                </a>
              )}
              {metadata.description && (
                <p className="kb-note-editor__metadata-desc">{metadata.description}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* 无来源信息时仍显示标签 */}
      {!hasSourceInfo && (
        <div className="kb-note-editor__tags">
          <KBTagSelector
            allTags={allTags}
            selectedTagIds={selectedTagIds}
            onSelectedChange={handleTagsChange}
            onCreateTag={onCreateTag}
          />
        </div>
      )}

      {/* Markdown 编辑器 */}
      <div className="kb-note-editor__content">
        <MarkdownEditor
          ref={editorRef}
          markdown={note.content}
          onChange={readOnly ? undefined : handleContentChange}
          placeholder="开始写点什么..."
          showModeSwitch={!readOnly}
          readOnly={readOnly}
        />
      </div>

      {/* DSL 解析状态提示条（仅在 Skill 目录且非只读时显示） */}
      {isSkillDirectory && !readOnly && isDSLContent !== null && (
        <div className={`kb-note-editor__dsl-status ${isDSLContent ? 'kb-note-editor__dsl-status--valid' : 'kb-note-editor__dsl-status--fallback'}`}>
          {isDSLContent
            ? '✓ 已识别为工作流 DSL（正则解析），将直接执行'
            : '⚡ 将由 AI 解析为工作流（大模型解析）'
          }
        </div>
      )}
    </div>
  );
};
