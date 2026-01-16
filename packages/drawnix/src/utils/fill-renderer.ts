/**
 * 填充渲染工具函数
 * Fill Renderer Utilities
 *
 * 用于在 SVG 中渲染渐变和图片填充
 */

import type {
  FillConfig,
  GradientFillConfig,
  ImageFillConfig,
  LinearGradientConfig,
  RadialGradientConfig,
} from '../types/fill.types';
import { isSolidFill, isFillConfig } from '../types/fill.types';

/**
 * 生成唯一的 fill 定义 ID
 */
export function generateFillDefId(elementId: string, type: 'gradient' | 'pattern'): string {
  return `fill-${type}-${elementId}`;
}

/**
 * 创建 SVG defs 元素
 */
export function createSVGDefs(): SVGDefsElement {
  return document.createElementNS('http://www.w3.org/2000/svg', 'defs');
}

/**
 * 创建线性渐变定义
 */
export function createLinearGradientDef(
  config: LinearGradientConfig,
  id: string
): SVGLinearGradientElement {
  const gradient = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'linearGradient'
  );

  gradient.setAttribute('id', id);

  // 将角度转换为 x1, y1, x2, y2
  // 0 度 = 从左到右，90 度 = 从上到下
  const angleRad = ((config.angle - 90) * Math.PI) / 180;
  const x1 = 50 - Math.cos(angleRad) * 50;
  const y1 = 50 - Math.sin(angleRad) * 50;
  const x2 = 50 + Math.cos(angleRad) * 50;
  const y2 = 50 + Math.sin(angleRad) * 50;

  gradient.setAttribute('x1', `${x1}%`);
  gradient.setAttribute('y1', `${y1}%`);
  gradient.setAttribute('x2', `${x2}%`);
  gradient.setAttribute('y2', `${y2}%`);

  // 添加色标
  config.stops.forEach((stop) => {
    const stopEl = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'stop'
    );
    stopEl.setAttribute('offset', `${stop.offset * 100}%`);
    stopEl.setAttribute('stop-color', stop.color);
    if (stop.opacity !== undefined && stop.opacity < 1) {
      stopEl.setAttribute('stop-opacity', String(stop.opacity));
    }
    gradient.appendChild(stopEl);
  });

  return gradient;
}

/**
 * 创建径向渐变定义
 */
export function createRadialGradientDef(
  config: RadialGradientConfig,
  id: string
): SVGRadialGradientElement {
  const gradient = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'radialGradient'
  );

  gradient.setAttribute('id', id);
  gradient.setAttribute('cx', `${config.centerX * 100}%`);
  gradient.setAttribute('cy', `${config.centerY * 100}%`);
  gradient.setAttribute('r', '50%');
  gradient.setAttribute('fx', `${config.centerX * 100}%`);
  gradient.setAttribute('fy', `${config.centerY * 100}%`);

  // 添加色标
  config.stops.forEach((stop) => {
    const stopEl = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'stop'
    );
    stopEl.setAttribute('offset', `${stop.offset * 100}%`);
    stopEl.setAttribute('stop-color', stop.color);
    if (stop.opacity !== undefined && stop.opacity < 1) {
      stopEl.setAttribute('stop-opacity', String(stop.opacity));
    }
    gradient.appendChild(stopEl);
  });

  return gradient;
}

/**
 * 创建渐变定义
 */
export function createGradientDef(
  config: GradientFillConfig,
  id: string
): SVGLinearGradientElement | SVGRadialGradientElement {
  if (config.type === 'linear') {
    return createLinearGradientDef(config, id);
  } else {
    return createRadialGradientDef(config, id);
  }
}

/**
 * 创建图片填充 pattern 定义
 */
export function createImagePatternDef(
  config: ImageFillConfig,
  id: string,
  elementWidth: number,
  elementHeight: number
): SVGPatternElement {
  const pattern = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'pattern'
  );

  pattern.setAttribute('id', id);
  pattern.setAttribute('patternUnits', 'userSpaceOnUse');

  const scale = config.scale ?? 1;
  const rotation = config.rotation ?? 0;
  const offsetX = (config.offsetX ?? 0) * elementWidth;
  const offsetY = (config.offsetY ?? 0) * elementHeight;

  // 创建 image 元素
  const image = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'image'
  );
  image.setAttribute('href', config.imageUrl);
  image.setAttribute('preserveAspectRatio', 'none');

  // 根据模式设置 pattern 和 image 属性
  switch (config.mode) {
    case 'stretch':
      // 拉伸模式：pattern 覆盖整个元素
      pattern.setAttribute('width', String(elementWidth));
      pattern.setAttribute('height', String(elementHeight));
      pattern.setAttribute('x', String(offsetX));
      pattern.setAttribute('y', String(offsetY));
      image.setAttribute('width', String(elementWidth * scale));
      image.setAttribute('height', String(elementHeight * scale));
      break;

    case 'tile':
      // 平铺模式：使用原始图片尺寸（这里假设 100x100 作为基础）
      const tileSize = 100 * scale;
      pattern.setAttribute('width', String(tileSize));
      pattern.setAttribute('height', String(tileSize));
      pattern.setAttribute('x', String(offsetX));
      pattern.setAttribute('y', String(offsetY));
      image.setAttribute('width', String(tileSize));
      image.setAttribute('height', String(tileSize));
      break;

    case 'fit':
      // 适应模式：保持比例
      pattern.setAttribute('width', String(elementWidth));
      pattern.setAttribute('height', String(elementHeight));
      pattern.setAttribute('x', String(offsetX));
      pattern.setAttribute('y', String(offsetY));
      image.setAttribute('width', String(elementWidth * scale));
      image.setAttribute('height', String(elementHeight * scale));
      image.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      break;
  }

  // 应用旋转变换
  if (rotation !== 0) {
    const cx = elementWidth / 2;
    const cy = elementHeight / 2;
    pattern.setAttribute(
      'patternTransform',
      `rotate(${rotation} ${cx} ${cy})`
    );
  }

  pattern.appendChild(image);
  return pattern;
}

/**
 * 解析填充值，返回可用于 SVG fill 属性的值
 * 如果需要 defs，返回 { defElement, fillValue }
 * 如果是纯色，返回 { fillValue }
 */
export interface ParsedFill {
  fillValue: string;
  defElement?: SVGElement;
}

export function parseFillValue(
  fill: string | FillConfig | undefined,
  elementId: string,
  elementWidth: number,
  elementHeight: number
): ParsedFill {
  // 无填充
  if (!fill || fill === 'none') {
    return { fillValue: 'none' };
  }

  // 纯色字符串
  if (isSolidFill(fill)) {
    return { fillValue: fill };
  }

  // FillConfig 对象
  if (isFillConfig(fill)) {
    switch (fill.type) {
      case 'solid':
        return { fillValue: fill.solid?.color || 'none' };

      case 'gradient':
        if (fill.gradient) {
          const gradientId = generateFillDefId(elementId, 'gradient');
          const defElement = createGradientDef(fill.gradient, gradientId);
          return {
            fillValue: `url(#${gradientId})`,
            defElement,
          };
        }
        return { fillValue: 'none' };

      case 'image':
        if (fill.image && fill.image.imageUrl) {
          const patternId = generateFillDefId(elementId, 'pattern');
          const defElement = createImagePatternDef(
            fill.image,
            patternId,
            elementWidth,
            elementHeight
          );
          return {
            fillValue: `url(#${patternId})`,
            defElement,
          };
        }
        return { fillValue: 'none' };

      default:
        return { fillValue: 'none' };
    }
  }

  return { fillValue: 'none' };
}

/**
 * 为 SVG 元素应用填充
 * 自动处理 defs 的添加
 */
export function applyFillToSVGElement(
  svgElement: SVGElement,
  fill: string | FillConfig | undefined,
  elementId: string,
  elementWidth: number,
  elementHeight: number
): void {
  const parsed = parseFillValue(fill, elementId, elementWidth, elementHeight);

  // 设置 fill 属性
  svgElement.setAttribute('fill', parsed.fillValue);

  // 如果有 def 元素，添加到 SVG 的 defs 中
  if (parsed.defElement) {
    // 查找或创建 defs
    const svg = svgElement.closest('svg');
    if (svg) {
      let defs = svg.querySelector('defs');
      if (!defs) {
        defs = createSVGDefs();
        svg.insertBefore(defs, svg.firstChild);
      }

      // 移除已存在的同 id 定义
      const existingDef = defs.querySelector(`#${parsed.defElement.id}`);
      if (existingDef) {
        existingDef.remove();
      }

      defs.appendChild(parsed.defElement);
    }
  }
}

/**
 * 生成渐变的 CSS 字符串（用于预览）
 */
export function gradientToCSS(config: GradientFillConfig): string {
  const stopsStr = config.stops
    .map((stop) => {
      const opacity = stop.opacity !== undefined ? stop.opacity : 1;
      if (opacity < 1) {
        // 转换为 rgba
        const hex = stop.color.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${opacity}) ${Math.round(stop.offset * 100)}%`;
      }
      return `${stop.color} ${Math.round(stop.offset * 100)}%`;
    })
    .join(', ');

  if (config.type === 'linear') {
    return `linear-gradient(${config.angle}deg, ${stopsStr})`;
  } else {
    const cx = Math.round(config.centerX * 100);
    const cy = Math.round(config.centerY * 100);
    return `radial-gradient(circle at ${cx}% ${cy}%, ${stopsStr})`;
  }
}

/**
 * 生成图片填充的 CSS 字符串（用于预览）
 */
export function imageFillToCSS(config: ImageFillConfig): string {
  if (!config.imageUrl) return 'none';

  const scale = config.scale ?? 1;
  const offsetX = (config.offsetX ?? 0) * 100;
  const offsetY = (config.offsetY ?? 0) * 100;
  const rotation = config.rotation ?? 0;

  let backgroundSize = '';
  let backgroundRepeat = '';

  switch (config.mode) {
    case 'stretch':
      backgroundSize = `${scale * 100}% ${scale * 100}%`;
      backgroundRepeat = 'no-repeat';
      break;
    case 'tile':
      backgroundSize = `${scale * 100}px ${scale * 100}px`;
      backgroundRepeat = 'repeat';
      break;
    case 'fit':
      backgroundSize = 'contain';
      backgroundRepeat = 'no-repeat';
      break;
  }

  const styles: string[] = [
    `background-image: url(${config.imageUrl})`,
    `background-size: ${backgroundSize}`,
    `background-repeat: ${backgroundRepeat}`,
    `background-position: ${50 + offsetX}% ${50 + offsetY}%`,
  ];

  if (rotation !== 0) {
    // CSS 不支持直接旋转背景，需要使用伪元素或其他技术
    // 这里仅做标注
    styles.push(`/* rotation: ${rotation}deg */`);
  }

  return styles.join('; ');
}
