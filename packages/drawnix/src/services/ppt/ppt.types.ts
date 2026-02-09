/**
 * PPT 生成相关类型定义
 */

/** PPT 页面版式类型 */
export type PPTLayoutType =
  | 'cover' // 封面页：大标题居中 + 副标题
  | 'toc' // 目录页：标题 + 目录列表
  | 'title-body' // 标题正文页：标题 + 要点列表
  | 'image-text' // 图文页：预留图片区 + 文本区
  | 'comparison' // 对比页：左右对比
  | 'ending'; // 结尾页：结束语居中

/** PPT 页面规格（AI 生成的大纲中每页的描述） */
export interface PPTPageSpec {
  /** 页面版式类型 */
  layout: PPTLayoutType;
  /** 页面标题 */
  title: string;
  /** 副标题（封面页、结尾页使用） */
  subtitle?: string;
  /** 正文要点列表 */
  bullets?: string[];
  /** 配图提示词（AI 判断需要配图的页面才有） */
  imagePrompt?: string;
  /** 演讲者备注 */
  notes?: string;
}

/** PPT 大纲（AI 生成的完整大纲结构） */
export interface PPTOutline {
  /** PPT 总标题 */
  title: string;
  /** 所有页面规格 */
  pages: PPTPageSpec[];
}

/** PPT 生成页数选项 */
export type PPTPageCountOption = 'short' | 'normal' | 'long';

/** PPT 生成选项 */
export interface PPTGenerateOptions {
  /** 页数控制：short(5-7页), normal(8-12页), long(13-18页) */
  pageCount?: PPTPageCountOption;
  /** 输出语言 */
  language?: string;
  /** 额外要求 */
  extraRequirements?: string;
}

/** Frame 上的 PPT 扩展元数据 */
export interface PPTFrameMeta {
  /** 配图提示词 */
  imagePrompt?: string;
  /** 页面版式类型 */
  layout?: PPTLayoutType;
  /** 演讲者备注 */
  notes?: string;
  /** 页面索引（从 1 开始） */
  pageIndex?: number;
}

/** 布局引擎输出：单个文本元素的位置和样式 */
export interface LayoutElement {
  /** 元素类型 */
  type: 'title' | 'subtitle' | 'body' | 'bullet';
  /** 文本内容 */
  text: string;
  /** 相对于 Frame 左上角的偏移坐标 [x, y] */
  point: [number, number];
  /** 字体大小等级 */
  fontSize?: 'large' | 'medium' | 'small';
  /** 文本对齐方式 */
  align?: 'left' | 'center' | 'right';
}

/** Frame 矩形信息 */
export interface FrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** generate_ppt MCP 工具参数 */
export interface PPTGenerationParams {
  /** PPT 主题或内容描述 */
  topic: string;
  /** 页数控制 */
  pageCount?: PPTPageCountOption;
  /** 输出语言 */
  language?: string;
  /** 额外要求 */
  extraRequirements?: string;
}
