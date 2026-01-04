import {
  getHitElementByPoint,
  getSelectedElements,
  getRectangleByElements,
  PlaitBoard,
  Point,
} from '@plait/core';
import { DataURL } from '../types';
import { getDataURL } from './blob';
import { MindElement, MindTransforms } from '@plait/mind';
import { DrawTransforms } from '@plait/draw';
import { getElementOfFocusedImage } from '@plait/common';
import { getInsertionPointForSelectedElements, getInsertionPointBelowBottommostElement, scrollToPointIfNeeded } from '../utils/selection-utils';
import { urlCacheService } from '../services/url-cache-service';

/**
 * 从保存的选中元素IDs计算插入点
 * @param board - PlaitBoard实例
 * @param imageWidth - 图片宽度,用于调整X坐标使图片居中
 * @returns 插入点坐标,如果没有保存的选中元素则返回undefined
 */
const getInsertionPointFromSavedSelection = (
  board: PlaitBoard,
  imageWidth: number
): Point | undefined => {
  const appState = (board as any).appState;
  const savedElementIds = appState?.lastSelectedElementIds || [];

  if (savedElementIds.length === 0) {
    return undefined;
  }

  // 查找对应的元素
  const elements = savedElementIds
    .map((id: string) => board.children.find((el: any) => el.id === id))
    .filter(Boolean);

  if (elements.length === 0) {
    console.warn(
      'getInsertionPointFromSavedSelection: No elements found for saved IDs:',
      savedElementIds
    );
    return undefined;
  }

  try {
    const boundingRect = getRectangleByElements(board, elements, false);
    const centerX = boundingRect.x + boundingRect.width / 2;
    const insertionY = boundingRect.y + boundingRect.height + 50;

    console.log(
      'getInsertionPointFromSavedSelection: Calculated insertion point:',
      {
        centerX,
        insertionY,
        boundingRect,
        imageWidth,
      }
    );

    // 将X坐标向左偏移图片宽度的一半，让图片以中心点对齐
    return [centerX - imageWidth / 2, insertionY] as Point;
  } catch (error) {
    console.warn(
      'getInsertionPointFromSavedSelection: Error calculating insertion point:',
      error
    );
    return undefined;
  }
};

export const loadHTMLImageElement = (dataURL: DataURL, crossOrigin = false) => {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    if (crossOrigin) {
      image.crossOrigin = 'anonymous';
    }
    image.onload = () => {
      resolve(image);
    };
    image.onerror = (error) => {
      reject(error);
    };
    image.src = dataURL;
  });
};

export const buildImage = (
  image: HTMLImageElement,
  dataURL: DataURL,
  maxWidth?: number,
  useOriginalSize = false,
  referenceDimensions?: { width: number; height: number }
) => {
  let width, height;

  if (useOriginalSize) {
    const originalWidth = image.width;
    const originalHeight = image.height;

    if (referenceDimensions) {
      // 如果提供了参考尺寸，使用参考尺寸作为目标大小
      // 保持图片的宽高比，适配参考尺寸
      const referenceAspectRatio =
        referenceDimensions.width / referenceDimensions.height;
      const imageAspectRatio = originalWidth / originalHeight;

      if (imageAspectRatio > referenceAspectRatio) {
        // 图片更宽，以宽度为准
        width = referenceDimensions.width;
        height = width / imageAspectRatio;
      } else {
        // 图片更高，以高度为准
        height = referenceDimensions.height;
        width = height * imageAspectRatio;
      }

      console.log('Using reference dimensions for image sizing:', {
        reference: referenceDimensions,
        calculated: { width, height },
        originalAspectRatio: imageAspectRatio,
      });
    } else {
      // 如果没有参考尺寸，使用固定的最大尺寸限制
      const MAX_SIZE = 600; // 最大宽度或高度限制

      // 计算缩放比例，保持宽高比
      if (originalWidth > MAX_SIZE || originalHeight > MAX_SIZE) {
        const widthScale = MAX_SIZE / originalWidth;
        const heightScale = MAX_SIZE / originalHeight;
        const scale = Math.min(widthScale, heightScale);

        width = originalWidth * scale;
        height = originalHeight * scale;
      } else {
        // 如果尺寸在限制内，使用原始尺寸
        width = originalWidth;
        height = originalHeight;
      }
    }
  } else {
    // 使用限制最大宽度的逻辑（保持向后兼容）
    const effectiveMaxWidth = maxWidth || 400;
    width = image.width > effectiveMaxWidth ? effectiveMaxWidth : image.width;
    height = (width / image.width) * image.height;
  }

  return {
    url: dataURL,
    width,
    height,
  };
};

export const insertImage = async (
  board: PlaitBoard,
  imageFile: File,
  startPoint?: Point,
  isDrop?: boolean
) => {
  // 只有在没有提供startPoint时,才获取当前选中元素
  // 当从文件选择器上传时,已经没有选中状态了,不应该依赖当前选中
  const selectedElement = startPoint
    ? null
    : getSelectedElements(board)[0] || getElementOfFocusedImage(board);
  const defaultImageWidth = selectedElement ? 240 : 400;
  const dataURL = await getDataURL(imageFile);
  const image = await loadHTMLImageElement(dataURL);
  const imageItem = buildImage(image, dataURL, defaultImageWidth);
  const element = startPoint && getHitElementByPoint(board, startPoint);

  if (isDrop && element && MindElement.isMindElement(board, element)) {
    MindTransforms.setImage(board, element as MindElement, imageItem);
    return;
  }

  if (
    selectedElement &&
    MindElement.isMindElement(board, selectedElement) &&
    !isDrop
  ) {
    MindTransforms.setImage(board, selectedElement as MindElement, imageItem);
  } else {
    // If no startPoint is provided, use saved selection for insertion point calculation
    let insertionPoint = startPoint;
    if (!startPoint && !isDrop) {
      // 优先使用保存的选中元素IDs计算插入位置
      insertionPoint = getInsertionPointFromSavedSelection(
        board,
        imageItem.width
      );

      // 如果没有保存的选中元素,回退到使用当前选中元素
      if (!insertionPoint) {
        const calculatedPoint = getInsertionPointForSelectedElements(board);
        if (calculatedPoint) {
          // 图片插入位置应该在所有选中元素垂直居中对齐
          // 将X坐标向左偏移图片宽度的一半，让图片以计算点为中心显示
          insertionPoint = [
            calculatedPoint[0] - imageItem.width / 2,
            calculatedPoint[1],
          ] as Point;
        } else {
          // 如果没有选中元素,在最下方元素的下方插入
          insertionPoint = getInsertionPointBelowBottommostElement(board, imageItem.width);
        }
      }
    }

    DrawTransforms.insertImage(board, imageItem, insertionPoint);

    // 插入后滚动视口到新元素位置（如果不在视口内）
    if (insertionPoint && !isDrop) {
      // 计算图片中心点位置用于滚动
      const centerPoint: Point = [
        insertionPoint[0] + imageItem.width / 2,
        insertionPoint[1] + imageItem.height / 2,
      ];
      // 使用 requestAnimationFrame 确保 DOM 更新后再滚动
      requestAnimationFrame(() => {
        scrollToPointIfNeeded(board, centerPoint);
      });
    }
  }
};

export const insertImageFromUrl = async (
  board: PlaitBoard,
  imageUrl: string,
  startPoint?: Point,
  isDrop?: boolean,
  referenceDimensions?: { width: number; height: number },
  skipScroll?: boolean
) => {
  // 只有在没有提供startPoint和referenceDimensions时,才获取当前选中元素
  // 当从AI生成对话框调用时,已经传入了这些参数,不应该依赖当前选中状态
  const selectedElement =
    !startPoint && !referenceDimensions
      ? getSelectedElements(board)[0] || getElementOfFocusedImage(board)
      : null;
  const defaultImageWidth = selectedElement ? 240 : 400;

  // 使用缓存服务获取图片的 Base64 数据
  // 这样可以避免重复下载，并且存储 Base64 确保 URL 过期后图片仍然可用
  const dataURL = await urlCacheService.getImageAsBase64(imageUrl);
  const image = await loadHTMLImageElement(dataURL, false); // Base64 不需要 crossOrigin
  const imageItem = buildImage(
    image,
    dataURL,
    defaultImageWidth,
    true,
    referenceDimensions
  ); // 使用原始尺寸并传递参考尺寸

  const element = startPoint && getHitElementByPoint(board, startPoint);
  if (isDrop && element && MindElement.isMindElement(board, element)) {
    MindTransforms.setImage(board, element as MindElement, imageItem);
    return;
  }

  // 处理插入点逻辑
  let insertionPoint: Point | undefined = startPoint;

  // 只有在没有提供startPoint时才自动计算插入位置
  if (!startPoint && !isDrop) {
    // 优先使用保存的选中元素IDs计算插入位置
    insertionPoint = getInsertionPointFromSavedSelection(board, imageItem.width);

    // 如果没有保存的选中元素,回退到使用当前选中元素(向后兼容)
    if (!insertionPoint) {
      const calculatedPoint = getInsertionPointForSelectedElements(board);
      if (calculatedPoint) {
        // 图片插入位置应该在所有选中元素垂直居中对齐
        // 将X坐标向左偏移图片宽度的一半，让图片以计算点为中心显示
        insertionPoint = [
          calculatedPoint[0] - imageItem.width / 2,
          calculatedPoint[1],
        ] as Point;
      } else {
        // 如果没有选中元素,在最下方元素的下方插入
        insertionPoint = getInsertionPointBelowBottommostElement(board, imageItem.width);
      }
    }
  }

  DrawTransforms.insertImage(board, imageItem, insertionPoint);

  // 插入后滚动视口到新元素位置（如果不在视口内）
  // skipScroll 用于批量插入场景，由上层统一处理滚动
  if (insertionPoint && !isDrop && !skipScroll) {
    // 计算图片中心点位置用于滚动
    const centerPoint: Point = [
      insertionPoint[0] + imageItem.width / 2,
      insertionPoint[1] + imageItem.height / 2,
    ];
    // 使用 requestAnimationFrame 确保 DOM 更新后再滚动
    requestAnimationFrame(() => {
      scrollToPointIfNeeded(board, centerPoint);
    });
  }
};
