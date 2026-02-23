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

/** 自动模式 Skill ID */
export const SKILL_AUTO_ID = 'auto';

/** 系统内置 Skill 接口 */
export interface SystemSkill {
  /** 唯一标识，与 MCP 工具名一致 */
  id: string;
  /** 中文名称，用于 UI 展示 */
  name: string;
  /** 对应的 MCP 工具名称 */
  mcpTool: string;
  /** 功能说明，用于知识库笔记内容展示 */
  description: string;
  /** 类型标记 */
  type: typeof SKILL_TYPE_SYSTEM;
}

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
];

/** 根据 ID 查找系统内置 Skill */
export function findSystemSkillById(id: string): SystemSkill | undefined {
  return SYSTEM_SKILLS.find((skill) => skill.id === id);
}

/** 判断是否为系统内置 Skill ID */
export function isSystemSkillId(id: string): boolean {
  return SYSTEM_SKILLS.some((skill) => skill.id === id);
}
