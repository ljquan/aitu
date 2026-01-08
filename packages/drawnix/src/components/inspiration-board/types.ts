/**
 * Inspiration Board Types
 *
 * 灵感创意板块类型定义
 */

/**
 * 灵感模版分类
 */
export enum InspirationCategory {
  VIDEO = '视频创作',
  IMAGE = '图片生成',
  MINDMAP = '思维导图',
  FLOWCHART = '流程图',
  GRID = '宫格图',
  SVG = 'SVG矢量图',
}

/**
 * 灵感模版数据结构
 */
export interface InspirationTemplate {
  /** 唯一标识 */
  id: string;
  /** 模版标题 */
  title: string;
  /** 简短描述（1-2行） */
  description: string;
  /** 完整提示词 */
  prompt: string;
  /** 分类 */
  category: InspirationCategory;
  /** 1:1 效果图 URL */
  imageUrl: string;
  /** 分类标签颜色 (Tailwind/CSS class) */
  badgeColor: string;
}

/**
 * InspirationBoard 组件属性
 */
export interface InspirationBoardProps {
  /** 画板是否为空 */
  isCanvasEmpty: boolean;
  /** 选择提示词回调 */
  onSelectPrompt: (prompt: string) => void;
  /** 打开提示词工具回调 */
  onOpenPromptTool?: () => void;
  /** 外部控制显示（可选） */
  visible?: boolean;
  /** 自定义类名 */
  className?: string;
}

/**
 * InspirationCard 组件属性
 */
export interface InspirationCardProps {
  /** 模版数据 */
  template: InspirationTemplate;
  /** 点击回调 */
  onClick: () => void;
}
