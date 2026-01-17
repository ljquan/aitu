/**
 * 颜色和渐变历史记录存储服务
 * Color and Gradient History Storage Service
 * 
 * 使用 IndexedDB 存储用户使用过的颜色和渐变配置
 */

import localforage from 'localforage';
import type { GradientFillConfig } from '../types/fill.types';

// ============ 类型定义 ============

/** 颜色历史记录项 */
export interface ColorHistoryItem {
  /** 颜色值 (HEX 格式) */
  color: string;
  /** 最后使用时间 */
  lastUsedAt: number;
  /** 使用次数 */
  useCount: number;
}

/** 渐变历史记录项 */
export interface GradientHistoryItem {
  /** 唯一 ID */
  id: string;
  /** 渐变配置 */
  config: GradientFillConfig;
  /** 最后使用时间 */
  lastUsedAt: number;
  /** 使用次数 */
  useCount: number;
}

/** 颜色历史数据 */
interface ColorHistoryData {
  colors: ColorHistoryItem[];
  gradients: GradientHistoryItem[];
}

// ============ 常量 ============

const STORE_NAME = 'drawnix-color-history';
const MAX_COLORS = 24; // 最多保存 24 个颜色
const MAX_GRADIENTS = 12; // 最多保存 12 个渐变

// ============ 存储实例 ============

const colorHistoryStore = localforage.createInstance({
  name: 'drawnix',
  storeName: STORE_NAME,
});

// ============ 内存缓存 ============

let cachedData: ColorHistoryData | null = null;

// ============ 辅助函数 ============

/**
 * 生成渐变配置的唯一 ID
 */
function generateGradientId(config: GradientFillConfig): string {
  const stopsStr = config.stops
    .map((s) => `${s.color}@${s.offset}`)
    .join('|');
  
  if (config.type === 'linear') {
    return `linear-${config.angle}-${stopsStr}`;
  } else {
    return `radial-${config.centerX}-${config.centerY}-${stopsStr}`;
  }
}

/**
 * 比较两个渐变配置是否相同
 */
function isSameGradient(a: GradientFillConfig, b: GradientFillConfig): boolean {
  return generateGradientId(a) === generateGradientId(b);
}

// ============ 服务类 ============

class ColorHistoryService {
  private initialized = false;

  /**
   * 初始化服务
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      const data = await colorHistoryStore.getItem<ColorHistoryData>('history');
      cachedData = data || { colors: [], gradients: [] };
      this.initialized = true;
    } catch (error) {
      console.error('[ColorHistoryService] Failed to initialize:', error);
      cachedData = { colors: [], gradients: [] };
      this.initialized = true;
    }
  }

  /**
   * 保存数据到 IndexedDB
   */
  private async saveData(): Promise<void> {
    if (!cachedData) return;
    
    try {
      await colorHistoryStore.setItem('history', cachedData);
    } catch (error) {
      console.error('[ColorHistoryService] Failed to save data:', error);
    }
  }

  /**
   * 添加颜色到历史记录
   */
  async addColor(color: string): Promise<void> {
    await this.initialize();
    if (!cachedData) return;

    // 标准化颜色格式为大写
    const normalizedColor = color.toUpperCase();
    
    // 查找是否已存在
    const existingIndex = cachedData.colors.findIndex(
      (item) => item.color.toUpperCase() === normalizedColor
    );

    if (existingIndex >= 0) {
      // 更新已存在的颜色
      cachedData.colors[existingIndex].lastUsedAt = Date.now();
      cachedData.colors[existingIndex].useCount += 1;
      
      // 移到最前面
      const [item] = cachedData.colors.splice(existingIndex, 1);
      cachedData.colors.unshift(item);
    } else {
      // 添加新颜色
      cachedData.colors.unshift({
        color: normalizedColor,
        lastUsedAt: Date.now(),
        useCount: 1,
      });
      
      // 限制数量
      if (cachedData.colors.length > MAX_COLORS) {
        cachedData.colors = cachedData.colors.slice(0, MAX_COLORS);
      }
    }

    await this.saveData();
  }

  /**
   * 添加渐变到历史记录
   */
  async addGradient(config: GradientFillConfig): Promise<void> {
    await this.initialize();
    if (!cachedData) return;

    const id = generateGradientId(config);
    
    // 查找是否已存在
    const existingIndex = cachedData.gradients.findIndex(
      (item) => isSameGradient(item.config, config)
    );

    if (existingIndex >= 0) {
      // 更新已存在的渐变
      cachedData.gradients[existingIndex].lastUsedAt = Date.now();
      cachedData.gradients[existingIndex].useCount += 1;
      
      // 移到最前面
      const [item] = cachedData.gradients.splice(existingIndex, 1);
      cachedData.gradients.unshift(item);
    } else {
      // 添加新渐变
      cachedData.gradients.unshift({
        id,
        config: { ...config },
        lastUsedAt: Date.now(),
        useCount: 1,
      });
      
      // 限制数量
      if (cachedData.gradients.length > MAX_GRADIENTS) {
        cachedData.gradients = cachedData.gradients.slice(0, MAX_GRADIENTS);
      }
    }

    await this.saveData();
  }

  /**
   * 获取颜色历史记录
   */
  async getColors(): Promise<ColorHistoryItem[]> {
    await this.initialize();
    return cachedData?.colors || [];
  }

  /**
   * 获取渐变历史记录
   */
  async getGradients(): Promise<GradientHistoryItem[]> {
    await this.initialize();
    return cachedData?.gradients || [];
  }

  /**
   * 删除颜色
   */
  async removeColor(color: string): Promise<void> {
    await this.initialize();
    if (!cachedData) return;

    const normalizedColor = color.toUpperCase();
    cachedData.colors = cachedData.colors.filter(
      (item) => item.color.toUpperCase() !== normalizedColor
    );
    
    await this.saveData();
  }

  /**
   * 删除渐变
   */
  async removeGradient(id: string): Promise<void> {
    await this.initialize();
    if (!cachedData) return;

    cachedData.gradients = cachedData.gradients.filter((item) => item.id !== id);
    
    await this.saveData();
  }

  /**
   * 清空所有历史记录
   */
  async clearAll(): Promise<void> {
    cachedData = { colors: [], gradients: [] };
    await this.saveData();
  }

  /**
   * 重置缓存（用于测试或刷新）
   */
  resetCache(): void {
    cachedData = null;
    this.initialized = false;
  }
}

// ============ 导出单例 ============

export const colorHistoryService = new ColorHistoryService();
