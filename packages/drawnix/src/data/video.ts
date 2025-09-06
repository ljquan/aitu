import {
  getHitElementByPoint,
  getSelectedElements,
  PlaitBoard,
  Point,
} from '@plait/core';
import { DrawTransforms } from '@plait/draw';
import { getInsertionPointForSelectedElements } from '../utils/selection-utils';

/**
 * 获取视频真实尺寸的接口
 */
export interface VideoDimensions {
  width: number;
  height: number;
}

/**
 * 获取视频的真实尺寸
 * @param videoUrl 视频URL
 * @returns Promise<VideoDimensions> 视频的宽度和高度
 */
export const getVideoDimensions = (videoUrl: string): Promise<VideoDimensions> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    
    // 设置超时时间，防止长时间等待
    const timeout = setTimeout(() => {
      video.src = '';
      reject(new Error('Video dimensions loading timeout'));
    }, 10000); // 10秒超时
    
    video.onloadedmetadata = () => {
      clearTimeout(timeout);
      try {
        const dimensions: VideoDimensions = {
          width: video.videoWidth || 400, // 如果无法获取宽度，使用默认值
          height: video.videoHeight || 225 // 如果无法获取高度，使用默认值
        };
        
        console.log('Retrieved video dimensions:', dimensions, 'for URL:', videoUrl);
        
        // 清理视频元素
        video.src = '';
        video.load();
        
        resolve(dimensions);
      } catch (error) {
        clearTimeout(timeout);
        video.src = '';
        reject(error);
      }
    };
    
    video.onerror = (error) => {
      clearTimeout(timeout);
      console.warn('Failed to load video metadata for dimensions:', error);
      video.src = '';
      
      // 如果视频加载失败，返回默认尺寸而不是抛出错误
      resolve({
        width: 400,
        height: 225
      });
    };
    
    // 开始加载视频元数据
    video.src = videoUrl;
  });
};

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

  try {
    // 首先获取视频的真实尺寸
    console.log('Getting video dimensions for:', videoUrl);
    const dimensions = await getVideoDimensions(videoUrl);
    console.log('Video dimensions retrieved:', dimensions);

    // 计算插入位置
    let insertionPoint = startPoint;
    if (!startPoint && !isDrop) {
      const calculatedPoint = getInsertionPointForSelectedElements(board);
      if (calculatedPoint) {
        // 调整X坐标，让视频以计算点为中心左右居中显示
        insertionPoint = [calculatedPoint[0] - dimensions.width / 2, calculatedPoint[1]] as Point;
      }
    } else if (startPoint) {
      // 如果传入了具体的插入点，需要判断这个点是否已经是期望的左上角位置
      // 从AI视频生成对话框传入的点是中心点，需要调整为左上角位置
      insertionPoint = [startPoint[0] - dimensions.width / 2, startPoint[1]] as Point;
    }

    // 如果没有计算出插入位置，使用默认位置
    if (!insertionPoint) {
      insertionPoint = [100, 100] as Point;
    }
    
    console.log('Inserting video as image element with real dimensions:', dimensions, 'at point:', insertionPoint);
    
    // 使用图片插入但添加视频标识属性，使用真实尺寸
    const videoAsImageElement = {
      url: videoUrl,
      width: dimensions.width,
      height: dimensions.height,
      // 添加自定义属性来标识这是视频
      videoType: 'video/mp4',
      isVideo: true,
    };
    
    DrawTransforms.insertImage(board, videoAsImageElement, insertionPoint);
    console.log('Video inserted successfully as image element with real dimensions:', dimensions);
    
  } catch (error) {
    console.error('Failed to insert video:', error);
    throw new Error(`Video insertion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};