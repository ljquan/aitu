/**
 * 工具栏配置存储服务
 * 管理工具栏按钮顺序和显示状态的持久化
 */

import { TOOLBAR_CONFIG_KEY } from '../constants/storage';
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

/**
 * 工具栏配置服务类
 */
class ToolbarConfigService {
  private config: ToolbarConfig | null = null;
  private initialized = false;

  /**
   * 初始化服务
   */
  initialize(): ToolbarConfig {
    if (this.initialized && this.config) {
      return this.config;
    }

    // 尝试加载已保存的配置
    const savedConfig = this.loadFromStorage();
    if (savedConfig) {
      this.config = this.migrateConfig(savedConfig);
    } else {
      // 无配置，使用默认配置
      this.config = getDefaultToolbarConfig();
      this.saveToStorage(this.config);
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
   * 从 localStorage 加载配置
   */
  private loadFromStorage(): ToolbarConfig | null {
    try {
      const stored = localStorage.getItem(TOOLBAR_CONFIG_KEY);
      if (!stored) {
        return null;
      }
      return JSON.parse(stored) as ToolbarConfig;
    } catch (error) {
      console.warn('[ToolbarConfigService] Failed to load config:', error);
      return null;
    }
  }

  /**
   * 保存配置到 localStorage
   */
  private saveToStorage(config: ToolbarConfig): void {
    try {
      localStorage.setItem(TOOLBAR_CONFIG_KEY, JSON.stringify(config));
    } catch (error) {
      console.error('[ToolbarConfigService] Failed to save config:', error);
    }
  }

  /**
   * 迁移旧版本配置
   */
  private migrateConfig(config: ToolbarConfig): ToolbarConfig {
    // 检查是否有新增的按钮需要添加
    const existingIds = new Set(config.buttons.map((btn) => btn.id));
    const newButtons: ToolbarButtonConfig[] = [];

    ALL_BUTTON_IDS.forEach((id, index) => {
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

    // 更新版本号
    if (config.version !== TOOLBAR_CONFIG_VERSION) {
      config = {
        ...config,
        version: TOOLBAR_CONFIG_VERSION,
      };
    }

    return config;
  }
}

// 导出单例
export const toolbarConfigService = new ToolbarConfigService();
