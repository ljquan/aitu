/**
 * Skill（技能）常量定义
 *
 * 系统内置 Skill 列表，每个 Skill 对应一个 MCP 工具。
 * 用户也可以在知识库 Skill 目录下创建自定义 Skill 笔记。
 */

/** Skill 类型：系统内置 */
export const SKILL_TYPE_SYSTEM = 'system' as const;
/** Skill 类型：用户自定义 */
export const SKILL_TYPE_USER = 'user' as const;
/** Skill 类型：外部引入 */
export const SKILL_TYPE_EXTERNAL = 'external' as const;

/** 自动模式 Skill ID */
export const SKILL_AUTO_ID = 'auto';

/** 系统内置 Skill 接口 */
export interface SystemSkill {
  /** 唯一标识 */
  id: string;
  /** 中文名称，用于 UI 展示 */
  name: string;
  /**
   * 对应的 MCP 工具名称（可选，统一执行路径下不再直接使用）
   */
  mcpTool?: string;
  /** 功能说明，用于知识库笔记内容展示；同时作为 Skill 执行路径的解析内容 */
  description: string;
  /** 类型标记 */
  type: typeof SKILL_TYPE_SYSTEM;
}

/** 外部 Skill 接口，继承 SystemSkill 并扩展来源信息 */
export interface ExternalSkill {
  /** 唯一标识（自动加包名前缀，如 baoyu-skills:baoyu-infographic） */
  id: string;
  /** 中文/英文名称，用于 UI 展示 */
  name: string;
  /** 对应的 MCP 工具名称（可选） */
  mcpTool?: string;
  /** 功能描述（来自 SKILL.md front matter 的 description） */
  description: string;
  /** 类型标记 */
  type: typeof SKILL_TYPE_EXTERNAL;
  /** SKILL.md 文档体（Markdown 内容，作为执行路径的解析内容） */
  content: string;
  /** 包源名称 */
  source: string;
  /** 包源路径/URL */
  sourceUrl?: string;
  /** 分类（来自 marketplace.json） */
  category?: string;
  /** 输出类型：image 表示图片生成类 Skill，text 表示文本处理类 Skill，video 表示视频生成类 Skill */
outputType?: 'image' | 'text' | 'video' | 'ppt';
}

/** 外部 Skill 包接口 */
export interface ExternalSkillPackage {
  /** 包名（如 baoyu-skills） */
  name: string;
  /** 包源路径/URL */
  url?: string;
  /** 包含的外部 Skill 列表 */
  skills: ExternalSkill[];
  /** 包元数据 */
  metadata?: {
    version?: string;
    description?: string;
    [key: string]: unknown;
  };
}

/** 外部 Skill 虚拟笔记 ID 前缀 */
export const EXTERNAL_SKILL_NOTE_PREFIX = '__external_skill__:';

/** 系统内置 Skill 列表 */
export const SYSTEM_SKILLS: SystemSkill[] = [
  {
    id: 'generate_inspiration_board',
    name: '灵感图',
    mcpTool: 'generate_inspiration_board',
    description:
      '灵感图\n\n生成创意灵感拼贴图，将多张图片以不规则分割的方式拼合，以散落的横向布局插入画布，营造富有创意感的视觉效果。\n\n**使用方式：** 在 AI 输入框中描述你的主题或灵感关键词，选择「灵感图」Skill 后提交，AI 将直接生成灵感拼贴图并插入画布。\n\n**适用场景：** 创意头脑风暴、情绪板制作、视觉灵感收集。\n\n**工作流：**\n\n调用 generate_inspiration_board\n- imageCount: 9\n- imageSize: 16x9',
    type: SKILL_TYPE_SYSTEM,
  },
  {
    id: 'generate_grid_image',
    name: '宫格图',
    mcpTool: 'generate_grid_image',
    description:
      '宫格图\n\n生成整齐排列的宫格图片墙，将多张主题相关图片按网格布局排列在画布上，适合产品展示、表情包制作等场景。\n\n**使用方式：** 在 AI 输入框中描述你的主题，选择「宫格图」Skill 后提交，AI 将直接生成宫格图并插入画布。\n\n**适用场景：** 产品展示墙、表情包制作、图片集合展示。\n\n**工作流：**\n\n调用 generate_grid_image\n- rows: 3\n- cols: 3\n- layoutStyle: scattered',
    type: SKILL_TYPE_SYSTEM,
  },
  {
    id: 'generate_flowchart',
    name: '流程图',
    description:
      '流程图\n\n你是一个流程图专家。请根据用户的描述，生成 Mermaid 格式的流程图代码，并调用 insert_mermaid 工具将其插入画布。\n\n**要求：**\n1. 分析用户需求，设计合理的流程结构。\n2. 使用 Mermaid 语法生成代码。\n3. 必须调用 insert_mermaid 工具。',
    type: SKILL_TYPE_SYSTEM,
  },
  {
    id: 'generate_mindmap',
    name: '思维导图',
    description:
      '思维导图\n\n你是一个思维导图专家。请根据用户的描述，生成 Markdown 格式的思维导图内容，并调用 insert_mindmap 工具将其插入画布。\n\n**要求：**\n1. 使用 Markdown 列表语法（# 标题, - 列表项）。\n2. 结构清晰，层级分明。\n3. 必须调用 insert_mindmap 工具。',
    type: SKILL_TYPE_SYSTEM,
  },
  {
    id: 'generate_svg',
    name: 'SVG矢量图',
    description:
      'SVG矢量图\n\n你是一个矢量图形设计师。请根据用户的描述，编写 SVG 代码，并调用 insert_svg 工具将其插入画布。\n\n**要求：**\n1. 生成标准 SVG 代码，包含 xmlns 和 viewBox。\n2. 代码简洁，适合作为图标或 Logo。\n3. 必须调用 insert_svg 工具。',
    type: SKILL_TYPE_SYSTEM,
  },
  {
    id: 'generate_ppt',
    name: 'PPT演示',
    mcpTool: 'generate_ppt',
    description:
      'PPT演示\n\n生成 PPT 演示文稿大纲并自动布局。\n\n**使用方式：** 输入 PPT 主题，选择「PPT演示」Skill 后提交。\n\n**适用场景：** 演示文稿、课件制作、汇报材料。\n\n**工作流：**\n\n调用 generate_ppt',
    type: SKILL_TYPE_SYSTEM,
  },
  {
    id: 'role_chat_pm',
    name: '产品经理',
    description:
      '你是一位拥有 10 年经验的资深产品经理，擅长将模糊的业务需求转化为清晰的产品文档。\n\n用户会描述一个功能需求或产品想法，请用以下结构回复：\n\n1. **需求背景**：简述该功能的业务价值（2-3句）\n2. **用户故事**：以"作为[用户]，我希望[功能]，以便[价值]"格式描述\n3. **功能要点**：列出 3-5 个核心功能点\n4. **验收标准**：列出可量化的验收条件\n\n请保持简洁专业，避免冗余描述。',
    type: SKILL_TYPE_SYSTEM,
  },
];/** 根据 ID 查找系统内置 Skill */
export function findSystemSkillById(id: string): SystemSkill | undefined {
  return SYSTEM_SKILLS.find((skill) => skill.id === id);
}

/** 判断是否为系统内置 Skill ID */
export function isSystemSkillId(id: string): boolean {
  return SYSTEM_SKILLS.some((skill) => skill.id === id);
}

/**
 * 外部 Skill 运行时注册表
 * 由 external-skill-service 在加载后填充，供其他模块查询
 */
let _externalSkills: ExternalSkill[] = [];

/** 注册外部 Skill 列表（由 external-skill-service 调用） */
export function registerExternalSkills(skills: ExternalSkill[]): void {
  _externalSkills = skills;
}

/** 获取所有已注册的外部 Skill */
export function getExternalSkills(): ExternalSkill[] {
  return _externalSkills;
}

/** 根据 ID 查找外部 Skill */
export function findExternalSkillById(id: string): ExternalSkill | undefined {
  return _externalSkills.find((skill) => skill.id === id);
}

/** 判断是否为外部 Skill ID */
export function isExternalSkillId(id: string): boolean {
  return _externalSkills.some((skill) => skill.id === id);
}
