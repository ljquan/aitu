/**
 * 工具栏配置存储服务
 * 管理工具栏按钮顺序和显示状态的持久化
 * 使用 IndexedDB 进行存储（通过 kvStorageService）
 */

import { LS_KEYS_TO_MIGRATE } from '../constants/storage-keys';
import { kvStorageService } from './kv-storage-service';
import {
  ToolbarConfig,
  ToolbarButtonConfig,
  TOOLBAR_CONFIG_VERSION,
  ALL_BUTTON_IDS,
  getDefaultToolbarConfig,
  updateButtonVisibility,
  reorderButtons,
  moveButtonToVisible,
  moveButtonToHidden,
} from '../types/toolbar-config.types';

const STORAGE_KEY = LS_KEYS_TO_MIGRATE.TOOLBAR_CONFIG;

// 旧版默认布局，用于迁移判断
const LEGACY_ALL_BUTTON_IDS = [
  'hand',
  'selection',
  'text',
  'media-library',
  'ai-image',
  'ai-video',
  'mind',
  'freehand',
  'arrow',
  'shape',
  'image',
  'theme',
  'mermaid-to-drawnix',
  'markdown-to-drawnix',
  'undo',
  'redo',
  'zoom',
];

const LEGACY_DEFAULT_VISIBLE_BUTTONS = [
  'hand',
  'selection',
  'text',
  'media-library',
  'ai-image',
  'ai-video',
];

/**
 * 工具栏配置服务类
 */
class ToolbarConfigService {
  private config: ToolbarConfig | null = null;
  private initialized = false;
  private initPromise: Promise<ToolbarConfig> | null = null;

  /**
   * 异步初始化服务（从 IndexedDB 加载）
   */
  async initializeAsync(): Promise<ToolbarConfig> {
    if (this.initialized && this.config) {
      return this.config;
    }

    // 防止重复初始化
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.doInitialize();
    return this.initPromise;
  }

  private async doInitialize(): Promise<ToolbarConfig> {
    try {
      const savedConfig = await kvStorageService.get<ToolbarConfig>(STORAGE_KEY);
      if (savedConfig) {
        this.config = this.migrateConfig(savedConfig);
      } else {
        // 无配置，使用默认配置
        this.config = getDefaultToolbarConfig();
        await this.saveToStorageAsync(this.config);
      }
    } catch (error) {
      console.warn('[ToolbarConfigService] Failed to load from IndexedDB:', error);
      this.config = getDefaultToolbarConfig();
    }

    this.initialized = true;
    return this.config;
  }

  /**
   * 同步初始化服务（使用默认配置，后台异步加载）
   * 用于兼容现有同步调用
   */
  initialize(): ToolbarConfig {
    if (this.initialized && this.config) {
      return this.config;
    }

    // 如果尚未初始化，先使用默认配置
    if (!this.config) {
      this.config = getDefaultToolbarConfig();
      // 后台异步加载真实配置
      this.initializeAsync().then((loadedConfig) => {
        // 只有在用户没有修改过的情况下才更新
        if (this.config && loadedConfig) {
          this.config = loadedConfig;
        }
      });
    }

    this.initialized = true;
    return this.config;
  }

  /**
   * 获取当前配置
   */
  getConfig(): ToolbarConfig {
    if (!this.config) {
      return this.initialize();
    }
    return this.config;
  }

  /**
   * 更新按钮可见性
   */
  setButtonVisibility(buttonId: string, visible: boolean): ToolbarConfig {
    if (!this.config) {
      this.initialize();
    }

    this.config = updateButtonVisibility(this.config!, buttonId, visible);
    this.saveToStorage(this.config);
    return this.config;
  }

  /**
   * 重新排序按钮
   */
  reorderButton(
    fromIndex: number,
    toIndex: number,
    isVisibleList: boolean
  ): ToolbarConfig {
    if (!this.config) {
      this.initialize();
    }

    this.config = reorderButtons(this.config!, fromIndex, toIndex, isVisibleList);
    this.saveToStorage(this.config);
    return this.config;
  }

  /**
   * 将按钮移动到可见区域
   */
  showButton(buttonId: string, insertIndex?: number): ToolbarConfig {
    if (!this.config) {
      this.initialize();
    }

    this.config = moveButtonToVisible(this.config!, buttonId, insertIndex);
    this.saveToStorage(this.config);
    return this.config;
  }

  /**
   * 将按钮移动到隐藏区域
   */
  hideButton(buttonId: string): ToolbarConfig {
    if (!this.config) {
      this.initialize();
    }

    this.config = moveButtonToHidden(this.config!, buttonId);
    this.saveToStorage(this.config);
    return this.config;
  }

  /**
   * 批量更新配置
   */
  updateConfig(updates: Partial<ToolbarConfig>): ToolbarConfig {
    if (!this.config) {
      this.initialize();
    }

    this.config = {
      ...this.config!,
      ...updates,
      updatedAt: Date.now(),
    };
    this.saveToStorage(this.config);
    return this.config;
  }

  /**
   * 重置为默认配置
   */
  resetToDefault(): ToolbarConfig {
    this.config = getDefaultToolbarConfig();
    this.saveToStorage(this.config);
    return this.config;
  }

  /**
   * 保存配置到 IndexedDB（异步，不阻塞）
   */
  private saveToStorage(config: ToolbarConfig): void {
    kvStorageService.set(STORAGE_KEY, config).catch((error) => {
      console.error('[ToolbarConfigService] Failed to save config:', error);
    });
  }

  /**
   * 保存配置到 IndexedDB（异步，等待完成）
   */
  private async saveToStorageAsync(config: ToolbarConfig): Promise<void> {
    try {
      await kvStorageService.set(STORAGE_KEY, config);
    } catch (error) {
      console.error('[ToolbarConfigService] Failed to save config:', error);
    }
  }

  /**
   * 迁移旧版本配置
   */
  private migrateConfig(config: ToolbarConfig): ToolbarConfig {
    const isLegacyVersion = (config.version ?? 1) < TOOLBAR_CONFIG_VERSION;
    const matchesLegacyDefault =
      isLegacyVersion && this.matchesLegacyDefaultLayout(config);

    // 检查是否有新增的按钮需要添加
    const existingIds = new Set(config.buttons.map((btn) => btn.id));
    const newButtons: ToolbarButtonConfig[] = [];

    ALL_BUTTON_IDS.forEach((id) => {
      if (!existingIds.has(id)) {
        // 新按钮默认隐藏，放在最后
        newButtons.push({
          id,
          visible: false,
          order: config.buttons.length + newButtons.length,
        });
      }
    });

    if (newButtons.length > 0) {
      config = {
        ...config,
        buttons: [...config.buttons, ...newButtons],
        updatedAt: Date.now(),
      };
    }

    // 移除已删除的按钮
    const validIds = new Set(ALL_BUTTON_IDS);
    const filteredButtons = config.buttons.filter((btn) => validIds.has(btn.id));

    if (filteredButtons.length !== config.buttons.length) {
      config = {
        ...config,
        buttons: filteredButtons,
        updatedAt: Date.now(),
      };
    }

    // 旧版默认布局 -> 使用新的默认配置（手形/选择前置，思维导图收起）
    if (matchesLegacyDefault) {
      config = getDefaultToolbarConfig();
    }

    // 更新版本号
    if (config.version !== TOOLBAR_CONFIG_VERSION) {
      config = {
        ...config,
        version: TOOLBAR_CONFIG_VERSION,
      };
    }

    return config;
  }

  /**
   * 判断是否仍然使用旧版的默认布局
   */
  private matchesLegacyDefaultLayout(config: ToolbarConfig): boolean {
    if (config.buttons.length !== LEGACY_ALL_BUTTON_IDS.length) {
      return false;
    }

    return LEGACY_ALL_BUTTON_IDS.every((id, index) => {
      const button = config.buttons.find((btn) => btn.id === id);
      if (!button) return false;

      const shouldBeVisible = LEGACY_DEFAULT_VISIBLE_BUTTONS.includes(id);
      return button.order === index && button.visible === shouldBeVisible;
    });
  }
}

// 导出单例
export const toolbarConfigService = new ToolbarConfigService();
