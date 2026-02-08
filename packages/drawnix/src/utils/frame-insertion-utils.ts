/**
 * Frame 内部插入工具
 *
 * 将生成的图片/视频插入到 Frame 内部，缩放到 Frame 尺寸，
 * 并自动绑定到 Frame（设置 frameId）。
 */

import type { PlaitBoard, Point } from '@plait/core';
import { RectangleClient } from '@plait/core';
import { isFrameElement, type PlaitFrame } from '../types/frame.types';
import { FrameTransforms } from '../plugins/with-frame';

/**
 * 将图片/视频插入到指定 Frame 内部
 *
 * 行为：
 * 1. 查找目标 Frame，获取其矩形区域
 * 2. 计算媒体应该占据的尺寸（contain 模式等比缩放适配 Frame）
 * 3. 将媒体居中放置在 Frame 内
 * 4. 插入后绑定到 Frame（设置 frameId）
 *
 * @param board - PlaitBoard 实例
 * @param mediaUrl - 媒体 URL
 * @param mediaType - 'image' | 'video'
 * @param frameId - 目标 Frame 的 ID
 * @param frameDimensions - Frame 的宽高（用于缩放媒体）
 * @param mediaDimensions - 实际媒体的宽高（用于等比缩放，缺省则填满 Frame）
 */
export async function insertMediaIntoFrame(
  board: PlaitBoard,
  mediaUrl: string,
  mediaType: 'image' | 'video',
  frameId: string,
  frameDimensions: { width: number; height: number },
  mediaDimensions?: { width: number; height: number }
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

  // 使用 contain 模式等比缩放：媒体完整显示在 Frame 内，保持宽高比
  let mediaWidth: number;
  let mediaHeight: number;

  if (mediaDimensions && mediaDimensions.width > 0 && mediaDimensions.height > 0) {
    const mediaAspect = mediaDimensions.width / mediaDimensions.height;
    const frameAspect = frameDimensions.width / frameDimensions.height;

    if (mediaAspect > frameAspect) {
      // 媒体更宽，以 Frame 宽度为基准
      mediaWidth = frameDimensions.width;
      mediaHeight = frameDimensions.width / mediaAspect;
    } else {
      // 媒体更高或相同比例，以 Frame 高度为基准
      mediaHeight = frameDimensions.height;
      mediaWidth = frameDimensions.height * mediaAspect;
    }
  } else {
    // 无媒体尺寸信息，回退到填满 Frame
    mediaWidth = frameDimensions.width;
    mediaHeight = frameDimensions.height;
  }

  // 居中放置在 Frame 内
  const insertX = frameRect.x + (frameRect.width - mediaWidth) / 2;
  const insertY = frameRect.y + (frameRect.height - mediaHeight) / 2;
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
