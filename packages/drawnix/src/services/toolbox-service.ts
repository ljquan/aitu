/**
 * Toolbox Service
 *
 * 工具箱管理服务（单例模式）
 * 负责管理内置工具和自定义工具
 */

import localforage from 'localforage';
import { ToolDefinition, ToolCategory } from '../types/toolbox.types';
import { BUILT_IN_TOOLS } from '../constants/built-in-tools';

/**
 * 自定义工具存储格式
 */
interface CustomToolsStorage {
  version: string;
  tools: ToolDefinition[];
  updatedAt: number;
}

/**
 * 工具箱管理服务类
 */
class ToolboxService {
  private static instance: ToolboxService;
  private customTools: ToolDefinition[] = [];
  private isInitialized = false;

  // 存储配置
  private static readonly STORAGE_KEY = 'aitu:custom-tools';
  private static readonly STORAGE_VERSION = '1.0';
  private static readonly MAX_CUSTOM_TOOLS = 50;

  private constructor() {
    // 私有构造函数，防止外部实例化
    this.initialize();
  }

  /**
   * 获取单例实例
   */
  static getInstance(): ToolboxService {
    if (!ToolboxService.instance) {
      ToolboxService.instance = new ToolboxService();
    }
    return ToolboxService.instance;
  }

  /**
   * 获取所有可用工具
   */
  getAvailableTools(): ToolDefinition[] {
    return [...BUILT_IN_TOOLS, ...this.customTools];
  }

  /**
   * 根据 ID 获取工具定义
   */
  getToolById(id: string): ToolDefinition | null {
    const allTools = this.getAvailableTools();
    return allTools.find(tool => tool.id === id) || null;
  }

  /**
   * 初始化服务（加载持久化数据）
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      const storage = await localforage.getItem<CustomToolsStorage>(
        ToolboxService.STORAGE_KEY
      );

      if (storage) {
        // 验证版本兼容性
        if (this.isCompatibleVersion(storage.version)) {
          this.customTools = storage.tools;
          // console.log(`[Toolbox] Loaded ${this.customTools.length} custom tools`);
        } else {
          console.warn('[Toolbox] Incompatible version, resetting custom tools');
          await this.resetCustomTools();
        }
      }
    } catch (error) {
      console.error('[Toolbox] Failed to load custom tools:', error);
    } finally {
      this.isInitialized = true;
    }
  }

  /**
   * 保存自定义工具到存储
   */
  private async saveCustomTools(): Promise<void> {
    try {
      const storage: CustomToolsStorage = {
        version: ToolboxService.STORAGE_VERSION,
        tools: this.customTools,
        updatedAt: Date.now(),
      };

      await localforage.setItem(ToolboxService.STORAGE_KEY, storage);
      // console.log(`[Toolbox] Saved ${this.customTools.length} custom tools`);
    } catch (error) {
      console.error('[Toolbox] Failed to save custom tools:', error);
      throw error;
    }
  }

  /**
   * 添加自定义工具
   */
  async addCustomTool(tool: ToolDefinition): Promise<void> {
    // 检查数量限制
    if (this.customTools.length >= ToolboxService.MAX_CUSTOM_TOOLS) {
      throw new Error(`Maximum ${ToolboxService.MAX_CUSTOM_TOOLS} custom tools allowed`);
    }

    // 验证工具定义
    this.validateToolDefinition(tool);

    // 检查是否已存在
    const exists = this.customTools.some(t => t.id === tool.id);
    if (exists) {
      throw new Error(`Tool with id "${tool.id}" already exists`);
    }

    // 生成唯一 ID（如果没有提供）
    const toolWithId: ToolDefinition = {
      ...tool,
      id: tool.id || `custom-${Date.now()}`,
      category: tool.category || ToolCategory.CUSTOM,
      defaultWidth: tool.defaultWidth || 800,
      defaultHeight: tool.defaultHeight || 600,
      permissions: tool.permissions || [
        'allow-scripts',
        'allow-same-origin',
        'allow-popups',
        'allow-forms',
        'allow-top-navigation-by-user-activation'
      ],
    };

    this.customTools.push(toolWithId);
    await this.saveCustomTools();
  }

  /**
   * 移除自定义工具
   */
  async removeCustomTool(id: string): Promise<boolean> {
    const initialLength = this.customTools.length;
    this.customTools = this.customTools.filter(t => t.id !== id);
    const removed = this.customTools.length < initialLength;

    if (removed) {
      await this.saveCustomTools();
    }

    return removed;
  }

  /**
   * 更新自定义工具
   */
  async updateCustomTool(id: string, updates: Partial<ToolDefinition>): Promise<boolean> {
    const toolIndex = this.customTools.findIndex(t => t.id === id);
    if (toolIndex === -1) {
      return false;
    }

    // 验证更新后的工具定义
    const updatedTool = {
      ...this.customTools[toolIndex],
      ...updates,
      id, // 确保 ID 不被修改
    };
    this.validateToolDefinition(updatedTool);

    this.customTools[toolIndex] = updatedTool;
    await this.saveCustomTools();
    return true;
  }

  /**
   * 获取按分类分组的工具列表
   */
  getToolsByCategory(): Record<string, ToolDefinition[]> {
    const tools = this.getAvailableTools();
    const categorized: Record<string, ToolDefinition[]> = {};

    tools.forEach(tool => {
      const category = tool.category || 'utilities';
      if (!categorized[category]) {
        categorized[category] = [];
      }
      categorized[category].push(tool);
    });

    return categorized;
  }

  /**
   * 搜索工具
   */
  searchTools(query: string): ToolDefinition[] {
    if (!query.trim()) {
      return this.getAvailableTools();
    }

    const lowerQuery = query.toLowerCase().trim();
    return this.getAvailableTools().filter(tool => {
      return (
        tool.name.toLowerCase().includes(lowerQuery) ||
        tool.description?.toLowerCase().includes(lowerQuery) ||
        tool.id.toLowerCase().includes(lowerQuery)
      );
    });
  }

  /**
   * 获取所有自定义工具
   */
  getCustomTools(): ToolDefinition[] {
    return [...this.customTools];
  }

  /**
   * 清空所有自定义工具
   */
  async clearCustomTools(): Promise<void> {
    this.customTools = [];
    await this.saveCustomTools();
  }

  /**
   * 验证工具定义
   */
  private validateToolDefinition(tool: Partial<ToolDefinition>): void {
    // 必填字段
    if (!tool.name || !tool.url) {
      throw new Error('Tool name and URL are required');
    }

    // URL 格式验证
    try {
      const url = new URL(tool.url);
      // 只允许 https 和 http
      if (!['https:', 'http:'].includes(url.protocol)) {
        throw new Error('Only HTTP/HTTPS URLs are allowed');
      }
    } catch (e) {
      throw new Error('Invalid URL format');
    }

    // 名称长度限制
    if (tool.name.length > 50) {
      throw new Error('Tool name too long (max 50 characters)');
    }

    // 描述长度限制
    if (tool.description && tool.description.length > 200) {
      throw new Error('Tool description too long (max 200 characters)');
    }
  }

  /**
   * 版本兼容性检查
   */
  private isCompatibleVersion(version: string): boolean {
    return version === ToolboxService.STORAGE_VERSION;
  }

  /**
   * 重置自定义工具
   */
  private async resetCustomTools(): Promise<void> {
    this.customTools = [];
    await this.saveCustomTools();
  }
}

// 导出单例实例
export const toolboxService = ToolboxService.getInstance();
