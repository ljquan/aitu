/**
 * Prompt Storage Service
 * 
 * 管理用户自定义的提示词设置（置顶、删除）
 * 使用 localStorage 进行持久化存储
 */

const STORAGE_KEY = 'aitu-prompt-settings';

export interface PromptSettings {
  /** 置顶的提示词列表（按置顶顺序排列） */
  pinnedPrompts: string[];
  /** 已删除的提示词列表 */
  deletedPrompts: string[];
}

export type PromptType = 'image' | 'video';

interface StorageData {
  image: PromptSettings;
  video: PromptSettings;
}

const defaultSettings: PromptSettings = {
  pinnedPrompts: [],
  deletedPrompts: [],
};

class PromptStorageService {
  private data: StorageData | null = null;

  private loadData(): StorageData {
    if (this.data) return this.data;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.data = JSON.parse(stored);
        return this.data!;
      }
    } catch (error) {
      console.warn('[PromptStorageService] Failed to load data:', error);
    }

    this.data = {
      image: { ...defaultSettings },
      video: { ...defaultSettings },
    };
    return this.data;
  }

  private saveData(): void {
    if (!this.data) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (error) {
      console.warn('[PromptStorageService] Failed to save data:', error);
    }
  }

  /**
   * 获取指定类型的提示词设置
   */
  getSettings(type: PromptType): PromptSettings {
    const data = this.loadData();
    return data[type] || { ...defaultSettings };
  }

  /**
   * 置顶提示词
   */
  pinPrompt(type: PromptType, prompt: string): void {
    const data = this.loadData();
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
    
    this.saveData();
  }

  /**
   * 取消置顶提示词
   */
  unpinPrompt(type: PromptType, prompt: string): void {
    const data = this.loadData();
    const settings = data[type];
    
    const index = settings.pinnedPrompts.indexOf(prompt);
    if (index > -1) {
      settings.pinnedPrompts.splice(index, 1);
      this.saveData();
    }
  }

  /**
   * 检查提示词是否已置顶
   */
  isPinned(type: PromptType, prompt: string): boolean {
    const settings = this.getSettings(type);
    return settings.pinnedPrompts.includes(prompt);
  }

  /**
   * 删除提示词（从显示列表中隐藏）
   */
  deletePrompt(type: PromptType, prompt: string): void {
    const data = this.loadData();
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
    
    this.saveData();
  }

  /**
   * 恢复已删除的提示词
   */
  restorePrompt(type: PromptType, prompt: string): void {
    const data = this.loadData();
    const settings = data[type];
    
    const index = settings.deletedPrompts.indexOf(prompt);
    if (index > -1) {
      settings.deletedPrompts.splice(index, 1);
      this.saveData();
    }
  }

  /**
   * 检查提示词是否已删除
   */
  isDeleted(type: PromptType, prompt: string): boolean {
    const settings = this.getSettings(type);
    return settings.deletedPrompts.includes(prompt);
  }

  /**
   * 对提示词列表进行排序（置顶的在前，已删除的过滤掉）
   */
  sortPrompts(type: PromptType, prompts: string[]): string[] {
    const settings = this.getSettings(type);
    
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
   * 清除所有设置
   */
  clearAll(): void {
    this.data = {
      image: { ...defaultSettings },
      video: { ...defaultSettings },
    };
    this.saveData();
  }
}

export const promptStorageService = new PromptStorageService();
