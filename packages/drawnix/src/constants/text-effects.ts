/**
 * 文本特效预设常量
 * Text Effects Preset Constants
 */

import type {
  FontConfig,
  GradientPreset,
  BoxShadowConfig,
  TextShadowConfig,
  GlowConfig,
} from '../types/text-effects.types';

// ============ 系统字体预设 ============

export const SYSTEM_FONTS: FontConfig[] = [
  {
    family: 'PingFang SC',
    source: 'system',
    displayName: '苹方',
    previewText: '元旦快乐',
  },
  {
    family: 'Microsoft YaHei',
    source: 'system',
    displayName: '微软雅黑',
    previewText: '元旦快乐',
  },
  {
    family: 'SimHei',
    source: 'system',
    displayName: '黑体',
    previewText: '元旦快乐',
  },
  {
    family: 'SimSun',
    source: 'system',
    displayName: '宋体',
    previewText: '元旦快乐',
  },
  {
    family: 'KaiTi',
    source: 'system',
    displayName: '楷体',
    previewText: '元旦快乐',
  },
  {
    family: 'FangSong',
    source: 'system',
    displayName: '仿宋',
    previewText: '元旦快乐',
  },
  {
    family: 'STXingkai',
    source: 'system',
    displayName: '华文行楷',
    previewText: '元旦快乐',
  },
  {
    family: 'STCaiyun',
    source: 'system',
    displayName: '华文彩云',
    previewText: '元旦快乐',
  },
  {
    family: 'STHupo',
    source: 'system',
    displayName: '华文琥珀',
    previewText: '元旦快乐',
  },
  {
    family: 'LiSu',
    source: 'system',
    displayName: '隶书',
    previewText: '元旦快乐',
  },
  {
    family: 'YouYuan',
    source: 'system',
    displayName: '幼圆',
    previewText: '元旦快乐',
  },
  {
    family: 'Arial',
    source: 'system',
    displayName: 'Arial',
    previewText: 'Happy New Year',
  },
  {
    family: 'Georgia',
    source: 'system',
    displayName: 'Georgia',
    previewText: 'Happy New Year',
  },
  {
    family: 'Times New Roman',
    source: 'system',
    displayName: 'Times New Roman',
    previewText: 'Happy New Year',
  },
];

// ============ Google Fonts 预设 ============

export const GOOGLE_FONTS: FontConfig[] = [
  {
    family: 'Noto Sans SC',
    source: 'google',
    displayName: 'Noto Sans 简体',
    previewText: '元旦快乐',
  },
  {
    family: 'Noto Serif SC',
    source: 'google',
    displayName: 'Noto Serif 简体',
    previewText: '元旦快乐',
  },
  {
    family: 'ZCOOL XiaoWei',
    source: 'google',
    displayName: '站酷小薇',
    previewText: '元旦快乐',
  },
  {
    family: 'ZCOOL QingKe HuangYou',
    source: 'google',
    displayName: '站酷庆科黄油体',
    previewText: '元旦快乐',
  },
  {
    family: 'Ma Shan Zheng',
    source: 'google',
    displayName: '马善政毛笔楷书',
    previewText: '元旦快乐',
  },
  {
    family: 'Zhi Mang Xing',
    source: 'google',
    displayName: '芝麻行',
    previewText: '元旦快乐',
  },
  {
    family: 'Liu Jian Mao Cao',
    source: 'google',
    displayName: '刘建毛草',
    previewText: '元旦快乐',
  },
  {
    family: 'Long Cang',
    source: 'google',
    displayName: '龙藏',
    previewText: '元旦快乐',
  },
  {
    family: 'Lobster',
    source: 'google',
    displayName: 'Lobster',
    previewText: 'Happy New Year',
  },
  {
    family: 'Pacifico',
    source: 'google',
    displayName: 'Pacifico',
    previewText: 'Happy New Year',
  },
  {
    family: 'Dancing Script',
    source: 'google',
    displayName: 'Dancing Script',
    previewText: 'Happy New Year',
  },
  {
    family: 'Satisfy',
    source: 'google',
    displayName: 'Satisfy',
    previewText: 'Happy New Year',
  },
];

// ============ 渐变预设 ============

export const GRADIENT_PRESETS: GradientPreset[] = [
  // 节日主题
  {
    id: 'gold',
    name: 'Golden',
    nameZh: '金色',
    category: 'festival',
    config: {
      type: 'linear',
      angle: 135,
      stops: [
        { color: '#FFD700', position: 0 },
        { color: '#FFA500', position: 50 },
        { color: '#FF8C00', position: 100 },
      ],
      target: 'text',
    },
  },
  {
    id: 'red-gold',
    name: 'Red Gold',
    nameZh: '红金',
    category: 'festival',
    config: {
      type: 'linear',
      angle: 135,
      stops: [
        { color: '#FF0000', position: 0 },
        { color: '#FFD700', position: 50 },
        { color: '#FF4500', position: 100 },
      ],
      target: 'text',
    },
  },
  {
    id: 'new-year',
    name: 'New Year',
    nameZh: '新年红',
    category: 'festival',
    config: {
      type: 'linear',
      angle: 180,
      stops: [
        { color: '#DC143C', position: 0 },
        { color: '#B22222', position: 50 },
        { color: '#8B0000', position: 100 },
      ],
      target: 'text',
    },
  },
  {
    id: 'spring-festival',
    name: 'Spring Festival',
    nameZh: '春节',
    category: 'festival',
    config: {
      type: 'linear',
      angle: 135,
      stops: [
        { color: '#C41E3A', position: 0 },
        { color: '#FFD700', position: 30 },
        { color: '#C41E3A', position: 70 },
        { color: '#FFD700', position: 100 },
      ],
      target: 'text',
    },
  },
  // 金属质感
  {
    id: 'silver',
    name: 'Silver',
    nameZh: '银色',
    category: 'metal',
    config: {
      type: 'linear',
      angle: 135,
      stops: [
        { color: '#C0C0C0', position: 0 },
        { color: '#FFFFFF', position: 50 },
        { color: '#A9A9A9', position: 100 },
      ],
      target: 'text',
    },
  },
  {
    id: 'bronze',
    name: 'Bronze',
    nameZh: '青铜',
    category: 'metal',
    config: {
      type: 'linear',
      angle: 135,
      stops: [
        { color: '#CD7F32', position: 0 },
        { color: '#DAA520', position: 50 },
        { color: '#8B4513', position: 100 },
      ],
      target: 'text',
    },
  },
  {
    id: 'rose-gold',
    name: 'Rose Gold',
    nameZh: '玫瑰金',
    category: 'metal',
    config: {
      type: 'linear',
      angle: 135,
      stops: [
        { color: '#B76E79', position: 0 },
        { color: '#E8B4B8', position: 50 },
        { color: '#B76E79', position: 100 },
      ],
      target: 'text',
    },
  },
  // 自然主题
  {
    id: 'rainbow',
    name: 'Rainbow',
    nameZh: '彩虹',
    category: 'nature',
    config: {
      type: 'linear',
      angle: 90,
      stops: [
        { color: '#FF0000', position: 0 },
        { color: '#FF7F00', position: 17 },
        { color: '#FFFF00', position: 33 },
        { color: '#00FF00', position: 50 },
        { color: '#0000FF', position: 67 },
        { color: '#4B0082', position: 83 },
        { color: '#9400D3', position: 100 },
      ],
      target: 'text',
    },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    nameZh: '日落',
    category: 'nature',
    config: {
      type: 'linear',
      angle: 180,
      stops: [
        { color: '#FF6B6B', position: 0 },
        { color: '#FFE66D', position: 50 },
        { color: '#4ECDC4', position: 100 },
      ],
      target: 'text',
    },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    nameZh: '海洋',
    category: 'nature',
    config: {
      type: 'linear',
      angle: 180,
      stops: [
        { color: '#667eea', position: 0 },
        { color: '#764ba2', position: 100 },
      ],
      target: 'text',
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    nameZh: '森林',
    category: 'nature',
    config: {
      type: 'linear',
      angle: 135,
      stops: [
        { color: '#134E5E', position: 0 },
        { color: '#71B280', position: 100 },
      ],
      target: 'text',
    },
  },
];

// ============ 阴影预设 ============

export const DEFAULT_BOX_SHADOW: BoxShadowConfig = {
  type: 'box',
  enabled: false,
  color: 'rgba(0, 0, 0, 0.25)',
  offsetX: 4,
  offsetY: 4,
  blur: 8,
  spread: 0,
  inset: false,
};

export const DEFAULT_TEXT_SHADOW: TextShadowConfig = {
  type: 'text',
  enabled: false,
  color: 'rgba(0, 0, 0, 0.5)',
  offsetX: 2,
  offsetY: 2,
  blur: 4,
};

export const DEFAULT_GLOW: GlowConfig = {
  enabled: false,
  glowType: 'outer',
  color: '#FFD700',
  intensity: 50,
  radius: 10,
};

// 阴影预设模板
export const SHADOW_PRESETS = {
  // 文字阴影预设
  textShadow: {
    subtle: {
      type: 'text' as const,
      enabled: true,
      color: 'rgba(0, 0, 0, 0.3)',
      offsetX: 1,
      offsetY: 1,
      blur: 2,
    },
    medium: {
      type: 'text' as const,
      enabled: true,
      color: 'rgba(0, 0, 0, 0.5)',
      offsetX: 2,
      offsetY: 2,
      blur: 4,
    },
    strong: {
      type: 'text' as const,
      enabled: true,
      color: 'rgba(0, 0, 0, 0.7)',
      offsetX: 4,
      offsetY: 4,
      blur: 8,
    },
    longShadow: {
      type: 'text' as const,
      enabled: true,
      color: 'rgba(0, 0, 0, 0.4)',
      offsetX: 6,
      offsetY: 6,
      blur: 0,
    },
  },
  // 发光预设
  glow: {
    golden: {
      enabled: true,
      glowType: 'outer' as const,
      color: '#FFD700',
      intensity: 60,
      radius: 15,
    },
    neon: {
      enabled: true,
      glowType: 'neon' as const,
      color: '#00FFFF',
      intensity: 80,
      radius: 20,
    },
    fire: {
      enabled: true,
      glowType: 'outer' as const,
      color: '#FF4500',
      intensity: 70,
      radius: 12,
    },
    soft: {
      enabled: true,
      glowType: 'outer' as const,
      color: '#FFFFFF',
      intensity: 40,
      radius: 8,
    },
  },
};

// ============ 字体文件格式映射 ============

export const FONT_FORMAT_MAP: Record<string, 'truetype' | 'opentype' | 'woff' | 'woff2'> = {
  '.ttf': 'truetype',
  '.otf': 'opentype',
  '.woff': 'woff',
  '.woff2': 'woff2',
};

export const SUPPORTED_FONT_EXTENSIONS = ['.ttf', '.otf', '.woff', '.woff2'];
export const SUPPORTED_FONT_MIMES = [
  'font/ttf',
  'font/otf',
  'font/woff',
  'font/woff2',
  'application/x-font-ttf',
  'application/x-font-opentype',
  'application/font-woff',
  'application/font-woff2',
];

// ============ Google Fonts API ============

export const GOOGLE_FONTS_API_BASE = 'https://fonts.googleapis.com/css2';

/** 生成 Google Fonts 加载 URL */
export function getGoogleFontUrl(family: string, weights: number[] = [400, 700]): string {
  const weightStr = weights.join(';');
  const encodedFamily = encodeURIComponent(family);
  return `${GOOGLE_FONTS_API_BASE}?family=${encodedFamily}:wght@${weightStr}&display=swap`;
}
