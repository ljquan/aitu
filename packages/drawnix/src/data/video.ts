import {
  getHitElementByPoint,
  getSelectedElements,
  PlaitBoard,
  Point,
} from '@plait/core';
import { DrawTransforms } from '@plait/draw';
import { getInsertionPointForSelectedElements } from '../utils/selection-utils';

/**
 * 插入视频到画布（作为带视频元数据的图片元素）
 * @param board PlaitBoard实例
 * @param videoUrl 视频URL
 * @param startPoint 插入位置（可选）
 * @param isDrop 是否为拖拽操作
 */
export const insertVideoFromUrl = async (
  board: PlaitBoard | null,
  videoUrl: string,
  startPoint?: Point,
  isDrop?: boolean
) => {
  if (!board) {
    throw new Error('Board is required for video insertion');
  }

  // 计算插入位置
  let insertionPoint = startPoint;
  if (!startPoint && !isDrop) {
    const calculatedPoint = getInsertionPointForSelectedElements(board);
    if (calculatedPoint) {
      // 调整X坐标，让视频以计算点为中心左右居中显示
      insertionPoint = [calculatedPoint[0] - 200, calculatedPoint[1]] as Point; // 400px width / 2 = 200px
    }
  }

  // 如果没有计算出插入位置，使用默认位置
  if (!insertionPoint) {
    insertionPoint = [100, 100] as Point;
  }
  
  try {
    console.log('Inserting video as image element with video metadata:', videoUrl, 'at point:', insertionPoint);
    
    // 使用图片插入但添加视频标识属性
    // 这样可以在未来需要时轻松识别和处理视频元素
    const videoAsImageElement = {
      url: videoUrl,
      width: 400,
      height: 225,
      // 添加自定义属性来标识这是视频
      videoType: 'video/mp4',
      isVideo: true,
    };
    
    DrawTransforms.insertImage(board, videoAsImageElement, insertionPoint);
    console.log('Video inserted successfully as image element with video metadata');
    
  } catch (error) {
    console.error('Failed to insert video:', error);
    throw new Error(`Video insertion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};