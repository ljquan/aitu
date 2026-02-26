/**
 * Markdown 文本解析为 Card 块
 *
 * 将 Markdown 格式的文本解析为结构化的 CardBlock 数组，
 * 每个一级/二级标题对应一张 Card。
 */

export interface CardBlock {
  /** 标题（可选，来自 # 或 ## 标题行） */
  title?: string;
  /** 正文内容 */
  body: string;
}

/**
 * 检测文本是否包含 Markdown 特征
 * 包括：标题（#）、列表（-、*、1.）、粗体（**）、代码块（`）等
 */
function hasMarkdownFeatures(text: string): boolean {
  const markdownPatterns = [
    /^#{1,6}\s+/m,          // 标题
    /^[-*+]\s+/m,           // 无序列表
    /^\d+\.\s+/m,           // 有序列表
    /\*\*[^*]+\*\*/,        // 粗体
    /`[^`]+`/,              // 行内代码
    /^```/m,                // 代码块
    /^\s*>\s+/m,            // 引用
  ];
  return markdownPatterns.some((pattern) => pattern.test(text));
}

/**
 * 将 Markdown 文本解析为 CardBlock 数组
 *
 * 规则：
 * - 一个 Markdown 文本只生成一张 Card
 * - title 取首个 # 或 ## 标题（若有）
 * - body 为原始文本（仅 trim 处理）
 * - 无 Markdown 特征时 → 返回 null（降级为普通文本插入）
 *
 * @param text 输入文本
 * @returns CardBlock 数组，或 null（表示无 Markdown 特征，应降级处理）
 */
export function parseMarkdownToCards(text: string): CardBlock[] | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // 检测是否有 Markdown 特征，无则降级
  if (!hasMarkdownFeatures(trimmed)) {
    return null;
  }

  const titleMatch = trimmed.match(/^#{1,2}\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : undefined;
  // 若提取到标题，从 body 中去掉第一个标题行，避免正文中重复显示
  const body = title && titleMatch
    ? trimmed.replace(titleMatch[0], '').replace(/^\n+/, '').trim()
    : trimmed;

  return [{ title, body }];
}
