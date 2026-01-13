import { getImagePrompts, getVideoPrompts, type Language } from '../../../constants/prompts';
import {
  type ImageHistoryItem,
  type VideoHistoryItem
} from '../../generation-history';
import {
  addVideoPromptHistory,
  addImagePromptHistory,
  getVideoPromptHistoryContents,
  getImagePromptHistoryContents,
} from '../../../services/prompt-storage-service';
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
 *
 * 会合并三个来源：
 * 1. 本地存储的描述历史（提交时立即保存）
 * 2. 任务队列中已完成任务的提示词
 * 3. 默认预设提示词
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

  // 提取用户历史提示词（来自任务队列的已完成任务）
  const taskQueuePrompts = extractUserPromptsFromHistory(historyItems);

  // 获取本地存储的历史记录
  const localStoragePrompts = type === 'video'
    ? getVideoPromptHistoryContents()
    : getImagePromptHistoryContents();

  // 合并所有来源的提示词（本地存储优先，因为包含最新提交的）
  // 顺序：本地存储历史 -> 任务队列历史 -> 默认预设
  const allUserPrompts = [...localStoragePrompts, ...taskQueuePrompts]
    .filter((prompt, index, arr) => arr.indexOf(prompt) === index) // 去重
    .slice(0, USER_PROMPTS_LIMIT);

  // 合并：用户历史提示词在前，默认预设在后，总数不超过限制
  const merged = [...allUserPrompts, ...defaultPrompts]
    .filter((prompt, index, arr) => arr.indexOf(prompt) === index) // 再次去重，避免用户历史与默认重复
    .slice(0, PRESET_PROMPTS_LIMIT); // 限制总数

  return merged;
};

/**
 * 保存提示词到历史记录（去重）
 *
 * 会立即保存到本地存储，这样即使任务还在执行中，
 * 用户也可以在预设列表中看到刚刚使用的提示词。
 */
export const savePromptToHistory = (type: PromptType, promptText: string, dimensions?: { width: number; height: number }) => {
  if (!promptText || !promptText.trim()) return;

  if (type === 'video') {
    addVideoPromptHistory(promptText.trim());
  } else {
    addImagePromptHistory(promptText.trim());
  }
};
