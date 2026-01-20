/**
 * Tool Window Service
 * 
 * 管理工具箱工具以弹窗形式打开的状态
 */

import { BehaviorSubject, Observable } from 'rxjs';
import { ToolDefinition } from '../types/toolbox.types';

/**
 * 工具窗口管理服务
 */
class ToolWindowService {
  private static instance: ToolWindowService;
  private openTools: Map<string, ToolDefinition> = new Map();
  private openToolsSubject = new BehaviorSubject<ToolDefinition[]>([]);

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): ToolWindowService {
    if (!ToolWindowService.instance) {
      ToolWindowService.instance = new ToolWindowService();
    }
    return ToolWindowService.instance;
  }

  /**
   * 观察已打开的工具窗口列表
   */
  observeOpenTools(): Observable<ToolDefinition[]> {
    return this.openToolsSubject.asObservable();
  }

  /**
   * 获取当前已打开的工具窗口列表
   */
  getOpenTools(): ToolDefinition[] {
    return Array.from(this.openTools.values());
  }

  /**
   * 打开工具窗口
   */
  openTool(tool: ToolDefinition): void {
    if (this.openTools.has(tool.id)) {
      // 如果已经打开，可能需要置顶（WinBox 自身处理聚焦）
      // 这里只需要确保它在列表中
      return;
    }
    
    this.openTools.set(tool.id, tool);
    this.notify();
  }

  /**
   * 关闭工具窗口
   */
  closeTool(toolId: string): void {
    if (this.openTools.has(toolId)) {
      this.openTools.delete(toolId);
      this.notify();
    }
  }

  /**
   * 检查工具是否已打开窗口
   */
  isToolOpen(toolId: string): boolean {
    return this.openTools.has(toolId);
  }

  /**
   * 通知订阅者
   */
  private notify(): void {
    this.openToolsSubject.next(this.getOpenTools());
  }
}

export const toolWindowService = ToolWindowService.getInstance();
