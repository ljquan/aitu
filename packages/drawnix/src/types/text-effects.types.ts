/**
 * 文本特效类型定义
 * Text Effects Type Definitions
 */

// ============ 字体相关类型 ============

/** 字体来源类型 */
export type FontSource = 'system' | 'google' | 'custom';

/** 字体配置 */
export interface FontConfig {
  /** 字体家族名称 */
  family: string;
  /** 字体来源 */
  source: FontSource;
  /** 自定义字体 URL (仅 custom 类型) */
  url?: string;
  /** 字体显示名称 */
  displayName: string;
  /** 字体预览文本 */
  previewText?: string;
}

/** 自定义字体资源 */
export interface CustomFontAsset {
  id: string;
  name: string;
  family: string;
  url: string;
  format: 'truetype' | 'opentype' | 'woff' | 'woff2';
  createdAt: number;
}

// ============ 阴影相关类型 ============

/** 阴影类型 */
export type ShadowType = 'box' | 'text' | 'glow';

/** 基础阴影配置 */
export interface BaseShadowConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 颜色 */
  color: string;
  /** 水平偏移 */
  offsetX: number;
  /** 垂直偏移 */
  offsetY: number;
  /** 模糊半径 */
  blur: number;
}

/** Box Shadow 配置 */
export interface BoxShadowConfig extends BaseShadowConfig {
  type: 'box';
  /** 扩散半径 */
  spread: number;
  /** 是否内阴影 */
  inset: boolean;
}

/** Text Shadow 配置 */
export interface TextShadowConfig extends BaseShadowConfig {
  type: 'text';
}

/** 发光效果配置 */
export interface GlowConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 发光类型 */
  glowType: 'outer' | 'inner' | 'neon';
  /** 发光颜色 */
  color: string;
  /** 发光强度 (0-100) */
  intensity: number;
  /** 发光半径 */
  radius: number;
}

/** 综合阴影配置 */
export interface ShadowEffectConfig {
  boxShadows: BoxShadowConfig[];
  textShadows: TextShadowConfig[];
  glow: GlowConfig;
}

// ============ 渐变相关类型 ============

/** 渐变类型 */
export type GradientType = 'linear' | 'radial';

/** 渐变应用目标 */
export type GradientTarget = 'text' | 'fill' | 'stroke';

/** 渐变色标 */
export interface GradientStop {
  /** 颜色值 */
  color: string;
  /** 位置 (0-100) */
  position: number;
}

/** 渐变配置 */
export interface GradientConfig {
  /** 渐变类型 */
  type: GradientType;
  /** 渐变角度 (仅线性渐变) */
  angle: number;
  /** 色标列表 */
  stops: GradientStop[];
  /** 应用目标 */
  target: GradientTarget;
}

/** 渐变预设 */
export interface GradientPreset {
  id: string;
  name: string;
  nameZh: string;
  config: GradientConfig;
  /** 预设分类 */
  category: 'festival' | 'metal' | 'nature' | 'custom';
}

// ============ 图层相关类型 ============

/** 图层操作类型 */
export type LayerAction = 'bringToFront' | 'bringForward' | 'sendBackward' | 'sendToBack';

/** 图层信息 */
export interface LayerInfo {
  /** 元素 ID */
  elementId: string;
  /** 当前层级索引 */
  index: number;
  /** 总层级数 */
  total: number;
  /** 是否可上移 */
  canMoveUp: boolean;
  /** 是否可下移 */
  canMoveDown: boolean;
}

// ============ 综合文本特效配置 ============

/** 文本特效完整配置 */
export interface TextEffectStyle {
  /** 字体配置 */
  font?: FontConfig;
  /** 阴影配置 */
  shadow?: ShadowEffectConfig;
  /** 渐变配置 */
  gradient?: GradientConfig;
}

/** 文本特效面板状态 */
export interface TextEffectPanelState {
  /** 当前激活的标签页 */
  activeTab: 'font' | 'shadow' | 'gradient' | 'layer';
  /** 是否展开 */
  expanded: boolean;
}
