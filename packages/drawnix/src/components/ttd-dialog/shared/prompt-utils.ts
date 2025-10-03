import { getImagePrompts, getVideoPrompts, type Language } from '../../../constants/prompts';
import { 
  extractUserPromptsFromHistory, 
  type ImageHistoryItem, 
  type VideoHistoryItem,
  saveImageToHistory,
  saveVideoToHistory,
  loadImageHistory,
  loadVideoHistory,
  generateHistoryId
} from '../../generation-history';
import { DEFAULT_IMAGE_DIMENSIONS, DEFAULT_VIDEO_DIMENSIONS, PRESET_PROMPTS_LIMIT, USER_PROMPTS_LIMIT } from './size-constants';

export type PromptType = 'image' | 'video';
export type HistoryItem = ImageHistoryItem | VideoHistoryItem;

/**
 * 获取合并的预设提示词（用户历史 + 默认预设）
 */
export const getMergedPresetPrompts = (
  type: PromptType,
  language: Language,
  historyItems: HistoryItem[]
) => {
  // 获取默认预设提示词
  const defaultPrompts = type === 'image' 
    ? getImagePrompts(language) 
    : getVideoPrompts(language);

  // 使用工具函数提取用户历史提示词
  const userPrompts = extractUserPromptsFromHistory(historyItems).slice(0, USER_PROMPTS_LIMIT);

  // 合并：用户历史提示词在前，默认预设在后，总数不超过限制
  const merged = [...userPrompts, ...defaultPrompts]
    .filter((prompt, index, arr) => arr.indexOf(prompt) === index) // 再次去重，避免用户历史与默认重复
    .slice(0, PRESET_PROMPTS_LIMIT); // 限制总数

  return merged;
};

/**
 * 保存提示词到历史记录（去重）
 */
export const savePromptToHistory = (type: PromptType, promptText: string, dimensions?: { width: number; height: number }) => {
  if (!promptText.trim()) return;

  // 获取现有的历史记录
  const existingHistory = type === 'image' ? loadImageHistory() : loadVideoHistory();
  
  // 检查是否已存在相同的提示词
  const isDuplicate = existingHistory.some(item => item.prompt.trim() === promptText.trim());
  
  if (!isDuplicate) {
    if (type === 'image') {
      // 创建一个临时的图片历史项目，只用于保存提示词
      const promptHistoryItem: Omit<ImageHistoryItem, 'type'> = {
        id: generateHistoryId(),
        prompt: promptText.trim(),
        imageUrl: '', // 暂时为空
        timestamp: Date.now(),
        width: dimensions?.width ?? DEFAULT_IMAGE_DIMENSIONS.width,
        height: dimensions?.height ?? DEFAULT_IMAGE_DIMENSIONS.height
      };
      
      console.log('Saving image prompt to history:', promptText);
      saveImageToHistory(promptHistoryItem);
    } else {
      // 创建一个临时的视频历史项目，只用于保存提示词
      const promptHistoryItem: Omit<VideoHistoryItem, 'type'> = {
        id: generateHistoryId(),
        prompt: promptText.trim(),
        imageUrl: '', // 暂时为空
        timestamp: Date.now(),
        width: DEFAULT_VIDEO_DIMENSIONS.width,
        height: DEFAULT_VIDEO_DIMENSIONS.height,
        previewUrl: '',
        downloadUrl: ''
      };
      
      console.log('Saving video prompt to history:', promptText);
      saveVideoToHistory(promptHistoryItem);
    }
  } else {
    console.log('Prompt already exists in history, skipping:', promptText);
  }
};