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
  KBNoteImage,
} from '../types/knowledge-base.types';
import JSZip from 'jszip';
import {
  getAllDirectories,
  getDirectoryById,
  getNoteById,
  getAllNoteMetas,
  getNoteMetasByDirectory,
  getTagById,
  getTagsForNote,
  createNote,
  createDirectory,
  getOrCreateTag,
  addTagToNote,
  _getStoreInstances,
} from './knowledge-base-service';

export interface KBExportData {
  version: 1 | 2;
  exportedAt: number;
  directories: KBDirectory[];
  notes: KBNote[];
  tags: KBTag[];
  noteTags: KBNoteTag[];
  /** v2: 独立存储的图片数据 */
  images?: KBNoteImage[];
}

/**
 * 导出所有知识库数据为 JSON
 */
export async function exportAllData(): Promise<KBExportData> {
  const { notesStore, noteContentsStore, noteImagesStore, tagsStore, noteTagsStore } = _getStoreInstances();

  const directories = await getAllDirectories();
  const tags: KBTag[] = [];
  await tagsStore.iterate<KBTag, void>((value) => {
    tags.push(value);
  });

  // 导出笔记：合并元数据和正文
  const notes: KBNote[] = [];
  await notesStore.iterate<KBNote, void>(async (meta) => {
    // 从 noteContentsStore 加载正文
    const contentRecord = await noteContentsStore.getItem<{ id: string; noteId: string; content: string }>(meta.id);
    const content = contentRecord?.content ?? (meta as any).content ?? '';
    notes.push({ ...meta, content });
  });

  const noteTagsList: KBNoteTag[] = [];
  await noteTagsStore.iterate<KBNoteTag, void>((value) => {
    noteTagsList.push(value);
  });

  // 导出图片
  const images: KBNoteImage[] = [];
  if (noteImagesStore) {
    await noteImagesStore.iterate<KBNoteImage, void>((value) => {
      images.push(value);
    });
  }

  return {
    version: 2,
    exportedAt: Date.now(),
    directories,
    notes,
    tags,
    noteTags: noteTagsList,
    images,
  };
}

/**
 * 导出所有知识库数据为 ZIP 压缩包 (Markdown 格式)
 */
export async function exportAsZip(): Promise<Blob> {
  const zip = new JSZip();
  const directories = await getAllDirectories();
  const dirMap = new Map(directories.map((d) => [d.id, d.name]));

  // Create folders for all directories
  directories.forEach((dir) => {
    zip.folder(dir.name);
  });

  const noteMetas = await getAllNoteMetas();

  // Process notes in parallel
  await Promise.all(
    noteMetas.map(async (meta) => {
      const mdData = await exportNoteAsMarkdown(meta.id);
      if (mdData) {
        const dirName = dirMap.get(meta.directoryId) || '未分类';
        zip.folder(dirName)?.file(mdData.filename, mdData.content);
      }
    })
  );

  return zip.generateAsync({ type: 'blob' });
}

/**
 * 从 ZIP 压缩包导入知识库数据
 * 结构：目录名/笔记.md
 */
export async function importFromZip(file: File): Promise<{
  dirCount: number;
  noteCount: number;
}> {
  const zip = await JSZip.loadAsync(file);
  let dirCount = 0;
  let noteCount = 0;

  // 1. 扫描所有需要的目标目录名
  const targetDirNames = new Set<string>();
  const filesToProcess: { dirName: string; filename: string; entry: JSZip.JSZipObject }[] = [];

  zip.forEach((relativePath, zipEntry) => {
    // 忽略目录本身、隐藏文件、非 Markdown 文件
    if (zipEntry.dir) return;
    if (relativePath.startsWith('__MACOSX') || relativePath.includes('/.')) return;
    if (!relativePath.endsWith('.md') && !relativePath.endsWith('.markdown')) return;

    const parts = relativePath.split('/');
    let dirName = '导入的笔记';
    let filename = relativePath;

    if (parts.length > 1) {
      // 取第一级目录作为分类
      dirName = parts[0];
      filename = parts[parts.length - 1];
    }
    
    targetDirNames.add(dirName);
    filesToProcess.push({ dirName, filename, entry: zipEntry });
  });

  // 2. 准备目录 ID 映射（先加载现有目录）
  const existingDirs = await getAllDirectories();
  const dirNameMap = new Map<string, string>();
  existingDirs.forEach(d => dirNameMap.set(d.name, d.id));

  // 创建缺失的目录
  for (const name of targetDirNames) {
    if (!dirNameMap.has(name)) {
      const newDir = await createDirectory(name);
      dirNameMap.set(name, newDir.id);
      dirCount++;
    }
  }

  // 3. 并行导入笔记
  await Promise.all(
    filesToProcess.map(async ({ dirName, filename, entry }) => {
      const dirId = dirNameMap.get(dirName);
      if (dirId) {
        const content = await entry.async('string');
        const imported = await importNoteFromMarkdown(content, dirId, filename);
        if (imported) noteCount++;
      }
    })
  );

  return { dirCount, noteCount };
}

/**
 * 导入知识库数据（合并模式，不覆盖已有数据）
 * 支持向下兼容：自动拆分旧格式数据（正文在 note 对象中）
 */
export async function importAllData(data: KBExportData): Promise<{
  dirCount: number;
  noteCount: number;
  tagCount: number;
  imageCount: number;
}> {
  const { directoriesStore, notesStore, noteContentsStore, noteImagesStore, tagsStore, noteTagsStore } = _getStoreInstances();

  let dirCount = 0;
  let noteCount = 0;
  let tagCount = 0;
  let imageCount = 0;

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

  // 导入笔记（支持旧格式自动拆分）
  for (const note of data.notes) {
    const existing = await getNoteById(note.id);
    if (!existing) {
      // 拆分元数据和正文
      const { content, ...meta } = note;

      // 存储元数据（不含正文）
      await notesStore.setItem(note.id, meta);

      // 存储正文到独立 store
      if (content) {
        await noteContentsStore.setItem(note.id, {
          id: note.id,
          noteId: note.id,
          content,
        });
      }

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

  // 导入图片（v2 格式）
  if (data.images && data.images.length > 0 && noteImagesStore) {
    for (const img of data.images) {
      const existing = await noteImagesStore.getItem<KBNoteImage>(img.id);
      if (!existing) {
        await noteImagesStore.setItem(img.id, img);
        imageCount++;
      }
    }
  }

  return { dirCount, noteCount, tagCount, imageCount };
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
): Promise<KBNote | null> {
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

  // 去重逻辑：检查目录下是否有标题相同的笔记
  const existingMetas = await getNoteMetasByDirectory(directoryId);
  const sameTitleNotes = existingMetas.filter(n => n.title === title);

  if (sameTitleNotes.length > 0) {
    // 检查是否有正文完全相同的笔记
    for (const meta of sameTitleNotes) {
      const existingNote = await getNoteById(meta.id);
      if (existingNote && existingNote.content === content) {
        // 标题和正文都相同，跳过导入
        return null;
      }
    }

    // 标题相同但正文不同，自动编号重命名
    let counter = 1;
    let newTitle = `${title} (${counter})`;
    while (existingMetas.some(n => n.title === newTitle)) {
      counter++;
      newTitle = `${title} (${counter})`;
    }
    title = newTitle;
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
