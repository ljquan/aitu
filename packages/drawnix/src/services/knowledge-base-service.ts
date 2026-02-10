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
  KBTag,
  KBTagWithCount,
  KBNoteTag,
  KBSortOptions,
  KBFilterOptions,
} from '../types/knowledge-base.types';
import {
  KB_TAG_COLORS,
  KB_DEFAULT_SORT,
  KB_DEFAULT_DIRECTORIES,
} from '../types/knowledge-base.types';

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

function generateId(): string {
  return crypto.randomUUID();
}

/**
 * 暴露 store 实例给 import/export 服务使用
 * @internal
 */
export function _getStoreInstances() {
  return { directoriesStore, notesStore, tagsStore, noteTagsStore };
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
  return notesStore.getItem<KBNote>(id);
}

export async function createNote(
  title: string,
  directoryId: string,
  content = ''
): Promise<KBNote> {
  const dir = await getDirectoryById(directoryId);
  if (!dir) throw new Error('目录不存在');

  const now = Date.now();
  const note: KBNote = {
    id: generateId(),
    title,
    content,
    directoryId,
    createdAt: now,
    updatedAt: now,
  };
  await notesStore.setItem(note.id, note);
  return note;
}

export async function updateNote(
  id: string,
  updates: Partial<Pick<KBNote, 'title' | 'content' | 'directoryId' | 'metadata'>>
): Promise<void> {
  const note = await getNoteById(id);
  if (!note) throw new Error('笔记不存在');

  const updated: KBNote = {
    ...note,
    ...updates,
    updatedAt: Date.now(),
  };
  await notesStore.setItem(id, updated);
}

export async function deleteNote(id: string): Promise<void> {
  // Delete note-tag associations
  const associations = await getNoteTagsByNote(id);
  for (const assoc of associations) {
    await noteTagsStore.removeItem(assoc.id);
  }
  await notesStore.removeItem(id);
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

// --- Search & Filter & Sort ---

export async function searchNotes(query: string): Promise<KBNoteMeta[]> {
  const lowerQuery = query.toLowerCase();
  const results: KBNoteMeta[] = [];

  await notesStore.iterate<KBNote, void>((value) => {
    const titleMatch = value.title.toLowerCase().includes(lowerQuery);
    const contentMatch = value.content.toLowerCase().includes(lowerQuery);
    const descMatch = value.metadata?.description?.toLowerCase().includes(lowerQuery);
    if (titleMatch || contentMatch || descMatch) {
      const { content: _, ...meta } = value;
      results.push(meta);
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
    return multiplier * ((a[field] || 0) - (b[field] || 0));
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
} from './kb-import-export-service';

// Re-import for namespace export
import {
  exportAllData,
  importAllData,
  exportNoteAsMarkdown,
  importNoteFromMarkdown,
} from './kb-import-export-service';

// --- Initialize ---

export async function initializeKnowledgeBase(): Promise<void> {
  await ensureDefaultDirectories();
}

export const knowledgeBaseService = {
  initialize: initializeKnowledgeBase,
  getAllDirectories, getDirectoryById, createDirectory, updateDirectory, deleteDirectory,
  getAllNoteMetas, getNoteMetasByDirectory, getNoteById, createNote, updateNote, deleteNote,
  getAllTags, getTagById, createTag, getOrCreateTag, updateTag, deleteTag,
  getTagsForNote, addTagToNote, removeTagFromNote, setNoteTags,
  searchNotes, sortNoteMetas, filterNotes, saveSortPreference, loadSortPreference,
  exportAllData, importAllData, exportNoteAsMarkdown, importNoteFromMarkdown,
};
