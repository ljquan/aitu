import { ImageHistoryItem, VideoHistoryItem, HistoryItem } from './generation-history';

// 图片历史记录缓存key
export const IMAGE_HISTORY_CACHE_KEY = 'ai_image_generation_history';

// 视频历史记录缓存key  
export const VIDEO_HISTORY_CACHE_KEY = 'ai_video_generation_history';

/**
 * 保存历史记录到localStorage
 */
export const saveToHistory = <T extends HistoryItem>(item: T, cacheKey: string): void => {
  try {
    const existing = loadHistory<T>(cacheKey);
    // 添加新项目到开头，并限制最多保存50个
    const updated = [item, ...existing.filter(h => h.id !== item.id)].slice(0, 50);
    localStorage.setItem(cacheKey, JSON.stringify(updated));
  } catch (error) {
    console.warn('Failed to save history:', error);
  }
};

/**
 * 从localStorage加载历史记录
 */
export const loadHistory = <T extends HistoryItem>(cacheKey: string): T[] => {
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const data = JSON.parse(cached) as T[];
      // 过滤掉超过7天的记录
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      return data.filter(item => item.timestamp > weekAgo);
    }
  } catch (error) {
    console.warn('Failed to load history:', error);
  }
  return [];
};

/**
 * 保存图片历史记录
 */
export const saveImageToHistory = (item: Omit<ImageHistoryItem, 'type'>): void => {
  const imageItem: ImageHistoryItem = {
    ...item,
    type: 'image'
  };
  saveToHistory(imageItem, IMAGE_HISTORY_CACHE_KEY);
};

/**
 * 保存视频历史记录
 */
export const saveVideoToHistory = (item: Omit<VideoHistoryItem, 'type'>): void => {
  const videoItem: VideoHistoryItem = {
    ...item,
    type: 'video'
  };
  saveToHistory(videoItem, VIDEO_HISTORY_CACHE_KEY);
};

/**
 * 加载图片历史记录（包含旧数据迁移）
 */
export const loadImageHistory = (): ImageHistoryItem[] => {
  try {
    const cached = localStorage.getItem(IMAGE_HISTORY_CACHE_KEY);
    if (cached) {
      const data = JSON.parse(cached) as any[];
      // 过滤掉超过7天的记录
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const validItems = data.filter(item => item.timestamp > weekAgo);
      
      // 迁移旧数据格式到新格式
      return validItems.map((item: any): ImageHistoryItem => {
        return {
          ...item,
          type: 'image' // 确保所有图片历史都有正确的 type 字段
        } as ImageHistoryItem;
      });
    }
  } catch (error) {
    console.warn('Failed to load image history:', error);
  }
  return [];
};

/**
 * 加载视频历史记录（包含旧数据迁移）
 */
export const loadVideoHistory = (): VideoHistoryItem[] => {
  try {
    const cached = localStorage.getItem(VIDEO_HISTORY_CACHE_KEY);
    if (cached) {
      const data = JSON.parse(cached) as any[];
      // 过滤掉超过7天的记录
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const validItems = data.filter(item => item.timestamp > weekAgo);
      
      // 迁移旧数据格式到新格式
      return validItems.map((item: any): VideoHistoryItem => {
        // 如果是旧格式（没有 imageUrl 字段）
        if (!item.imageUrl && (item.thumbnail || item.previewUrl)) {
          return {
            ...item,
            type: 'video',
            imageUrl: item.thumbnail || item.previewUrl, // 使用缩略图或预览URL
            width: item.width || 400,   // 默认尺寸
            height: item.height || 225, // 默认尺寸
            previewUrl: item.previewUrl || item.videoUrls?.previewUrl || '',
            downloadUrl: item.downloadUrl || item.videoUrls?.downloadUrl
          };
        }
        // 如果已经是新格式
        return {
          ...item,
          type: 'video'
        } as VideoHistoryItem;
      });
    }
  } catch (error) {
    console.warn('Failed to load video history:', error);
  }
  return [];
};

/**
 * 生成唯一ID
 */
export const generateHistoryId = (): string => {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * 从历史记录中提取用户使用过的提示词（去重，最新的在前）
 */
export const extractUserPromptsFromHistory = (historyItems: HistoryItem[]): string[] => {
  return historyItems
    .map(item => item.prompt.trim())
    .filter(prompt => prompt.length > 0)
    .filter((prompt, index, arr) => arr.indexOf(prompt) === index); // 去重
};