/**
 * 知识提取 Prompt 模板
 */

/** 系统提示词 */
export const EXTRACTION_SYSTEM_PROMPT = `你是一个专业的知识提取助手，擅长从文本中识别和提取关键知识点。你的任务是分析给定的文本内容，提取出有价值的知识点，并以结构化的 Markdown 格式返回。

提取规则：
1. **核心概念**: 文中出现的重要概念、术语及其解释
2. **重要定义**: 明确的定义性内容，如"XX是指..."、"XX定义为..."
3. **关键步骤**: 操作流程、方法步骤、实施要点
4. **要点总结**: 核心观点、结论、重要发现

提取要求：
- 每个知识点必须有清晰的标题和详细的内容描述
- 确保提取的知识点具有独立性和完整性
- 避免重复提取相同的知识点
- 知识点数量控制在 3-10 个之间
- 内容要精炼、易于理解

输出格式要求：
- 必须返回 Markdown 格式
- 每个知识点使用二级标题（##）
- 内容使用正常段落或列表`;

/** 生成用户提示词 */
export function generateExtractionPrompt(content: string, title?: string): string {
  const titlePart = title ? `\n文章标题：${title}` : '';

  return `请分析以下文本内容，提取关键知识点并以 Markdown 格式返回：
${titlePart}
---
${content}
---

请按以下 Markdown 格式返回提取结果：

## 知识点标题1

知识点的详细内容描述，完整解释该知识点。可以使用列表、加粗等 Markdown 语法。

## 知识点标题2

另一个知识点的内容...

注意：
1. 每个知识点使用二级标题（##）
2. 标题要简洁明了，概括知识点核心
3. 内容要详细完整，可使用列表、加粗等格式
4. 不要添加"知识点1"、"知识点2"这样的序号前缀
5. 直接返回 Markdown 内容，不要使用代码块包裹`;
}

/** 解析 AI 响应中的知识点 */
export function parseExtractionResponse(
  response: string
): { knowledgePoints: Array<{ title: string; content: string; sourceContext: string; type: string; tags: string[] }> } | null {
  try {
    let content = response.trim();
    if (content.startsWith('```markdown')) content = content.slice(11);
    else if (content.startsWith('```md')) content = content.slice(5);
    else if (content.startsWith('```')) content = content.slice(3);
    if (content.endsWith('```')) content = content.slice(0, -3);
    content = content.trim();

    const sections = content.split(/^##\s+/gm).filter((s) => s.trim());
    if (sections.length === 0) return null;

    const knowledgePoints = sections
      .map((section) => {
        const lines = section.split('\n');
        return {
          title: lines[0].trim(),
          content: lines.slice(1).join('\n').trim(),
          sourceContext: '',
          type: 'summary',
          tags: [] as string[],
        };
      })
      .filter((p) => p.title && p.content);

    return knowledgePoints.length > 0 ? { knowledgePoints } : null;
  } catch {
    return null;
  }
}
