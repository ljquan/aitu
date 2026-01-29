import { getSelectedElements, PlaitBoard } from '@plait/core';
import { base64ToBlob, download } from '@aitu/utils';
import { boardToImage } from './common';
import { fileOpen } from '../data/filesystem';
import { IMAGE_MIME_TYPES } from '../constants';
import { insertImage } from '../data/image';

/**
 * 加载图片获取其自然尺寸（带超时机制）
 * @param url 图片 URL
 * @param fallbackWidth 加载失败时的回退宽度
 * @param fallbackHeight 加载失败时的回退高度
 * @param timeout 超时时间（毫秒），默认 5000ms
 */
export async function getImageNaturalSize(
  url: string,
  fallbackWidth: number,
  fallbackHeight: number,
  timeout = 5000
): Promise<{ width: number; height: number }> {
  const img = new Image();
  
  await Promise.race([
    new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve(); // 失败时使用 fallback
      img.src = url;
    }),
    new Promise<void>((resolve) => setTimeout(resolve, timeout))
  ]);
  
  const width = img.naturalWidth || fallbackWidth;
  const height = img.naturalHeight || fallbackHeight;
  
  // 防止除零错误
  return {
    width: width > 0 ? width : fallbackWidth,
    height: height > 0 ? height : fallbackHeight,
  };
}

/**
 * 计算图片编辑后的新尺寸和位置
 * 保持原图的缩放比例，左上角位置不变
 */
export interface ImageElementInfo {
  url: string;
  width?: number;
  height?: number;
  points: [[number, number], [number, number]];
}

export interface ScaledImageResult {
  newPoints: [[number, number], [number, number]];
  scale: number;
}

export async function calculateEditedImagePoints(
  element: ImageElementInfo,
  newNaturalWidth: number,
  newNaturalHeight: number
): Promise<ScaledImageResult> {
  const [start, end] = element.points;
  const originalDisplayWidth = end[0] - start[0];
  const originalDisplayHeight = end[1] - start[1];
  
  // 获取原图的实际尺寸
  let originalNaturalWidth = element.width;
  let originalNaturalHeight = element.height;
  
  if (!originalNaturalWidth || !originalNaturalHeight) {
    const size = await getImageNaturalSize(
      element.url,
      originalDisplayWidth,
      originalDisplayHeight
    );
    originalNaturalWidth = size.width;
    originalNaturalHeight = size.height;
  }
  
  // 计算原图的缩放比例
  const scaleX = originalDisplayWidth / originalNaturalWidth;
  const scaleY = originalDisplayHeight / originalNaturalHeight;
  // 使用较小的缩放比例保持宽高比一致
  const scale = Math.min(scaleX, scaleY);
  
  // 计算新的显示尺寸
  const newDisplayWidth = newNaturalWidth * scale;
  const newDisplayHeight = newNaturalHeight * scale;
  
  return {
    newPoints: [start, [start[0] + newDisplayWidth, start[1] + newDisplayHeight]],
    scale,
  };
}

export const saveAsImage = (board: PlaitBoard, isTransparent: boolean) => {
  const selectedElements = getSelectedElements(board);
  boardToImage(board, {
    elements: selectedElements.length > 0 ? selectedElements : undefined,
    fillStyle: isTransparent ? 'transparent' : 'white',
  }).then((image) => {
    if (image) {
      const ext = isTransparent ? 'png' : 'jpg';
      const pngImage = base64ToBlob(image);
      const imageName = `drawnix-${new Date().getTime()}.${ext}`;
      download(pngImage, imageName);
    }
  });
};

export const addImage = async (board: PlaitBoard) => {
  const imageFile = await fileOpen({
    description: 'Image',
    extensions: Object.keys(
      IMAGE_MIME_TYPES
    ) as (keyof typeof IMAGE_MIME_TYPES)[],
  });
  insertImage(board, imageFile);
};
