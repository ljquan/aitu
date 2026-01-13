/**
 * SVG MCP 工具
 *
 * 将SVG代码转换为图片并插入画布
 *
 * 输入：SVG代码字符串
 * 输出：将SVG作为图片插入到画布中
 */

import type { MCPTool, MCPResult } from '../types';
import { getBoard, extractCodeBlock } from './shared';
import { DrawTransforms } from '@plait/draw';
import { Point, getRectangleByElements } from '@plait/core';
import { scrollToPointIfNeeded } from '../../utils/selection-utils';

/**
 * SVG工具输入参数
 */
export interface SvgToolParams {
  /** SVG代码字符串 */
  svg: string;
  /** 插入位置（可选） */
  startPoint?: Point;
  /** 目标宽度（可选，默认400） */
  width?: number;
}

/**
 * 布局常量
 */
const LAYOUT_CONSTANTS = {
  /** 默认垂直间距 */
  DEFAULT_VERTICAL_GAP: 50,
  /** SVG 默认宽度 */
  SVG_DEFAULT_WIDTH: 400,
  /** SVG 最大宽度 */
  SVG_MAX_WIDTH: 800,
  /** SVG 最小宽度 */
  SVG_MIN_WIDTH: 100,
};

/**
 * 从代码块中提取SVG代码
 */
function extractSvgCode(input: string): string {
  // 先尝试提取 ```svg 或 ```xml 代码块
  let svg = extractCodeBlock(input, 'svg');
  if (svg === input) {
    svg = extractCodeBlock(input, 'xml');
  }

  // 如果没有代码块，尝试直接查找 <svg 标签
  if (svg === input && !svg.trim().startsWith('<svg')) {
    const svgMatch = svg.match(/<svg[\s\S]*?<\/svg>/i);
    if (svgMatch) {
      svg = svgMatch[0];
    }
  }

  return svg.trim();
}

/**
 * 验证SVG代码是否有效
 */
function validateSvg(svg: string): { valid: boolean; error?: string } {
  if (!svg || typeof svg !== 'string') {
    return { valid: false, error: '缺少SVG代码' };
  }

  const trimmed = svg.trim();
  if (!trimmed.startsWith('<svg') && !trimmed.startsWith('<?xml')) {
    return { valid: false, error: 'SVG代码格式无效，必须以<svg开头' };
  }

  if (!trimmed.includes('</svg>')) {
    return { valid: false, error: 'SVG代码不完整，缺少</svg>结束标签' };
  }

  return { valid: true };
}

/**
 * 规范化SVG代码，确保有正确的命名空间
 */
function normalizeSvg(svg: string): string {
  let normalized = svg.trim();

  // 确保有 xmlns 属性
  if (!normalized.includes('xmlns=')) {
    normalized = normalized.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  return normalized;
}

/**
 * 解析SVG尺寸
 */
function parseSvgDimensions(svg: string): { width: number; height: number } {
  // 尝试从 viewBox 解析
  const viewBoxMatch = svg.match(/viewBox=["']([^"']+)["']/i);
  if (viewBoxMatch) {
    const [, , vbWidth, vbHeight] = viewBoxMatch[1].split(/\s+/).map(Number);
    if (vbWidth && vbHeight) {
      return { width: vbWidth, height: vbHeight };
    }
  }

  // 尝试从 width/height 属性解析
  const widthMatch = svg.match(/width=["'](\d+)(?:px)?["']/i);
  const heightMatch = svg.match(/height=["'](\d+)(?:px)?["']/i);
  if (widthMatch && heightMatch) {
    return { width: parseInt(widthMatch[1]), height: parseInt(heightMatch[1]) };
  }

  // 默认尺寸
  return { width: 400, height: 400 };
}

/**
 * 将SVG转换为Data URL
 */
function svgToDataUrl(svg: string): string {
  const encoded = encodeURIComponent(svg)
    .replace(/'/g, '%27')
    .replace(/"/g, '%22');
  return `data:image/svg+xml,${encoded}`;
}

/**
 * 从保存的选中元素IDs获取起始插入位置
 */
function getStartPointFromSelection(board: any): Point | undefined {
  const appState = board.appState;
  const savedElementIds = appState?.lastSelectedElementIds || [];

  if (savedElementIds.length === 0) {
    return undefined;
  }

  const elements = savedElementIds
    .map((id: string) => board.children.find((el: any) => el.id === id))
    .filter(Boolean);

  if (elements.length === 0) {
    return undefined;
  }

  try {
    const boundingRect = getRectangleByElements(board, elements, false);
    const centerX = boundingRect.x + boundingRect.width / 2;
    const insertionY = boundingRect.y + boundingRect.height + LAYOUT_CONSTANTS.DEFAULT_VERTICAL_GAP;
    return [centerX, insertionY] as Point;
  } catch (error) {
    console.warn('[SvgTool] Error calculating start point:', error);
    return undefined;
  }
}

/**
 * 获取画布底部最后一个元素的位置
 */
function getBottomMostPoint(board: any): Point {
  if (!board.children || board.children.length === 0) {
    return [100, 100] as Point;
  }

  let maxY = 0;
  let maxYCenterX = 100;

  for (const element of board.children) {
    try {
      const rect = getRectangleByElements(board, [element], false);
      const elementBottom = rect.y + rect.height;
      if (elementBottom > maxY) {
        maxY = elementBottom;
        maxYCenterX = rect.x + rect.width / 2;
      }
    } catch {
      // 忽略无法计算矩形的元素
    }
  }

  return [maxYCenterX, maxY + LAYOUT_CONSTANTS.DEFAULT_VERTICAL_GAP] as Point;
}

/**
 * 执行SVG插入
 */
async function executeSvgTool(params: SvgToolParams): Promise<MCPResult> {
  const board = getBoard();

  if (!board) {
    return {
      success: false,
      error: '画布未初始化，请先打开画布',
      type: 'error',
    };
  }

  const { svg, startPoint, width: targetWidth } = params;

  // 验证SVG
  const validation = validateSvg(svg);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error || 'SVG代码无效',
      type: 'error',
    };
  }

  try {
    // 1. 提取并规范化SVG代码
    const svgCode = normalizeSvg(extractSvgCode(svg));
    // console.log('[SvgTool] Extracted SVG code:', svgCode.substring(0, 100) + '...');

    // 2. 解析SVG尺寸
    const svgDimensions = parseSvgDimensions(svgCode);
    // console.log('[SvgTool] SVG dimensions:', svgDimensions);

    // 3. 计算最终尺寸
    const effectiveWidth = Math.min(
      Math.max(targetWidth || LAYOUT_CONSTANTS.SVG_DEFAULT_WIDTH, LAYOUT_CONSTANTS.SVG_MIN_WIDTH),
      LAYOUT_CONSTANTS.SVG_MAX_WIDTH
    );
    const aspectRatio = svgDimensions.height / svgDimensions.width;
    const effectiveHeight = effectiveWidth * aspectRatio;

    // 4. 转换为Data URL
    const dataUrl = svgToDataUrl(svgCode);

    // 5. 确定插入位置
    let insertionPoint = startPoint;
    if (!insertionPoint) {
      insertionPoint = getStartPointFromSelection(board);
    }
    if (!insertionPoint) {
      insertionPoint = getBottomMostPoint(board);
    }

    // 居中调整
    insertionPoint = [insertionPoint[0] - effectiveWidth / 2, insertionPoint[1]] as Point;

    // 6. 创建图片项
    const imageItem = {
      url: dataUrl,
      width: effectiveWidth,
      height: effectiveHeight,
    };

    // 7. 插入到画布
    DrawTransforms.insertImage(board, imageItem, insertionPoint);

    // console.log('[SvgTool] Successfully inserted SVG at:', insertionPoint);

    // 8. 滚动到插入位置
    const centerPoint: Point = [
      insertionPoint[0] + effectiveWidth / 2,
      insertionPoint[1] + effectiveHeight / 2,
    ];
    requestAnimationFrame(() => {
      scrollToPointIfNeeded(board, centerPoint);
    });

    return {
      success: true,
      data: {
        width: effectiveWidth,
        height: effectiveHeight,
        position: insertionPoint,
        svgPreview: svgCode.substring(0, 200) + (svgCode.length > 200 ? '...' : ''),
      },
      type: 'canvas',
    };
  } catch (error: any) {
    console.error('[SvgTool] Failed to process SVG:', error);
    return {
      success: false,
      error: `SVG插入失败: ${error.message || '未知错误'}`,
      type: 'error',
    };
  }
}

/**
 * SVG MCP 工具定义
 */
export const svgTool: MCPTool = {
  name: 'insert_svg',
  description: `将SVG矢量图插入到画布工具。将SVG代码转换为可缩放矢量图形并插入到画布中。

使用场景：
- 用户需要在画布上创建图标、Logo、徽章等矢量图
- AI生成了SVG代码需要展示在画布上
- 用户提供了"矢量图"、"SVG"、"图标"等关键词的请求

SVG的优势：
- 矢量图形，无限缩放不失真
- 文件体积小，适合图标和简单图形
- 可编辑性强，颜色和形状可以修改

输入格式：
- 可以是纯SVG代码
- 也可以是包含\`\`\`svg或\`\`\`xml代码块的markdown

示例输入：
\`\`\`svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="40" fill="#5A4FCF"/>
  <path d="M35 50 L45 60 L65 40" stroke="white" stroke-width="6" fill="none"/>
</svg>
\`\`\`

常用场景：
- 矢量图：简约风格的火箭图标 → 生成火箭SVG
- 图标：社交媒体图标组 → 生成多个社交图标
- Logo：品牌Logo设计 → 生成矢量Logo`,

  inputSchema: {
    type: 'object',
    properties: {
      svg: {
        type: 'string',
        description: 'SVG代码字符串，可以是纯SVG代码或包含```svg代码块的markdown',
      },
      width: {
        type: 'number',
        description: '目标宽度（像素），默认400，范围100-800',
        default: 400,
      },
    },
    required: ['svg'],
  },

  promptGuidance: {
    whenToUse: '当用户请求生成矢量图、图标、Logo、SVG、徽章等关键词时使用此工具',
    parameterGuidance: {
      svg: '生成完整的SVG代码，确保包含xmlns属性和viewBox。使用简洁的路径和形状。',
      width: '根据图标复杂度调整，简单图标200-300，复杂图形400-600',
    },
    bestPractices: [
      '使用viewBox确保SVG可缩放',
      '颜色使用十六进制格式',
      '图标设计保持简洁，避免过于复杂的路径',
      '适当使用渐变和阴影增加质感',
    ],
    examples: [
      {
        input: '矢量图：一个简约风格的火箭图标',
        args: {
          svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path d="M50 10 L60 50 L55 50 L55 70 L45 70 L45 50 L40 50 Z" fill="#E67E22"/>
  <circle cx="50" cy="35" r="5" fill="#5A4FCF"/>
  <path d="M45 70 L40 85 L50 75 L60 85 L55 70" fill="#F39C12"/>
</svg>`,
          width: 300,
        },
        explanation: '生成简约火箭图标，使用品牌色彩',
      },
    ],
    warnings: [
      '不要生成过于复杂的SVG，可能导致渲染性能问题',
      '确保SVG代码格式正确，包含完整的开始和结束标签',
    ],
  },

  execute: async (params: Record<string, unknown>): Promise<MCPResult> => {
    return executeSvgTool(params as unknown as SvgToolParams);
  },
};

/**
 * 便捷函数：快速插入SVG
 */
export async function insertSvg(svgCode: string, width?: number): Promise<MCPResult> {
  return executeSvgTool({ svg: svgCode, width });
}
