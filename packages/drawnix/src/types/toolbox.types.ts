/**
 * Toolbox Type Definitions
 *
 * 定义工具箱系统的所有 TypeScript 类型和接口
 */

import { PlaitElement, Point } from '@plait/core';

/**
 * 工具定义 - 工具箱中的工具配置
 *
 * 定义可用工具的基本信息和默认配置
 */
export type ToolDefinition = {
  /** 唯一标识 */
  id: string;

  /** 工具名称 */
  name: string;

  /** 工具描述 */
  description?: string;

  /** 图标（emoji 或 icon name） */
  icon?: string;

  /** 分类 */
  category?: string;

  /** 默认宽度（画布单位） */
  defaultWidth?: number;

  /** 默认高度（画布单位） */
  defaultHeight?: number;

  /** iframe sandbox 权限 */
  permissions?: string[];
} & (
  | {
      /** iframe URL (外部页面工具必填) */
      url: string;
      /** 内部组件标识 */
      component?: never;
    }
  | {
      /** iframe URL */
      url?: never;
      /** 内部组件标识 (内部 React 组件工具必填) */
      component: string;
    }
);

/**
 * 工具元素 - 画布上的工具实例
 *
 * 继承 PlaitElement，成为画布的原生元素，支持拖拽、缩放、旋转等完整交互能力
 */
export type PlaitTool = PlaitElement & {
  /** 元素类型标识 */
  type: 'tool';

  /** 位置和尺寸（画布坐标）[左上角, 右下角] */
  points: [Point, Point];

  /** 旋转角度（度数） */
  angle: number;

  /** 工具定义ID（关联到 ToolDefinition） */
  toolId: string;

  /** 可选元数据 */
  metadata?: {
    /** 工具名称 */
    name?: string;
    /** 工具分类 */
    category?: string;
    /** iframe sandbox 权限列表 */
    permissions?: string[];
    /** 内部组件标识 */
    component?: string;
  };
} & (
  | {
      /** iframe URL */
      url: string;
      /** 内部组件标识 */
      component?: never;
    }
  | {
      /** iframe URL */
      url?: never;
      /** 内部组件标识 */
      component: string;
    }
);

/**
 * 工具分类枚举
 */
export enum ToolCategory {
  /** AI 工具（提示词、生成等） */
  AI_TOOLS = 'ai-tools',

  /** 内容工具（文案、素材等） */
  CONTENT_TOOLS = 'content-tools',

  /** 实用工具（批处理、转换等） */
  UTILITIES = 'utilities',

  /** 自定义工具 */
  CUSTOM = 'custom',
}

/**
 * 工具箱状态
 */
export interface ToolboxState {
  /** 是否打开 */
  isOpen: boolean;

  /** 当前选中的分类 */
  selectedCategory?: string;

  /** 搜索关键词 */
  searchQuery?: string;
}
