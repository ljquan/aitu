import { PlaitBoard, PlaitElement, getRectangleByElements, Point } from '@plait/core';
import { DrawTransforms } from '@plait/draw';

/**
 * 将视频帧图片插入到指定视频元素的底下
 * @param board PlaitBoard实例  
 * @param videoElement 视频元素
 * @param frameImageDataUrl 帧图片的data URL
 * @param timestamp 帧的时间戳（秒）
 */
export const insertVideoFrame = async (
  board: PlaitBoard,
  videoElement: PlaitElement,
  frameImageDataUrl: string,
  timestamp: number
): Promise<void> => {
  if (!board || !videoElement) {
    throw new Error('Board and video element are required');
  }
  
  try {
    // 获取视频元素的位置和尺寸
    const videoRect = getRectangleByElements(board, [videoElement], false);
    
    // 计算插入位置：视频底下，左对齐，间距20px
    const insertionPoint: Point = [
      videoRect.x, // 左对齐
      videoRect.y + videoRect.height + 20 // 底下20px间距
    ];
    
    console.log('Inserting video frame at position:', insertionPoint, 'timestamp:', timestamp);
    
    // 将data URL转换为对象，准备插入
    const frameImageElement = {
      url: frameImageDataUrl,
      width: Math.min(videoRect.width, 400), // 限制最大宽度为400或视频宽度
      height: Math.min(videoRect.width * 0.5625, 225), // 保持16:9比例，限制最大高度
      // 添加自定义属性标识这是视频帧
      isVideoFrame: true,
      videoTimestamp: timestamp,
      sourceVideoId: (videoElement as any).id || 'unknown',
    };
    
    // 插入图片元素
    DrawTransforms.insertImage(board, frameImageElement, insertionPoint);
    
    console.log('Video frame inserted successfully');
    
  } catch (error) {
    console.error('Failed to insert video frame:', error);
    throw new Error(`Video frame insertion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * 格式化时间戳为可读字符串
 * @param timestamp 时间戳（秒）
 * @returns 格式化的时间字符串 (mm:ss.s)
 */
export const formatTimestamp = (timestamp: number): string => {
  const minutes = Math.floor(timestamp / 60);
  const seconds = (timestamp % 60).toFixed(1);
  return `${minutes}:${seconds.padStart(4, '0')}`;
};