/**
 * Prompt Storage Service
 *
 * 管理用户历史提示词的本地存储
 * 使用 localStorage 进行持久化存储
 */

const STORAGE_KEY = 'aitu_prompt_history';
const MAX_HISTORY_COUNT = 20;

// 预设提示词设置的存储 key
const PRESET_SETTINGS_KEY = 'aitu-prompt-preset-settings';

export interface PromptHistoryItem {
  id: string;
  content: string;
  timestamp: number;
  /** 是否在有选中元素时输入的 */
  hasSelection?: boolean;
  /** 是否置顶 */
  pinned?: boolean;
}

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `prompt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 获取所有历史提示词
 * 返回排序后的列表：置顶的在前面，非置顶的按时间倒序
 */
export function getPromptHistory(): PromptHistoryItem[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const history = JSON.parse(data) as PromptHistoryItem[];
    // 排序：置顶的在前，非置顶的按时间倒序
    return history.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.timestamp - a.timestamp;
    });
  } catch (error) {
    console.error('Failed to get prompt history:', error);
    return [];
  }
}

/**
 * 添加历史提示词
 * 自动去重，新记录插入头部，限制最大数量
 * 注意：如果相同内容已被置顶，只更新时间戳，不会创建新记录
 * @param content 提示词内容
 * @param hasSelection 是否在有选中元素时输入的
 */
export function addPromptHistory(content: string, hasSelection?: boolean): void {
  if (!content || !content.trim()) return;

  const trimmedContent = content.trim();

  try {
    let history = getPromptHistory();

    // 检查是否已存在相同内容
    const existingIndex = history.findIndex(item => item.content === trimmedContent);

    if (existingIndex >= 0) {
      const existingItem = history[existingIndex];
      if (existingItem.pinned) {
        // 已置顶的提示词：只更新时间戳，保持置顶状态
        existingItem.timestamp = Date.now();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
        return;
      }
      // 未置顶的：移除旧记录，后面会添加新的
      history = history.filter(item => item.content !== trimmedContent);
    }

    // 新记录插入头部
    const newItem: PromptHistoryItem = {
      id: generateId(),
      content: trimmedContent,
      timestamp: Date.now(),
      hasSelection,
    };
    history.unshift(newItem);

    // 限制最大数量（优先保留置顶的）
    if (history.length > MAX_HISTORY_COUNT) {
      // 分离置顶和非置顶
      const pinned = history.filter(item => item.pinned);
      const unpinned = history.filter(item => !item.pinned);
      // 保留所有置顶 + 尽可能多的非置顶
      const maxUnpinned = MAX_HISTORY_COUNT - pinned.length;
      history = [...pinned, ...unpinned.slice(0, Math.max(0, maxUnpinned))];
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (error) {
    console.error('Failed to add prompt history:', error);
  }
}

/**
 * 删除指定历史提示词
 */
export function removePromptHistory(id: string): void {
  try {
    let history = getPromptHistory();
    history = history.filter(item => item.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (error) {
    console.error('Failed to remove prompt history:', error);
  }
}

/**
 * 清空所有历史提示词
 */
export function clearPromptHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear prompt history:', error);
  }
}

/**
 * 切换提示词置顶状态
 * @param id 提示词 ID
 * @returns 切换后的置顶状态
 */
export function togglePinPrompt(id: string): boolean {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return false;

    const history = JSON.parse(data) as PromptHistoryItem[];
    const item = history.find(item => item.id === id);

    if (!item) return false;

    // 切换置顶状态
    item.pinned = !item.pinned;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));

    return item.pinned;
  } catch (error) {
    console.error('Failed to toggle pin prompt:', error);
    return false;
  }
}

// ============================================
// 预设提示词设置功能（用于 AI 图片/视频生成弹窗）
// ============================================

export interface PresetPromptSettings {
  /** 置顶的提示词列表（按置顶顺序排列） */
  pinnedPrompts: string[];
  /** 已删除的提示词列表 */
  deletedPrompts: string[];
}

export type PromptType = 'image' | 'video';

interface PresetStorageData {
  image: PresetPromptSettings;
  video: PresetPromptSettings;
}

const defaultPresetSettings: PresetPromptSettings = {
  pinnedPrompts: [],
  deletedPrompts: [],
};

let presetData: PresetStorageData | null = null;

function loadPresetData(): PresetStorageData {
  if (presetData) return presetData;

  try {
    const stored = localStorage.getItem(PRESET_SETTINGS_KEY);
    if (stored) {
      presetData = JSON.parse(stored);
      return presetData!;
    }
  } catch (error) {
    console.warn('[PromptStorageService] Failed to load preset data:', error);
  }

  presetData = {
    image: { ...defaultPresetSettings },
    video: { ...defaultPresetSettings },
  };
  return presetData;
}

function savePresetData(): void {
  if (!presetData) return;
  try {
    localStorage.setItem(PRESET_SETTINGS_KEY, JSON.stringify(presetData));
  } catch (error) {
    console.warn('[PromptStorageService] Failed to save preset data:', error);
  }
}

/**
 * 获取指定类型的预设提示词设置
 */
function getPresetSettings(type: PromptType): PresetPromptSettings {
  const data = loadPresetData();
  return data[type] || { ...defaultPresetSettings };
}

/**
 * 置顶预设提示词
 */
function pinPresetPrompt(type: PromptType, prompt: string): void {
  const data = loadPresetData();
  const settings = data[type];

  // 如果已经置顶，先移除
  const index = settings.pinnedPrompts.indexOf(prompt);
  if (index > -1) {
    settings.pinnedPrompts.splice(index, 1);
  }

  // 添加到置顶列表最前面
  settings.pinnedPrompts.unshift(prompt);

  // 如果在删除列表中，移除
  const deletedIndex = settings.deletedPrompts.indexOf(prompt);
  if (deletedIndex > -1) {
    settings.deletedPrompts.splice(deletedIndex, 1);
  }

  savePresetData();
}

/**
 * 取消置顶预设提示词
 */
function unpinPresetPrompt(type: PromptType, prompt: string): void {
  const data = loadPresetData();
  const settings = data[type];

  const index = settings.pinnedPrompts.indexOf(prompt);
  if (index > -1) {
    settings.pinnedPrompts.splice(index, 1);
    savePresetData();
  }
}

/**
 * 检查预设提示词是否已置顶
 */
function isPresetPinned(type: PromptType, prompt: string): boolean {
  const settings = getPresetSettings(type);
  return settings.pinnedPrompts.includes(prompt);
}

/**
 * 删除预设提示词（从显示列表中隐藏）
 */
function deletePresetPrompt(type: PromptType, prompt: string): void {
  const data = loadPresetData();
  const settings = data[type];

  // 从置顶列表移除
  const pinnedIndex = settings.pinnedPrompts.indexOf(prompt);
  if (pinnedIndex > -1) {
    settings.pinnedPrompts.splice(pinnedIndex, 1);
  }

  // 添加到删除列表
  if (!settings.deletedPrompts.includes(prompt)) {
    settings.deletedPrompts.push(prompt);
  }

  savePresetData();
}

/**
 * 对预设提示词列表进行排序（置顶的在前，已删除的过滤掉）
 */
function sortPresetPrompts(type: PromptType, prompts: string[]): string[] {
  const settings = getPresetSettings(type);

  // 过滤掉已删除的
  const filtered = prompts.filter(p => !settings.deletedPrompts.includes(p));

  // 分离置顶和非置顶
  const pinned: string[] = [];
  const unpinned: string[] = [];

  for (const prompt of filtered) {
    if (settings.pinnedPrompts.includes(prompt)) {
      pinned.push(prompt);
    } else {
      unpinned.push(prompt);
    }
  }

  // 按置顶顺序排序
  pinned.sort((a, b) => {
    return settings.pinnedPrompts.indexOf(a) - settings.pinnedPrompts.indexOf(b);
  });

  return [...pinned, ...unpinned];
}

/**
 * 导出 prompt storage service 对象
 */
export const promptStorageService = {
  // 历史记录功能（用于 AI 输入框）
  getHistory: getPromptHistory,
  addHistory: addPromptHistory,
  removeHistory: removePromptHistory,
  clearHistory: clearPromptHistory,
  togglePin: togglePinPrompt,
  
  // 预设提示词设置功能（用于 AI 图片/视频生成弹窗）
  getPresetSettings,
  pinPrompt: pinPresetPrompt,
  unpinPrompt: unpinPresetPrompt,
  isPinned: isPresetPinned,
  deletePrompt: deletePresetPrompt,
  sortPrompts: sortPresetPrompts,
};
