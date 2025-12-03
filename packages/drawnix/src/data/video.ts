import {
  PlaitBoard,
  Point,
  getRectangleByElements,
} from '@plait/core';
import { getInsertionPointForSelectedElements } from '../utils/selection-utils';
import { urlCacheService } from '../services/url-cache-service';

/**
 * 从保存的选中元素IDs计算插入点
 * @param board - PlaitBoard实例
 * @param videoWidth - 视频宽度,用于调整X坐标使视频居中
 * @returns 插入点坐标,如果没有保存的选中元素则返回undefined
 */
const getInsertionPointFromSavedSelection = (
  board: PlaitBoard,
  videoWidth: number
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
    console.warn('getInsertionPointFromSavedSelection (video): No elements found for saved IDs:', savedElementIds);
    return undefined;
  }

  try {
    const boundingRect = getRectangleByElements(board, elements, false);
    const centerX = boundingRect.x + boundingRect.width / 2;
    const insertionY = boundingRect.y + boundingRect.height + 50;

    console.log('getInsertionPointFromSavedSelection (video): Calculated insertion point:', {
      centerX,
      insertionY,
      boundingRect,
      videoWidth
    });

    // 将X坐标向左偏移视频宽度的一半，让视频以中心点对齐
    return [centerX - videoWidth / 2, insertionY] as Point;
  } catch (error) {
    console.warn('getInsertionPointFromSavedSelection (video): Error calculating insertion point:', error);
    return undefined;
  }
};

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
// 防止重复调用的缓存
const dimensionsCache = new Map<string, Promise<VideoDimensions>>();

export const getVideoDimensions = (videoUrl: string): Promise<VideoDimensions> => {
  // 检查缓存
  if (dimensionsCache.has(videoUrl)) {
    return dimensionsCache.get(videoUrl)!;
  }
  
  const promise = new Promise<VideoDimensions>((resolve) => {
    const video = document.createElement('video');
    // Remove crossOrigin to avoid CORS issues with external video URLs
    // video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    
    // 设置超时时间，防止长时间等待
    const timeout = setTimeout(() => {
      console.warn('Video dimensions loading timeout for:', videoUrl);
      video.src = '';
      
      // 从缓存中移除超时的URL
      dimensionsCache.delete(videoUrl);
      
      // 超时时返回默认尺寸而不是抛出错误
      resolve({
        width: 400,
        height: 225
      });
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
        
        console.warn('Failed to get video dimensions, using defaults:', error);
        // 从缓存中移除失败的URL
        dimensionsCache.delete(videoUrl);
        
        // 使用默认尺寸而不是抛出错误
        resolve({
          width: 400,
          height: 225
        });
      }
    };
    
    video.onerror = (error) => {
      clearTimeout(timeout);
      console.warn('Failed to load video metadata for dimensions:', error);
      
      // 从缓存中移除失败的URL
      dimensionsCache.delete(videoUrl);
      
      // 如果视频加载失败，返回默认尺寸而不是抛出错误
      resolve({
        width: 400,
        height: 225
      });
    };
    
    // 开始加载视频元数据
    video.src = videoUrl;
  });
  
  // 将Promise添加到缓存
  dimensionsCache.set(videoUrl, promise);
  return promise;
};

/**
 * 计算适合画板显示的视频尺寸
 * 保持宽高比，但限制最大尺寸避免过大
 */
const calculateDisplayDimensions = (
  originalWidth: number,
  originalHeight: number,
  referenceDimensions?: { width: number; height: number }
): VideoDimensions => {
  if (referenceDimensions) {
    // 如果提供了参考尺寸，使用参考尺寸作为目标大小
    // 保持视频的宽高比，适配参考尺寸
    const referenceAspectRatio = referenceDimensions.width / referenceDimensions.height;
    const videoAspectRatio = originalWidth / originalHeight;

    let width, height;
    if (videoAspectRatio > referenceAspectRatio) {
      // 视频更宽，以宽度为准
      width = referenceDimensions.width;
      height = width / videoAspectRatio;
    } else {
      // 视频更高，以高度为准
      height = referenceDimensions.height;
      width = height * videoAspectRatio;
    }

    console.log('Using reference dimensions for video sizing:', {
      reference: referenceDimensions,
      calculated: { width: Math.round(width), height: Math.round(height) },
      originalAspectRatio: videoAspectRatio
    });

    return {
      width: Math.round(width),
      height: Math.round(height)
    };
  } else {
    // 如果没有参考尺寸，使用固定的最大尺寸限制
    const MAX_SIZE = 600; // 最大宽度或高度限制

    // 如果尺寸在限制内，直接使用原始尺寸
    if (originalWidth <= MAX_SIZE && originalHeight <= MAX_SIZE) {
      return {
        width: originalWidth,
        height: originalHeight
      };
    }

    // 计算缩放比例，保持宽高比
    const widthScale = MAX_SIZE / originalWidth;
    const heightScale = MAX_SIZE / originalHeight;
    const scale = Math.min(widthScale, heightScale);

    return {
      width: Math.round(originalWidth * scale),
      height: Math.round(originalHeight * scale)
    };
  }
};

/**
 * 插入视频到画布（作为带视频元数据的图片元素）
 * @param board PlaitBoard实例
 * @param videoUrl 视频URL
 * @param startPoint 插入位置（可选）
 * @param isDrop 是否为拖拽操作
 * @param referenceDimensions 参考尺寸（可选，用于适应选中元素的大小）
 */
export const insertVideoFromUrl = async (
  board: PlaitBoard | null,
  videoUrl: string,
  startPoint?: Point,
  isDrop?: boolean,
  referenceDimensions?: { width: number; height: number }
) => {
  if (!board) {
    throw new Error('Board is required for video insertion');
  }

  try {
    // 首先获取视频的真实尺寸
    console.log('Getting video dimensions for:', videoUrl);
    const originalDimensions = await getVideoDimensions(videoUrl);
    console.log('Original video dimensions:', originalDimensions);

    // 计算适合画板显示的尺寸（保持比例但使用参考尺寸或限制大小）
    const displayDimensions = calculateDisplayDimensions(
      originalDimensions.width,
      originalDimensions.height,
      referenceDimensions
    );
    console.log('Display dimensions after scaling:', displayDimensions);

    // 使用缓存服务下载并缓存视频
    // 视频文件较大，存储 Blob 而不是 Base64
    // 使用 ObjectURL 作为视频源
    const { objectUrl } = await urlCacheService.getVideoAsBlob(videoUrl);
    console.log('Video cached, using ObjectURL:', objectUrl.substring(0, 50));

    // 计算插入位置
    let insertionPoint = startPoint;

    // 如果提供了起始点(startPoint),它应该是选中元素的中心点
    // 需要将X坐标向左偏移视频宽度的一半,让视频以中心点对齐
    if (insertionPoint && !isDrop) {
      insertionPoint = [insertionPoint[0] - displayDimensions.width / 2, insertionPoint[1]] as Point;
      console.log('insertVideoFromUrl: Adjusted insertion point for video centering:', insertionPoint);
    } else if (!startPoint && !isDrop) {
      // 没有提供起始点时,优先使用保存的选中元素IDs计算插入位置
      insertionPoint = getInsertionPointFromSavedSelection(board, displayDimensions.width);

      // 如果没有保存的选中元素,回退到使用当前选中元素(向后兼容)
      if (!insertionPoint) {
        const calculatedPoint = getInsertionPointForSelectedElements(board);
        if (calculatedPoint) {
          // 调整X坐标，让视频以计算点为中心左右居中显示
          insertionPoint = [calculatedPoint[0] - displayDimensions.width / 2, calculatedPoint[1]] as Point;
        }
      }
    }

    // 如果没有计算出插入位置，使用默认位置
    if (!insertionPoint) {
      insertionPoint = [100, 100] as Point;
    }

    console.log('Inserting video element with display dimensions:', displayDimensions, 'at point:', insertionPoint);

    // 使用图片元素，通过URL后缀识别为视频
    // 注意：使用 ObjectURL 在页面刷新后会失效
    // 但视频数据已缓存到 IndexedDB，后续可以实现从缓存恢复的逻辑
    // 在 ObjectURL 后面添加 #video 标识符
    // 因为 DrawTransforms.insertImage 可能不会保留自定义属性（如 isVideo）
    // 通过 URL hash 来标识视频元素是最可靠的方式
    const videoAsImageElement = {
      url: `${objectUrl}#video`,
      width: displayDimensions.width,
      height: displayDimensions.height,
      // 存储原始 URL 以便后续从缓存恢复
      originalUrl: videoUrl,
      // 显式标识为视频，因为 ObjectURL 没有扩展名无法通过后缀识别
      isVideo: true,
    };

    console.log('Creating video as image element:', videoAsImageElement);

    // 使用DrawTransforms插入，但保留视频标识
    const { DrawTransforms } = await import('@plait/draw');
    DrawTransforms.insertImage(board, videoAsImageElement, insertionPoint);
    console.log('Video inserted successfully with scaled dimensions:', displayDimensions);

  } catch (error) {
    console.error('Failed to insert video:', error);
    throw new Error(`Video insertion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};