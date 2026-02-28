/**
 * 外部 Skill 解析器
 *
 * 解析 baoyu-skills 规范的 SKILL.md 文件和 marketplace.json，
 * 将外部 Skill 转换为 aitu 内部 ExternalSkill 格式。
 */

import type { ExternalSkill } from '../constants/skills';
import { SKILL_TYPE_EXTERNAL } from '../constants/skills';

// ──────────────────────────────────────────────────────────────────
// SKILL.md 解析
// ──────────────────────────────────────────────────────────────────

/** SKILL.md 解析结果 */
export interface ParsedSkillMarkdown {
  /** YAML front matter 中的 name（kebab-case 唯一标识） */
  name: string;
  /** YAML front matter 中的 description */
  description: string;
  /** Markdown 文档体（去掉 front matter 后的内容） */
  body: string;
}

/**
 * 解析 SKILL.md 内容，提取 YAML front matter 和文档体
 *
 * SKILL.md 格式：
 * ```
 * ---
 * name: baoyu-infographic
 * description: Generates professional infographics...
 * ---
 *
 * # Title
 * ...文档内容...
 * ```
 *
 * @param content - SKILL.md 的完整文本内容
 * @returns 解析结果，如果格式无效则返回 null
 */
export function parseSkillMarkdown(content: string): ParsedSkillMarkdown | null {
  if (!content || typeof content !== 'string') {
    console.warn('[ExternalSkillParser] SKILL.md 内容为空');
    return null;
  }

  const trimmed = content.trim();

  // 检查是否以 YAML front matter 起始（--- 开头）
  if (!trimmed.startsWith('---')) {
    console.warn('[ExternalSkillParser] SKILL.md 缺少 YAML front matter（未以 --- 开头）');
    return null;
  }

  // 查找 front matter 结束标记（第二个 ---）
  const endIndex = trimmed.indexOf('---', 3);
  if (endIndex === -1) {
    console.warn('[ExternalSkillParser] SKILL.md YAML front matter 未闭合（缺少结束 ---）');
    return null;
  }

  const frontMatterRaw = trimmed.substring(3, endIndex).trim();
  const body = trimmed.substring(endIndex + 3).trim();

  // 简易 YAML 解析（仅支持 key: value 格式的平面结构）
  const frontMatter = parseSimpleYaml(frontMatterRaw);

  const name = frontMatter['name'];
  const description = frontMatter['description'] || '';

  if (!name) {
    console.warn('[ExternalSkillParser] SKILL.md 缺少必填字段 name');
    return null;
  }

  return { name, description, body };
}

/**
 * 简易 YAML 解析器
 * 仅支持 `key: value` 格式，不支持嵌套、数组等复杂结构。
 * 足以解析 SKILL.md 的 front matter。
 */
function parseSimpleYaml(yaml: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = yaml.split('\n');

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) continue;

    const colonIndex = trimmedLine.indexOf(':');
    if (colonIndex === -1) continue;

    const key = trimmedLine.substring(0, colonIndex).trim();
    let value = trimmedLine.substring(colonIndex + 1).trim();

    // 去除引号包裹
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (key) {
      result[key] = value;
    }
  }

  return result;
}

// ──────────────────────────────────────────────────────────────────
// marketplace.json 解析
// ──────────────────────────────────────────────────────────────────

/** marketplace.json 中的 plugin 分组 */
export interface MarketplacePlugin {
  name: string;
  description: string;
  skills: string[];
}

/** marketplace.json 解析结果 */
export interface ParsedMarketplace {
  /** 包名 */
  name: string;
  /** 元数据 */
  metadata?: {
    description?: string;
    version?: string;
  };
  /** Skill 分组列表 */
  plugins: MarketplacePlugin[];
  /** skill 路径 → 所属分类名的映射 */
  skillCategoryMap: Map<string, string>;
}

/**
 * 解析 marketplace.json 内容
 *
 * @param jsonStr - marketplace.json 的文本内容
 * @returns 解析结果，解析失败返回 null
 */
export function parseMarketplaceJson(jsonStr: string): ParsedMarketplace | null {
  try {
    const data = JSON.parse(jsonStr);

    if (!data.plugins || !Array.isArray(data.plugins)) {
      console.warn('[ExternalSkillParser] marketplace.json 缺少 plugins 数组');
      return null;
    }

    const skillCategoryMap = new Map<string, string>();
    const plugins: MarketplacePlugin[] = [];

    for (const plugin of data.plugins) {
      const pluginEntry: MarketplacePlugin = {
        name: plugin.name || '',
        description: plugin.description || '',
        skills: [],
      };

      if (Array.isArray(plugin.skills)) {
        for (const skillPath of plugin.skills) {
          // 规范化路径：移除 ./ 前缀，提取 skill 名称
          const normalized = normalizeSkillPath(skillPath);
          pluginEntry.skills.push(normalized);
          skillCategoryMap.set(normalized, plugin.name || '');
        }
      }

      plugins.push(pluginEntry);
    }

    return {
      name: data.name || '',
      metadata: data.metadata ? {
        description: data.metadata.description,
        version: data.metadata.version,
      } : undefined,
      plugins,
      skillCategoryMap,
    };
  } catch (err) {
    console.warn('[ExternalSkillParser] marketplace.json 解析失败:', err);
    return null;
  }
}

/**
 * 规范化 skill 路径
 * 将 `./skills/baoyu-infographic` 转换为 `baoyu-infographic`
 */
function normalizeSkillPath(rawPath: string): string {
  let path = rawPath.trim();
  // 移除 ./ 前缀
  if (path.startsWith('./')) {
    path = path.substring(2);
  }
  // 移除 skills/ 前缀
  if (path.startsWith('skills/')) {
    path = path.substring(7);
  }
  // 移除尾部 /
  if (path.endsWith('/')) {
    path = path.slice(0, -1);
  }
  return path;
}

// ──────────────────────────────────────────────────────────────────
// 引用内容解析
// ──────────────────────────────────────────────────────────────────

/**
 * 将 SKILL.md 文档体中引用的 references/ 和 prompts/ 路径替换为内联内容
 *
 * @param skillContent - SKILL.md 文档体
 * @param references - 文件路径 → 文件内容的映射
 * @returns 替换后的内容
 */
export function resolveReferences(
  skillContent: string,
  references: Map<string, string>
): string {
  if (!references || references.size === 0) return skillContent;

  let resolved = skillContent;

  // 替换 backtick 引用路径（如 `references/layouts/bento-grid.md`）
  // 以及 markdown 链接中的路径
  for (const [path, content] of references) {
    // 替换 `path` 格式的引用
    const backtickPattern = new RegExp('`' + escapeRegex(path) + '`', 'g');
    resolved = resolved.replace(backtickPattern, `\`${path}\`\n\n<details><summary>${path}</summary>\n\n${content}\n\n</details>`);
  }

  return resolved;
}

/** 转义正则表达式特殊字符 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ──────────────────────────────────────────────────────────────────
// 转换为 ExternalSkill
// ──────────────────────────────────────────────────────────────────

/**
 * 将解析后的 SKILL.md 转换为 ExternalSkill 对象
 *
 * @param parsed - SKILL.md 解析结果
 * @param packageName - 包源名称（用于 ID 前缀和 source 字段）
 * @param category - 分类名称（来自 marketplace.json）
 * @param sourceUrl - 包源路径/URL
 * @returns ExternalSkill 对象
 */
export function toExternalSkill(
  parsed: ParsedSkillMarkdown,
  packageName: string,
  category?: string,
  sourceUrl?: string
): ExternalSkill {
  return {
    id: `${packageName}:${parsed.name}`,
    name: parsed.name,
    description: parsed.description,
    type: SKILL_TYPE_EXTERNAL,
    content: parsed.body,
    source: packageName,
    sourceUrl,
    category,
  };
}

// ──────────────────────────────────────────────────────────────────
// 批量解析
// ──────────────────────────────────────────────────────────────────

/** 单个 Skill 文件数据（用于批量解析输入） */
export interface SkillFileData {
  /** skill 目录名（如 baoyu-infographic） */
  dirName: string;
  /** SKILL.md 文件内容 */
  skillMdContent: string;
  /** references 文件映射（路径 → 内容），可选 */
  references?: Map<string, string>;
}

/**
 * 批量解析 Skill 文件数据，转换为 ExternalSkill 数组
 *
 * @param files - Skill 文件数据列表
 * @param packageName - 包名
 * @param marketplace - marketplace.json 解析结果（可选，用于分类信息）
 * @param sourceUrl - 包源路径/URL
 * @returns ExternalSkill 数组（跳过无效文件）
 */
export function batchParseSkills(
  files: SkillFileData[],
  packageName: string,
  marketplace?: ParsedMarketplace | null,
  sourceUrl?: string
): ExternalSkill[] {
  const skills: ExternalSkill[] = [];

  for (const file of files) {
    const parsed = parseSkillMarkdown(file.skillMdContent);
    if (!parsed) {
      console.warn(`[ExternalSkillParser] 跳过无效 Skill: ${file.dirName}`);
      continue;
    }

    // 如果有 references，内联替换引用
    let content = parsed.body;
    if (file.references && file.references.size > 0) {
      content = resolveReferences(content, file.references);
    }

    const category = marketplace?.skillCategoryMap.get(parsed.name)
      || marketplace?.skillCategoryMap.get(file.dirName);

    skills.push({
      id: `${packageName}:${parsed.name}`,
      name: parsed.name,
      description: parsed.description,
      type: SKILL_TYPE_EXTERNAL,
      content,
      source: packageName,
      sourceUrl,
      category,
    });
  }

  return skills;
}

// ──────────────────────────────────────────────────────────────────
// 外部 Skill content 预处理
// ──────────────────────────────────────────────────────────────────

/**
 * 对外部 Skill 的 content 进行预处理，适配 aitu 执行环境
 *
 * 对于 `outputType === 'image'` 的 Skill：
 * - 将 baoyu-image-gen 相关脚本调用替换为 generate_image 工具调用
 * - 将 AskUserQuestion 交互步骤替换为自动选择
 * - 移除本地文件系统操作指令
 * - 保留所有 prompt 构建相关内容
 * - 末尾追加执行指引
 *
 * 对于 `outputType === 'text'` 的 Skill，直接返回原始 content
 *
 * @param content - Skill 的 content（SKILL.md 文档体 + 内联 references）
 * @param outputType - Skill 输出类型
 * @returns 预处理后的 content
 */
export function preprocessExternalSkillContent(
  content: string,
  outputType: 'image' | 'text'
): string {
  if (outputType !== 'image') {
    return content;
  }

  if (!content || content.trim().length === 0) {
    return content;
  }

  let processed = content;

  // 1. 替换 bash 代码块中的脚本调用（如 npx bun scripts/main.ts 等）
  processed = processed.replace(
    /```bash\n[\s\S]*?```/g,
    (match) => {
      // 如果 bash 块包含脚本调用或文件操作，移除整个块
      if (/npx|bun|scripts\/|\.ts\b|\.js\b|mkdir|cp |mv |rm |cat /i.test(match)) {
        return '> *（此步骤在 aitu 中自动处理）*';
      }
      return match;
    }
  );

  // 2. 替换 image generation skill 相关引用
  processed = processed.replace(
    /(?:Select|Check|Use|Call)\s+(?:available\s+)?image\s+generation\s+skill[s]?[^.\n]*/gi,
    '调用 generate_image 工具生成图片'
  );
  processed = processed.replace(
    /(?:If\s+)?(?:multiple\s+)?(?:image\s+generation\s+)?skills?\s+available,?\s*ask\s+(?:user\s+)?preference[^.\n]*/gi,
    ''
  );
  processed = processed.replace(
    /Call\s+(?:skill\s+)?with\s+prompt\s+file[^.\n]*/gi,
    '调用 generate_image 工具，传入构建好的 prompt'
  );
  processed = processed.replace(
    /If\s+image\s+generation\s+skill\s+supports[^.\n]*/gi,
    ''
  );

  // 3. 替换 AskUserQuestion 交互步骤
  processed = processed.replace(
    /(?:Use\s+)?AskUserQuestion\s+(?:with\s+)?(?:ALL\s+)?(?:questions?\s+)?(?:in\s+ONE\s+call)?[^.\n]*/gi,
    '自动选择最合适的参数组合'
  );
  processed = processed.replace(
    /\*\*(?:Use\s+)?AskUserQuestion\*\*[^.\n]*/gi,
    '**自动选择**最合适的参数组合'
  );
  processed = processed.replace(
    /ask\s+(?:the\s+)?user\s+with\s+AskUserQuestion[^.\n]*/gi,
    '自动选择最合适的参数'
  );
  processed = processed.replace(
    /\bDo\s+NOT\s+split\s+into\s+separate\s+AskUserQuestion\s+calls[^.\n]*/gi,
    ''
  );
  processed = processed.replace(
    /\*\*Important\*\*:\s*Do NOT split into separate AskUserQuestion[^.\n]*/gi,
    ''
  );

  // 4. 移除文件系统操作指令
  processed = processed.replace(
    /\*\*(?:Save|Write)\s+(?:source\s+)?(?:content|to\s+file)\*\*[^.\n]*(?:\n\s*-[^\n]*)*/gi,
    '> *（文件保存步骤在 aitu 中自动跳过）*'
  );
  processed = processed.replace(
    /(?:Save|Write)\s+(?:to|the)\s+(?:file|disk|output)[^.\n]*/gi,
    ''
  );
  processed = processed.replace(
    /\*\*Check\s+for\s+existing\s+file\*\*[^.\n]*(?:\n\s*-[^\n]*)*/gi,
    ''
  );
  processed = processed.replace(
    /If\s+exists?:\s*Rename\s+to[^\n]*/gi,
    ''
  );
  processed = processed.replace(
    /\*\*Backup\s+rule\*\*[^\n]*/gi,
    ''
  );
  processed = processed.replace(
    /output\s+path[,:]?\s*(?:files?\s+created)?[^.\n]*/gi,
    ''
  );

  // 5. 移除目录结构展示（如 ├── xxx.md）
  processed = processed.replace(
    /(?:^|\n)(?:[│├└─\s]+[^\n]+\n)+/gm,
    '\n'
  );

  // 6. 清理连续空行（超过2个空行压缩为2个）
  processed = processed.replace(/\n{4,}/g, '\n\n\n');

  // 7. 末尾追加执行指引
  const executionGuide = `

---

## 执行指引（aitu 环境适配）

**你必须严格按照以上 Skill 工作流指令执行。** 在 aitu 环境中，执行规则如下：

1. **内容分析**：基于用户输入内容，按照 Skill 中的步骤进行深入分析，提取关键信息
2. **参数选择**：自动选择最合适的布局（layout）和样式（style），无需询问用户
3. **Prompt 构建**：严格按照 Skill 中的模板和规则，结合 Reference 中的布局定义和样式定义，构建完整、详细的图片生成 prompt
4. **图片生成**：将构建好的完整 prompt 作为参数，调用 \`generate_image\` 工具生成图片
5. **禁止**：不要仅输出文字描述而不生成图片，必须实际调用 \`generate_image\` 工具

**重要**：你的最终目标是调用 \`generate_image\` 工具生成一张高质量的图片，而非输出文本分析。
`;

  processed += executionGuide;

  return processed;
}
