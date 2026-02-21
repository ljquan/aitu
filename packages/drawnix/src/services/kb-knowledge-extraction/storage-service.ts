/**
 * 知识点存储服务
 * 将提取的知识点保存到知识库
 */

import type { ExtractedKnowledge, KnowledgeSaveOptions } from './types';
import { KNOWLEDGE_TYPE_LABELS, type KnowledgeType } from './types';
import {
  createNote,
  getAllDirectories,
  createDirectory,
  createTag,
  setNoteTags,
  getAllTags,
} from '../knowledge-base-service';

/** 将知识点转换为 Markdown */
function knowledgeToMarkdown(knowledge: ExtractedKnowledge): string {
  const lines: string[] = [];
  lines.push(`## ${knowledge.title}`);
  lines.push('');
  lines.push(`**类型**: ${KNOWLEDGE_TYPE_LABELS[knowledge.type]}`);
  lines.push('');
  lines.push(knowledge.content);
  if (knowledge.tags.length > 0) {
    lines.push('');
    lines.push(`**标签**: ${knowledge.tags.map((t) => `\`${t}\``).join(' ')}`);
  }
  return lines.join('\n');
}

/** 合并多个知识点为一篇 Markdown */
function mergeKnowledgeToMarkdown(
  points: ExtractedKnowledge[],
  opts: { title?: string; sourceUrl?: string }
): string {
  const lines: string[] = [];
  if (opts.title) {
    lines.push(`# ${opts.title}`);
    lines.push('');
  }
  if (opts.sourceUrl) {
    lines.push(`> 来源: [${opts.sourceUrl}](${opts.sourceUrl})`);
    lines.push('');
  }
  lines.push(`> 提取时间: ${new Date().toLocaleString('zh-CN')}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // 按类型分组
  const typeOrder: KnowledgeType[] = ['concept', 'definition', 'step', 'summary'];
  for (const type of typeOrder) {
    const grouped = points.filter((p) => p.type === type);
    if (grouped.length === 0) continue;
    lines.push(`## ${KNOWLEDGE_TYPE_LABELS[type]}`);
    lines.push('');
    for (const p of grouped) {
      lines.push(`### ${p.title}`);
      lines.push('');
      lines.push(p.content);
      if (p.tags.length > 0) {
        lines.push('');
        lines.push(`标签: ${p.tags.map((t) => `\`${t}\``).join(' ')}`);
      }
      lines.push('');
    }
  }
  return lines.join('\n');
}

/** 获取或创建"知识提炼"目录 */
export async function getKnowledgeExtractionDirectory(): Promise<{ id: string; name: string }> {
  const dirs = await getAllDirectories();
  const existing = dirs.find((d) => d.name === '知识提炼');
  if (existing) return { id: existing.id, name: existing.name };
  const newDir = await createDirectory('知识提炼');
  return { id: newDir.id, name: newDir.name };
}

/** 根据名称查找或创建标签 */
async function getOrCreateTagsByNames(names: string[]): Promise<string[]> {
  const allTags = await getAllTags();
  const tagMap = new Map(allTags.map((t) => [t.name, t.id]));
  const ids: string[] = [];

  for (const name of names) {
    if (tagMap.has(name)) {
      ids.push(tagMap.get(name)!);
    } else {
      const tag = await createTag(name);
      ids.push(tag.id);
      tagMap.set(name, tag.id);
    }
  }
  return ids;
}

/**
 * 批量保存知识点
 */
export async function saveKnowledgePoints(
  knowledgePoints: ExtractedKnowledge[],
  options: KnowledgeSaveOptions & { sourceUrl?: string; sourceTitle?: string }
): Promise<{ noteIds: string[]; count: number }> {
  const { directoryId, mergeAsOne, customTitle, sourceUrl, sourceTitle } = options;
  const selected = knowledgePoints.filter((k) => k.selected !== false);
  if (selected.length === 0) throw new Error('没有选中的知识点');

  const noteIds: string[] = [];

  if (mergeAsOne) {
    const title = customTitle || sourceTitle || `知识提炼 - ${new Date().toLocaleDateString('zh-CN')}`;
    const markdown = mergeKnowledgeToMarkdown(selected, { title, sourceUrl });
    const allTags = [...new Set(selected.flatMap((k) => k.tags))];

    const note = await createNote(title, directoryId, markdown);
    if (allTags.length > 0) {
      const tagIds = await getOrCreateTagsByNames(allTags);
      await setNoteTags(note.id, tagIds);
    }
    noteIds.push(note.id);
  } else {
    for (const kp of selected) {
      const markdown = knowledgeToMarkdown(kp);
      const note = await createNote(kp.title, directoryId, markdown);
      if (kp.tags.length > 0) {
        const tagIds = await getOrCreateTagsByNames(kp.tags);
        await setNoteTags(note.id, tagIds);
      }
      noteIds.push(note.id);
    }
  }

  return { noteIds, count: noteIds.length };
}
