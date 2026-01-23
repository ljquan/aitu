/**
 * 文本特效工具函数
 * Text Effects Utility Functions
 */

import type {
  GradientConfig,
  GradientStop,
  TextShadowConfig,
  BoxShadowConfig,
  GlowConfig,
  ShadowEffectConfig,
} from '../types/text-effects.types';
import type { GradientFillConfig, GradientFillStop } from '../types/fill.types';

// ============ 渐变 CSS 生成 ============

/**
 * 格式化渐变色标
 */
function formatGradientStops(stops: GradientStop[]): string {
  return stops
    .sort((a, b) => a.position - b.position)
    .map((stop) => `${stop.color} ${stop.position}%`)
    .join(', ');
}

/**
 * 生成渐变 CSS 字符串
 */
export function generateGradientCSS(config: GradientConfig): string {
  const stopsStr = formatGradientStops(config.stops);
  
  if (config.type === 'linear') {
    return `linear-gradient(${config.angle}deg, ${stopsStr})`;
  }
  return `radial-gradient(circle, ${stopsStr})`;
}

// ============ 类型转换函数 ============

/**
 * 将 GradientFillConfig (fill.types) 转换为 GradientConfig (text-effects.types)
 * GradientFillConfig 使用 offset (0-1)
 * GradientConfig 使用 position (0-100)
 */
export function fillConfigToTextConfig(
  fillConfig: GradientFillConfig,
  target: 'text' | 'fill' | 'stroke' = 'text'
): GradientConfig {
  return {
    type: fillConfig.type,
    angle: fillConfig.type === 'linear' ? fillConfig.angle : 90,
    stops: fillConfig.stops.map((stop: GradientFillStop) => ({
      color: stop.color,
      position: Math.round(stop.offset * 100),
    })),
    target,
  };
}

/**
 * 将 GradientConfig (text-effects.types) 转换为 GradientFillConfig (fill.types)
 * GradientConfig 使用 position (0-100)
 * GradientFillConfig 使用 offset (0-1)
 */
export function textConfigToFillConfig(textConfig: GradientConfig): GradientFillConfig {
  const stops: GradientFillStop[] = textConfig.stops.map((stop: GradientStop) => ({
    color: stop.color,
    offset: stop.position / 100,
  }));

  if (textConfig.type === 'radial') {
    return {
      type: 'radial',
      centerX: 0.5,
      centerY: 0.5,
      stops,
    };
  }

  return {
    type: 'linear',
    angle: textConfig.angle,
    stops,
  };
}

/**
 * 从 CSS 渐变字符串解析出 GradientFillConfig
 */
export function parseGradientCSSToFillConfig(css: string): GradientFillConfig | null {
  // 匹配线性渐变: linear-gradient(135deg, #color1 0%, #color2 100%)
  const linearMatch = css.match(/linear-gradient\((\d+)deg,\s*(.+)\)/);
  if (linearMatch) {
    const angle = parseInt(linearMatch[1], 10);
    const stopsStr = linearMatch[2];
    const stops = parseGradientStops(stopsStr);
    if (stops.length >= 2) {
      return {
        type: 'linear',
        angle,
        stops,
      };
    }
  }

  // 匹配径向渐变: radial-gradient(circle, #color1 0%, #color2 100%)
  const radialMatch = css.match(/radial-gradient\((?:circle(?:\s+at\s+(\d+)%\s+(\d+)%)?)?(?:,)?\s*(.+)\)/);
  if (radialMatch) {
    const centerX = radialMatch[1] ? parseInt(radialMatch[1], 10) / 100 : 0.5;
    const centerY = radialMatch[2] ? parseInt(radialMatch[2], 10) / 100 : 0.5;
    const stopsStr = radialMatch[3];
    const stops = parseGradientStops(stopsStr);
    if (stops.length >= 2) {
      return {
        type: 'radial',
        centerX,
        centerY,
        stops,
      };
    }
  }

  return null;
}

/**
 * 解析渐变色标字符串
 */
function parseGradientStops(stopsStr: string): GradientFillStop[] {
  const stops: GradientFillStop[] = [];
  // 匹配: #color 50% 或 rgb(r,g,b) 50% 或 rgba(r,g,b,a) 50%
  const stopRegex = /(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))\s+(\d+)%/g;
  let match;
  while ((match = stopRegex.exec(stopsStr)) !== null) {
    stops.push({
      color: match[1],
      offset: parseInt(match[2], 10) / 100,
    });
  }
  return stops;
}

/**
 * 生成文字渐变样式
 */
export function generateTextGradientStyle(config: GradientConfig): React.CSSProperties {
  const gradient = generateGradientCSS(config);
  return {
    background: gradient,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  };
}

/**
 * 生成填充渐变样式
 */
export function generateFillGradientStyle(config: GradientConfig): React.CSSProperties {
  return {
    background: generateGradientCSS(config),
  };
}

/**
 * 根据目标类型生成渐变样式
 */
export function generateGradientStyle(config: GradientConfig): React.CSSProperties {
  switch (config.target) {
    case 'text':
      return generateTextGradientStyle(config);
    case 'fill':
      return generateFillGradientStyle(config);
    case 'stroke':
      // 描边渐变需要 SVG 实现，这里返回基础样式
      return {
        WebkitTextStroke: `2px transparent`,
        background: generateGradientCSS(config),
        WebkitBackgroundClip: 'text',
      };
    default:
      return {};
  }
}

// ============ 阴影 CSS 生成 ============

/**
 * 生成单个 text-shadow CSS
 */
export function generateTextShadowCSS(config: TextShadowConfig): string {
  if (!config.enabled) return '';
  return `${config.offsetX}px ${config.offsetY}px ${config.blur}px ${config.color}`;
}

/**
 * 生成多层 text-shadow CSS
 */
export function generateTextShadowsCSS(configs: TextShadowConfig[]): string {
  return configs
    .filter((c) => c.enabled)
    .map(generateTextShadowCSS)
    .join(', ');
}

/**
 * 生成单个 box-shadow CSS
 */
export function generateBoxShadowCSS(config: BoxShadowConfig): string {
  if (!config.enabled) return '';
  const inset = config.inset ? 'inset ' : '';
  return `${inset}${config.offsetX}px ${config.offsetY}px ${config.blur}px ${config.spread}px ${config.color}`;
}

/**
 * 生成多层 box-shadow CSS
 */
export function generateBoxShadowsCSS(configs: BoxShadowConfig[]): string {
  return configs
    .filter((c) => c.enabled)
    .map(generateBoxShadowCSS)
    .join(', ');
}

/**
 * 生成发光效果 CSS (基于 text-shadow 实现)
 */
export function generateGlowCSS(config: GlowConfig): string {
  if (!config.enabled) return '';
  
  const { color, intensity, radius, glowType } = config;
  const alpha = intensity / 100;
  
  // 解析颜色并添加透明度
  const colorWithAlpha = addAlphaToColor(color, alpha);
  
  switch (glowType) {
    case 'outer':
      // 外发光：多层模糊阴影叠加
      return [
        `0 0 ${radius * 0.5}px ${colorWithAlpha}`,
        `0 0 ${radius}px ${colorWithAlpha}`,
        `0 0 ${radius * 1.5}px ${colorWithAlpha}`,
      ].join(', ');
    
    case 'inner':
      // 内发光：使用 inset box-shadow
      return `inset 0 0 ${radius}px ${colorWithAlpha}`;
    
    case 'neon':
      // 霓虹灯效果：强烈的多层发光
      return [
        `0 0 ${radius * 0.25}px #fff`,
        `0 0 ${radius * 0.5}px ${colorWithAlpha}`,
        `0 0 ${radius}px ${colorWithAlpha}`,
        `0 0 ${radius * 2}px ${colorWithAlpha}`,
        `0 0 ${radius * 3}px ${colorWithAlpha}`,
      ].join(', ');
    
    default:
      return '';
  }
}

/**
 * 生成综合阴影样式
 */
export function generateShadowStyle(config: ShadowEffectConfig): React.CSSProperties {
  const style: React.CSSProperties = {};
  
  // 文字阴影
  const textShadows: string[] = [];
  
  // 添加普通文字阴影
  const textShadowCSS = generateTextShadowsCSS(config.textShadows);
  if (textShadowCSS) {
    textShadows.push(textShadowCSS);
  }
  
  // 添加发光效果 (如果是外发光或霓虹灯，使用 text-shadow)
  if (config.glow.enabled && (config.glow.glowType === 'outer' || config.glow.glowType === 'neon')) {
    const glowCSS = generateGlowCSS(config.glow);
    if (glowCSS) {
      textShadows.push(glowCSS);
    }
  }
  
  if (textShadows.length > 0) {
    style.textShadow = textShadows.join(', ');
  }
  
  // Box 阴影
  const boxShadows: string[] = [];
  
  const boxShadowCSS = generateBoxShadowsCSS(config.boxShadows);
  if (boxShadowCSS) {
    boxShadows.push(boxShadowCSS);
  }
  
  // 内发光使用 box-shadow
  if (config.glow.enabled && config.glow.glowType === 'inner') {
    const glowCSS = generateGlowCSS(config.glow);
    if (glowCSS) {
      boxShadows.push(glowCSS);
    }
  }
  
  if (boxShadows.length > 0) {
    style.boxShadow = boxShadows.join(', ');
  }
  
  return style;
}

// ============ 颜色工具 ============

/**
 * 为颜色添加透明度
 */
export function addAlphaToColor(color: string, alpha: number): string {
  // 如果是 rgba 格式
  if (color.startsWith('rgba')) {
    return color.replace(/[\d.]+\)$/, `${alpha})`);
  }
  
  // 如果是 rgb 格式
  if (color.startsWith('rgb(')) {
    return color.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
  }
  
  // 如果是 hex 格式
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    let r: number, g: number, b: number;
    
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    } else {
      return color;
    }
    
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  
  return color;
}

/**
 * 解析颜色为 RGB 值
 */
export function parseColorToRGB(color: string): { r: number; g: number; b: number } | null {
  // Hex 格式
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
      };
    }
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      };
    }
  }
  
  // RGB/RGBA 格式
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1], 10),
      g: parseInt(rgbMatch[2], 10),
      b: parseInt(rgbMatch[3], 10),
    };
  }
  
  return null;
}

// ============ 字体工具 ============

/**
 * 加载 Google Font
 */
export function loadGoogleFont(family: string, weights: number[] = [400, 700]): Promise<void> {
  return new Promise((resolve, reject) => {
    const linkId = `google-font-${family.replace(/\s+/g, '-').toLowerCase()}`;
    
    // 检查是否已加载
    if (document.getElementById(linkId)) {
      resolve();
      return;
    }
    
    const link = document.createElement('link');
    link.id = linkId;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weights.join(';')}&display=swap`;
    
    link.onload = () => resolve();
    link.onerror = () => reject(new Error(`Failed to load font: ${family}`));
    
    document.head.appendChild(link);
  });
}

/**
 * 加载自定义字体文件
 */
export async function loadCustomFont(
  family: string,
  url: string,
  format: 'truetype' | 'opentype' | 'woff' | 'woff2' = 'truetype'
): Promise<void> {
  const fontFace = new FontFace(family, `url(${url}) format('${format}')`);
  
  try {
    const loadedFont = await fontFace.load();
    document.fonts.add(loadedFont);
  } catch (error) {
    console.error(`Failed to load custom font: ${family}`, error);
    throw error;
  }
}

/**
 * 检查字体是否可用
 */
export function isFontAvailable(family: string): boolean {
  // 使用 Canvas 检测字体是否可用
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return false;
  
  const testText = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const baseFont = 'monospace';
  
  context.font = `72px ${baseFont}`;
  const baseWidth = context.measureText(testText).width;
  
  context.font = `72px '${family}', ${baseFont}`;
  const testWidth = context.measureText(testText).width;
  
  return baseWidth !== testWidth;
}

/**
 * 获取字体文件格式
 */
export function getFontFormat(filename: string): 'truetype' | 'opentype' | 'woff' | 'woff2' | null {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  const formatMap: Record<string, 'truetype' | 'opentype' | 'woff' | 'woff2'> = {
    '.ttf': 'truetype',
    '.otf': 'opentype',
    '.woff': 'woff',
    '.woff2': 'woff2',
  };
  return formatMap[ext] || null;
}
