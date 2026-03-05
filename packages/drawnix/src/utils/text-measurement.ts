/**
 * 文本测量工具函数
 * Text Measurement Utilities
 */

import { DEFAULT_FONT_SIZE } from '@plait/text-plugins';

const LINE_HEIGHT_FACTOR = 1.4;
const DEFAULT_PADDING = 8;

interface TextNode {
  text?: string;
  'font-size'?: string;
  children?: TextNode[];
}

/**
 * 递归提取文本节点中的所有文本段落及其字体大小
 */
function extractTextSegments(node: TextNode): Array<{ text: string; fontSize: number }> {
  const segments: Array<{ text: string; fontSize: number }> = [];
  
  if (!node) return segments;
  
  if ('text' in node && typeof node.text === 'string') {
    const fontSize = node['font-size'] 
      ? parseFloat(node['font-size']) 
      : DEFAULT_FONT_SIZE;
    segments.push({ text: node.text, fontSize });
  }
  
  if ('children' in node && Array.isArray(node.children)) {
    for (const child of node.children) {
      segments.push(...extractTextSegments(child));
    }
  }
  
  return segments;
}

/**
 * 使用 Canvas API 测量文本宽度
 */
function measureTextWidth(text: string, fontSize: number): number {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return text.length * fontSize * 0.6;
  
  ctx.font = `${fontSize}px sans-serif`;
  return ctx.measureText(text).width;
}

/**
 * 计算文本内容在给定宽度下的实际渲染高度
 * @param textNode 文本节点树
 * @param containerWidth 容器宽度
 * @returns 文本内容的实际高度（包含 padding）
 */
export function calculateTextContentHeight(
  textNode: TextNode | undefined,
  containerWidth: number
): number {
  if (!textNode) return DEFAULT_FONT_SIZE * LINE_HEIGHT_FACTOR + DEFAULT_PADDING * 2;
  
  const segments = extractTextSegments(textNode);
  if (segments.length === 0) {
    return DEFAULT_FONT_SIZE * LINE_HEIGHT_FACTOR + DEFAULT_PADDING * 2;
  }
  
  const availableWidth = Math.max(10, containerWidth - DEFAULT_PADDING * 2);
  let totalHeight = 0;
  let currentLineWidth = 0;
  let currentLineMaxFontSize = DEFAULT_FONT_SIZE;
  
  for (const segment of segments) {
    const { text, fontSize } = segment;
    
    // 处理换行符
    const lines = text.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // 如果不是第一行，说明有换行符，需要结算当前行
      if (i > 0) {
        totalHeight += currentLineMaxFontSize * LINE_HEIGHT_FACTOR;
        currentLineWidth = 0;
        currentLineMaxFontSize = fontSize;
      }
      
      if (line.length === 0) continue;
      
      // 测量当前行的文本宽度
      const textWidth = measureTextWidth(line, fontSize);
      
      // 如果当前行加上这段文本会超出容器宽度，需要换行
      if (currentLineWidth + textWidth > availableWidth && currentLineWidth > 0) {
        totalHeight += currentLineMaxFontSize * LINE_HEIGHT_FACTOR;
        currentLineWidth = textWidth;
        currentLineMaxFontSize = fontSize;
      } else {
        currentLineWidth += textWidth;
        currentLineMaxFontSize = Math.max(currentLineMaxFontSize, fontSize);
      }
    }
  }
  
  // 加上最后一行的高度
  if (currentLineWidth > 0 || segments.length > 0) {
    totalHeight += currentLineMaxFontSize * LINE_HEIGHT_FACTOR;
  }
  
  // 加上上下 padding
  return totalHeight + DEFAULT_PADDING * 2;
}

/**
 * 计算能完整容纳文字内容的最小矩形尺寸（宽、高取内容所需最小值的最大值）
 * @param textNode 文本节点树
 * @returns { width, height } 含 padding，单位与测量一致
 */
export function getMinTextContentSize(
  textNode: TextNode | undefined
): { width: number; height: number } {
  if (!textNode) {
    const h =
      DEFAULT_FONT_SIZE * LINE_HEIGHT_FACTOR + DEFAULT_PADDING * 2;
    return { width: DEFAULT_PADDING * 2, height: h };
  }
  const segments = extractTextSegments(textNode);
  if (segments.length === 0) {
    const h =
      DEFAULT_FONT_SIZE * LINE_HEIGHT_FACTOR + DEFAULT_PADDING * 2;
    return { width: DEFAULT_PADDING * 2, height: h };
  }
  let maxLineWidth = 0;
  for (const segment of segments) {
    const lines = segment.text.split('\n');
    for (const line of lines) {
      const w = measureTextWidth(line, segment.fontSize);
      if (w > maxLineWidth) maxLineWidth = w;
    }
  }
  const minWidth = maxLineWidth + DEFAULT_PADDING * 2;
  const minHeight = calculateTextContentHeight(textNode, minWidth);
  return { width: minWidth, height: minHeight };
}

/**
 * 计算缩放后文本内容的高度
 * @param textNode 原始文本节点树
 * @param containerWidth 缩放后的容器宽度
 * @param scaleFactor 缩放系数
 * @returns 缩放后文本内容的实际高度
 */
export function calculateScaledTextHeight(
  textNode: TextNode | undefined,
  containerWidth: number,
  scaleFactor: number
): number {
  if (!textNode) return DEFAULT_FONT_SIZE * LINE_HEIGHT_FACTOR * scaleFactor + DEFAULT_PADDING * 2;
  
  // 创建缩放后的文本节点副本
  const scaledNode = scaleTextNodeFontSize(textNode, scaleFactor);
  
  // 计算缩放后的高度
  return calculateTextContentHeight(scaledNode, containerWidth);
}

/**
 * 递归缩放文本节点的字体大小
 */
function scaleTextNodeFontSize(node: TextNode, scaleFactor: number): TextNode {
  if (!node) return node;
  
  const result: TextNode = { ...node };
  
  if ('font-size' in node && node['font-size']) {
    const currentSize = parseFloat(node['font-size']);
    const newSize = Math.max(1, currentSize * scaleFactor);
    result['font-size'] = `${newSize}`;
  }
  
  if ('children' in node && Array.isArray(node.children)) {
    result.children = node.children.map(child => scaleTextNodeFontSize(child, scaleFactor));
  }
  
  return result;
}
