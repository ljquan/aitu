/**
 * UnifiedColorPicker 颜色转换工具函数
 */

import type { HSVColor, RGBColor, RGBAColor } from './types';

/**
 * HSV 转 RGB
 * @param hsv HSV 颜色对象 { h: 0-360, s: 0-100, v: 0-100 }
 * @returns RGB 颜色对象 { r: 0-255, g: 0-255, b: 0-255 }
 */
export function hsvToRgb(hsv: HSVColor): RGBColor {
  const { h, s, v } = hsv;
  const hNorm = h / 360;
  const sNorm = s / 100;
  const vNorm = v / 100;

  let r = 0, g = 0, b = 0;

  const i = Math.floor(hNorm * 6);
  const f = hNorm * 6 - i;
  const p = vNorm * (1 - sNorm);
  const q = vNorm * (1 - f * sNorm);
  const t = vNorm * (1 - (1 - f) * sNorm);

  switch (i % 6) {
    case 0: r = vNorm; g = t; b = p; break;
    case 1: r = q; g = vNorm; b = p; break;
    case 2: r = p; g = vNorm; b = t; break;
    case 3: r = p; g = q; b = vNorm; break;
    case 4: r = t; g = p; b = vNorm; break;
    case 5: r = vNorm; g = p; b = q; break;
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

/**
 * RGB 转 HSV
 * @param rgb RGB 颜色对象 { r: 0-255, g: 0-255, b: 0-255 }
 * @returns HSV 颜色对象 { h: 0-360, s: 0-100, v: 0-100 }
 */
export function rgbToHsv(rgb: RGBColor): HSVColor {
  const { r, g, b } = rgb;
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;

  let h = 0;
  let s = 0;
  const v = max;

  if (delta !== 0) {
    s = delta / max;

    if (max === rNorm) {
      h = ((gNorm - bNorm) / delta) % 6;
    } else if (max === gNorm) {
      h = (bNorm - rNorm) / delta + 2;
    } else {
      h = (rNorm - gNorm) / delta + 4;
    }

    h *= 60;
    if (h < 0) h += 360;
  }

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    v: Math.round(v * 100),
  };
}

/**
 * RGB 转 HEX
 * @param rgb RGB 颜色对象
 * @param includeAlpha 是否包含透明度
 * @returns HEX 颜色字符串 (如 #FF0000 或 #FF0000FF)
 */
export function rgbToHex(rgb: RGBColor | RGBAColor, includeAlpha = false): string {
  const { r, g, b } = rgb;
  const hex = `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;
  
  if (includeAlpha && 'a' in rgb) {
    const alpha = Math.round(rgb.a * 255);
    return `${hex}${componentToHex(alpha)}`;
  }
  
  return hex;
}

/**
 * HEX 转 RGB
 * @param hex HEX 颜色字符串 (支持 #RGB, #RRGGBB, #RRGGBBAA)
 * @returns RGBA 颜色对象，解析失败返回 null
 */
export function hexToRgb(hex: string): RGBAColor | null {
  // 移除 # 前缀
  const cleanHex = hex.replace(/^#/, '');
  
  let r = 0, g = 0, b = 0, a = 1;
  
  if (cleanHex.length === 3) {
    // #RGB 格式
    r = parseInt(cleanHex[0] + cleanHex[0], 16);
    g = parseInt(cleanHex[1] + cleanHex[1], 16);
    b = parseInt(cleanHex[2] + cleanHex[2], 16);
  } else if (cleanHex.length === 6) {
    // #RRGGBB 格式
    r = parseInt(cleanHex.substring(0, 2), 16);
    g = parseInt(cleanHex.substring(2, 4), 16);
    b = parseInt(cleanHex.substring(4, 6), 16);
  } else if (cleanHex.length === 8) {
    // #RRGGBBAA 格式
    r = parseInt(cleanHex.substring(0, 2), 16);
    g = parseInt(cleanHex.substring(2, 4), 16);
    b = parseInt(cleanHex.substring(4, 6), 16);
    a = parseInt(cleanHex.substring(6, 8), 16) / 255;
  } else {
    return null;
  }
  
  if (isNaN(r) || isNaN(g) || isNaN(b) || isNaN(a)) {
    return null;
  }
  
  return { r, g, b, a };
}

/**
 * HSV 转 HEX
 * @param hsv HSV 颜色对象
 * @param alpha 透明度 0-1，可选
 * @returns HEX 颜色字符串
 */
export function hsvToHex(hsv: HSVColor, alpha?: number): string {
  const rgb = hsvToRgb(hsv);
  if (alpha !== undefined) {
    return rgbToHex({ ...rgb, a: alpha }, true);
  }
  return rgbToHex(rgb);
}

/**
 * HEX 转 HSV
 * @param hex HEX 颜色字符串
 * @returns HSV 颜色对象，解析失败返回默认红色
 */
export function hexToHsv(hex: string): HSVColor {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return { h: 0, s: 100, v: 100 }; // 默认红色
  }
  return rgbToHsv(rgb);
}

/**
 * 从 HEX 颜色提取透明度
 * @param hex HEX 颜色字符串
 * @returns 透明度 0-100
 */
export function getAlphaFromHex(hex: string): number {
  const rgba = hexToRgb(hex);
  if (!rgba) return 100;
  return Math.round(rgba.a * 100);
}

/**
 * 给 HEX 颜色设置透明度
 * @param hex HEX 颜色字符串 (6位)
 * @param alpha 透明度 0-100
 * @returns 带透明度的 HEX 颜色字符串 (8位)
 */
export function setAlphaToHex(hex: string, alpha: number): string {
  const cleanHex = hex.replace(/^#/, '').substring(0, 6);
  const alphaHex = componentToHex(Math.round((alpha / 100) * 255));
  return `#${cleanHex}${alphaHex}`;
}

/**
 * 移除 HEX 颜色的透明度通道
 * @param hex HEX 颜色字符串
 * @returns 6位 HEX 颜色字符串
 */
export function removeAlphaFromHex(hex: string): string {
  const cleanHex = hex.replace(/^#/, '');
  if (cleanHex.length === 8) {
    return `#${cleanHex.substring(0, 6)}`;
  }
  if (cleanHex.length === 3) {
    return `#${cleanHex[0]}${cleanHex[0]}${cleanHex[1]}${cleanHex[1]}${cleanHex[2]}${cleanHex[2]}`;
  }
  return hex.startsWith('#') ? hex : `#${hex}`;
}

/**
 * 验证 HEX 颜色格式
 * @param hex HEX 颜色字符串
 * @returns 是否有效
 */
export function isValidHex(hex: string): boolean {
  return /^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(hex);
}

/**
 * 格式化 HEX 颜色为标准 6 位格式
 * @param hex HEX 颜色字符串
 * @returns 标准化的 HEX 颜色字符串
 */
export function normalizeHex(hex: string): string {
  const cleanHex = hex.replace(/^#/, '').toUpperCase();
  
  if (cleanHex.length === 3) {
    return `#${cleanHex[0]}${cleanHex[0]}${cleanHex[1]}${cleanHex[1]}${cleanHex[2]}${cleanHex[2]}`;
  }
  
  if (cleanHex.length === 6 || cleanHex.length === 8) {
    return `#${cleanHex}`;
  }
  
  return hex;
}

/**
 * 将数值转换为两位 HEX 字符串
 */
function componentToHex(c: number): string {
  const hex = Math.max(0, Math.min(255, Math.round(c))).toString(16);
  return hex.length === 1 ? '0' + hex : hex;
}

/**
 * 计算颜色的亮度
 * @param hex HEX 颜色字符串
 * @returns 亮度值 0-255
 */
export function getLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  // 使用感知亮度公式
  return 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
}

/**
 * 判断颜色是否为浅色
 * @param hex HEX 颜色字符串
 * @returns 是否为浅色
 */
export function isLightColor(hex: string): boolean {
  return getLuminance(hex) > 186;
}
