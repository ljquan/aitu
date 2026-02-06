/**
 * 通用的全局设置管理器
 * 统一管理应用程序的所有配置设置
 * 支持敏感信息加密存储
 */

import { CryptoUtils } from './crypto-utils';
import { DRAWNIX_SETTINGS_KEY } from '../constants/storage';
import { getSafeErrorMessage } from '@aitu/utils';
import { configIndexedDBWriter } from './config-indexeddb-writer';
import type { GeminiConfig } from './gemini-api/types';
import type { VideoAPIConfig } from './config-indexeddb-writer';

// ====================================
// 类型定义
// ====================================

export interface GeminiSettings {
  apiKey: string;
  baseUrl: string;
  chatModel?: string;
  imageModelName?: string;
  videoModelName?: string;
  textModelName?: string;
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
    chatModel: 'gpt-5',
    imageModelName: 'gemini-3-pro-image-preview-vip',
    videoModelName: 'veo3.1',
    textModelName:  'deepseek-v3.2',
  },
};

// 设置变更监听器类型
type SettingsListener<T = any> = (newValue: T, oldValue: T) => void;
type AnySettingsListener = SettingsListener<any>;

// 需要加密存储的敏感字段列表
const SENSITIVE_FIELDS = new Set([
  'gemini.apiKey',
  // 可以在这里添加其他敏感字段
]);

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
  private cryptoAvailable = false;
  private initializationPromise: Promise<void> | null = null;

  private constructor() {
    this.settings = this.loadSettings();
    this.initializationPromise = this.initializeAsync();
  }

  /**
   * 异步初始化
   */
  private async initializeAsync(): Promise<void> {
    try {
      await this.initializeCrypto();
      // 加密功能初始化完成后，解密已加载的敏感数据
      await this.decryptSensitiveDataForLoading(this.settings);
      this.initializeFromUrl();
      // 初始化完成后，同步配置到 IndexedDB，供 SW 读取
      await this.syncToIndexedDB();
      // console.log('SettingsManager initialization completed');
    } catch (error) {
      console.error('SettingsManager initialization failed:', error);
    }
  }

  /**
   * 等待初始化完成
   */
  public async waitForInitialization(): Promise<void> {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
  }

  /**
   * 初始化加密功能
   */
  private async initializeCrypto(): Promise<void> {
    try {
      this.cryptoAvailable = await CryptoUtils.testCrypto();
      if (!this.cryptoAvailable) {
        console.warn('Crypto functionality is not available, sensitive data will be stored as plain text');
      }
    } catch (error) {
      console.error('Failed to initialize crypto:', error);
      this.cryptoAvailable = false;
    }
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
   * 检查字段是否为敏感字段
   */
  private isSensitiveField(path: string): boolean {
    return SENSITIVE_FIELDS.has(path);
  }

  /**
   * 加密敏感数据
   */
  private async encryptSensitiveData(path: string, value: string): Promise<string> {
    if (!this.isSensitiveField(path) || !this.cryptoAvailable) {
      return value;
    }

    try {
      return await CryptoUtils.encrypt(value);
    } catch (error) {
      console.warn(`Failed to encrypt sensitive data for ${path}:`, error);
      return value; // 加密失败时返回原值
    }
  }

  /**
   * 解密敏感数据
   */
  private async decryptSensitiveData(path: string, value: string): Promise<string> {
    if (!this.isSensitiveField(path) || !this.cryptoAvailable) {
      return value;
    }

    try {
      // 检查数据是否已加密
      if (CryptoUtils.isEncrypted(value)) {
        return await CryptoUtils.decrypt(value);
      }
      return value; // 如果不是加密数据，返回原值
    } catch (error) {
      console.warn(`Failed to decrypt sensitive data for ${path}:`, error);
      return value; // 解密失败时返回原值
    }
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
      const storedSettings = localStorage.getItem(DRAWNIX_SETTINGS_KEY);
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
   * 为加载的设置解密敏感数据
   */
  private async decryptSensitiveDataForLoading(settings: AppSettings): Promise<void> {
    for (const fieldPath of SENSITIVE_FIELDS) {
      const value = this.getSetting.call({ settings }, fieldPath);
      if (value && typeof value === 'string') {
        try {
          const decryptedValue = await this.decryptSensitiveData(fieldPath, value);
          if (decryptedValue !== value) {
            // 只有当解密成功时才更新设置
            this.setNestedValue(settings, fieldPath, decryptedValue);
            // console.log(`Decrypted sensitive field: ${fieldPath}`);
          }
        } catch (error) {
          console.warn(`Failed to decrypt field ${fieldPath} during loading:`, error);
        }
      }
    }
  }


  /**
   * 设置嵌套对象的值
   */
  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    let current = obj;
    
    for (const key of keys) {
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }
    
    current[lastKey] = value;
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
        
        // updateSetting 已有占位符检查，会自动忽略无效值
        if (urlSettings.key) {
          this.updateSetting('gemini.apiKey', urlSettings.key);
        }
        if (urlSettings.url) {
          this.updateSetting('gemini.baseUrl', urlSettings.url);
        }
      }

      // 处理apiKey参数
      // updateSetting 已有占位符检查，会自动忽略无效值
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
  private async saveToStorage(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      // 创建设置副本用于存储
      const settingsToSave = JSON.parse(JSON.stringify(this.settings));
      
      // 加密敏感数据
      await this.encryptSensitiveDataForStorage(settingsToSave);
      
      // 使用单个 key 存储序列化的设置
      const settingsJson = JSON.stringify(settingsToSave);
      localStorage.setItem(DRAWNIX_SETTINGS_KEY, settingsJson);
      
      // 同步到 IndexedDB，供 SW 读取（fire-and-forget，不阻塞）
      this.syncToIndexedDB().catch((error) => {
        console.warn('[SettingsManager] Failed to sync to IndexedDB:', error);
      });
    } catch (error) {
      console.warn('Failed to save settings to localStorage:', error);
    }
  }

  /**
   * 同步配置到 IndexedDB
   * 将当前设置转换为 SW 需要的配置格式并写入 IndexedDB
   */
  private async syncToIndexedDB(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      const gemini = this.settings.gemini;
      
      // 构建 GeminiConfig（与 SW 期望的格式一致）
      const geminiConfig: GeminiConfig = {
        apiKey: gemini.apiKey,
        baseUrl: gemini.baseUrl,
        modelName: gemini.imageModelName,
      };
      
      // 构建 VideoAPIConfig（与 SW 期望的格式一致）
      const videoConfig: VideoAPIConfig = {
        apiKey: gemini.apiKey,
        baseUrl: gemini.baseUrl,
        model: gemini.videoModelName,
      };
      
      await configIndexedDBWriter.saveConfig(geminiConfig, videoConfig);
    } catch (error) {
      // IndexedDB 写入失败不影响正常流程
      console.warn('[SettingsManager] Failed to sync config to IndexedDB:', error);
    }
  }

  /**
   * 为存储加密敏感数据
   */
  private async encryptSensitiveDataForStorage(settings: AppSettings): Promise<void> {
    for (const fieldPath of SENSITIVE_FIELDS) {
      const value = this.getSetting.call({ settings }, fieldPath);
      if (value && typeof value === 'string') {
        try {
          const encryptedValue = await this.encryptSensitiveData(fieldPath, value);
          if (encryptedValue !== value) {
            // 只有当加密成功时才更新存储副本
            this.setNestedValue(settings, fieldPath, encryptedValue);
            // console.log(`Encrypted sensitive field for storage: ${fieldPath}`);
          }
        } catch (error) {
          console.warn(`Failed to encrypt field ${fieldPath} for storage:`, error);
        }
      }
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
   * 返回深拷贝，防止外部修改影响原始设置
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
    
    // 返回深拷贝，防止外部代码修改返回值影响原始设置
    // 这是防止脱敏函数或其他代码意外修改 apiKey 等敏感字段的关键
    if (value && typeof value === 'object') {
      return JSON.parse(JSON.stringify(value)) as T;
    }
    
    return value as T;
  }

  /**
   * 检查字符串是否是占位符格式
   * 如 {key}、${key}、{{key}}、{apiKey} 等
   */
  private isPlaceholderValue(value: unknown): boolean {
    if (!value || typeof value !== 'string') return false;
    // 匹配 {xxx}、${xxx}、{{xxx}} 等占位符格式
    return /^[{$]*\{?\w+\}?\}*$/.test(value) || 
           value.includes('{key}') || 
           value.includes('${');
  }

  /**
   * 更新特定设置值（支持点记号法）
   */
  public async updateSetting<T = any>(path: string, newValue: T): Promise<void> {
    // 对 apiKey 相关字段进行占位符检查
    if ((path.endsWith('.apiKey') || path === 'apiKey') && this.isPlaceholderValue(newValue)) {
      console.warn(`[SettingsManager] Detected placeholder value for ${path}, ignoring:`, newValue);
      return;
    }
    
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
    await this.saveToStorage();
    
    // 通知监听器
    this.notifyListeners(path, newValue, oldValue);
    
    // console.log(`Setting updated: ${path} =`, newValue);
  }

  /**
   * 批量更新设置
   */
  public async updateSettings(updates: Partial<AppSettings>): Promise<void> {
    const oldSettings = { ...this.settings };
    
    // 深度合并设置
    this.settings = this.deepMerge(this.settings, updates);
    
    // 保存到本地存储
    await this.saveToStorage();
    
    // 为每个更新的路径通知监听器
    this.notifySettingsChange(oldSettings, this.settings, '');
    
    // console.log('Settings batch updated:', updates);
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
          // 只记录错误类型，不记录详细信息（可能包含敏感设置值）
          console.error(`Error in settings listener for ${path}:`, getSafeErrorMessage(error));
        }
      });
    }
    
    // 触发全局事件，用于画布中的工具 URL 模板刷新
    // 当 gemini 相关设置变化时（如 apiKey、baseUrl）
    if (path.startsWith('gemini') && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gemini-settings-changed', {
        detail: { path, newValue, oldValue }
      }));
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
  public async resetSettings(): Promise<void> {
    const oldSettings = { ...this.settings };
    this.settings = { ...DEFAULT_SETTINGS };
    await this.saveToStorage();
    this.notifySettingsChange(oldSettings, this.settings, '');
    // console.log('Settings reset to default');
  }

  /**
   * 重置特定设置为默认值
   */
  public async resetSetting(path: string): Promise<void> {
    const defaultValue = this.getSetting.call({ settings: DEFAULT_SETTINGS }, path);
    if (defaultValue !== undefined) {
      await this.updateSetting(path, defaultValue);
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
  update: async (settings: Partial<GeminiSettings>) => {
    const currentGeminiSettings = settingsManager.getSetting<GeminiSettings>('gemini');
    const updatedSettings: GeminiSettings = { ...currentGeminiSettings, ...settings };
    await settingsManager.updateSettings({ gemini: updatedSettings });
  },
  addListener: (listener: SettingsListener<GeminiSettings>) => {
    settingsManager.addListener('gemini', listener);
  },
  removeListener: (listener: SettingsListener<GeminiSettings>) => {
    settingsManager.removeListener('gemini', listener);
  },
};

