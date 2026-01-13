import {
  getElementOfFocusedImage,
  isResizing,
  type PlaitImageBoard,
} from '@plait/common';
import {
  ClipboardData,
  getHitElementByPoint,
  isDragging,
  isSelectionMoving,
  PlaitBoard,
  Point,
  toHostPoint,
  toViewBoxPoint,
  WritableClipboardOperationType,
} from '@plait/core';
import { isSupportedImageFileType } from '../data/blob';
import { insertImage, insertImageFromUrlAndSelect } from '../data/image';
import { isHitImage, MindElement, ImageData } from '@plait/mind';
import { ImageViewer } from '../libs/image-viewer';

/**
 * 从 dataTransfer 中提取图片 URL
 * 支持从 iframe 拖拽图片的场景
 */
function extractImageUrlFromDataTransfer(dataTransfer: DataTransfer): string | null {
  // 尝试获取 text/uri-list（标准的 URI 列表格式）
  const uriList = dataTransfer.getData('text/uri-list');
  if (uriList) {
    // URI 列表可能包含多行，取第一个非注释行
    const urls = uriList.split('\n').filter(line => line && !line.startsWith('#'));
    if (urls.length > 0 && isImageUrl(urls[0])) {
      return urls[0].trim();
    }
  }

  // 尝试获取 text/plain（可能是图片 URL）
  const text = dataTransfer.getData('text/plain');
  if (text && isImageUrl(text.trim())) {
    return text.trim();
  }

  // 尝试获取 text/html（可能包含 img 标签）
  const html = dataTransfer.getData('text/html');
  if (html) {
    const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch && imgMatch[1]) {
      return imgMatch[1];
    }
  }

  return null;
}

/**
 * 判断 URL 是否是图片 URL
 */
function isImageUrl(url: string): boolean {
  if (!url) return false;
  
  // 检查是否是有效的 URL
  try {
    new URL(url);
  } catch {
    return false;
  }

  // 检查常见的图片扩展名
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'];
  const lowerUrl = url.toLowerCase();
  
  // 检查扩展名
  if (imageExtensions.some(ext => lowerUrl.includes(ext))) {
    return true;
  }

  // 检查常见的图片服务 URL 模式
  const imagePatterns = [
    /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?|$)/i,
    /\/image\//i,
    /\/images\//i,
    /\/img\//i,
    /\/photo\//i,
    /data:image\//i,
    /blob:/i,
  ];

  return imagePatterns.some(pattern => pattern.test(url));
}

export const withImagePlugin = (board: PlaitBoard) => {
  const newBoard = board as PlaitBoard & PlaitImageBoard;
  const { insertFragment, drop, pointerUp } = newBoard;
  const viewer = new ImageViewer({
    zoomStep: 0.3,
    minZoom: 0.1,
    maxZoom: 5,
    enableKeyboard: true,
  });

  newBoard.insertFragment = (
    clipboardData: ClipboardData | null,
    targetPoint: Point,
    operationType?: WritableClipboardOperationType
  ) => {
    if (
      clipboardData?.files?.length &&
      isSupportedImageFileType(clipboardData.files[0].type)
    ) {
      const imageFile = clipboardData.files[0];
      insertImage(board, imageFile, targetPoint, false);
      return;
    }
    insertFragment(clipboardData, targetPoint, operationType);
  };

  newBoard.drop = (event: DragEvent) => {
    // 优先处理文件拖拽
    if (event.dataTransfer?.files?.length) {
      const imageFile = event.dataTransfer.files[0];
      if (isSupportedImageFileType(imageFile.type)) {
        const point = toViewBoxPoint(
          board,
          toHostPoint(board, event.x, event.y)
        );
        insertImage(board, imageFile, point, true);
        return true;
      }
    }

    // 处理从 iframe 或其他来源拖拽的图片 URL
    if (event.dataTransfer) {
      const imageUrl = extractImageUrlFromDataTransfer(event.dataTransfer);
      if (imageUrl) {
        const point = toViewBoxPoint(
          board,
          toHostPoint(board, event.x, event.y)
        );
        // 异步插入图片并选中
        insertImageFromUrlAndSelect(board, imageUrl, point).catch(err => {
          console.error('[withImagePlugin] Failed to insert image from URL:', err);
        });
        return true;
      }
    }

    return drop(event);
  };

  newBoard.pointerUp = (event: PointerEvent) => {
    const focusMindNode = getElementOfFocusedImage(board);
    if (
      focusMindNode &&
      !isResizing(board) &&
      !isSelectionMoving(board) &&
      !isDragging(board)
    ) {
      const point = toViewBoxPoint(board, toHostPoint(board, event.x, event.y));
      const hitElement = getHitElementByPoint(board, point);
      const isHittingImage =
        hitElement &&
        MindElement.isMindElement(board, hitElement) &&
        MindElement.hasImage(hitElement) &&
        isHitImage(board, hitElement as MindElement<ImageData>, point);
      if (isHittingImage && focusMindNode === hitElement) {
        viewer.open(hitElement.data.image.url);
      }
    }
    pointerUp(event);
  };

  return newBoard;
};
