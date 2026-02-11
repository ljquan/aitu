/**
 * Frame 内部插入工具
 *
 * 将生成的图片/视频插入到 Frame 内部，缩放到 Frame 尺寸，
 * 并自动绑定到 Frame（设置 frameId）。
 */

import type { PlaitBoard, Point } from '@plait/core';
import { RectangleClient, Transforms, idCreator } from '@plait/core';
import { isFrameElement, type PlaitFrame } from '../types/frame.types';
import { FrameTransforms } from '../plugins/with-frame';
import { getImageRegion } from '../services/ppt';

const PPT_PLACEHOLDER_IMAGE_URL =
  'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

type PPTImageStatus = 'placeholder' | 'loading' | 'generated';

export function findPPTImagePlaceholder(
  board: PlaitBoard,
  frameId: string
): { element: any; index: number } | null {
  const index = board.children.findIndex(
    (el: any) => el?.pptImagePlaceholder && el?.frameId === frameId
  );
  if (index === -1) return null;
  return { element: board.children[index] as any, index };
}

export function setFramePPTImageStatus(
  board: PlaitBoard,
  frameId: string,
  status: PPTImageStatus
): void {
  const frameIndex = board.children.findIndex(
    (el) => el.id === frameId && isFrameElement(el)
  );
  if (frameIndex === -1) return;

  const frame = board.children[frameIndex] as PlaitFrame & { pptMeta?: any };
  const nextMeta = {
    ...(frame.pptMeta || {}),
    imageStatus: status,
  };
  Transforms.setNode(board, { pptMeta: nextMeta } as any, [frameIndex]);
}

export function setPPTImagePlaceholderStatus(
  board: PlaitBoard,
  frameId: string,
  status: PPTImageStatus
): void {
  const hit = findPPTImagePlaceholder(board, frameId);
  if (!hit) return;
  Transforms.setNode(board, { pptImageStatus: status } as any, [hit.index]);
}

export function removePPTImagePlaceholder(board: PlaitBoard, frameId: string): void {
  const hit = findPPTImagePlaceholder(board, frameId);
  if (!hit) return;
  Transforms.removeNodes(board, { at: [hit.index] });
}

export function insertPPTImagePlaceholder(
  board: PlaitBoard,
  frame: PlaitFrame,
  imagePrompt: string
): void {
  if (!imagePrompt) return;
  if (findPPTImagePlaceholder(board, frame.id)) return;

  const frameRect = RectangleClient.getRectangleByPoints(frame.points);
  const imageRegion = getImageRegion({
    x: frameRect.x,
    y: frameRect.y,
    width: frameRect.width,
    height: frameRect.height,
  });

  const startPoint: Point = [imageRegion.x, imageRegion.y];
  const endPoint: Point = [imageRegion.x + imageRegion.width, imageRegion.y + imageRegion.height];

  const placeholderElement = {
    id: idCreator(),
    type: 'image',
    points: [startPoint, endPoint],
    url: PPT_PLACEHOLDER_IMAGE_URL,
    frameId: frame.id,
    pptImagePlaceholder: true,
    pptImageStatus: 'placeholder' as PPTImageStatus,
    pptImagePrompt: imagePrompt,
  } as any;

  Transforms.insertNode(board, placeholderElement, [board.children.length]);
}

/**
 * 将图片/视频插入到指定 Frame 内部
 *
 * 行为：
 * 1. 查找目标 Frame，获取其矩形区域
 * 2. 计算媒体应该占据的尺寸（contain 模式等比缩放适配目标区域）
 * 3. 将媒体居中放置在目标区域内
 * 4. 插入后绑定到 Frame（设置 frameId）
 *
 * @param board - PlaitBoard 实例
 * @param mediaUrl - 媒体 URL
 * @param mediaType - 'image' | 'video'
 * @param frameId - 目标 Frame 的 ID
 * @param frameDimensions - Frame 的宽高（用于缩放媒体）
 * @param mediaDimensions - 实际媒体的宽高（用于等比缩放，缺省则填满目标区域）
 * @param targetRegion - 可选的目标插入区域（世界坐标），不指定则使用整个 Frame
 */
export async function insertMediaIntoFrame(
  board: PlaitBoard,
  mediaUrl: string,
  mediaType: 'image' | 'video',
  frameId: string,
  frameDimensions: { width: number; height: number },
  mediaDimensions?: { width: number; height: number },
  targetRegion?: { x: number; y: number; width: number; height: number }
): Promise<void> {
  // 查找目标 Frame
  const frameElement = board.children.find(
    (el) => el.id === frameId && isFrameElement(el)
  ) as PlaitFrame | undefined;

  if (!frameElement) {
    console.warn(
      '[insertMediaIntoFrame] Frame not found, falling back to normal insertion:',
      frameId
    );
    // Frame 不存在，回退到普通插入
    if (mediaType === 'video') {
      const { insertVideoFromUrl } = await import('../data/video');
      await insertVideoFromUrl(board, mediaUrl);
    } else {
      const { insertImageFromUrl } = await import('../data/image');
      await insertImageFromUrl(board, mediaUrl);
    }
    return;
  }

  const frameRect = RectangleClient.getRectangleByPoints(frameElement.points);

  // 确定目标区域：优先使用指定的 targetRegion，否则使用整个 Frame
  const region = targetRegion ?? {
    x: frameRect.x,
    y: frameRect.y,
    width: frameRect.width,
    height: frameRect.height,
  };
  const regionDimensions = { width: region.width, height: region.height };

  // 使用 contain 模式等比缩放：媒体完整显示在目标区域内，保持宽高比
  let mediaWidth: number;
  let mediaHeight: number;

  if (mediaDimensions && mediaDimensions.width > 0 && mediaDimensions.height > 0) {
    const mediaAspect = mediaDimensions.width / mediaDimensions.height;
    const regionAspect = regionDimensions.width / regionDimensions.height;

    if (mediaAspect > regionAspect) {
      mediaWidth = regionDimensions.width;
      mediaHeight = regionDimensions.width / mediaAspect;
    } else {
      mediaHeight = regionDimensions.height;
      mediaWidth = regionDimensions.height * mediaAspect;
    }
  } else {
    mediaWidth = regionDimensions.width;
    mediaHeight = regionDimensions.height;
  }

  // 居中放置在目标区域内
  const insertX = region.x + (region.width - mediaWidth) / 2;
  const insertY = region.y + (region.height - mediaHeight) / 2;
  const insertionPoint: Point = [insertX, insertY];

  // 记录插入前的 children 数量，用于找到新插入的元素
  const childrenCountBefore = board.children.length;

  if (mediaType === 'video') {
    const { insertVideoFromUrl } = await import('../data/video');
    await insertVideoFromUrl(
      board,
      mediaUrl,
      insertionPoint,
      false,
      { width: mediaWidth, height: mediaHeight },
      true, // skipScroll
      true // skipCentering（insertionPoint 已经是左上角坐标）
    );
  } else {
    const { insertImageFromUrl } = await import('../data/image');
    await insertImageFromUrl(
      board,
      mediaUrl,
      insertionPoint,
      false,
      { width: mediaWidth, height: mediaHeight },
      true, // skipScroll
      true // skipImageLoad（使用 Frame 尺寸立即插入）
    );
  }

  // 查找新插入的元素并绑定到 Frame
  if (board.children.length > childrenCountBefore) {
    const newElement = board.children[childrenCountBefore];
    if (newElement) {
      FrameTransforms.bindToFrame(board, newElement, frameElement);
    }
  }
}
