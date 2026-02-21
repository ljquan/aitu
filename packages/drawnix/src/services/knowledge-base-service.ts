/**
 * Knowledge Base Storage Service
 *
 * 知识库数据持久化服务，使用 localforage (IndexedDB) 存储
 * 目录、笔记、标签及其关联数据
 */

import localforage from 'localforage';
import { IDB_DATABASES, LS_KEYS } from '../constants/storage-keys';
import type {
  KBDirectory,
  KBNote,
  KBNoteMeta,
  KBNoteContent,
  KBNoteImage,
  KBTag,
  KBTagWithCount,
  KBNoteTag,
  KBSortOptions,
  KBSortField,
  KBFilterOptions,
} from '../types/knowledge-base.types';
import {
  KB_TAG_COLORS,
  KB_DEFAULT_SORT,
  KB_DEFAULT_DIRECTORIES,
} from '../types/knowledge-base.types';

import {
  exportAllData,
  importAllData,
  exportNoteAsMarkdown,
  importNoteFromMarkdown,
  exportAsZip,
  importFromZip,
} from './kb-import-export-service';

const { NAME, STORES } = IDB_DATABASES.KNOWLEDGE_BASE;

// localforage instances
const directoriesStore = localforage.createInstance({
  name: NAME,
  storeName: STORES.DIRECTORIES,
});

const notesStore = localforage.createInstance({
  name: NAME,
  storeName: STORES.NOTES,
});

const tagsStore = localforage.createInstance({
  name: NAME,
  storeName: STORES.TAGS,
});

const noteTagsStore = localforage.createInstance({
  name: NAME,
  storeName: STORES.NOTE_TAGS,
});

const noteContentsStore = localforage.createInstance({
  name: NAME,
  storeName: STORES.NOTE_CONTENTS,
});

const noteImagesStore = localforage.createInstance({
  name: NAME,
  storeName: STORES.NOTE_IMAGES,
});

function generateId(): string {
  return crypto.randomUUID();
}

/**
 * 暴露 store 实例给 import/export 服务使用
 * @internal
 */
export function _getStoreInstances() {
  return { directoriesStore, notesStore, tagsStore, noteTagsStore, noteContentsStore, noteImagesStore };
}

// --- Directory Operations ---

let defaultDirsInitialized = false;

async function ensureDefaultDirectories(): Promise<void> {
  if (defaultDirsInitialized) return;

  const dirs = await getAllDirectories();
  const hasDefaults = dirs.some((d) => d.isDefault);
  if (!hasDefaults) {
    const now = Date.now();
    for (const def of KB_DEFAULT_DIRECTORIES) {
      const dir: KBDirectory = {
        id: generateId(),
        name: def.name,
        isDefault: def.isDefault,
        createdAt: now,
        updatedAt: now,
        order: def.order,
      };
      await directoriesStore.setItem(dir.id, dir);
    }
  }
  defaultDirsInitialized = true;
}

export async function getAllDirectories(): Promise<KBDirectory[]> {
  const dirs: KBDirectory[] = [];
  await directoriesStore.iterate<KBDirectory, void>((value) => {
    dirs.push(value);
  });
  return dirs.sort((a, b) => a.order - b.order);
}

export async function getDirectoryById(
  id: string
): Promise<KBDirectory | null> {
  return directoriesStore.getItem<KBDirectory>(id);
}

export async function createDirectory(
  name: string,
  isDefault = false
): Promise<KBDirectory> {
  // Check name uniqueness
  const dirs = await getAllDirectories();
  if (dirs.some((d) => d.name === name)) {
    throw new Error(`目录"${name}"已存在`);
  }
  const now = Date.now();
  const dir: KBDirectory = {
    id: generateId(),
    name,
    isDefault,
    createdAt: now,
    updatedAt: now,
    order: dirs.length,
  };
  await directoriesStore.setItem(dir.id, dir);
  return dir;
}

export async function updateDirectory(
  id: string,
  updates: Partial<Pick<KBDirectory, 'name' | 'order'>>
): Promise<void> {
  const dir = await getDirectoryById(id);
  if (!dir) throw new Error('目录不存在');

  if (updates.name && updates.name !== dir.name) {
    const dirs = await getAllDirectories();
    if (dirs.some((d) => d.name === updates.name && d.id !== id)) {
      throw new Error(`目录"${updates.name}"已存在`);
    }
  }

  const updated: KBDirectory = {
    ...dir,
    ...updates,
    updatedAt: Date.now(),
  };
  await directoriesStore.setItem(id, updated);
}

export async function duplicateDirectory(id: string): Promise<KBDirectory> {
  const dir = await getDirectoryById(id);
  if (!dir) throw new Error('目录不存在');

  const dirs = await getAllDirectories();
  const baseName = `${dir.name} (副本)`;
  let newName = baseName;
  let counter = 1;

  while (dirs.some((d) => d.name === newName)) {
    newName = `${baseName} ${counter}`;
    counter++;
  }

  const newDir = await createDirectory(newName);

  const notes = await getNoteMetasByDirectory(id);
  for (const noteMeta of notes) {
    await duplicateNote(noteMeta.id, newDir.id);
  }

  return newDir;
}

export async function deleteDirectory(id: string): Promise<void> {
  const dir = await getDirectoryById(id);
  if (!dir) return;
  if (dir.isDefault) throw new Error('不能删除默认目录');

  // Cascade delete notes in this directory
  const notes = await getNoteMetasByDirectory(id);
  for (const note of notes) {
    await deleteNote(note.id);
  }
  await directoriesStore.removeItem(id);
}

// --- Note Operations ---

export async function getAllNoteMetas(): Promise<KBNoteMeta[]> {
  const metas: KBNoteMeta[] = [];
  await notesStore.iterate<KBNote, void>((value) => {
    const { content: _, ...meta } = value;
    metas.push(meta);
  });
  return metas;
}

export async function getNoteMetasByDirectory(
  directoryId: string
): Promise<KBNoteMeta[]> {
  const metas: KBNoteMeta[] = [];
  await notesStore.iterate<KBNote, void>((value) => {
    if (value.directoryId === directoryId) {
      const { content: _, ...meta } = value;
      metas.push(meta);
    }
  });
  return metas;
}

export async function getNoteById(id: string): Promise<KBNote | null> {
  const meta = await notesStore.getItem<KBNoteMeta & { content?: string }>(id);
  if (!meta) return null;

  // 尝试从 noteContentsStore 加载正文（分离存储）
  const contentRecord = await noteContentsStore.getItem<KBNoteContent>(id);
  const content = contentRecord?.content ?? (meta as any).content ?? '';

  return { ...meta, content } as KBNote;
}

export async function createNote(
  title: string,
  directoryId: string,
  content = '',
  metadata?: KBNote['metadata']
): Promise<KBNote> {
  const dir = await getDirectoryById(directoryId);
  if (!dir) throw new Error('目录不存在');

  const now = Date.now();
  const id = generateId();

  // 元数据（不含正文）存入 notesStore
  const meta: KBNoteMeta = {
    id,
    title,
    directoryId,
    createdAt: now,
    updatedAt: now,
    ...(metadata ? { metadata } : {}),
  };
  await notesStore.setItem(id, meta);

  // 正文独立存入 noteContentsStore
  const noteContent: KBNoteContent = {
    id,
    noteId: id,
    content,
  };
  await noteContentsStore.setItem(id, noteContent);

  return { ...meta, content };
}

export async function updateNote(
  id: string,
  updates: Partial<Pick<KBNote, 'title' | 'content' | 'directoryId' | 'metadata'>>
): Promise<void> {
  const meta = await notesStore.getItem<KBNoteMeta>(id);
  if (!meta) throw new Error('笔记不存在');

  // 如果有 content 变更，更新 noteContentsStore
  if (updates.content !== undefined) {
    const contentRecord = await noteContentsStore.getItem<KBNoteContent>(id);
    const updatedContent: KBNoteContent = {
      id,
      noteId: id,
      content: updates.content,
    };
    await noteContentsStore.setItem(id, updatedContent);
  }

  // 更新元数据（不含 content）
  const { content: _content, ...metaUpdates } = updates;
  const updatedMeta: KBNoteMeta = {
    ...meta,
    ...metaUpdates,
    updatedAt: Date.now(),
  };
  await notesStore.setItem(id, updatedMeta);
}

export async function deleteNote(id: string): Promise<void> {
  // 删除笔记-标签关联
  const associations = await getNoteTagsByNote(id);
  for (const assoc of associations) {
    await noteTagsStore.removeItem(assoc.id);
  }
  // 删除正文
  await noteContentsStore.removeItem(id);
  // 删除元数据
  await notesStore.removeItem(id);
}

export async function duplicateNote(
  id: string,
  targetDirectoryId?: string
): Promise<KBNote> {
  const note = await getNoteById(id);
  if (!note) throw new Error('笔记不存在');

  const destDirId = targetDirectoryId || note.directoryId;
  const isSameDir = destDirId === note.directoryId;

  // 如果在同一目录下，标题加副本后缀；如果移动/复制到不同目录，保留原标题
  const newTitle = isSameDir ? `${note.title} (副本)` : note.title;

  const newNote = await createNote(
    newTitle,
    destDirId,
    note.content,
    note.metadata
  );

  // Copy tags
  const tags = await getTagsForNote(id);
  for (const tag of tags) {
    await addTagToNote(newNote.id, tag.id);
  }

  return newNote;
}

// --- Tag Operations ---

export async function getAllTags(): Promise<KBTagWithCount[]> {
  const tags: KBTag[] = [];
  await tagsStore.iterate<KBTag, void>((value) => {
    tags.push(value);
  });

  // Count associations
  const countMap = new Map<string, number>();
  await noteTagsStore.iterate<KBNoteTag, void>((value) => {
    countMap.set(value.tagId, (countMap.get(value.tagId) || 0) + 1);
  });

  return tags
    .map((tag) => ({ ...tag, count: countMap.get(tag.id) || 0 }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getTagById(id: string): Promise<KBTag | null> {
  return tagsStore.getItem<KBTag>(id);
}

export async function createTag(name: string, color?: string): Promise<KBTag> {
  // Check name uniqueness
  const tags = await getAllTags();
  if (tags.some((t) => t.name === name)) {
    throw new Error(`标签"${name}"已存在`);
  }

  const tag: KBTag = {
    id: generateId(),
    name,
    color: color || KB_TAG_COLORS[Math.floor(Math.random() * KB_TAG_COLORS.length)],
    createdAt: Date.now(),
  };
  await tagsStore.setItem(tag.id, tag);
  return tag;
}

export async function getOrCreateTag(name: string): Promise<KBTag> {
  const tags = await getAllTags();
  const existing = tags.find((t) => t.name === name);
  if (existing) return existing;
  return createTag(name);
}

export async function updateTag(
  id: string,
  updates: Partial<Pick<KBTag, 'name' | 'color'>>
): Promise<void> {
  const tag = await getTagById(id);
  if (!tag) throw new Error('标签不存在');

  if (updates.name && updates.name !== tag.name) {
    const tags = await getAllTags();
    if (tags.some((t) => t.name === updates.name && t.id !== id)) {
      throw new Error(`标签"${updates.name}"已存在`);
    }
  }

  await tagsStore.setItem(id, { ...tag, ...updates });
}

export async function deleteTag(id: string): Promise<void> {
  // Cascade delete associations
  const associations: KBNoteTag[] = [];
  await noteTagsStore.iterate<KBNoteTag, void>((value) => {
    if (value.tagId === id) associations.push(value);
  });
  for (const assoc of associations) {
    await noteTagsStore.removeItem(assoc.id);
  }
  await tagsStore.removeItem(id);
}

// --- NoteTag Operations ---

export async function getAllNoteTags(): Promise<KBNoteTag[]> {
  const result: KBNoteTag[] = [];
  await noteTagsStore.iterate<KBNoteTag, void>((value) => {
    result.push(value);
  });
  return result;
}

async function getNoteTagsByNote(noteId: string): Promise<KBNoteTag[]> {
  const result: KBNoteTag[] = [];
  await noteTagsStore.iterate<KBNoteTag, void>((value) => {
    if (value.noteId === noteId) result.push(value);
  });
  return result;
}

export async function getTagsForNote(noteId: string): Promise<KBTag[]> {
  const associations = await getNoteTagsByNote(noteId);
  const tags: KBTag[] = [];
  for (const assoc of associations) {
    const tag = await getTagById(assoc.tagId);
    if (tag) tags.push(tag);
  }
  return tags.sort((a, b) => a.name.localeCompare(b.name));
}

export async function addTagToNote(
  noteId: string,
  tagId: string
): Promise<void> {
  // Check duplicates
  const existing = await getNoteTagsByNote(noteId);
  if (existing.some((a) => a.tagId === tagId)) return;

  const assoc: KBNoteTag = {
    id: generateId(),
    noteId,
    tagId,
  };
  await noteTagsStore.setItem(assoc.id, assoc);
}

export async function removeTagFromNote(
  noteId: string,
  tagId: string
): Promise<void> {
  const associations = await getNoteTagsByNote(noteId);
  const target = associations.find((a) => a.tagId === tagId);
  if (target) {
    await noteTagsStore.removeItem(target.id);
  }
}

export async function setNoteTags(
  noteId: string,
  tagIds: string[]
): Promise<void> {
  // Remove all existing
  const existing = await getNoteTagsByNote(noteId);
  for (const assoc of existing) {
    await noteTagsStore.removeItem(assoc.id);
  }
  // Add new
  for (const tagId of tagIds) {
    await addTagToNote(noteId, tagId);
  }
}

// --- Upsert & Batch & SourceUrl Operations ---

/**
 * 按 sourceUrl 查找笔记（可选限定目录）
 */
export async function getNotesBySourceUrl(
  sourceUrl: string,
  directoryId?: string
): Promise<KBNoteMeta[]> {
  const results: KBNoteMeta[] = [];
  await notesStore.iterate<KBNoteMeta & { content?: string }, void>((value) => {
    if (value.metadata?.sourceUrl === sourceUrl) {
      if (!directoryId || value.directoryId === directoryId) {
        const { content: _, ...meta } = value as any;
        results.push(meta);
      }
    }
  });
  return results;
}

/**
 * 创建或更新笔记（基于同目录下的 sourceUrl 去重）
 * 如果同目录下已存在相同 sourceUrl 的笔记，更新它；否则创建新笔记
 */
export async function upsertNoteBySourceUrl(
  directoryId: string,
  sourceUrl: string,
  title: string,
  content: string,
  metadata?: KBNote['metadata']
): Promise<{ noteId: string; isUpdate: boolean }> {
  // 查找同目录下是否已存在相同 sourceUrl 的笔记
  const existing = await getNotesBySourceUrl(sourceUrl, directoryId);

  if (existing.length > 0) {
    // 更新现有笔记
    const noteId = existing[0].id;
    await updateNote(noteId, {
      title,
      content,
      metadata: { ...existing[0].metadata, ...metadata, sourceUrl },
    });

    // 如果 metadata 中有 tags，处理标签关联
    if (metadata?.tags && metadata.tags.length > 0) {
      await _syncTagsFromMetadata(noteId, metadata.tags);
    }

    return { noteId, isUpdate: true };
  }

  // 创建新笔记
  const fullMetadata = { ...metadata, sourceUrl };
  const note = await createNote(title, directoryId, content, fullMetadata);

  // 处理标签关联
  if (metadata?.tags && metadata.tags.length > 0) {
    await _syncTagsFromMetadata(note.id, metadata.tags);
  }

  return { noteId: note.id, isUpdate: false };
}

/**
 * 批量创建笔记
 * @returns 创建的笔记 ID 列表
 */
export async function batchCreateNotes(
  notes: Array<{
    title: string;
    directoryId: string;
    content?: string;
    metadata?: KBNote['metadata'];
  }>
): Promise<string[]> {
  const ids: string[] = [];
  for (const noteData of notes) {
    const note = await createNote(
      noteData.title,
      noteData.directoryId,
      noteData.content || '',
      noteData.metadata
    );

    // 处理标签关联
    if (noteData.metadata?.tags && noteData.metadata.tags.length > 0) {
      await _syncTagsFromMetadata(note.id, noteData.metadata.tags);
    }

    ids.push(note.id);
  }
  return ids;
}

/**
 * 获取所有唯一域名及计数统计
 */
export async function getUniqueDomains(): Promise<
  Array<{ domain: string; count: number; faviconUrl?: string }>
> {
  const domainMap = new Map<string, { count: number; faviconUrl?: string }>();

  await notesStore.iterate<KBNoteMeta, void>((value) => {
    const domain = value.metadata?.domain;
    if (domain) {
      const existing = domainMap.get(domain);
      if (existing) {
        existing.count++;
      } else {
        domainMap.set(domain, {
          count: 1,
          faviconUrl: value.metadata?.faviconUrl,
        });
      }
    }
  });

  return Array.from(domainMap.entries())
    .map(([domain, data]) => ({
      domain,
      count: data.count,
      faviconUrl: data.faviconUrl,
    }))
    .sort((a, b) => a.domain.localeCompare(b.domain));
}

/**
 * 内部：同步 metadata.tags 到标签关联
 */
async function _syncTagsFromMetadata(noteId: string, tagNames: string[]): Promise<void> {
  const tagIds: string[] = [];
  for (const tagName of tagNames) {
    const tag = await getOrCreateTag(tagName);
    tagIds.push(tag.id);
  }
  await setNoteTags(noteId, tagIds);
}

// --- Search & Filter & Sort ---

export async function searchNotes(query: string): Promise<KBNoteMeta[]> {
  const lowerQuery = query.toLowerCase();
  const results: KBNoteMeta[] = [];

  // 先搜索标题和元数据
  const allMetas: KBNoteMeta[] = [];
  await notesStore.iterate<KBNoteMeta & { content?: string }, void>((value) => {
    const { content: _, ...meta } = value as any;
    allMetas.push(meta);

    const titleMatch = value.title.toLowerCase().includes(lowerQuery);
    const descMatch = value.metadata?.description?.toLowerCase().includes(lowerQuery);
    const domainMatch = value.metadata?.domain?.toLowerCase().includes(lowerQuery);
    // 兼容旧数据：如果 content 还在 notesStore 中
    const inlineContentMatch = (value as any).content?.toLowerCase().includes(lowerQuery);

    if (titleMatch || descMatch || domainMatch || inlineContentMatch) {
      results.push(meta);
    }
  });

  // 搜索 noteContentsStore 中的正文
  const matchedIds = new Set(results.map((r) => r.id));
  await noteContentsStore.iterate<KBNoteContent, void>((value) => {
    if (!matchedIds.has(value.noteId) && value.content.toLowerCase().includes(lowerQuery)) {
      const meta = allMetas.find((m) => m.id === value.noteId);
      if (meta) results.push(meta);
    }
  });

  return results;
}

export function sortNoteMetas(
  metas: KBNoteMeta[],
  options: KBSortOptions
): KBNoteMeta[] {
  const sorted = [...metas];
  const { field, order } = options;
  const multiplier = order === 'asc' ? 1 : -1;

  sorted.sort((a, b) => {
    if (field === 'title') {
      return multiplier * a.title.localeCompare(b.title);
    }
    if (field === 'domain') {
      const domainA = a.metadata?.domain || '';
      const domainB = b.metadata?.domain || '';
      return multiplier * domainA.localeCompare(domainB);
    }
    
    // 确保数值比较的安全性
    let valA = Number(a[field as 'updatedAt' | 'createdAt']);
    let valB = Number(b[field as 'updatedAt' | 'createdAt']);
    if (isNaN(valA)) valA = 0;
    if (isNaN(valB)) valB = 0;
    return multiplier * (valA - valB);
  });

  return sorted;
}

export async function filterNotes(
  metas: KBNoteMeta[],
  filter: KBFilterOptions
): Promise<KBNoteMeta[]> {
  let result = metas;

  if (filter.directoryId) {
    result = result.filter((n) => n.directoryId === filter.directoryId);
  }

  if (filter.searchQuery) {
    const query = filter.searchQuery.toLowerCase();
    // For search, we need full content — load from store
    const matched = await searchNotes(query);
    const matchedIds = new Set(matched.map((m) => m.id));
    result = result.filter((n) => matchedIds.has(n.id));
  }

  if (filter.domain) {
    result = result.filter((n) => n.metadata?.domain === filter.domain);
  }

  if (filter.tagIds && filter.tagIds.length > 0) {
    const tagSet = new Set(filter.tagIds);
    const noteIdsWithTags = new Set<string>();
    await noteTagsStore.iterate<KBNoteTag, void>((value) => {
      if (tagSet.has(value.tagId)) {
        noteIdsWithTags.add(value.noteId);
      }
    });
    result = result.filter((n) => noteIdsWithTags.has(n.id));
  }

  return result;
}

// --- Storage Quota Management ---

/**
 * 获取存储使用情况
 */
export async function getStorageUsage(): Promise<{
  used: number;
  quota: number;
  percentage: number;
}> {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    const used = estimate.usage || 0;
    const quota = estimate.quota || 0;
    const percentage = quota > 0 ? (used / quota) * 100 : 0;
    return { used, quota, percentage };
  }
  return { used: 0, quota: 0, percentage: 0 };
}

/**
 * 检查存储是否接近配额
 */
export async function isStorageNearQuota(
  threshold = 0.8
): Promise<boolean> {
  const { percentage } = await getStorageUsage();
  return percentage > threshold * 100;
}

// --- Sort Preference ---

export function saveSortPreference(options: KBSortOptions): void {
  try {
    localStorage.setItem(LS_KEYS.KB_SORT_PREFERENCE, JSON.stringify(options));
  } catch {
    // ignore
  }
}

export function loadSortPreference(): KBSortOptions {
  try {
    const raw = localStorage.getItem(LS_KEYS.KB_SORT_PREFERENCE);
    if (raw) return JSON.parse(raw) as KBSortOptions;
  } catch {
    // ignore
  }
  return KB_DEFAULT_SORT;
}

// --- Import & Export (delegated to kb-import-export-service.ts) ---

export {
  exportAllData,
  importAllData,
  exportNoteAsMarkdown,
  importNoteFromMarkdown,
  exportAsZip,
} from './kb-import-export-service';

// --- Initialize ---

export async function initializeKnowledgeBase(): Promise<void> {
  await ensureDefaultDirectories();
}

export const knowledgeBaseService = {
  initialize: initializeKnowledgeBase,
  getAllDirectories, getDirectoryById, createDirectory, updateDirectory, deleteDirectory, duplicateDirectory,
  getAllNoteMetas, getNoteMetasByDirectory, getNoteById, createNote, updateNote, deleteNote, duplicateNote,
  getAllTags, getTagById, createTag, getOrCreateTag, updateTag, deleteTag,
  getTagsForNote, addTagToNote, removeTagFromNote, setNoteTags, getAllNoteTags,
  getNotesBySourceUrl, upsertNoteBySourceUrl, batchCreateNotes, getUniqueDomains,
  searchNotes, sortNoteMetas, filterNotes, saveSortPreference, loadSortPreference,
  getStorageUsage, isStorageNearQuota,
  exportAllData, importAllData, exportNoteAsMarkdown, importNoteFromMarkdown, exportAsZip, importFromZip,
  _getStoreInstances,
};
