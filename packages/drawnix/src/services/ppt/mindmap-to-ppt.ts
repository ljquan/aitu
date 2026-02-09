/**
 * 思维导图转 PPT 服务
 *
 * 将思维导图的树形结构转换为 PPT 演示文稿
 *
 * 转换规则：
 * - 根节点 → 封面页标题
 * - 一级子节点 → 目录项 + 独立内容页标题
 * - 二级及更深子节点 → 内容页的正文要点
 */

import type { PlaitBoard, Point } from '@plait/core';
import { Transforms, BoardTransforms, PlaitBoard as PlaitBoardUtils, RectangleClient } from '@plait/core';
import { DrawTransforms } from '@plait/draw';
import { MindElement } from '@plait/mind';
import { Node } from 'slate';
import { FrameTransforms } from '../../plugins/with-frame';
import { insertPPTImagePlaceholder } from '../../utils/frame-insertion-utils';
import { isFrameElement, PlaitFrame } from '../../types/frame.types';
import type {
  MindmapNodeInfo,
  MindmapToPPTOptions,
  MindmapToPPTResult,
  PPTOutline,
  PPTPageSpec,
  PPTFrameMeta,
  FrameRect,
} from './ppt.types';
import { layoutPageContent, convertToAbsoluteCoordinates, createStyledTextElement, PPT_FRAME_WIDTH, PPT_FRAME_HEIGHT } from './ppt-layout-engine';

/** Frame 间距 */
const FRAME_GAP = 60;

/**
 * 从 MindElement 的 data 中提取纯文本
 * MindElement.data 存储的是 Slate 节点数组
 */
function extractTextFromMindData(data: MindElement['data']): string {
  if (!data) return '';

  // data 是一个包含 Slate 节点的对象，通常有 children 属性
  if (typeof data === 'object' && 'children' in data) {
    try {
      // 使用 Slate 的 Node.string 提取纯文本
      return Node.string(data as any).trim();
    } catch {
      // 如果提取失败，尝试直接获取文本
      return '';
    }
  }

  // 如果 data 直接是字符串
  if (typeof data === 'string') {
    return data.trim();
  }

  return '';
}

/**
 * 递归遍历思维导图，提取层级结构
 *
 * @param element - MindElement 节点
 * @param depth - 当前深度（根节点为 0）
 * @returns 节点信息
 */
export function extractMindmapStructure(element: MindElement, depth: number = 0): MindmapNodeInfo {
  const text = extractTextFromMindData(element.data);

  const children: MindmapNodeInfo[] = [];
  if (element.children && Array.isArray(element.children)) {
    for (const child of element.children) {
      children.push(extractMindmapStructure(child, depth + 1));
    }
  }

  return {
    text,
    children,
    depth,
  };
}

/**
 * 将子节点展平为要点列表
 * 处理多层嵌套，将深层节点格式化为缩进要点
 *
 * @param children - 子节点列表
 * @param maxDepth - 最大展开深度（相对于当前节点）
 * @returns 要点文本数组
 */
function flattenChildrenToBullets(children: MindmapNodeInfo[], maxDepth: number = 2): string[] {
  const bullets: string[] = [];

  function traverse(nodes: MindmapNodeInfo[], currentDepth: number) {
    for (const node of nodes) {
      if (!node.text) continue;

      // 根据深度添加缩进前缀
      const indent = currentDepth > 0 ? '  '.repeat(currentDepth) : '';
      bullets.push(`${indent}${node.text}`);

      // 继续遍历子节点，但限制深度
      if (node.children.length > 0 && currentDepth < maxDepth - 1) {
        traverse(node.children, currentDepth + 1);
      }
    }
  }

  traverse(children, 0);
  return bullets;
}

/**
 * 将思维导图结构转换为 PPT 大纲
 *
 * @param rootInfo - 思维导图根节点信息
 * @param options - 转换选项
 * @returns PPT 大纲
 */
export function convertMindmapToOutline(
  rootInfo: MindmapNodeInfo,
  options: MindmapToPPTOptions = {}
): PPTOutline {
  const { includeToc = true, endingTitle = '谢谢观看', endingSubtitle } = options;

  const pages: PPTPageSpec[] = [];
  const title = rootInfo.text || '未命名演示文稿';

  // 1. 封面页
  pages.push({
    layout: 'cover',
    title,
    subtitle: rootInfo.children.length > 0 ? `共 ${rootInfo.children.length} 个主题` : undefined,
  });

  // 2. 目录页（如果有一级子节点且启用目录）
  if (includeToc && rootInfo.children.length > 0) {
    const tocBullets = rootInfo.children
      .map((child) => child.text)
      .filter((text) => text); // 过滤空文本

    if (tocBullets.length > 0) {
      pages.push({
        layout: 'toc',
        title: '目录',
        bullets: tocBullets,
      });
    }
  }

  // 3. 内容页（每个一级子节点生成一页）
  for (const child of rootInfo.children) {
    if (!child.text) continue;

    const pageSpec: PPTPageSpec = {
      layout: 'title-body',
      title: child.text,
    };

    // 将二级及更深子节点转换为要点
    if (child.children.length > 0) {
      pageSpec.bullets = flattenChildrenToBullets(child.children);
    }

    pages.push(pageSpec);
  }

  // 4. 结尾页
  pages.push({
    layout: 'ending',
    title: endingTitle,
    subtitle: endingSubtitle,
  });

  return {
    title,
    pages,
  };
}

/**
 * 计算新 Frame 的插入位置
 * PPT Frame 固定 1920x1080（横屏），放在最右侧 Frame 的右边
 */
function calcNewFramePosition(board: PlaitBoard): Point {
  const existingFrames: RectangleClient[] = [];

  for (const el of board.children) {
    if (isFrameElement(el)) {
      existingFrames.push(RectangleClient.getRectangleByPoints(el.points));
    }
  }

  // 无 Frame 时居中显示
  if (existingFrames.length === 0) {
    const container = PlaitBoardUtils.getBoardContainer(board);
    const vw = container.clientWidth;
    const vh = container.clientHeight;
    const zoom = board.viewport?.zoom ?? 1;
    const orig = board.viewport?.origination;
    const ox = orig ? orig[0] : 0;
    const oy = orig ? orig[1] : 0;
    const cx = ox + vw / 2 / zoom;
    const cy = oy + vh / 2 / zoom;
    return [cx - PPT_FRAME_WIDTH / 2, cy - PPT_FRAME_HEIGHT / 2];
  }

  // 横屏：放在最右侧 Frame 的右边
  let maxRight = -Infinity;
  let refY = 0;
  for (const r of existingFrames) {
    const right = r.x + r.width;
    if (right > maxRight) {
      maxRight = right;
      refY = r.y;
    }
  }
  return [maxRight + FRAME_GAP, refY];
}

/**
 * 聚焦视口到指定 Frame
 */
function focusOnFrame(board: PlaitBoard, frame: PlaitFrame): void {
  const rect = RectangleClient.getRectangleByPoints(frame.points);
  const padding = 80;

  const container = PlaitBoardUtils.getBoardContainer(board);
  const viewportWidth = container.clientWidth;
  const viewportHeight = container.clientHeight;

  // 计算缩放比例，让 Frame 适应视口
  const scaleX = viewportWidth / (rect.width + padding * 2);
  const scaleY = viewportHeight / (rect.height + padding * 2);
  const zoom = Math.min(scaleX, scaleY, 1);

  // 计算 Frame 中心点
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;

  // 计算 origination：使 Frame 中心对齐视口中心
  const origination: [number, number] = [centerX - viewportWidth / 2 / zoom, centerY - viewportHeight / 2 / zoom];

  BoardTransforms.updateViewport(board, origination, zoom);
}

/**
 * 创建单个 PPT 页面（Frame + 文本内容）
 */
function createPPTPage(board: PlaitBoard, pageSpec: PPTPageSpec, pageIndex: number, framePosition: Point): PlaitFrame {
  // 1. 创建 Frame
  const framePoints: [Point, Point] = [
    framePosition,
    [framePosition[0] + PPT_FRAME_WIDTH, framePosition[1] + PPT_FRAME_HEIGHT],
  ];
  const frameName = pageSpec.title || `Slide ${pageIndex}`;
  const frame = FrameTransforms.insertFrame(board, framePoints, frameName);

  // 2. 计算布局
  const frameRect: FrameRect = {
    x: framePosition[0],
    y: framePosition[1],
    width: PPT_FRAME_WIDTH,
    height: PPT_FRAME_HEIGHT,
  };
  const layoutElements = layoutPageContent(pageSpec, frameRect);
  const absoluteElements = convertToAbsoluteCoordinates(layoutElements, frameRect);

  // 3. 插入文本元素并绑定到 Frame
  for (const element of absoluteElements) {
    const insertPoint: Point = element.point;

    // 跳过占位符文本
    if (element.text === '[图片区域]') {
      continue;
    }

    // 记录插入前的 children 数量
    const childrenCountBefore = board.children.length;

    // 插入带样式的文本（Slate Element 包含字号/粗细/颜色）
    const styledText = createStyledTextElement(element);
    DrawTransforms.insertText(board, insertPoint, styledText);

    // 绑定到 Frame
    if (board.children.length > childrenCountBefore) {
      const newElement = board.children[childrenCountBefore];
      if (newElement) {
        FrameTransforms.bindToFrame(board, newElement, frame);
      }
    }
  }

  // 4. 设置 pptMeta 扩展属性
  const pptMeta: PPTFrameMeta = {
    layout: pageSpec.layout,
    pageIndex,
  };
  if (pageSpec.imagePrompt) {
    pptMeta.imagePrompt = pageSpec.imagePrompt;
    pptMeta.imageStatus = 'placeholder';
  }
  if (pageSpec.notes) {
    pptMeta.notes = pageSpec.notes;
  }

  // 查找 frame 在 board.children 中的索引并设置属性
  const frameIndex = board.children.findIndex((el) => el.id === frame.id);
  if (frameIndex !== -1) {
    Transforms.setNode(board, { pptMeta } as any, [frameIndex]);
  }

  if (pageSpec.imagePrompt) {
    insertPPTImagePlaceholder(board, frame, pageSpec.imagePrompt);
  }

  return frame;
}

/**
 * 检查元素是否为 PlaitMind（思维导图根元素）
 */
export function isPlaitMind(element: unknown): element is MindElement {
  return (
    element !== null &&
    typeof element === 'object' &&
    'type' in element &&
    (element as any).type === 'mindmap' &&
    'data' in element
  );
}

/**
 * 从思维导图生成 PPT
 *
 * @param board - Plait 画布实例
 * @param mindElement - 思维导图元素（必须是根元素，即 type='mindmap'）
 * @param options - 转换选项
 * @returns 转换结果
 */
export async function generatePPTFromMindmap(
  board: PlaitBoard,
  mindElement: MindElement,
  options: MindmapToPPTOptions = {}
): Promise<MindmapToPPTResult> {
  try {
    // 1. 验证输入
    if (!isPlaitMind(mindElement)) {
      return {
        success: false,
        error: '请选择一个完整的思维导图（根节点）',
      };
    }

    // 2. 提取思维导图结构
    const rootInfo = extractMindmapStructure(mindElement);

    // 3. 验证结构
    if (!rootInfo.text && rootInfo.children.length === 0) {
      return {
        success: false,
        error: '思维导图内容为空，请先添加内容',
      };
    }

    // 4. 转换为 PPT 大纲
    const outline = convertMindmapToOutline(rootInfo, options);

    // 5. 逐页创建 Frame
    let firstFrame: PlaitFrame | null = null;
    let createdCount = 0;

    for (let i = 0; i < outline.pages.length; i++) {
      const pageSpec = outline.pages[i];
      const pageIndex = i + 1;

      // 计算 Frame 位置
      const framePosition = calcNewFramePosition(board);

      // 创建页面
      const frame = createPPTPage(board, pageSpec, pageIndex, framePosition);

      if (i === 0) {
        firstFrame = frame;
      }

      createdCount++;
    }

    // 6. 聚焦到第一个 Frame
    if (firstFrame) {
      focusOnFrame(board, firstFrame);
    }

    return {
      success: true,
      pageCount: createdCount,
    };
  } catch (error: any) {
    console.error('[MindmapToPPT] Conversion failed:', error);
    return {
      success: false,
      error: error.message || '思维导图转 PPT 失败',
    };
  }
}
