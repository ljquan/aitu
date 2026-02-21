/**
 * 知识点导出服务
 * 导出为 Markdown / JSON 格式
 */

import type { ExtractedKnowledge, ExportOptions, KnowledgeExtractionResult } from './types';
import { KNOWLEDGE_TYPE_LABELS, type KnowledgeType } from './types';

function exportToMarkdown(
  points: ExtractedKnowledge[],
  opts: { title?: string; sourceUrl?: string; includeSource: boolean; includeTags: boolean }
): string {
  const lines: string[] = [];
  lines.push(`# ${opts.title || '知识提炼'}`);
  lines.push('');
  if (opts.sourceUrl) { lines.push(`> 来源: ${opts.sourceUrl}`); lines.push(''); }
  lines.push(`> 导出时间: ${new Date().toLocaleString('zh-CN')}`);
  lines.push('');
  lines.push('---');
  lines.push('');

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
      if (opts.includeSource && p.sourceContext) { lines.push(''); lines.push(`> ${p.sourceContext}`); }
      if (opts.includeTags && p.tags.length > 0) { lines.push(''); lines.push(`**标签**: ${p.tags.map((t) => `\`${t}\``).join(' ')}`); }
      lines.push('');
    }
  }
  return lines.join('\n');
}

function exportToJson(
  points: ExtractedKnowledge[],
  opts: { title?: string; sourceUrl?: string; includeSource: boolean; includeTags: boolean }
): string {
  const data = {
    title: opts.title || '知识提炼',
    sourceUrl: opts.sourceUrl || null,
    exportedAt: new Date().toISOString(),
    knowledgePoints: points.map((p) => {
      const item: Record<string, unknown> = {
        title: p.title,
        content: p.content,
        type: p.type,
        typeLabel: KNOWLEDGE_TYPE_LABELS[p.type],
      };
      if (opts.includeSource && p.sourceContext) item.sourceContext = p.sourceContext;
      if (opts.includeTags && p.tags.length > 0) item.tags = p.tags;
      return item;
    }),
  };
  return JSON.stringify(data, null, 2);
}

/** 导出知识点 */
export function exportKnowledge(
  result: KnowledgeExtractionResult,
  options: ExportOptions
): { content: string; filename: string; mimeType: string } {
  const selected = result.knowledgePoints.filter((k) => k.selected !== false);
  if (selected.length === 0) throw new Error('没有选中的知识点');

  const exportOpts = {
    title: result.sourceTitle || '知识提炼',
    sourceUrl: result.sourceUrl,
    includeSource: options.includeSource,
    includeTags: options.includeTags,
  };

  const ts = new Date().toISOString().slice(0, 10);
  const base = result.sourceTitle
    ? `${result.sourceTitle.slice(0, 30).replace(/[/\\?%*:|"<>]/g, '-')}_知识提炼_${ts}`
    : `知识提炼_${ts}`;

  if (options.format === 'markdown') {
    return { content: exportToMarkdown(selected, exportOpts), filename: `${base}.md`, mimeType: 'text/markdown' };
  }
  return { content: exportToJson(selected, exportOpts), filename: `${base}.json`, mimeType: 'application/json' };
}

/** 下载导出文件 */
export function downloadExport(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
