/**
 * KnowledgeBaseContent - 知识库核心内容组件
 *
 * 三栏布局：左侧（目录树 + 笔记列表）、中间（编辑器）、右侧（相关笔记/知识提取）
 * 独立于容器，可嵌入 WinBox、Dialog 或任意父容器
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Input, Dropdown, MessagePlugin, DialogPlugin } from 'tdesign-react';
import {
  Search,
  Upload,
  Download,
  HardDrive,
  Link2,
  Sparkles,
  PanelRight,
  PanelRightClose,
  Ellipsis,
  FolderPlus,
  Tags,
} from 'lucide-react';
import { KBUnifiedTree, SYSTEM_SKILL_NOTE_PREFIX } from './KBUnifiedTree';
import { KBNoteEditor } from './KBNoteEditor';
import { SYSTEM_SKILLS } from '../../constants/skills';
import { KBTagFilterDropdown } from './KBTagFilterDropdown';
import { KBTagManagementDialog } from './KBTagManagementDialog';
import { KBRelatedNotes } from './KBRelatedNotes';
import { KBKnowledgeExtraction } from './KBKnowledgeExtraction';
import { KBSortDropdown } from './KBSortDropdown';
import { knowledgeBaseService } from '../../services/knowledge-base-service';
import { getKBSearchEngine, type KBSearchResult } from '../../services/kb-search-engine';
import type {
  KBDirectory,
  KBNote,
  KBNoteMeta,
  KBTag,
  KBTagWithCount,
  KBSortOptions,
} from '../../types/knowledge-base.types';
import './knowledge-base-drawer.scss';

type RightSidebarTab = 'related' | 'extraction';

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
  const [showTagManager, setShowTagManager] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isCreatingDir, setIsCreatingDir] = useState(false);
  const [semanticResults, setSemanticResults] = useState<KBSearchResult[] | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Right sidebar state
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false);
  const [rightSidebarTab, setRightSidebarTab] = useState<RightSidebarTab>('related');

  // Resizable state
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [rightSidebarWidth, setRightSidebarWidth] = useState(300);
  const isResizingSidebar = useRef(false);
  const isResizingRightSidebar = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load saved widths
  useEffect(() => {
    const savedSidebarWidth = localStorage.getItem('kb-sidebar-width');
    if (savedSidebarWidth) {
      const width = parseInt(savedSidebarWidth, 10);
      if (!isNaN(width) && width > 100 && width < 800) {
        setSidebarWidth(width);
      }
    }
    const savedRightSidebarWidth = localStorage.getItem('kb-right-sidebar-width');
    if (savedRightSidebarWidth) {
      const width = parseInt(savedRightSidebarWidth, 10);
      if (!isNaN(width) && width > 100 && width < 800) {
        setRightSidebarWidth(width);
      }
    }
  }, []);

  // Resize handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();

      if (isResizingSidebar.current) {
        e.preventDefault();
        const newWidth = Math.max(200, Math.min(600, e.clientX - containerRect.left));
        setSidebarWidth(newWidth);
      } else if (isResizingRightSidebar.current) {
        e.preventDefault();
        const newWidth = Math.max(200, Math.min(600, containerRect.right - e.clientX));
        setRightSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      if (isResizingSidebar.current) {
        isResizingSidebar.current = false;
        localStorage.setItem('kb-sidebar-width', sidebarWidth.toString());
        document.body.style.cursor = '';
      }
      if (isResizingRightSidebar.current) {
        isResizingRightSidebar.current = false;
        localStorage.setItem('kb-right-sidebar-width', rightSidebarWidth.toString());
        document.body.style.cursor = '';
      }
    };

    if (isResizingSidebar.current || isResizingRightSidebar.current) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    } else {
      document.addEventListener('mousemove', handleMouseMove); // We need this attached for the drag to work continuously? No, only when dragging.
      // Actually, we should attach listeners only when mouse down, but useEffect dependency is cleaner if we attach always or use state.
      // Optimization: only attach when dragging.
      // But since we use refs for flags, we can attach globally and check flags.
      // Or better: attach on mousedown, detach on mouseup.
    }
    
    // Better implementation: attach/detach based on "active" state or just keep them global but check refs.
    // Keeping it simple: Add listeners on mount, check refs.
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [sidebarWidth, rightSidebarWidth]); // Dependencies needed for saving current width

  const startResizingSidebar = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingSidebar.current = true;
    document.body.style.cursor = 'col-resize';
  };

  const startResizingRightSidebar = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRightSidebar.current = true;
    document.body.style.cursor = 'col-resize';
  };

  // Storage usage
  const [storageUsage, setStorageUsage] = useState<{ used: number; quota: number; percentage: number } | null>(null);

  const initializedRef = useRef(false);
  const initializedSelectionRef = useRef(false);

  // Initialize on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const init = async () => {
      await knowledgeBaseService.initialize();
      await refreshData();
      try {
        const usage = await knowledgeBaseService.getStorageUsage();
        setStorageUsage(usage);
      } catch { /* ignore */ }

      // 检查是否有待处理的导航意图（由 AIInputBar 的 handleAddSkill 设置）
      const pending = (window as any).__kbPendingNavigation;
      if (pending) {
        (window as any).__kbPendingNavigation = null;
        const { directoryName, autoCreateNote: shouldCreate } = pending;
        if (directoryName) {
          const dirs = await knowledgeBaseService.getAllDirectories();
          const targetDir = dirs.find((d: { name: string }) => d.name === directoryName);
          if (targetDir) {
            setSelectedDirId(targetDir.id);
            setExpandedDirIds((prev) => {
              const next = new Set(prev);
              next.add(targetDir.id);
              return next;
            });
            if (shouldCreate) {
              // 直接创建笔记，避免闭包问题
              const defaultTitle = directoryName === 'Skill' ? '新Skill' : '新笔记';
              const note = await knowledgeBaseService.createNote(defaultTitle, targetDir.id);
              await refreshData();
              setExpandedDirIds((prev) => {
                const next = new Set(prev);
                next.add(targetDir.id);
                return next;
              });
              setSelectedNoteId(note.id);
              const fullNote = await knowledgeBaseService.getNoteById(note.id);
              setCurrentNote(fullNote);
              setNoteTags([]);
            }
          }
        }
      }
    };
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshData = useCallback(async () => {
    const [dirs, notes, tags] = await Promise.all([
      knowledgeBaseService.getAllDirectories(),
      knowledgeBaseService.getAllNoteMetas(),
      knowledgeBaseService.getAllTags(),
    ]);
    // Deduplicate directories to prevent React key warnings
    const uniqueDirs = Array.from(new Map(dirs.map((d) => [d.id, d])).values());
    setDirectories(uniqueDirs);
    
    // Deduplicate notes to prevent React key warnings
    const uniqueNotes = Array.from(new Map(notes.map((n) => [n.id, n])).values());
    setAllNotes(uniqueNotes);
    
    // Deduplicate tags to prevent React key warnings
    const uniqueTags = Array.from(new Map(tags.map((t) => [t.id, t])).values());
    setAllTags(uniqueTags);

    // 只有在没有任何选中状态时才自动激活第一个目录（初始化场景）
    if (!selectedDirId && !selectedNoteId && uniqueDirs.length > 0) {
      setSelectedDirId(uniqueDirs[0].id);
      setExpandedDirIds(new Set([uniqueDirs[0].id]));
    }

    await refreshNoteTagsMap(uniqueNotes);
  }, [selectedDirId, selectedNoteId]);

  const refreshNoteTagsMap = useCallback(async (notes: KBNoteMeta[]) => {
    try {
      // 批量获取所有标签和关联关系，避免 N+1 查询
      const [allTags, noteTags] = await Promise.all([
        knowledgeBaseService.getAllTags(),
        knowledgeBaseService.getAllNoteTags(),
      ]);

      const tagMap = new Map(allTags.map((t) => [t.id, t]));
      const map: Record<string, KBTag[]> = {};

      // 初始化每个笔记的标签列表
      for (const note of notes) {
        map[note.id] = [];
      }

      // 填充标签
      for (const nt of noteTags) {
        if (map[nt.noteId] && tagMap.has(nt.tagId)) {
          const tag = tagMap.get(nt.tagId);
          if (tag) {
            // Deduplicate tags for the same note
            if (!map[nt.noteId].some((t) => t.id === tag.id)) {
              map[nt.noteId].push(tag);
            }
          }
        }
      }

      // 对每个笔记的标签进行排序
      for (const noteId in map) {
        map[noteId].sort((a, b) => a.name.localeCompare(b.name));
      }

      setNoteTagsMap(map);
    } catch (err) {
      console.error('Failed to refresh note tags map:', err);
    }
  }, []);

  // 语义搜索
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSemanticResults(null);
      return;
    }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const engine = getKBSearchEngine();
        const results = await engine.search(searchQuery, {
          limit: 50,
          filter: selectedDirId ? { directoryId: selectedDirId } : {},
        });
        setSemanticResults(results);
      } catch {
        setSemanticResults(null);
      }
    }, 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchQuery, selectedDirId]);

  const filteredNotes = useMemo(() => {
    if (semanticResults && searchQuery.trim()) {
      const resultIds = new Set(semanticResults.map((r) => r.id));
      const resultOrder = new Map(semanticResults.map((r, i) => [r.id, i]));
      let notes = allNotes.filter((n) => resultIds.has(n.id));
      if (filterTagIds.length > 0) {
        const tagSet = new Set(filterTagIds);
        notes = notes.filter((n) => {
          const tags = noteTagsMap[n.id] || [];
          return tags.some((t) => tagSet.has(t.id));
        });
      }
      return notes.sort((a, b) => (resultOrder.get(a.id) ?? 0) - (resultOrder.get(b.id) ?? 0));
    }

    let notes = allNotes;
    // 移除目录过滤，确保目录树能显示所有目录下的笔记
    // if (selectedDirId) {
    //   notes = notes.filter((n) => n.directoryId === selectedDirId);
    // }
    if (filterTagIds.length > 0) {
      const tagSet = new Set(filterTagIds);
      notes = notes.filter((n) => {
        const tags = noteTagsMap[n.id] || [];
        return tags.some((t) => tagSet.has(t.id));
      });
    }
    return knowledgeBaseService.sortNoteMetas(notes, sortOptions);
  }, [allNotes, selectedDirId, searchQuery, filterTagIds, sortOptions, noteTagsMap, semanticResults]);

  const noteCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const seen = new Set<string>();
    for (const note of filteredNotes) {
      if (seen.has(note.id)) continue;
      seen.add(note.id);
      counts[note.directoryId] = (counts[note.directoryId] || 0) + 1;
    }
    return counts;
  }, [filteredNotes]);

  const notesByDir = useMemo(() => {
    const map: Record<string, KBNoteMeta[]> = {};
    for (const note of filteredNotes) {
      const dirNotes = (map[note.directoryId] ??= []);
      // Deduplicate notes in directory to prevent React key warnings
      if (!dirNotes.some((n) => n.id === note.id)) {
        dirNotes.push(note);
      }
    }
    return map;
  }, [filteredNotes]);

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
    const dir = directories.find((d) => d.id === id);
    if (!dir) return;

    const confirmDialog = DialogPlugin.confirm({
      header: '确认删除目录',
      body: `确定要删除目录 "${dir.name}" 及其下的所有笔记吗？此操作不可撤销。`,
      onConfirm: async () => {
        try {
          await knowledgeBaseService.deleteDirectory(id);
          if (selectedDirId === id) {
            setSelectedDirId(directories[0]?.id || null);
            setSelectedNoteId(null);
            setCurrentNote(null);
          }
          await refreshData();
          MessagePlugin.success('目录已删除');
        } catch (err: any) {
          MessagePlugin.error(`删除失败: ${err.message}`);
        }
        confirmDialog.destroy();
      },
      onClose: () => {
        confirmDialog.destroy();
      },
    });
  }, [refreshData, selectedDirId, directories]);

  const handleDuplicateDir = useCallback(async (id: string) => {
    try {
      await knowledgeBaseService.duplicateDirectory(id);
      await refreshData();
      MessagePlugin.success('目录复制成功');
    } catch (err: any) {
      MessagePlugin.error(`复制目录失败: ${err.message}`);
    }
  }, [refreshData]);

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedDirIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelectNote = useCallback(async (id: string) => {
    setSelectedNoteId(id);
    // 选中笔记时清空目录激活态，保持激活态互斥
    setSelectedDirId(null);
    setNoteTags(noteTagsMap[id] || []);

    // 系统内置 Skill 虚拟笔记：构造虚拟 KBNote 对象，不查询 IndexedDB
    if (id.startsWith(SYSTEM_SKILL_NOTE_PREFIX)) {
      const skillId = id.slice(SYSTEM_SKILL_NOTE_PREFIX.length);
      const skill = SYSTEM_SKILLS.find((s) => s.id === skillId);
      if (skill) {
        const virtualNote: KBNote = {
          id,
          title: skill.name,
          content: skill.description || '',
          directoryId: '',
          createdAt: 0,
          updatedAt: 0,
        };
        setCurrentNote(virtualNote);
        setNoteTags([]);
      }
      return;
    }

    const note = await knowledgeBaseService.getNoteById(id);
    setCurrentNote(note);
    if (note) {
      const tags = await knowledgeBaseService.getTagsForNote(note.id);
      setNoteTags(tags);
      // 仅展开笔记所在目录，不激活目录（激活态互斥：选中笔记时目录不高亮）
      setExpandedDirIds((prev) => {
        const next = new Set(prev);
        next.add(note.directoryId);
        return next;
      });
    }
  }, [directories, noteTagsMap]);

  const handleCreateNote = useCallback(async (directoryId: string) => {
    // 生成不重复的默认标题（Skill 目录使用「新Skill」，其他目录使用「新笔记」）
    const existingTitles = new Set(
      allNotes
        .filter(n => n.directoryId === directoryId)
        .map(n => n.title)
    );
    const dir = directories.find(d => d.id === directoryId);
    const baseTitle = dir?.name === 'Skill' ? '新Skill' : '新笔记';
    let title = baseTitle;
    let counter = 1;
    while (existingTitles.has(title)) {
      title = `${baseTitle} ${counter}`;
      counter++;
    }

    const note = await knowledgeBaseService.createNote(title, directoryId);
    await refreshData();
    setExpandedDirIds((prev) => {
      const next = new Set(prev);
      next.add(directoryId);
      return next;
    });
    handleSelectNote(note.id);
  }, [refreshData, handleSelectNote, allNotes, directories]);

  const handleUpdateNote = useCallback(
    async (id: string, updates: { title?: string; content?: string }) => {
      await knowledgeBaseService.updateNote(id, updates);
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

  const handleInsertToNote = useCallback(
    async (text: string) => {
      if (!currentNote) return;
      // Add a newline if content is not empty
      const separator = currentNote.content ? '\n\n' : '';
      const newContent = (currentNote.content || '') + separator + text;
      
      await handleUpdateNote(currentNote.id, { content: newContent });
      MessagePlugin.success('已插入到笔记末尾');
    },
    [currentNote, handleUpdateNote]
  );

  const handleDuplicateNote = useCallback(async (id: string) => {
    try {
      await knowledgeBaseService.duplicateNote(id);
      await refreshData();
      MessagePlugin.success('笔记复制成功');
    } catch (err: any) {
      MessagePlugin.error(`复制笔记失败: ${err.message}`);
    }
  }, [refreshData]);

  const handleDeleteNote = useCallback(async (id: string) => {
    // 系统内置 Skill 笔记不可删除
    if (id.startsWith(SYSTEM_SKILL_NOTE_PREFIX)) {
      MessagePlugin.warning('系统内置 Skill，不可删除');
      return;
    }

    const note = allNotes.find((n) => n.id === id);
    if (!note) return;

    const confirmDialog = DialogPlugin.confirm({
      header: '确认删除笔记',
      body: `确定要删除笔记 "${note.title || '无标题'}" 吗？此操作不可撤销。`,
      onConfirm: async () => {
        try {
          await knowledgeBaseService.deleteNote(id);
          if (selectedNoteId === id) {
            setSelectedNoteId(null);
            setCurrentNote(null);
            setNoteTags([]);
          }
          await refreshData();
          MessagePlugin.success('笔记已删除');
        } catch (err: any) {
          MessagePlugin.error(`删除失败: ${err.message}`);
        }
        confirmDialog.destroy();
      },
      onClose: () => {
        confirmDialog.destroy();
      },
    });
  }, [selectedNoteId, refreshData, allNotes]);

  // Auto-select first note on load
  useEffect(() => {
    if (!initializedSelectionRef.current && filteredNotes.length > 0) {
      handleSelectNote(filteredNotes[0].id);
      initializedSelectionRef.current = true;
    }
  }, [filteredNotes, handleSelectNote]);

  // 监听 kb:navigate 事件，支持从外部（如 SkillDropdown 的「添加 Skill」）定位到指定目录并新建笔记
  useEffect(() => {
    const handleNavigate = async (e: Event) => {
      const { directoryName, autoCreateNote: shouldCreate } = (e as CustomEvent<{
        directoryName?: string;
        autoCreateNote?: boolean;
      }>).detail;

      if (!directoryName) return;

      // 清除 pending navigation（避免组件重新挂载时重复处理）
      if ((window as any).__kbPendingNavigation) {
        (window as any).__kbPendingNavigation = null;
      }

      // 重新加载目录列表，确保数据最新
      const dirs = await knowledgeBaseService.getAllDirectories();
      const targetDir = dirs.find((d) => d.name === directoryName);
      if (!targetDir) return;

      // 选中目录并展开
      setSelectedDirId(targetDir.id);
      setExpandedDirIds((prev) => {
        const next = new Set(prev);
        next.add(targetDir.id);
        return next;
      });

      // 如果需要自动新建笔记
      if (shouldCreate) {
        await handleCreateNote(targetDir.id);
      }
    };

    window.addEventListener('kb:navigate', handleNavigate);
    return () => window.removeEventListener('kb:navigate', handleNavigate);
  }, [handleCreateNote]);

  // Tag handlers
  const handleSetNoteTags = useCallback(
    async (noteId: string, tagIds: string[]) => {
      await knowledgeBaseService.setNoteTags(noteId, tagIds);
      const tags = await knowledgeBaseService.getTagsForNote(noteId);
      setNoteTags(tags);
      setNoteTagsMap((prev) => ({ ...prev, [noteId]: tags }));
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

  const handleUpdateTag = useCallback(async (id: string, name: string) => {
    await knowledgeBaseService.updateTag(id, { name });
    const allTagsNew = await knowledgeBaseService.getAllTags();
    setAllTags(allTagsNew);
  }, []);

  const handleDeleteTag = useCallback(async (id: string) => {
    await knowledgeBaseService.deleteTag(id);
    const allTagsNew = await knowledgeBaseService.getAllTags();
    setAllTags(allTagsNew);
    if (currentNote) {
      const tags = await knowledgeBaseService.getTagsForNote(currentNote.id);
      setNoteTags(tags);
      setNoteTagsMap((prev) => ({ ...prev, [currentNote.id]: tags }));
    }
  }, [currentNote]);

  // Sort handler
  const handleSortChange = useCallback((options: KBSortOptions) => {
    setSortOptions(options);
    if (knowledgeBaseService.saveSortPreference) {
      knowledgeBaseService.saveSortPreference(options);
    }
  }, []);

  // Close menu on click outside
  useEffect(() => {
    if (!showMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

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
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [selectedDirId, refreshData]
  );

  const handleExportAll = useCallback(async () => {
    try {
      const blob = await knowledgeBaseService.exportAsZip();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `knowledge-base-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      MessagePlugin.error('导出失败');
    }
  }, []);

  const jsonInputRef = useRef<HTMLInputElement>(null);

  const handleImportAll = useCallback(() => {
    jsonInputRef.current?.click();
  }, []);

  const handleJsonFileSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        if (file.name.toLowerCase().endsWith('.zip')) {
          const result = await knowledgeBaseService.importFromZip(file);
          if (result.noteCount === 0 && result.dirCount === 0) {
            MessagePlugin.warning('导入完成：没有新增内容（可能已存在重复内容）');
          } else {
            MessagePlugin.success(`导入完成：${result.dirCount} 个新目录、${result.noteCount} 篇笔记`);
          }
        } else {
          const content = await file.text();
          const data = JSON.parse(content);
          if (data.version !== 1 && data.version !== 2) {
            MessagePlugin.error('不支持的导入格式');
            return;
          }
          const result = await knowledgeBaseService.importAllData(data);
          MessagePlugin.success(`导入完成：${result.dirCount} 个目录、${result.noteCount} 篇笔记、${result.tagCount} 个标签`);
        }
        await refreshData();
      } catch (err) {
        console.error(err);
        MessagePlugin.error('导入失败，请确认文件格式正确');
      }
      if (jsonInputRef.current) jsonInputRef.current.value = '';
    },
    [refreshData]
  );

  // Menu handlers
  const handleCreateDirClick = useCallback(() => {
    const name = window.prompt('请输入目录名称', '新建目录');
    if (name) {
      handleCreateDir(name);
    }
  }, [handleCreateDir]);

  const handleMenuClick = useCallback((data: any) => {
    switch (data.value) {
      case 'create-dir':
        handleCreateDirClick();
        break;
      case 'manage-tags':
        setShowTagManager(true);
        break;
      case 'import-md':
        handleImportMarkdown();
        break;
      case 'import-zip':
        handleImportAll();
        break;
      case 'export-zip':
        handleExportAll();
        break;
    }
  }, [handleCreateDirClick, handleImportMarkdown, handleImportAll, handleExportAll]);

  const menuOptions = useMemo(() => [
    { content: '新建目录', value: 'create-dir', prefixIcon: <FolderPlus size={14} /> },
    { content: '管理标签', value: 'manage-tags', prefixIcon: <Tags size={14} /> },
    { content: '导入 Markdown', value: 'import-md', prefixIcon: <Upload size={14} /> },
    { content: '导入 ZIP', value: 'import-zip', prefixIcon: <Upload size={14} /> },
    { content: '导出 ZIP', value: 'export-zip', prefixIcon: <Download size={14} /> },
  ], []);

  return (
    <div className="kb-drawer">
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
        accept=".json,.zip"
        style={{ display: 'none' }}
        onChange={handleJsonFileSelected}
      />

      {/* 主内容区 - 三栏布局 */}
      <div className="kb-drawer__body" ref={containerRef}>
        {/* 左侧边栏：搜索 + 筛选 + 目录树 + 笔记列表 + 存储 */}
        <div className="kb-drawer__sidebar" style={{ width: sidebarWidth }}>
          {/* 搜索和过滤 */}
          <div className="kb-drawer__toolbar">
            <div className="kb-drawer__search" style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
              <Input
                size="small"
                prefixIcon={<Search size={14} />}
                placeholder="搜索笔记..."
                value={searchQuery}
                onChange={(v) => setSearchQuery(v as string)}
                clearable
                style={{ flex: 1 }}
              />
              <Dropdown
                trigger="click"
                options={menuOptions}
                onClick={handleMenuClick}
                minColumnWidth={120}
                maxColumnWidth={200}
                popupProps={{ overlayStyle: { width: 200 } }}
              >
                <button
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '4px',
                    color: 'var(--td-text-color-secondary)',
                    borderRadius: '4px',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--td-bg-color-container-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  title="更多操作"
                >
                  <Ellipsis size={18} />
                </button>
              </Dropdown>
            </div>

            <div className="kb-drawer__filters" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <KBTagFilterDropdown
                allTags={allTags}
                selectedTagIds={filterTagIds}
                onSelectedChange={setFilterTagIds}
              />
              <div style={{ flex: 1 }} />
              <KBSortDropdown value={sortOptions} onChange={handleSortChange} />
            </div>
          </div>

          {/* 统一目录树 + 笔记列表 */}
          <KBUnifiedTree
            directories={directories}
            notesByDir={notesByDir}
            noteTagsMap={noteTagsMap}
            noteCounts={noteCounts}
            selectedDirId={selectedDirId}
            selectedNoteId={selectedNoteId}
            expandedDirIds={expandedDirIds}
            onSelectDir={(id) => {
              setSelectedDirId(id);
              setSelectedNoteId(null);
              setCurrentNote(null);
            }}
            onToggleExpand={handleToggleExpand}
            onCreateDir={handleCreateDir}
            onRenameDir={handleRenameDir}
            onDeleteDir={handleDeleteDir}
            onDuplicateDir={handleDuplicateDir}
            onSelectNote={handleSelectNote}
            onCreateNote={handleCreateNote}
            onDeleteNote={handleDeleteNote}
            onDuplicateNote={handleDuplicateNote}
            isCreatingDir={isCreatingDir}
            onCancelCreateDir={() => setIsCreatingDir(false)}
          />

          {/* 底部存储使用情况 */}
          {storageUsage && (
            <div className="kb-drawer__storage-bar">
              <HardDrive size={12} />
              <span className="kb-drawer__storage-text">
                已用 {formatBytes(storageUsage.used)}
              </span>
            </div>
          )}
        </div>

        <div className="kb-resizer" onMouseDown={startResizingSidebar} />

        {/* 中间编辑器区域 */}
        <div className="kb-drawer__editor">
          <KBNoteEditor
            note={currentNote}
            allTags={allTags}
            noteTags={noteTags}
            readOnly={!!(selectedNoteId && selectedNoteId.startsWith(SYSTEM_SKILL_NOTE_PREFIX))}
            isSkillDirectory={
              !!(currentNote && directories.find(d => d.id === currentNote.directoryId)?.name === 'Skill')
            }
            onUpdateNote={handleUpdateNote}
            onSetNoteTags={handleSetNoteTags}
            onCreateTag={handleCreateTag}
          />
        </div>

        {/* 右侧工具面板 */}
        {currentNote && (
          <>
            {rightSidebarCollapsed ? (
              <button
                className="kb-drawer__right-toggle"
                onClick={() => setRightSidebarCollapsed(false)}
                title="展开侧边栏"
              >
                <PanelRight size={14} />
              </button>
            ) : (
              <>
                <div className="kb-resizer" onMouseDown={startResizingRightSidebar} />
                <div className="kb-drawer__right-sidebar" style={{ width: rightSidebarWidth }}>
                  {/* 标签页头部 */}
                  <div className="kb-drawer__right-header">
                  <div className="kb-drawer__right-tabs">
                    <button
                      className={`kb-drawer__right-tab ${rightSidebarTab === 'related' ? 'kb-drawer__right-tab--active' : ''}`}
                      onClick={() => setRightSidebarTab('related')}
                      title="相似笔记"
                    >
                      <Link2 size={14} />
                    </button>
                    <button
                      className={`kb-drawer__right-tab ${rightSidebarTab === 'extraction' ? 'kb-drawer__right-tab--active' : ''}`}
                      onClick={() => setRightSidebarTab('extraction')}
                      title="知识提取"
                    >
                      <Sparkles size={14} />
                    </button>
                  </div>
                  <button
                    className="kb-drawer__right-collapse-btn"
                    onClick={() => setRightSidebarCollapsed(true)}
                    title="收起侧边栏"
                  >
                    <PanelRightClose size={14} />
                  </button>
                </div>

                {/* 内容区域 */}
                <div className="kb-drawer__right-content">
                  {rightSidebarTab === 'related' ? (
                    <KBRelatedNotes
                      currentNoteId={currentNote.id}
                      allNotes={allNotes}
                      noteTagsMap={noteTagsMap}
                      onSelectNote={handleSelectNote}
                    />
                  ) : (
                    <KBKnowledgeExtraction
                      key={currentNote.id}
                      noteId={currentNote.id}
                      noteContent={currentNote.content}
                      noteTitle={currentNote.title}
                      onSaved={() => refreshData()}
                      onInsertToNote={handleInsertToNote}
                    />
                  )}
                </div>
              </div>
              </>
            )}
          </>
        )}
      </div>
      <KBTagManagementDialog
        visible={showTagManager}
        onClose={() => setShowTagManager(false)}
        allTags={allTags}
        onCreateTag={handleCreateTag}
        onUpdateTag={handleUpdateTag}
        onDeleteTag={handleDeleteTag}
      />
    </div>
  );
};

export default KnowledgeBaseContent;

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
