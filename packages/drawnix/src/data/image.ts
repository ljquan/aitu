import {
  getHitElementByPoint,
  getSelectedElements,
  getRectangleByElements,
  PlaitBoard,
  Point,
  addSelectedElement,
  clearSelectedElement,
} from '@plait/core';
import { DataURL } from '../types';
import { getDataURL } from './blob';
import { MindElement, MindTransforms } from '@plait/mind';
import { DrawTransforms } from '@plait/draw';
import { getElementOfFocusedImage } from '@plait/common';
import { getInsertionPointForSelectedElements, getInsertionPointBelowBottommostElement, scrollToPointIfNeeded } from '../utils/selection-utils';
import { assetStorageService } from '../services/asset-storage-service';

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

    // console.log(
    //   'getInsertionPointFromSavedSelection: Calculated insertion point:',
    //   {
    //     centerX,
    //     insertionY,
    //     boundingRect,
    //     imageWidth,
    //   }
    // );

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

/**
 * 添加 bypass_sw 参数到 URL，跳过 Service Worker 拦截
 */
function addBypassSWParam(url: string): string {
  try {
    const urlObj = new URL(url, window.location.origin);
    if (!urlObj.searchParams.has('bypass_sw')) {
      urlObj.searchParams.set('bypass_sw', '1');
    }
    return urlObj.toString();
  } catch {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}bypass_sw=1`;
  }
}

/**
 * 带重试和绕过 SW 功能的图片加载
 * 
 * @param dataURL - 图片 URL
 * @param crossOrigin - 是否设置 crossOrigin
 * @param maxRetries - 最大重试次数（默认 3）
 * @param bypassSWAfterRetries - 多少次重试后绕过 SW（默认 1）
 */
export const loadHTMLImageElementWithRetry = (
  dataURL: DataURL,
  crossOrigin = false,
  maxRetries = 3,
  bypassSWAfterRetries = 1
): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    let retryCount = 0;
    let currentUrl = dataURL;
    let bypassSW = false;

    const tryLoad = () => {
      const image = new Image();
      if (crossOrigin) {
        image.crossOrigin = 'anonymous';
      }

      image.onload = () => {
        resolve(image);
      };

      image.onerror = (error) => {
        retryCount++;
        
        if (retryCount <= maxRetries) {
          // 检查是否应该绕过 SW
          if (retryCount >= bypassSWAfterRetries && !bypassSW) {
            bypassSW = true;
            currentUrl = addBypassSWParam(dataURL) as DataURL;
            // console.log(`[loadHTMLImageElement] 重试 ${retryCount} 次后绕过 SW:`, dataURL);
          }
          
          // 添加时间戳强制刷新
          const separator = currentUrl.includes('?') ? '&' : '?';
          const retryUrl = `${currentUrl}${separator}_retry=${Date.now()}`;
          
          // 延迟重试（指数退避）
          const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 5000);
          // console.log(`[loadHTMLImageElement] 重试 ${retryCount}/${maxRetries}，延迟 ${delay}ms:`, dataURL);
          
          setTimeout(() => {
            image.src = retryUrl;
          }, delay);
        } else {
          console.error(`[loadHTMLImageElement] 加载失败，已重试 ${maxRetries} 次:`, dataURL);
          reject(error);
        }
      };

      image.src = currentUrl;
    };

    tryLoad();
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

      // console.log('Using reference dimensions for image sizing:', {
      //   reference: referenceDimensions,
      //   calculated: { width, height },
      //   originalAspectRatio: imageAspectRatio,
      // });
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
  
  // 先读取图片数据用于获取尺寸
  const dataURL = await getDataURL(imageFile);
  const image = await loadHTMLImageElement(dataURL);
  
  // 将图片存入素材库获取虚拟 URL
  let imageUrl: string = dataURL;
  try {
    await assetStorageService.initialize();
    const { virtualUrl } = await assetStorageService.storeBase64AsAsset(
      dataURL,
      imageFile.name
    );
    imageUrl = virtualUrl;
  } catch (err) {
    console.warn('[insertImage] Failed to store asset, using base64:', err);
    // 失败时回退到使用 base64
  }
  
  // 使用虚拟 URL 构建 imageItem
  const imageItem = buildImage(image, imageUrl as DataURL, defaultImageWidth);
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
  skipScroll?: boolean,
  skipImageLoad?: boolean // 如果为 true 且提供了 referenceDimensions，则跳过图片加载直接使用提供的尺寸
) => {
  // console.log(`[insertImageFromUrl] Called with:`, {
  //   imageUrl: imageUrl?.substring(0, 80),
  //   startPoint,
  //   isDrop,
  //   referenceDimensions,
  //   skipScroll,
  //   skipImageLoad,
  //   boardExists: !!board,
  // });

  // 只有在没有提供startPoint和referenceDimensions时,才获取当前选中元素
  // 当从AI生成对话框调用时,已经传入了这些参数,不应该依赖当前选中状态
  const selectedElement =
    !startPoint && !referenceDimensions
      ? getSelectedElements(board)[0] || getElementOfFocusedImage(board)
      : null;
  const defaultImageWidth = selectedElement ? 240 : 400;

  let imageItem: { url: DataURL; width: number; height: number };

  // 如果允许跳过图片加载且提供了参考尺寸，直接使用参考尺寸构建 imageItem
  // 这样可以立即插入图片到画布，不需要等待图片下载完成
  if (skipImageLoad && referenceDimensions) {
    imageItem = {
      url: imageUrl as DataURL,
      width: referenceDimensions.width,
      height: referenceDimensions.height,
    };
    // console.log(`[insertImageFromUrl] Using provided dimensions:`, imageItem);
  } else {
    // 使用带重试的图片加载函数，支持自动绕过 SW
    // console.log(`[insertImageFromUrl] Loading image with retry...`);
    const image = await loadHTMLImageElementWithRetry(imageUrl as DataURL, true); // 使用 crossOrigin 以支持外部 URL
    imageItem = buildImage(
      image,
      imageUrl as DataURL,
      defaultImageWidth,
      true,
      referenceDimensions
    ); // 使用原始尺寸并传递参考尺寸
    // console.log(`[insertImageFromUrl] Image loaded, imageItem:`, imageItem);
  }

  const element = startPoint && getHitElementByPoint(board, startPoint);
  if (isDrop && element && MindElement.isMindElement(board, element)) {
    MindTransforms.setImage(board, element as MindElement, imageItem);
    // console.log(`[insertImageFromUrl] Set image to MindElement`);
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

  // console.log(`[insertImageFromUrl] Final insertionPoint:`, insertionPoint);
  // console.log(`[insertImageFromUrl] Calling DrawTransforms.insertImage...`);
  DrawTransforms.insertImage(board, imageItem, insertionPoint);
  // console.log(`[insertImageFromUrl] DrawTransforms.insertImage completed`);

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

/**
 * 使用 img 标签直接加载图片（不需要 CORS）
 * 仅用于获取图片尺寸
 */
const loadImageDirectly = (imageUrl: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // 不设置 crossOrigin，这样可以加载不支持 CORS 的图片
    image.onload = () => resolve(image);
    image.onerror = (error) => reject(error);
    image.src = imageUrl;
  });
};

/**
 * 从 URL 插入图片到画布并选中
 * 用于从工具 iframe 拖拽图片到画布的场景
 * 直接使用 img 标签加载图片获取尺寸，避免 CORS 问题
 */
export const insertImageFromUrlAndSelect = async (
  board: PlaitBoard,
  imageUrl: string,
  startPoint: Point,
  referenceDimensions?: { width: number; height: number }
): Promise<void> => {
  const childrenCountBefore = board.children.length;
  const defaultImageWidth = 400;

  let image: HTMLImageElement;

  try {
    // 使用直接加载方式获取图片尺寸（不需要 CORS）
    // 图片会使用原始 URL 存储，浏览器渲染 <img> 标签时不需要 CORS
    // console.log('[insertImageFromUrlAndSelect] Loading image directly:', imageUrl);
    image = await loadImageDirectly(imageUrl);
    // console.log('[insertImageFromUrlAndSelect] Load successful, dimensions:', image.width, 'x', image.height);
  } catch (error) {
    console.error('[insertImageFromUrlAndSelect] Failed to load image:', error);
    throw new Error('无法加载图片，请检查图片 URL 是否有效');
  }

  const imageItem = buildImage(
    image,
    imageUrl as DataURL,
    defaultImageWidth,
    true,
    referenceDimensions
  );

  // 检查是否拖放到 MindElement 上
  const element = getHitElementByPoint(board, startPoint);
  if (element && MindElement.isMindElement(board, element)) {
    MindTransforms.setImage(board, element as MindElement, imageItem);
    return;
  }

  // 插入图片
  DrawTransforms.insertImage(board, imageItem, startPoint);

  // 选中新插入的图片元素
  const newElement = board.children[childrenCountBefore];
  if (newElement) {
    clearSelectedElement(board);
    addSelectedElement(board, newElement);
  }
};
