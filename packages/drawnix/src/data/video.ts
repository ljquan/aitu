import {
  getHitElementByPoint,
  getSelectedElements,
  PlaitBoard,
  Point,
} from '@plait/core';
import { DrawTransforms } from '@plait/draw';
import { getInsertionPointForSelectedElements } from '../utils/selection-utils';

/**
 * 插入视频到画布
 * @param board PlaitBoard实例
 * @param videoUrl 视频URL
 * @param startPoint 插入位置（可选）
 * @param isDrop 是否为拖拽操作
 */
export const insertVideoFromUrl = async (
  board: PlaitBoard,
  videoUrl: string,
  startPoint?: Point,
  isDrop?: boolean
) => {
  // 创建视频元素对象
  const videoElement = {
    url: videoUrl,
    width: 400, // 默认宽度
    height: 225, // 默认高度 (16:9比例)
  };
  
  // 计算插入位置
  let insertionPoint = startPoint;
  if (!startPoint && !isDrop) {
    const calculatedPoint = getInsertionPointForSelectedElements(board);
    if (calculatedPoint) {
      // 调整X坐标，让视频以计算点为中心左右居中显示
      insertionPoint = [calculatedPoint[0] - videoElement.width / 2, calculatedPoint[1]] as Point;
    }
  }
  
  // 检查Plait是否支持视频插入
  if (DrawTransforms && (DrawTransforms as any).insertVideo) {
    // 如果有专门的视频插入方法
    (DrawTransforms as any).insertVideo(board, videoElement, insertionPoint);
  } else if (DrawTransforms && (DrawTransforms as any).insertMedia) {
    // 如果有通用的媒体插入方法
    (DrawTransforms as any).insertMedia(board, { ...videoElement, type: 'video' }, insertionPoint);
  } else {
    // 作为图片插入（兜底方案）
    console.warn('Video insertion not supported, falling back to image insertion');
    const imageItem = {
      url: videoUrl,
      width: videoElement.width,
      height: videoElement.height,
    };
    DrawTransforms.insertImage(board, imageItem, insertionPoint);
  }
};