import { DEFAULT_COLOR, Point, ThemeColorMode } from '@plait/core';
import { PlaitCustomGeometry } from '@plait/draw';
import { StrokeStyle } from '@plait/common';

/**
 * 钢笔工具主题颜色配置
 */
export const PenThemeColors = {
  [ThemeColorMode.default]: {
    strokeColor: DEFAULT_COLOR,
    fill: '#E8E8E8',
  },
  [ThemeColorMode.colorful]: {
    strokeColor: '#06ADBF',
    fill: '#CDEFF2',
  },
  [ThemeColorMode.soft]: {
    strokeColor: '#6D89C1',
    fill: '#D6E0F0',
  },
  [ThemeColorMode.retro]: {
    strokeColor: '#E9C358',
    fill: '#F7EDCC',
  },
  [ThemeColorMode.dark]: {
    strokeColor: '#FFFFFF',
    fill: '#3A3A3A',
  },
  [ThemeColorMode.starry]: {
    strokeColor: '#42ABE5',
    fill: '#1A3A4A',
  },
};

/**
 * 钢笔工具形状枚举
 */
export enum PenShape {
  pen = 'pen',
}

/**
 * 锚点类型
 * - corner: 角点，控制柄可独立调整
 * - smooth: 平滑点，控制柄对称但长度可不同
 * - symmetric: 对称点，控制柄完全对称
 */
export type AnchorType = 'corner' | 'smooth' | 'symmetric';

/**
 * 锚点数据结构
 * 采用绝对坐标存储，便于计算和渲染
 */
export interface PenAnchor {
  /** 锚点位置（绝对坐标） */
  point: Point;
  /** 入控制柄位置（绝对坐标，可选） */
  handleIn?: Point;
  /** 出控制柄位置（绝对坐标，可选） */
  handleOut?: Point;
  /** 锚点类型 */
  type: AnchorType;
}

export const PEN_TYPE = 'pen';

/**
 * 钢笔路径元素类型
 */
export type PenPath = PlaitCustomGeometry<typeof PEN_TYPE, Point[], PenShape> & {
  /** 锚点数组 */
  anchors: PenAnchor[];
  /** 是否闭合路径 */
  closed: boolean;
  /** 线条宽度 */
  strokeWidth?: number;
  /** 线条样式 */
  strokeStyle?: StrokeStyle;
  /** 填充色 */
  fill?: string;
};

/**
 * 类型守卫和工具函数
 */
export const PenPath = {
  isPenPath: (value: any): value is PenPath => {
    return value?.type === PEN_TYPE;
  },
};

/**
 * 默认线条宽度
 */
export const DEFAULT_PEN_STROKE_WIDTH = 2;

/**
 * 锚点检测半径（用于点击检测）
 */
export const ANCHOR_HIT_RADIUS = 8;

/**
 * 控制柄检测半径
 */
export const HANDLE_HIT_RADIUS = 6;

/**
 * 路径检测距离阈值
 */
export const PATH_HIT_DISTANCE = 5;
