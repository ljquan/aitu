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

  return `你是一位专业的PPT大纲设计师。请根据用户提供的主题，生成一份结构清晰、逻辑严密、内容丰富的PPT大纲。

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
  title: string;          // 页面标题（控制在10个中文字符以内，避免换行）
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
- 风格统一为：professional, modern, clean, flat design illustration
- 示例："A futuristic city with flying cars and holographic billboards, professional flat design illustration, clean and modern style"

## 设计原则
1. **标题精简**：每页标题控制在 10 个中文字符以内（约 20 个英文字符），避免在幻灯片上换行
2. **内容充实**：每页 4-6 个要点，每个要点 10-20 字，信息密度适中
3. **图文并茂**：大量使用 image-text 版式（建议占比 50-70%），让 PPT 更丰富
4. **逻辑清晰**：内容有明确的起承转合
5. **版式多样**：合理搭配不同版式，避免连续多页相同版式
6. **对比页要点**：comparison 版式需要 6 个要点（左右各 3 个），方便排版

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
 * 从文本中提取 JSON 对象字符串
 * 通过花括号匹配找到最外层的 JSON 对象
 */
function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

/**
 * 解析 AI 返回的大纲 JSON
 */
export function parseOutlineResponse(response: string): import('./ppt.types').PPTOutline {
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

  // 策略1: 直接解析
  try {
    const parsed = JSON.parse(jsonStr);
    if (validateOutline(parsed)) {
      return parsed;
    }
  } catch {
    // 直接解析失败，尝试其他策略
  }

  // 策略2: 提取 JSON 对象（处理前后有多余文本、注释等情况）
  const extracted = extractJsonObject(jsonStr);
  if (extracted) {
    try {
      const parsed = JSON.parse(extracted);
      if (validateOutline(parsed)) {
        return parsed;
      }
    } catch {
      // 提取后仍然解析失败
    }
  }

  // 策略3: 尝试修复常见 JSON 问题（如尾部逗号、单引号等）
  try {
    const fixedStr = (extracted || jsonStr)
      .replace(/,\s*([}\]])/g, '$1')       // 移除尾部逗号
      .replace(/(['"])?(\w+)(['"])?\s*:/g, '"$2":') // 修复未引用的 key
      .replace(/:\s*'([^']*)'/g, ':"$1"'); // 单引号转双引号

    const parsed = JSON.parse(fixedStr);
    if (validateOutline(parsed)) {
      return parsed;
    }
  } catch {
    // 修复也失败
  }

  throw new Error(
    `Failed to parse PPT outline. AI response may contain invalid JSON. ` +
    `Response preview: ${response.slice(0, 200)}...`
  );
}
