import { PlaitBoard, Transforms } from '@plait/core';

/**
 * 为 PlaitBoard 添加视频支持的插件
 * 自动转换遗留的video类型元素为image+标识模式
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
      console.log('Found video elements, converting to image+identifier format:', videoElements.length);
      
      // 转换每个video元素为image+标识元素
      videoElements.forEach((videoElement: any) => {
        try {
          const elementIndex = board.children.findIndex((el: any) => el === videoElement);
          if (elementIndex >= 0) {
            // 创建对应的图片元素，通过URL后缀识别为视频
            const imageElement = {
              ...videoElement,
              type: 'image', // 改为image类型，通过URL后缀识别为视频
            };
            
            // 移除可能存在的poster字段
            delete (imageElement as any).poster;
            
            console.log('Converting video element to image+identifier:', {
              from: videoElement,
              to: imageElement
            });
            
            // 替换元素
            Transforms.setNode(board, imageElement, [elementIndex]);
          }
        } catch (error) {
          console.error('Failed to convert video element to image+identifier:', error);
        }
      });
    }
    
    // 继续原有的onChange处理
    onChange();
  };
  
  console.log('Video plugin initialized with legacy video element conversion');
  return board;
};

/**
 * 检查元素是否为视频类型
 * 通过URL标识符、扩展名或元数据判断
 */
export function isVideoElement(element: any): boolean {
  if (!element || !element.url) {
    return false;
  }

  // 检查是否有视频标识属性
  if (element.isVideo === true || element.videoType) {
    return true;
  }

  const url = element.url.toLowerCase();

  // 检查 URL hash 标识符（用于 ObjectURL 的视频识别）
  // 格式：blob:http://...#video
  if (url.includes('#video')) {
    return true;
  }

  // 检查URL扩展名（用于普通 URL 的视频识别）
  const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.flv', '.wmv'];
  return videoExtensions.some(ext => url.includes(ext));
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