/**
 * PPT 大纲生成提示词模块
 *
 * 参考 banana-slides 8.2 节和 LandPPT 5.3 节设计
 * 输出严格 JSON（PPTOutline），内置语言控制和页数控制
 */

import type { PPTGenerateOptions, PPTLayoutType } from './ppt.types';

/** 页数范围映射 */
const PAGE_COUNT_RANGES: Record<string, { min: number; max: number }> = {
  short: { min: 5, max: 7 },
  normal: { min: 8, max: 12 },
  long: { min: 13, max: 18 },
};

/** 版式类型描述 */
const LAYOUT_DESCRIPTIONS: Record<PPTLayoutType, string> = {
  cover: '封面页 - 用于PPT开头，包含主标题和副标题',
  toc: '目录页 - 展示PPT的章节结构',
  'title-body': '标题正文页 - 最常用的版式，标题 + 要点列表',
  'image-text': '图文页 - 需要配图的内容页，同时包含文字和图片区域',
  comparison: '对比页 - 左右对比两个概念或事物',
  ending: '结尾页 - 用于PPT结尾，包含感谢语或总结',
};

/**
 * 生成 PPT 大纲的系统提示词
 */
export function generateOutlineSystemPrompt(options: PPTGenerateOptions = {}): string {
  const { pageCount = 'normal', language = '中文' } = options;
  const range = PAGE_COUNT_RANGES[pageCount] || PAGE_COUNT_RANGES.normal;

  return `你是一位专业的PPT大纲设计师。请根据用户提供的主题，生成一份结构清晰、逻辑严密的PPT大纲。

## 输出要求
1. 输出格式：严格JSON，符合 PPTOutline 接口定义
2. 输出语言：所有文本内容使用${language}
3. 页数控制：${range.min}-${range.max}页（不含封面和结尾）
4. 必须以封面页(cover)开头，结尾页(ending)结尾

## 可用版式类型
${Object.entries(LAYOUT_DESCRIPTIONS)
  .map(([type, desc]) => `- ${type}: ${desc}`)
  .join('\n')}

## PPTOutline JSON Schema
\`\`\`typescript
interface PPTOutline {
  title: string;          // PPT总标题
  pages: PPTPageSpec[];   // 所有页面
}

interface PPTPageSpec {
  layout: "cover" | "toc" | "title-body" | "image-text" | "comparison" | "ending";
  title: string;          // 页面标题
  subtitle?: string;      // 副标题（cover/ending页使用）
  bullets?: string[];     // 要点列表（title-body/image-text/comparison页使用）
  imagePrompt?: string;   // 配图描述（仅image-text页需要，英文）
  notes?: string;         // 演讲者备注（可选）
}
\`\`\`

## imagePrompt 生成规则
- 仅为 image-text 版式的页面生成 imagePrompt
- imagePrompt 使用英文描述，便于图片生成模型理解
- 描述应具体、可视化，包含主体、风格、氛围等要素
- 示例："A futuristic city with flying cars and holographic billboards, cyberpunk style, vibrant neon lights"

## 设计原则
1. 逻辑清晰：内容有明确的起承转合
2. 详略得当：重点内容可多用几页展开
3. 图文并茂：适当使用 image-text 版式（建议占比 30-50%）
4. 要点精炼：每个 bullet 控制在 15 字以内

## 输出格式
直接输出JSON对象，不要包含markdown代码块标记。`;
}

/**
 * 生成用户提示词
 */
export function generateOutlineUserPrompt(
  topic: string,
  options: PPTGenerateOptions = {}
): string {
  const { extraRequirements } = options;

  let prompt = `请为以下主题生成PPT大纲：

主题：${topic}`;

  if (extraRequirements) {
    prompt += `

额外要求：${extraRequirements}`;
  }

  prompt += `

请直接输出JSON格式的PPT大纲。`;

  return prompt;
}

/**
 * 验证 PPT 大纲结构
 */
export function validateOutline(outline: unknown): outline is import('./ppt.types').PPTOutline {
  if (!outline || typeof outline !== 'object') return false;

  const o = outline as Record<string, unknown>;
  if (typeof o.title !== 'string' || !o.title) return false;
  if (!Array.isArray(o.pages) || o.pages.length === 0) return false;

  const validLayouts = ['cover', 'toc', 'title-body', 'image-text', 'comparison', 'ending'];

  for (const page of o.pages) {
    if (!page || typeof page !== 'object') return false;
    const p = page as Record<string, unknown>;
    if (typeof p.layout !== 'string' || !validLayouts.includes(p.layout)) return false;
    if (typeof p.title !== 'string') return false;
  }

  return true;
}

/**
 * 解析 AI 返回的大纲 JSON
 */
export function parseOutlineResponse(response: string): import('./ppt.types').PPTOutline {
  // 尝试直接解析
  let jsonStr = response.trim();

  // 移除可能的 markdown 代码块标记
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith('```')) {
    jsonStr = jsonStr.slice(0, -3);
  }
  jsonStr = jsonStr.trim();

  try {
    const parsed = JSON.parse(jsonStr);
    if (!validateOutline(parsed)) {
      throw new Error('Invalid PPT outline structure');
    }
    return parsed;
  } catch (error) {
    throw new Error(`Failed to parse PPT outline: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
