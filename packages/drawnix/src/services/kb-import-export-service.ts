/**
 * Knowledge Base Import & Export Service
 *
 * 知识库数据导入导出功能，支持 JSON 全量导入/导出和 Markdown 单篇导入/导出
 */

import type {
  KBDirectory,
  KBNote,
  KBTag,
  KBNoteTag,
} from '../types/knowledge-base.types';
import {
  getAllDirectories,
  getDirectoryById,
  getNoteById,
  getTagById,
  getTagsForNote,
  createNote,
  getOrCreateTag,
  addTagToNote,
  _getStoreInstances,
} from './knowledge-base-service';

export interface KBExportData {
  version: 1;
  exportedAt: number;
  directories: KBDirectory[];
  notes: KBNote[];
  tags: KBTag[];
  noteTags: KBNoteTag[];
}

/**
 * 导出所有知识库数据为 JSON
 */
export async function exportAllData(): Promise<KBExportData> {
  const { notesStore, tagsStore, noteTagsStore } = _getStoreInstances();

  const directories = await getAllDirectories();
  const tags: KBTag[] = [];
  await tagsStore.iterate<KBTag, void>((value) => {
    tags.push(value);
  });
  const notes: KBNote[] = [];
  await notesStore.iterate<KBNote, void>((value) => {
    notes.push(value);
  });
  const noteTagsList: KBNoteTag[] = [];
  await noteTagsStore.iterate<KBNoteTag, void>((value) => {
    noteTagsList.push(value);
  });

  return {
    version: 1,
    exportedAt: Date.now(),
    directories,
    notes,
    tags,
    noteTags: noteTagsList,
  };
}

/**
 * 导入知识库数据（合并模式，不覆盖已有数据）
 */
export async function importAllData(data: KBExportData): Promise<{
  dirCount: number;
  noteCount: number;
  tagCount: number;
}> {
  const { directoriesStore, notesStore, tagsStore, noteTagsStore } = _getStoreInstances();

  let dirCount = 0;
  let noteCount = 0;
  let tagCount = 0;

  // 导入目录
  for (const dir of data.directories) {
    const existing = await getDirectoryById(dir.id);
    if (!existing) {
      await directoriesStore.setItem(dir.id, dir);
      dirCount++;
    }
  }

  // 导入标签
  for (const tag of data.tags) {
    const existing = await getTagById(tag.id);
    if (!existing) {
      await tagsStore.setItem(tag.id, tag);
      tagCount++;
    }
  }

  // 导入笔记
  for (const note of data.notes) {
    const existing = await getNoteById(note.id);
    if (!existing) {
      await notesStore.setItem(note.id, note);
      noteCount++;
    }
  }

  // 导入笔记-标签关联
  for (const nt of data.noteTags) {
    const existing = await noteTagsStore.getItem<KBNoteTag>(nt.id);
    if (!existing) {
      await noteTagsStore.setItem(nt.id, nt);
    }
  }

  return { dirCount, noteCount, tagCount };
}

/**
 * 导出单篇笔记为 Markdown 文件内容
 */
export async function exportNoteAsMarkdown(noteId: string): Promise<{
  filename: string;
  content: string;
} | null> {
  const note = await getNoteById(noteId);
  if (!note) return null;

  const tags = await getTagsForNote(noteId);
  const tagNames = tags.map((t) => t.name);

  // 构建 frontmatter
  let frontmatter = '---\n';
  frontmatter += `title: "${note.title}"\n`;
  frontmatter += `createdAt: ${new Date(note.createdAt).toISOString()}\n`;
  frontmatter += `updatedAt: ${new Date(note.updatedAt).toISOString()}\n`;
  if (tagNames.length > 0) {
    frontmatter += `tags: [${tagNames.map((n) => `"${n}"`).join(', ')}]\n`;
  }
  frontmatter += '---\n\n';

  const content = frontmatter + note.content;
  const filename = `${note.title.replace(/[/\\?%*:|"<>]/g, '_') || 'untitled'}.md`;

  return { filename, content };
}

/**
 * 从 Markdown 内容导入为笔记
 */
export async function importNoteFromMarkdown(
  markdownContent: string,
  directoryId: string,
  filename?: string
): Promise<KBNote> {
  let title = filename?.replace(/\.md$/i, '') || '导入的笔记';
  let content = markdownContent;
  const tagNames: string[] = [];

  // 解析 frontmatter
  const fmMatch = markdownContent.match(/^---\n([\s\S]*?)\n---\n*([\s\S]*)$/);
  if (fmMatch) {
    const fm = fmMatch[1];
    content = fmMatch[2];

    // 解析 title
    const titleMatch = fm.match(/^title:\s*"?([^"\n]+)"?$/m);
    if (titleMatch) title = titleMatch[1].trim();

    // 解析 tags
    const tagsMatch = fm.match(/^tags:\s*\[([^\]]*)\]$/m);
    if (tagsMatch) {
      const rawTags = tagsMatch[1];
      const parsed = rawTags.match(/"([^"]+)"/g);
      if (parsed) {
        for (const t of parsed) {
          tagNames.push(t.replace(/"/g, ''));
        }
      }
    }
  }

  // 创建笔记
  const note = await createNote(title, directoryId, content);

  // 创建/关联标签
  for (const name of tagNames) {
    const tag = await getOrCreateTag(name);
    await addTagToNote(note.id, tag.id);
  }

  return note;
}
