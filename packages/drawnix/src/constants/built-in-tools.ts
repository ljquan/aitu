/**
 * Built-in Tools Configuration
 *
 * 内置工具列表配置
 */

import { ToolDefinition, ToolCategory } from '../types/toolbox.types';

/**
 * 内置工具列表
 *
 * 包含默认提供的第三方工具网页
 */
export const BUILT_IN_TOOLS: ToolDefinition[] = [
  {
    id: 'banana-prompt',
    name: '香蕉提示词',
    description: '查看和复制优质 AI 提示词',
    icon: '🍌',
    category: ToolCategory.CONTENT_TOOLS,
    url: 'https://www.aiwind.org',
    defaultWidth: 800,
    defaultHeight: 600,
    permissions: [
      'allow-scripts',
      'allow-same-origin',
      'allow-popups',
      'allow-forms',
      'allow-top-navigation-by-user-activation'
    ],
  },
  {
    id: 'pose-library',
    name: '动作场景库',
    description: '专业人体姿态参考素材库，提供多角度动作姿势',
    icon: '🧘',
    category: ToolCategory.CONTENT_TOOLS,
    url: 'https://www.posemaniacs.com/zh-Hans/poses',
    defaultWidth: 900,
    defaultHeight: 700,
    permissions: [
      'allow-scripts',
      'allow-same-origin',
      'allow-popups',
      'allow-forms',
      'allow-top-navigation-by-user-activation'
    ],
  }
];

/**
 * 默认工具配置
 */
export const DEFAULT_TOOL_CONFIG = {
  /** 默认宽度（画布单位） */
  defaultWidth: 600,

  /** 默认高度（画布单位） */
  defaultHeight: 400,

  /** 默认 iframe 权限 */
  defaultPermissions: [
    'allow-scripts',
    'allow-same-origin',
    'allow-popups',
    'allow-forms',
    'allow-top-navigation-by-user-activation'
  ] as string[],
};

/**
 * 工具分类显示名称
 */
export const TOOL_CATEGORY_LABELS: Record<string, string> = {
  [ToolCategory.AI_TOOLS]: 'AI 工具',
  [ToolCategory.CONTENT_TOOLS]: '内容工具',
  [ToolCategory.UTILITIES]: '实用工具',
  [ToolCategory.CUSTOM]: '自定义工具',
};
