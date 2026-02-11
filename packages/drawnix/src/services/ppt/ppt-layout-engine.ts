/**
 * PPT 布局引擎
 *
 * 支持 6 种版式的文本元素坐标计算
 * 所有坐标相对于 Frame 左上角
 */

import type { Element as SlateElement } from 'slate';
import type { PPTPageSpec, PPTLayoutType, LayoutElement, FrameRect } from './ppt.types';

/** PPT Frame 标准尺寸 (16:9) */
export const PPT_FRAME_WIDTH = 1920;
export const PPT_FRAME_HEIGHT = 1080;

/** 字体样式等级 key */
export type FontStyleLevel =
  | 'title' | 'subtitle'
  | 'h1' | 'h2' | 'h3' | 'h4'
  | 'body' | 'caption' | 'footnote'
  | 'large' | 'medium' | 'small'; // PPT 布局兼容别名

/** 字体样式配置：对标 docx 标题层级 */
export const PPT_FONT_STYLES: Record<
  FontStyleLevel,
  { fontSize: number; fontWeight: string; color: string }
> = {
  // PPT 专用 - 使用品牌色系
  title:    { fontSize: 44, fontWeight: '700', color: '#2d2d2d' },
  subtitle: { fontSize: 32, fontWeight: '500', color: '#5A4FCF' },
  // 标题层级（对标 docx）
  h1: { fontSize: 32, fontWeight: '700', color: '#2d2d2d' },
  h2: { fontSize: 28, fontWeight: '600', color: '#333333' },
  h3: { fontSize: 24, fontWeight: '600', color: '#444444' },
  h4: { fontSize: 20, fontWeight: '600', color: '#555555' },
  // 正文
  body:     { fontSize: 18, fontWeight: '400', color: '#444444' },
  caption:  { fontSize: 16, fontWeight: '400', color: '#666666' },
  footnote: { fontSize: 14, fontWeight: '400', color: '#999999' },
  // PPT 布局兼容别名
  large:  { fontSize: 44, fontWeight: '700', color: '#2d2d2d' },
  medium: { fontSize: 28, fontWeight: '500', color: '#5A4FCF' },
  small:  { fontSize: 22, fontWeight: '400', color: '#444444' },
};

/**
 * 根据 LayoutElement 的 fontSize 等级和 type 创建带样式的 Slate Element
 */
export function createStyledTextElement(element: LayoutElement): SlateElement {
  const sizeKey = element.fontSize || 'small';
  const style = PPT_FONT_STYLES[sizeKey as FontStyleLevel] || PPT_FONT_STYLES.small;

  const marks: Record<string, any> = {
    'font-size': style.fontSize,
    'font-weight': style.fontWeight,
    color: style.color,
  };

  // 标题加粗
  if (element.type === 'title') {
    marks.bold = true;
  }

  // 副标题使用品牌蓝紫色
  if (element.type === 'subtitle') {
    marks.color = '#5A4FCF';
  }

  return {
    type: 'paragraph',
    children: [{ text: element.text, ...marks }],
  } as unknown as SlateElement;
}

/** 布局边距和间距常量 */
const LAYOUT_CONSTANTS = {
  // 边距
  marginX: 120,
  marginY: 100,
  // 标题
  titleY: 100,
  titleFontSize: 'large' as const,
  // 副标题
  subtitleGap: 50,
  subtitleFontSize: 'medium' as const,
  // 正文
  bodyStartY: 250,
  bulletGap: 70,
  bulletIndent: 40,
  bulletFontSize: 'small' as const,
  // 居中内容
  centerY: 400,
};

/**
 * 封面页布局
 * 大标题居中 + 副标题居中 + 装饰线
 */
function layoutCover(page: PPTPageSpec, frame: FrameRect): LayoutElement[] {
  const elements: LayoutElement[] = [];
  const centerX = frame.width / 2;

  // 主标题 - 垂直居中偏上
  elements.push({
    type: 'title',
    text: page.title,
    point: [centerX, frame.height * 0.38],
    fontSize: 'large',
    align: 'center',
  });

  // 副标题
  if (page.subtitle) {
    elements.push({
      type: 'subtitle',
      text: page.subtitle,
      point: [centerX, frame.height * 0.52],
      fontSize: 'medium',
      align: 'center',
    });
  }

  return elements;
}

/**
 * 目录页布局
 * 标题 + 目录列表（居中排列，带序号）
 */
function layoutToc(page: PPTPageSpec, frame: FrameRect): LayoutElement[] {
  const elements: LayoutElement[] = [];
  const centerX = frame.width / 2;

  // 标题
  elements.push({
    type: 'title',
    text: page.title || '目录',
    point: [centerX, LAYOUT_CONSTANTS.titleY + 20],
    fontSize: 'large',
    align: 'center',
  });

  // 目录项 - 使用更大字号和更宽间距
  if (page.bullets && page.bullets.length > 0) {
    const itemCount = page.bullets.length;
    // 动态计算起始 Y 和间距，让内容垂直居中
    const totalHeight = itemCount * 80;
    const startY = Math.max(280, (frame.height - totalHeight) / 2 + 20);
    const gap = Math.min(90, (frame.height - startY - 100) / itemCount);

    page.bullets.forEach((bullet, index) => {
      elements.push({
        type: 'bullet',
        text: `${index + 1}.  ${bullet}`,
        point: [centerX, startY + index * gap],
        fontSize: 'medium',
        align: 'center',
      });
    });
  }

  return elements;
}

/**
 * 标题正文页布局
 * 标题在顶部，要点列表在下方，更大间距
 */
function layoutTitleBody(page: PPTPageSpec, frame: FrameRect): LayoutElement[] {
  const elements: LayoutElement[] = [];

  // 标题
  elements.push({
    type: 'title',
    text: page.title,
    point: [LAYOUT_CONSTANTS.marginX, LAYOUT_CONSTANTS.titleY],
    fontSize: 'large',
    align: 'left',
  });

  // 要点列表 - 增大间距让内容更饱满
  if (page.bullets && page.bullets.length > 0) {
    const startY = LAYOUT_CONSTANTS.bodyStartY;
    const itemCount = page.bullets.length;
    // 动态间距：内容少时间距大，内容多时间距紧凑
    const gap = Math.min(LAYOUT_CONSTANTS.bulletGap + 10, (frame.height - startY - 80) / itemCount);

    page.bullets.forEach((bullet, index) => {
      elements.push({
        type: 'bullet',
        text: `• ${bullet}`,
        point: [LAYOUT_CONSTANTS.marginX + LAYOUT_CONSTANTS.bulletIndent, startY + index * gap],
        fontSize: 'small',
        align: 'left',
      });
    });
  }

  return elements;
}

/**
 * 图文页布局
 * 左侧文本区，右侧预留图片区
 */
function layoutImageText(page: PPTPageSpec, frame: FrameRect): LayoutElement[] {
  const elements: LayoutElement[] = [];

  // 标题
  elements.push({
    type: 'title',
    text: page.title,
    point: [LAYOUT_CONSTANTS.marginX, LAYOUT_CONSTANTS.titleY],
    fontSize: 'large',
    align: 'left',
  });

  // 要点列表（在左侧文本区内）
  if (page.bullets && page.bullets.length > 0) {
    const startY = LAYOUT_CONSTANTS.bodyStartY;
    const itemCount = page.bullets.length;
    const gap = Math.min(LAYOUT_CONSTANTS.bulletGap + 10, (frame.height - startY - 80) / itemCount);

    page.bullets.forEach((bullet, index) => {
      elements.push({
        type: 'bullet',
        text: `• ${bullet}`,
        point: [LAYOUT_CONSTANTS.marginX + LAYOUT_CONSTANTS.bulletIndent, startY + index * gap],
        fontSize: 'small',
        align: 'left',
      });
    });
  }

  return elements;
}

/**
 * 对比页布局
 * 标题在顶部，下方左右两栏对比，内容区更饱满
 */
function layoutComparison(page: PPTPageSpec, frame: FrameRect): LayoutElement[] {
  const elements: LayoutElement[] = [];
  const centerX = frame.width / 2;

  // 标题
  elements.push({
    type: 'title',
    text: page.title,
    point: [centerX, LAYOUT_CONSTANTS.titleY],
    fontSize: 'large',
    align: 'center',
  });

  // 对比内容（前半部分左侧，后半部分右侧）
  if (page.bullets && page.bullets.length > 0) {
    const midIndex = Math.ceil(page.bullets.length / 2);
    const leftBullets = page.bullets.slice(0, midIndex);
    const rightBullets = page.bullets.slice(midIndex);

    const leftX = frame.width * 0.25;
    const rightX = frame.width * 0.72;
    const startY = LAYOUT_CONSTANTS.bodyStartY + 20;
    const gap = LAYOUT_CONSTANTS.bulletGap + 10;

    // 左侧列
    leftBullets.forEach((bullet, index) => {
      elements.push({
        type: 'bullet',
        text: `• ${bullet}`,
        point: [leftX, startY + index * gap],
        fontSize: 'small',
        align: 'left',
      });
    });

    // 右侧列
    rightBullets.forEach((bullet, index) => {
      elements.push({
        type: 'bullet',
        text: `• ${bullet}`,
        point: [rightX, startY + index * gap],
        fontSize: 'small',
        align: 'left',
      });
    });
  }

  return elements;
}

/**
 * 结尾页布局
 * 结束语/感谢语居中
 */
function layoutEnding(page: PPTPageSpec, frame: FrameRect): LayoutElement[] {
  const elements: LayoutElement[] = [];
  const centerX = frame.width / 2;

  // 主标题
  elements.push({
    type: 'title',
    text: page.title || '谢谢观看',
    point: [centerX, frame.height * 0.45],
    fontSize: 'large',
    align: 'center',
  });

  // 副标题
  if (page.subtitle) {
    elements.push({
      type: 'subtitle',
      text: page.subtitle,
      point: [centerX, frame.height * 0.58],
      fontSize: 'medium',
      align: 'center',
    });
  }

  return elements;
}

/** 版式布局函数映射 */
const LAYOUT_FUNCTIONS: Record<PPTLayoutType, (page: PPTPageSpec, frame: FrameRect) => LayoutElement[]> = {
  cover: layoutCover,
  toc: layoutToc,
  'title-body': layoutTitleBody,
  'image-text': layoutImageText,
  comparison: layoutComparison,
  ending: layoutEnding,
};

/**
 * 布局引擎核心函数
 * 根据页面规格和 Frame 尺寸计算所有文本元素的坐标
 *
 * @param pageSpec - PPT 页面规格
 * @param frameRect - Frame 矩形信息（包含绝对坐标）
 * @returns 布局元素数组（坐标相对于 Frame 左上角）
 */
export function layoutPageContent(pageSpec: PPTPageSpec, frameRect: FrameRect): LayoutElement[] {
  const layoutFn = LAYOUT_FUNCTIONS[pageSpec.layout];
  if (!layoutFn) {
    // 默认使用标题正文布局
    return layoutTitleBody(pageSpec, frameRect);
  }
  return layoutFn(pageSpec, frameRect);
}

/**
 * 估算文本渲染宽度（基于字号和字符数）
 * 中文字符约等于字号宽度，英文/数字约 0.6 倍字号
 */
function estimateTextWidth(text: string, fontSizeKey?: 'large' | 'medium' | 'small'): number {
  const style = PPT_FONT_STYLES[fontSizeKey || 'small'];
  const fontSize = style.fontSize;
  let width = 0;
  for (const char of text) {
    // CJK 字符范围
    if (/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(char)) {
      width += fontSize;
    } else {
      width += fontSize * 0.55;
    }
  }
  return width;
}

/**
 * 将相对坐标转换为绝对坐标
 * 对 align: 'center' 的元素根据文本宽度偏移 x 坐标，使文本视觉居中
 *
 * @param elements - 布局元素数组（相对坐标）
 * @param frameRect - Frame 矩形信息（包含绝对坐标）
 * @returns 布局元素数组（绝对坐标）
 */
export function convertToAbsoluteCoordinates(
  elements: LayoutElement[],
  frameRect: FrameRect
): LayoutElement[] {
  return elements.map((element) => {
    let x = element.point[0];

    // 居中对齐：将 x 左移半个文本宽度
    if (element.align === 'center') {
      const textWidth = estimateTextWidth(element.text, element.fontSize);
      x = x - textWidth / 2;
    }

    return {
      ...element,
      point: [frameRect.x + x, frameRect.y + element.point[1]] as [number, number],
    };
  });
}

/**
 * 获取图片插入区域（用于 image-text 版式）
 *
 * @param frameRect - Frame 矩形信息
 * @returns 图片区域的矩形信息
 */
export function getImageRegion(frameRect: FrameRect): FrameRect {
  const textAreaWidth = frameRect.width * 0.45;
  const imageAreaWidth = frameRect.width * 0.5;
  const margin = LAYOUT_CONSTANTS.marginY;

  return {
    x: frameRect.x + textAreaWidth + (frameRect.width - textAreaWidth - imageAreaWidth) / 2,
    y: frameRect.y + margin,
    width: imageAreaWidth,
    height: frameRect.height - margin * 2,
  };
}
