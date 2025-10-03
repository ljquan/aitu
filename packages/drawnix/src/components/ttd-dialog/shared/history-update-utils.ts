import { 
  ImageHistoryItem, 
  VideoHistoryItem, 
  saveImageToHistory, 
  saveVideoToHistory,
  loadImageHistory,
  loadVideoHistory,
  generateHistoryId
} from '../../generation-history';
import { HISTORY_LIMIT } from './size-constants';

export type UpdateHistoryParams = {
  type: 'image' | 'video';
  prompt: string;
  url: string;
  dimensions: { width: number; height: number };
  additionalData?: {
    previewUrl?: string;
    downloadUrl?: string;
  };
};

/**
 * 更新历史记录，添加生成的内容信息
 */
export const updateHistoryWithGeneratedContent = (
  params: UpdateHistoryParams,
  setHistoryItems: (updater: (prev: any[]) => any[]) => void
) => {
  const { type, prompt, url, dimensions, additionalData } = params;

  if (type === 'image') {
    // 更新图片历史记录
    const existingHistory = loadImageHistory();
    const existingIndex = existingHistory.findIndex(item => item.prompt.trim() === prompt.trim());
    
    if (existingIndex >= 0) {
      // 如果找到了相同提示词的记录，更新它的图片信息
      const updatedItem = {
        ...existingHistory[existingIndex],
        imageUrl: url,
        timestamp: Date.now(), // 更新时间戳
        width: dimensions.width,
        height: dimensions.height
      };
      
      // 更新历史记录
      saveImageToHistory(updatedItem);
      
      // 更新历史列表状态
      const updatedHistoryItem: ImageHistoryItem = { ...updatedItem, type: 'image' };
      setHistoryItems(prev => [updatedHistoryItem, ...prev.filter(h => h.id !== updatedItem.id)].slice(0, HISTORY_LIMIT));
    } else {
      // 如果没有找到，创建新记录
      const historyItem: Omit<ImageHistoryItem, 'type'> = {
        id: generateHistoryId(),
        prompt,
        imageUrl: url,
        timestamp: Date.now(),
        width: dimensions.width,
        height: dimensions.height
      };
      saveImageToHistory(historyItem);
      
      // 更新历史列表状态
      const newHistoryItem: ImageHistoryItem = { ...historyItem, type: 'image' };
      setHistoryItems(prev => [newHistoryItem, ...prev.filter(h => h.id !== historyItem.id)].slice(0, HISTORY_LIMIT));
    }
  } else {
    // 更新视频历史记录
    const existingHistory = loadVideoHistory();
    const existingIndex = existingHistory.findIndex(item => item.prompt.trim() === prompt.trim());
    
    if (existingIndex >= 0) {
      // 如果找到了相同提示词的记录，更新它的视频信息
      const updatedItem = {
        ...existingHistory[existingIndex],
        imageUrl: url, // 缩略图URL
        timestamp: Date.now(),
        width: dimensions.width,
        height: dimensions.height,
        previewUrl: additionalData?.previewUrl || url,
        downloadUrl: additionalData?.downloadUrl || url
      };
      
      saveVideoToHistory(updatedItem);
      
      // 更新历史列表状态
      const updatedHistoryItem: VideoHistoryItem = { ...updatedItem, type: 'video' };
      setHistoryItems(prev => [updatedHistoryItem, ...prev.filter(h => h.id !== updatedItem.id)].slice(0, HISTORY_LIMIT));
    } else {
      // 如果没有找到，创建新记录
      const historyItem: Omit<VideoHistoryItem, 'type'> = {
        id: generateHistoryId(),
        prompt,
        imageUrl: url, // 缩略图URL
        timestamp: Date.now(),
        width: dimensions.width,
        height: dimensions.height,
        previewUrl: additionalData?.previewUrl || url,
        downloadUrl: additionalData?.downloadUrl || url
      };
      saveVideoToHistory(historyItem);
      
      // 更新历史列表状态
      const newHistoryItem: VideoHistoryItem = { ...historyItem, type: 'video' };
      setHistoryItems(prev => [newHistoryItem, ...prev.filter(h => h.id !== historyItem.id)].slice(0, HISTORY_LIMIT));
    }
  }
};