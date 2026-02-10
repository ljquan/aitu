/**
 * KnowledgeBaseContent - 知识库核心内容组件
 *
 * 独立于容器的知识库内容，可嵌入 WinBox、Dialog 或任意父容器
 * 管理目录树、笔记列表和编辑器
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Input } from 'tdesign-react';
import { Search, Upload, Download } from 'lucide-react';
import { KBDirectoryTree } from './KBDirectoryTree';
import { KBNoteList } from './KBNoteList';
import { KBNoteEditor } from './KBNoteEditor';
import { KBSortDropdown } from './KBSortDropdown';
import { KBTagSelector } from './KBTagSelector';
import { KBRelatedNotes } from './KBRelatedNotes';
import { knowledgeBaseService } from '../../services/knowledge-base-service';
import type {
  KBDirectory,
  KBNote,
  KBNoteMeta,
  KBTag,
  KBTagWithCount,
  KBSortOptions,
} from '../../types/knowledge-base.types';
import './knowledge-base-drawer.scss';

const KnowledgeBaseContent: React.FC = () => {
  // Data state
  const [directories, setDirectories] = useState<KBDirectory[]>([]);
  const [allNotes, setAllNotes] = useState<KBNoteMeta[]>([]);
  const [allTags, setAllTags] = useState<KBTagWithCount[]>([]);
  const [currentNote, setCurrentNote] = useState<KBNote | null>(null);
  const [noteTags, setNoteTags] = useState<KBTag[]>([]);
  const [noteTagsMap, setNoteTagsMap] = useState<Record<string, KBTag[]>>({});

  // UI state
  const [selectedDirId, setSelectedDirId] = useState<string | null>(null);
  const [expandedDirIds, setExpandedDirIds] = useState<Set<string>>(new Set());
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOptions, setSortOptions] = useState<KBSortOptions>(
    knowledgeBaseService.loadSortPreference
      ? knowledgeBaseService.loadSortPreference()
      : { field: 'updatedAt', order: 'desc' }
  );
  const [filterTagIds, setFilterTagIds] = useState<string[]>([]);
  const [showTagFilter, setShowTagFilter] = useState(false);

  const initializedRef = useRef(false);

  // Initialize on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const init = async () => {
      await knowledgeBaseService.initialize();
      await refreshData();
    };
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshData = useCallback(async () => {
    const [dirs, notes, tags] = await Promise.all([
      knowledgeBaseService.getAllDirectories(),
      knowledgeBaseService.getAllNoteMetas(),
      knowledgeBaseService.getAllTags(),
    ]);
    setDirectories(dirs);
    setAllNotes(notes);
    setAllTags(tags);

    // Auto-select first directory
    if (!selectedDirId && dirs.length > 0) {
      setSelectedDirId(dirs[0].id);
      setExpandedDirIds(new Set([dirs[0].id]));
    }

    // Load tags for visible notes
    await refreshNoteTagsMap(notes);
  }, [selectedDirId]);

  const refreshNoteTagsMap = useCallback(async (notes: KBNoteMeta[]) => {
    const map: Record<string, KBTag[]> = {};
    for (const note of notes) {
      map[note.id] = await knowledgeBaseService.getTagsForNote(note.id);
    }
    setNoteTagsMap(map);
  }, []);

  // Note counts per directory
  const noteCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const note of allNotes) {
      counts[note.directoryId] = (counts[note.directoryId] || 0) + 1;
    }
    return counts;
  }, [allNotes]);

  // Filtered & sorted notes for current directory
  const filteredNotes = useMemo(() => {
    let notes = allNotes;

    // Filter by directory
    if (selectedDirId) {
      notes = notes.filter((n) => n.directoryId === selectedDirId);
    }

    // Filter by search query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      notes = notes.filter((n) => n.title.toLowerCase().includes(q));
    }

    // Filter by tags
    if (filterTagIds.length > 0) {
      const tagSet = new Set(filterTagIds);
      notes = notes.filter((n) => {
        const tags = noteTagsMap[n.id] || [];
        return tags.some((t) => tagSet.has(t.id));
      });
    }

    // Sort
    return knowledgeBaseService.sortNoteMetas(notes, sortOptions);
  }, [allNotes, selectedDirId, searchQuery, filterTagIds, sortOptions, noteTagsMap]);

  // Directory handlers
  const handleCreateDir = useCallback(async (name: string) => {
    await knowledgeBaseService.createDirectory(name);
    await refreshData();
  }, [refreshData]);

  const handleRenameDir = useCallback(async (id: string, name: string) => {
    await knowledgeBaseService.updateDirectory(id, { name });
    await refreshData();
  }, [refreshData]);

  const handleDeleteDir = useCallback(async (id: string) => {
    await knowledgeBaseService.deleteDirectory(id);
    if (selectedDirId === id) {
      setSelectedDirId(directories[0]?.id || null);
      setSelectedNoteId(null);
      setCurrentNote(null);
    }
    await refreshData();
  }, [refreshData, selectedDirId, directories]);

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedDirIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Note handlers
  const handleSelectNote = useCallback(async (id: string) => {
    setSelectedNoteId(id);
    const note = await knowledgeBaseService.getNoteById(id);
    setCurrentNote(note);
    if (note) {
      const tags = await knowledgeBaseService.getTagsForNote(note.id);
      setNoteTags(tags);
    }
  }, []);

  const handleCreateNote = useCallback(async () => {
    if (!selectedDirId) return;
    const note = await knowledgeBaseService.createNote('新笔记', selectedDirId);
    await refreshData();
    handleSelectNote(note.id);
  }, [selectedDirId, refreshData, handleSelectNote]);

  const handleUpdateNote = useCallback(
    async (id: string, updates: { title?: string; content?: string }) => {
      await knowledgeBaseService.updateNote(id, updates);
      // Update local state without full refresh
      setAllNotes((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, ...updates, updatedAt: Date.now() } : n
        )
      );
      if (currentNote?.id === id) {
        setCurrentNote((prev) =>
          prev ? { ...prev, ...updates, updatedAt: Date.now() } : prev
        );
      }
    },
    [currentNote]
  );

  const handleDeleteNote = useCallback(
    async (id: string) => {
      await knowledgeBaseService.deleteNote(id);
      if (selectedNoteId === id) {
        setSelectedNoteId(null);
        setCurrentNote(null);
        setNoteTags([]);
      }
      await refreshData();
    },
    [selectedNoteId, refreshData]
  );

  // Tag handlers
  const handleSetNoteTags = useCallback(
    async (noteId: string, tagIds: string[]) => {
      await knowledgeBaseService.setNoteTags(noteId, tagIds);
      const tags = await knowledgeBaseService.getTagsForNote(noteId);
      setNoteTags(tags);
      setNoteTagsMap((prev) => ({ ...prev, [noteId]: tags }));
      // Refresh tags (counts may change)
      const allTagsNew = await knowledgeBaseService.getAllTags();
      setAllTags(allTagsNew);
    },
    []
  );

  const handleCreateTag = useCallback(async (name: string) => {
    const tag = await knowledgeBaseService.createTag(name);
    const allTagsNew = await knowledgeBaseService.getAllTags();
    setAllTags(allTagsNew);
    return tag;
  }, []);

  // Sort preference
  const handleSortChange = useCallback((options: KBSortOptions) => {
    setSortOptions(options);
    knowledgeBaseService.saveSortPreference(options);
  }, []);

  // Import Markdown files
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportMarkdown = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || !selectedDirId) return;

      for (const file of Array.from(files)) {
        if (!file.name.endsWith('.md') && !file.name.endsWith('.markdown')) continue;
        const content = await file.text();
        await knowledgeBaseService.importNoteFromMarkdown(content, selectedDirId, file.name);
      }
      await refreshData();
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [selectedDirId, refreshData]
  );

  // Export all data
  const handleExportAll = useCallback(async () => {
    const data = await knowledgeBaseService.exportAllData();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `knowledge-base-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  // Import all data from JSON
  const jsonInputRef = useRef<HTMLInputElement>(null);

  const handleImportAll = useCallback(() => {
    jsonInputRef.current?.click();
  }, []);

  const handleJsonFileSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const content = await file.text();
        const data = JSON.parse(content);
        if (data.version !== 1) {
          alert('不支持的导入格式');
          return;
        }
        const result = await knowledgeBaseService.importAllData(data);
        alert(`导入完成：${result.dirCount} 个目录、${result.noteCount} 篇笔记、${result.tagCount} 个标签`);
        await refreshData();
      } catch {
        alert('导入失败，请确认文件格式正确');
      }
      if (jsonInputRef.current) jsonInputRef.current.value = '';
    },
    [refreshData]
  );

  return (
    <div className="kb-drawer">
      {/* 顶部搜索和过滤 */}
      <div className="kb-drawer__toolbar">
        <div className="kb-drawer__search">
          <Input
            size="small"
            prefixIcon={<Search size={14} />}
            placeholder="搜索笔记..."
            value={searchQuery}
            onChange={(v) => setSearchQuery(v as string)}
            clearable
          />
        </div>
        <div className="kb-drawer__sort">
          <KBSortDropdown value={sortOptions} onChange={handleSortChange} />
          <button
            className={`kb-drawer__filter-btn ${showTagFilter ? 'kb-drawer__filter-btn--active' : ''}`}
            onClick={() => setShowTagFilter(!showTagFilter)}
            title="标签过滤"
          >
            标签
          </button>
          <button
            className="kb-drawer__filter-btn"
            onClick={handleImportMarkdown}
            title="导入 Markdown 文件"
          >
            <Upload size={12} />
          </button>
          <button
            className="kb-drawer__filter-btn"
            onClick={handleExportAll}
            title="导出全部数据"
          >
            <Download size={12} />
          </button>
          <button
            className="kb-drawer__filter-btn"
            onClick={handleImportAll}
            title="导入数据"
          >
            导入
          </button>
        </div>
      </div>

      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.markdown"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileSelected}
      />
      <input
        ref={jsonInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleJsonFileSelected}
      />

      {/* 标签过滤 */}
      {showTagFilter && (
        <div className="kb-drawer__tag-filter">
          <KBTagSelector
            allTags={allTags}
            selectedTagIds={filterTagIds}
            onSelectedChange={setFilterTagIds}
            onCreateTag={handleCreateTag}
            showCount
          />
        </div>
      )}

      {/* 主内容区 */}
      <div className="kb-drawer__body">
        {/* 左侧边栏 */}
        <div className="kb-drawer__sidebar">
          <KBDirectoryTree
            directories={directories}
            selectedDirId={selectedDirId}
            expandedDirIds={expandedDirIds}
            onSelectDir={setSelectedDirId}
            onToggleExpand={handleToggleExpand}
            onCreateDir={handleCreateDir}
            onRenameDir={handleRenameDir}
            onDeleteDir={handleDeleteDir}
            noteCounts={noteCounts}
          />
          <KBNoteList
            notes={filteredNotes}
            selectedNoteId={selectedNoteId}
            onSelectNote={handleSelectNote}
            onCreateNote={handleCreateNote}
            onDeleteNote={handleDeleteNote}
            noteTagsMap={noteTagsMap}
          />
        </div>

        {/* 右侧编辑器 + 相关笔记 */}
        <div className="kb-drawer__editor">
          <KBNoteEditor
            note={currentNote}
            allTags={allTags}
            noteTags={noteTags}
            onUpdateNote={handleUpdateNote}
            onSetNoteTags={handleSetNoteTags}
            onCreateTag={handleCreateTag}
          />
          {currentNote && (
            <KBRelatedNotes
              currentNoteId={currentNote.id}
              allNotes={allNotes}
              noteTagsMap={noteTagsMap}
              onSelectNote={handleSelectNote}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default KnowledgeBaseContent;
