/**
 * 新手引导功能类型定义
 */

/** 引导步骤位置 */
export type TutorialPosition = 'top' | 'bottom' | 'left' | 'right' | 'center';

/** 引导步骤配置 */
export interface TutorialStep {
  /** 步骤唯一标识 */
  id: string;
  /** 步骤标题 */
  title: string;
  /** 步骤描述 */
  description: string;
  /** 目标元素的 ID，如果为空则居中显示 */
  targetId?: string;
  /** 提示框相对于目标元素的位置 */
  position?: TutorialPosition;
  /** 媒体资源 URL（图片或视频） */
  media?: string;
  /** 媒体类型 */
  mediaType?: 'image' | 'video';
  /** 媒体替代文本 */
  mediaAlt?: string;
}

/** 元素位置信息 */
export interface ElementRect {
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
  right: number;
}

/** 引导状态 */
export interface TutorialState {
  /** 是否显示引导 */
  isOpen: boolean;
  /** 当前步骤索引 */
  activeStepIndex: number;
}

/** 引导组件 Props */
export interface TutorialOverlayProps {
  /** 引导步骤列表 */
  steps: TutorialStep[];
  /** 当前步骤索引 */
  activeStepIndex: number;
  /** 是否显示 */
  isOpen: boolean;
  /** 下一步回调 */
  onNext: () => void;
  /** 上一步回调 */
  onPrev: () => void;
  /** 跳过回调 */
  onSkip: () => void;
  /** 完成回调 */
  onComplete: () => void;
}
