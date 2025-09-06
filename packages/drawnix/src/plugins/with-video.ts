import { PlaitBoard, PlaitElement, Transforms } from '@plait/core';
import { DrawTransforms } from '@plait/draw';

/**
 * 为 PlaitBoard 添加视频支持的插件
 * 处理带有视频元数据的图片元素，并转换遗留的video类型元素
 */
export const withVideo = (board: PlaitBoard) => {
  const { onChange } = board;
  
  // 重写onChange来拦截和转换遗留的video类型元素
  board.onChange = () => {
    // 检查是否有video类型的元素需要转换
    const videoElements = board.children.filter((element: any) => 
      element.type === 'video'
    );
    
    if (videoElements.length > 0) {
      console.log('Found legacy video elements, converting to image elements:', videoElements.length);
      
      // 转换每个video元素为image元素
      videoElements.forEach((videoElement: any, index: number) => {
        try {
          const elementIndex = board.children.findIndex((el: any) => el === videoElement);
          if (elementIndex >= 0) {
            // 创建对应的图片元素
            const imageElement = {
              ...videoElement,
              type: 'image',
              isVideo: true,
              videoType: 'video/mp4',
            };
            delete (imageElement as any).poster; // 移除可能存在的poster字段
            
            // 替换元素
            Transforms.setNode(board, imageElement, [elementIndex]);
          }
        } catch (error) {
          console.error('Failed to convert video element to image:', error);
        }
      });
    }
    
    // 继续原有的onChange处理
    onChange();
  };
  
  console.log('Video plugin initialized with legacy element conversion support');
  
  return board;
};

/**
 * 检查元素是否为视频类型（包括标记为视频的图片元素）
 */
export function isVideoElement(element: any): boolean {
  return element.type === 'video' || (element.type === 'image' && element.isVideo === true);
}

/**
 * 为视频元素添加特殊处理逻辑
 */
export function handleVideoElementClick(element: any, event: MouseEvent) {
  if (isVideoElement(element)) {
    // 阻止默认行为
    event.preventDefault();
    event.stopPropagation();
    
    // 在新窗口打开视频
    if (element.url) {
      window.open(element.url, '_blank');
      return true;
    }
  }
  return false;
}