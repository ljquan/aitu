/**
 * PPT 布局引擎
 *
 * 支持 6 种版式的文本元素坐标计算
 * 所有坐标相对于 Frame 左上角
 */

import type { PPTPageSpec, PPTLayoutType, LayoutElement, FrameRect } from './ppt.types';

/** PPT Frame 标准尺寸 (16:9) */
export const PPT_FRAME_WIDTH = 1920;
export const PPT_FRAME_HEIGHT = 1080;

/** 布局边距和间距常量 */
const LAYOUT_CONSTANTS = {
  // 边距
  marginX: 120,
  marginY: 100,
  // 标题
  titleY: 80,
  titleFontSize: 'large' as const,
  // 副标题
  subtitleGap: 40,
  subtitleFontSize: 'medium' as const,
  // 正文
  bodyStartY: 220,
  bulletGap: 60,
  bulletIndent: 40,
  bulletFontSize: 'small' as const,
  // 居中内容
  centerY: 400,
};

/**
 * 封面页布局
 * 大标题居中 + 副标题居中
 */
function layoutCover(page: PPTPageSpec, frame: FrameRect): LayoutElement[] {
  const elements: LayoutElement[] = [];
  const centerX = frame.width / 2;

  // 主标题 - 垂直居中偏上
  elements.push({
    type: 'title',
    text: page.title,
    point: [centerX, frame.height * 0.4],
    fontSize: 'large',
    align: 'center',
  });

  // 副标题
  if (page.subtitle) {
    elements.push({
      type: 'subtitle',
      text: page.subtitle,
      point: [centerX, frame.height * 0.55],
      fontSize: 'medium',
      align: 'center',
    });
  }

  return elements;
}

/**
 * 目录页布局
 * 标题 + 目录列表（居中排列）
 */
function layoutToc(page: PPTPageSpec, frame: FrameRect): LayoutElement[] {
  const elements: LayoutElement[] = [];
  const centerX = frame.width / 2;

  // 标题
  elements.push({
    type: 'title',
    text: page.title || '目录',
    point: [centerX, LAYOUT_CONSTANTS.titleY + 40],
    fontSize: 'large',
    align: 'center',
  });

  // 目录项
  if (page.bullets && page.bullets.length > 0) {
    const startY = 280;
    const gap = 80;

    page.bullets.forEach((bullet, index) => {
      elements.push({
        type: 'bullet',
        text: `${index + 1}. ${bullet}`,
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
 * 标题在顶部，要点列表在下方
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

  // 要点列表
  if (page.bullets && page.bullets.length > 0) {
    const startY = LAYOUT_CONSTANTS.bodyStartY;
    const gap = LAYOUT_CONSTANTS.bulletGap;

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
  const textAreaWidth = frame.width * 0.45; // 左侧 45% 为文本区

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
    const gap = LAYOUT_CONSTANTS.bulletGap;

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

  // 图片区域提示文本（右侧中央）
  elements.push({
    type: 'body',
    text: '[图片区域]',
    point: [textAreaWidth + (frame.width - textAreaWidth) / 2, frame.height / 2],
    fontSize: 'small',
    align: 'center',
  });

  return elements;
}

/**
 * 对比页布局
 * 标题在顶部，下方左右两栏对比
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

  // 对比内容（假设 bullets 前半部分是左侧，后半部分是右侧）
  if (page.bullets && page.bullets.length > 0) {
    const midIndex = Math.ceil(page.bullets.length / 2);
    const leftBullets = page.bullets.slice(0, midIndex);
    const rightBullets = page.bullets.slice(midIndex);

    const leftX = frame.width * 0.25;
    const rightX = frame.width * 0.75;
    const startY = LAYOUT_CONSTANTS.bodyStartY;
    const gap = LAYOUT_CONSTANTS.bulletGap;

    // 左侧列
    leftBullets.forEach((bullet, index) => {
      elements.push({
        type: 'bullet',
        text: `• ${bullet}`,
        point: [leftX, startY + index * gap],
        fontSize: 'small',
        align: 'center',
      });
    });

    // 右侧列
    rightBullets.forEach((bullet, index) => {
      elements.push({
        type: 'bullet',
        text: `• ${bullet}`,
        point: [rightX, startY + index * gap],
        fontSize: 'small',
        align: 'center',
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
 * 将相对坐标转换为绝对坐标
 *
 * @param elements - 布局元素数组（相对坐标）
 * @param frameRect - Frame 矩形信息（包含绝对坐标）
 * @returns 布局元素数组（绝对坐标）
 */
export function convertToAbsoluteCoordinates(
  elements: LayoutElement[],
  frameRect: FrameRect
): LayoutElement[] {
  return elements.map((element) => ({
    ...element,
    point: [frameRect.x + element.point[0], frameRect.y + element.point[1]] as [number, number],
  }));
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
