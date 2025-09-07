import {
  getHitElementByPoint,
  getSelectedElements,
  PlaitBoard,
  Point,
} from '@plait/core';
import { DataURL } from '../types';
import { getDataURL } from './blob';
import { MindElement, MindTransforms } from '@plait/mind';
import { DrawTransforms } from '@plait/draw';
import { getElementOfFocusedImage } from '@plait/common';
import { getInsertionPointForSelectedElements } from '../utils/selection-utils';

// 辅助函数：将字符串转换为DataURL类型（用于外部URL）
const createDataURL = (url: string): DataURL => url as DataURL;

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
  useOriginalSize = false
) => {
  let width, height;
  
  if (useOriginalSize) {
    // 使用图片原始尺寸
    width = image.width;
    height = image.height;
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
  const selectedElement =
    getSelectedElements(board)[0] || getElementOfFocusedImage(board);
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
    // If no startPoint is provided and we have selected elements, use the calculated insertion point
    let insertionPoint = startPoint;
    if (!startPoint && !isDrop) {
      const calculatedPoint = getInsertionPointForSelectedElements(board);
      if (calculatedPoint) {
        // 图片插入位置应该在所有选中元素垂直居中对齐
        // 将X坐标向左偏移图片宽度的一半，让图片以计算点为中心显示
        insertionPoint = [calculatedPoint[0] - imageItem.width / 2, calculatedPoint[1]] as Point;
      }
    }
    
    DrawTransforms.insertImage(board, imageItem, insertionPoint);
  }
};

export const insertImageFromUrl = async (
  board: PlaitBoard,
  imageUrl: string,
  startPoint?: Point,
  isDrop?: boolean
) => {
  const selectedElement =
    getSelectedElements(board)[0] || getElementOfFocusedImage(board);
  const defaultImageWidth = selectedElement ? 240 : 400;
  
  // Service Worker会处理CORS问题，直接使用URL即可
  const dataURL = createDataURL(imageUrl);
  const image = await loadHTMLImageElement(dataURL, true); // 设置crossOrigin以防万一
  const imageItem = buildImage(image, dataURL, defaultImageWidth, true); // 使用原始尺寸
  
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
    // 处理插入点逻辑
    let insertionPoint = startPoint;
    if (!startPoint && !isDrop) {
      // 没有提供起始点时，使用计算的插入点
      const calculatedPoint = getInsertionPointForSelectedElements(board);
      if (calculatedPoint) {
        // 图片插入位置应该在所有选中元素垂直居中对齐
        // 将X坐标向左偏移图片宽度的一半，让图片以计算点为中心显示
        insertionPoint = [calculatedPoint[0] - imageItem.width / 2, calculatedPoint[1]] as Point;
      }
    } else if (startPoint && !isDrop) {
      // 有提供起始点时，假设这是选中元素的中心点，需要进行居中调整
      // 将X坐标向左偏移图片宽度的一半，让图片以起始点为中心显示
      insertionPoint = [startPoint[0] - imageItem.width / 2, startPoint[1]] as Point;
    }
    
    DrawTransforms.insertImage(board, imageItem, insertionPoint);
  }
};
