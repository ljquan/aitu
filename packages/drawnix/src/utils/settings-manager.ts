/**
 * 通用的全局设置管理器
 * 统一管理应用程序的所有配置设置
 */

// ====================================
// 类型定义
// ====================================

export interface GeminiSettings {
  apiKey: string;
  baseUrl: string;
  imageModelName?: string;
  videoModelName?: string;
}

export interface AppSettings {
  gemini: GeminiSettings;
  // 可以继续扩展其他设置
}

// 默认设置
const DEFAULT_SETTINGS: AppSettings = {
  gemini: {
    apiKey: '',
    baseUrl: 'https://api.tu-zi.com/v1',
    imageModelName: 'gemini-2.5-flash-image',
    videoModelName: 'veo3',
  },
};

// 设置变更监听器类型
type SettingsListener<T = any> = (newValue: T, oldValue: T) => void;
type AnySettingsListener = SettingsListener<any>;

// ====================================
// 设置管理器类
// ====================================

/**
 * 全局设置管理器单例
 * 提供类型安全的设置管理，支持监听器模式
 */
class SettingsManager {
  private static instance: SettingsManager;
  private settings: AppSettings;
  private listeners: Map<string, Set<AnySettingsListener>> = new Map();

  private constructor() {
    this.settings = this.loadSettings();
    this.initializeFromUrl();
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): SettingsManager {
    if (!SettingsManager.instance) {
      SettingsManager.instance = new SettingsManager();
    }
    return SettingsManager.instance;
  }

  /**
   * 从本地存储加载设置
   */
  private loadSettings(): AppSettings {
    if (typeof window === 'undefined') {
      return { ...DEFAULT_SETTINGS };
    }

    let settings = { ...DEFAULT_SETTINGS };

    try {
      const storedSettings = localStorage.getItem('drawnix_settings');
      if (storedSettings) {
        const parsedSettings = JSON.parse(storedSettings);
        settings = this.deepMerge(settings, parsedSettings);
      }
    } catch (error) {
      console.warn('Failed to load settings from localStorage:', error);
    }

    return settings;
  }

  /**
   * 从URL参数初始化设置
   */
  private initializeFromUrl(): void {
    if (typeof window === 'undefined') return;

    try {
      const urlParams = new URLSearchParams(window.location.search);
      
      // 处理settings参数
      const settingsParam = urlParams.get('settings');
      if (settingsParam) {
        const decoded = decodeURIComponent(settingsParam);
        const urlSettings = JSON.parse(decoded);
        
        if (urlSettings.key) {
          this.updateSetting('gemini.apiKey', urlSettings.key);
        }
        if (urlSettings.url) {
          this.updateSetting('gemini.baseUrl', urlSettings.url);
        }
      }

      // 处理apiKey参数
      const apiKey = urlParams.get('apiKey');
      if (apiKey) {
        this.updateSetting('gemini.apiKey', apiKey);
      }

      // 清除URL参数
      if (settingsParam || apiKey) {
        const url = new URL(window.location.href);
        url.searchParams.delete('settings');
        url.searchParams.delete('apiKey');
        window.history.replaceState({}, document.title, url.toString());
      }
    } catch (error) {
      console.warn('Failed to initialize settings from URL:', error);
    }
  }

  /**
   * 保存设置到本地存储
   */
  private saveToStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      // 使用单个 key 存储序列化的设置
      const settingsJson = JSON.stringify(this.settings);
      localStorage.setItem('drawnix_settings', settingsJson);
    } catch (error) {
      console.warn('Failed to save settings to localStorage:', error);
    }
  }

  /**
   * 获取完整设置
   */
  public getSettings(): AppSettings {
    return JSON.parse(JSON.stringify(this.settings));
  }

  /**
   * 获取特定设置值（支持点记号法）
   */
  public getSetting<T = any>(path: string): T {
    const keys = path.split('.');
    let value: any = this.settings;
    
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return undefined as T;
      }
    }
    
    return value as T;
  }

  /**
   * 更新特定设置值（支持点记号法）
   */
  public updateSetting<T = any>(path: string, newValue: T): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    
    // 获取旧值
    const oldValue = this.getSetting<T>(path);
    
    // 找到要更新的对象
    let target: any = this.settings;
    for (const key of keys) {
      if (!target[key] || typeof target[key] !== 'object') {
        target[key] = {};
      }
      target = target[key];
    }
    
    // 更新值
    target[lastKey] = newValue;
    
    // 保存到本地存储
    this.saveToStorage();
    
    // 通知监听器
    this.notifyListeners(path, newValue, oldValue);
    
    console.log(`Setting updated: ${path} =`, newValue);
  }

  /**
   * 批量更新设置
   */
  public updateSettings(updates: Partial<AppSettings>): void {
    const oldSettings = { ...this.settings };
    
    // 深度合并设置
    this.settings = this.deepMerge(this.settings, updates);
    
    // 保存到本地存储
    this.saveToStorage();
    
    // 为每个更新的路径通知监听器
    this.notifySettingsChange(oldSettings, this.settings, '');
    
    console.log('Settings batch updated:', updates);
  }

  /**
   * 深度合并对象
   */
  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  /**
   * 递归通知设置变更
   */
  private notifySettingsChange(oldObj: any, newObj: any, path: string): void {
    for (const key in newObj) {
      const currentPath = path ? `${path}.${key}` : key;
      const oldValue = oldObj?.[key];
      const newValue = newObj[key];
      
      if (oldValue !== newValue) {
        if (typeof newValue === 'object' && !Array.isArray(newValue) && newValue !== null) {
          this.notifySettingsChange(oldValue || {}, newValue, currentPath);
        } else {
          this.notifyListeners(currentPath, newValue, oldValue);
        }
      }
    }
  }

  /**
   * 通知监听器
   */
  private notifyListeners(path: string, newValue: any, oldValue: any): void {
    const listeners = this.listeners.get(path);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(newValue, oldValue);
        } catch (error) {
          console.error(`Error in settings listener for ${path}:`, error);
        }
      });
    }
  }

  /**
   * 添加设置变更监听器
   */
  public addListener<T = any>(path: string, listener: SettingsListener<T>): void {
    if (!this.listeners.has(path)) {
      this.listeners.set(path, new Set());
    }
    this.listeners.get(path)!.add(listener as AnySettingsListener);
  }

  /**
   * 移除设置变更监听器
   */
  public removeListener<T = any>(path: string, listener: SettingsListener<T>): void {
    const listeners = this.listeners.get(path);
    if (listeners) {
      listeners.delete(listener as AnySettingsListener);
      if (listeners.size === 0) {
        this.listeners.delete(path);
      }
    }
  }

  /**
   * 重置设置为默认值
   */
  public resetSettings(): void {
    const oldSettings = { ...this.settings };
    this.settings = { ...DEFAULT_SETTINGS };
    this.saveToStorage();
    this.notifySettingsChange(oldSettings, this.settings, '');
    console.log('Settings reset to default');
  }

  /**
   * 重置特定设置为默认值
   */
  public resetSetting(path: string): void {
    const defaultValue = this.getSetting.call({ settings: DEFAULT_SETTINGS }, path);
    if (defaultValue !== undefined) {
      this.updateSetting(path, defaultValue);
    }
  }
}

// ====================================
// 导出
// ====================================

/**
 * 全局设置管理器实例
 */
export const settingsManager = SettingsManager.getInstance();

/**
 * 便捷的 Gemini 设置访问器
 */
export const geminiSettings = {
  get: () => settingsManager.getSetting<GeminiSettings>('gemini'),
  update: (settings: Partial<GeminiSettings>) => {
    const currentGeminiSettings = settingsManager.getSetting<GeminiSettings>('gemini');
    const updatedSettings: GeminiSettings = { ...currentGeminiSettings, ...settings };
    settingsManager.updateSettings({ gemini: updatedSettings });
  },
  addListener: (listener: SettingsListener<GeminiSettings>) => {
    settingsManager.addListener('gemini', listener);
  },
  removeListener: (listener: SettingsListener<GeminiSettings>) => {
    settingsManager.removeListener('gemini', listener);
  },
};

