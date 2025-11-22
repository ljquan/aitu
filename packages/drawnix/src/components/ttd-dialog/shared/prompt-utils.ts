import { getImagePrompts, getVideoPrompts, type Language } from '../../../constants/prompts';
import {
  type ImageHistoryItem,
  type VideoHistoryItem
} from '../../generation-history';
import { PRESET_PROMPTS_LIMIT, USER_PROMPTS_LIMIT } from './size-constants';

export type PromptType = 'image' | 'video';
export type HistoryItem = ImageHistoryItem | VideoHistoryItem;

/**
 * 从历史记录中提取用户使用过的提示词（去重，最新的在前）
 */
function extractUserPromptsFromHistory(historyItems: HistoryItem[]): string[] {
  return historyItems
    .map(item => item.prompt.trim())
    .filter(prompt => prompt.length > 0)
    .filter((prompt, index, arr) => arr.indexOf(prompt) === index); // 去重
}

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

  // 提取用户历史提示词
  const userPrompts = extractUserPromptsFromHistory(historyItems).slice(0, USER_PROMPTS_LIMIT);

  // 合并：用户历史提示词在前，默认预设在后，总数不超过限制
  const merged = [...userPrompts, ...defaultPrompts]
    .filter((prompt, index, arr) => arr.indexOf(prompt) === index) // 再次去重，避免用户历史与默认重复
    .slice(0, PRESET_PROMPTS_LIMIT); // 限制总数

  return merged;
};

/**
 * 保存提示词到历史记录（去重）
 * 注意：现在提示词会随任务自动保存，此函数保留为空实现以保持兼容性
 */
export const savePromptToHistory = (type: PromptType, promptText: string, dimensions?: { width: number; height: number }) => {
  // 不再需要手动保存，提示词会随任务自动保存到任务队列
  // 保留此函数以避免破坏现有调用
};