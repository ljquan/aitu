/**
 * SW Debug Panel - Unified Log Panel Component
 * 统一的日志面板组件，用于抽象 Fetch/Console/PostMessage/LLM API/内存日志的公共逻辑
 */

import { formatTime, escapeHtml } from './utils.js';

/**
 * 日志面板配置
 * @typedef {Object} LogPanelConfig
 * @property {string} id - 面板唯一标识
 * @property {string} name - 面板名称
 * @property {string} emptyIcon - 空状态图标
 * @property {string} emptyText - 空状态主文本
 * @property {string} [emptySubtext] - 空状态副文本
 * @property {Function} renderEntry - 渲染单个日志条目的函数
 * @property {Function} formatForCopy - 格式化日志用于复制的函数
 * @property {Array<FilterConfig>} filters - 过滤器配置
 */

/**
 * 过滤器配置
 * @typedef {Object} FilterConfig
 * @property {string} type - 过滤器类型: 'select' | 'input'
 * @property {string} id - 过滤器 DOM ID
 * @property {string} [placeholder] - 输入框占位符
 * @property {Array<{value: string, label: string}>} [options] - 下拉选项
 * @property {Function} filter - 过滤函数 (log, filterValue) => boolean
 */

/**
 * 创建统一的日志面板
 */
export class LogPanel {
  /**
   * @param {LogPanelConfig} config
   */
  constructor(config) {
    this.config = config;
    this.logs = [];
    this.expandedIds = new Set();
    this.filterValues = {};
    this.elements = null;
    this.maxLogs = 500;
    this.maxDisplay = 200;
  }

  /**
   * 初始化面板，绑定 DOM 元素
   * @param {Object} elements - DOM 元素映射
   */
  init(elements) {
    this.elements = elements;
    this.setupFilterListeners();
  }

  /**
   * 设置过滤器事件监听
   */
  setupFilterListeners() {
    this.config.filters.forEach(filter => {
      const el = this.elements[filter.id];
      if (!el) return;

      if (filter.type === 'select') {
        el.addEventListener('change', () => {
          this.filterValues[filter.id] = el.value;
          this.render();
        });
      } else if (filter.type === 'input') {
        el.addEventListener('input', () => {
          this.filterValues[filter.id] = el.value;
          this.render();
        });
      }
    });
  }

  /**
   * 添加日志条目
   * @param {Object} log
   */
  addLog(log) {
    // 检查重复
    if (this.logs.some(l => l.id === log.id)) {
      return;
    }

    this.logs.unshift(log);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }
  }

  /**
   * 更新日志条目
   * @param {Object} log
   */
  updateLog(log) {
    const index = this.logs.findIndex(l => l.id === log.id);
    if (index >= 0) {
      this.logs[index] = { ...this.logs[index], ...log };
    } else {
      this.addLog(log);
    }
  }

  /**
   * 设置所有日志
   * @param {Array} logs
   */
  setLogs(logs) {
    this.logs = logs || [];
  }

  /**
   * 清空日志
   */
  clearLogs() {
    this.logs = [];
    this.expandedIds.clear();
  }

  /**
   * 获取过滤后的日志
   * @returns {Array}
   */
  getFilteredLogs() {
    let filtered = this.logs;

    this.config.filters.forEach(filter => {
      const value = this.filterValues[filter.id] || '';
      if (value && filter.filter) {
        filtered = filtered.filter(log => filter.filter(log, value));
      }
    });

    return filtered;
  }

  /**
   * 渲染日志列表
   */
  render() {
    const container = this.elements.container;
    if (!container) return;

    const filteredLogs = this.getFilteredLogs();

    if (filteredLogs.length === 0) {
      container.innerHTML = this.renderEmptyState();
      return;
    }

    container.innerHTML = '';
    filteredLogs.slice(0, this.maxDisplay).forEach(log => {
      const isExpanded = this.expandedIds.has(log.id);
      const entry = this.config.renderEntry(log, isExpanded, (id, expanded) => {
        if (expanded) {
          this.expandedIds.add(id);
        } else {
          this.expandedIds.delete(id);
        }
      });
      container.appendChild(entry);
    });
  }

  /**
   * 渲染空状态
   * @returns {string}
   */
  renderEmptyState() {
    return `
      <div class="empty-state">
        <span class="icon">${this.config.emptyIcon}</span>
        <p>${this.config.emptyText}</p>
        ${this.config.emptySubtext ? `<p style="font-size: 12px; opacity: 0.7;">${this.config.emptySubtext}</p>` : ''}
      </div>
    `;
  }

  /**
   * 复制过滤后的日志到剪贴板
   * @returns {Promise<{success: boolean, count: number}>}
   */
  async copyLogs() {
    const filteredLogs = this.getFilteredLogs();

    if (filteredLogs.length === 0) {
      return { success: false, count: 0 };
    }

    const text = filteredLogs.map(log => this.config.formatForCopy(log)).join('\n\n');

    try {
      await navigator.clipboard.writeText(text);
      return { success: true, count: filteredLogs.length };
    } catch (err) {
      console.error('Failed to copy:', err);
      return { success: false, count: 0 };
    }
  }

  /**
   * 获取日志统计信息
   * @returns {Object}
   */
  getStats() {
    return {
      total: this.logs.length,
      filtered: this.getFilteredLogs().length,
    };
  }
}

/**
 * 创建复制按钮的点击处理器
 * @param {LogPanel} panel - 日志面板实例
 * @param {HTMLElement} button - 按钮元素
 * @returns {Function}
 */
export function createCopyHandler(panel, button) {
  return async () => {
    const result = await panel.copyLogs();
    if (result.success) {
      const originalText = button.textContent;
      button.textContent = `✅ 已复制 (${result.count})`;
      setTimeout(() => {
        button.textContent = originalText;
      }, 1500);
    } else if (result.count === 0) {
      alert('没有可复制的日志');
    } else {
      alert('复制失败');
    }
  };
}

/**
 * 工具栏按钮组件
 */
export class ToolbarButton {
  /**
   * 创建工具栏按钮
   * @param {Object} options
   * @param {string} options.icon - 按钮图标
   * @param {string} options.text - 按钮文本
   * @param {string} [options.className] - 额外的 CSS 类
   * @param {Function} options.onClick - 点击处理函数
   * @returns {HTMLElement}
   */
  static create({ icon, text, className = '', onClick }) {
    const button = document.createElement('button');
    button.style.cssText = 'padding: 6px 12px; font-size: 12px;';
    if (className) {
      button.className = className;
    }
    button.innerHTML = `${icon ? icon + ' ' : ''}${text}`;
    button.addEventListener('click', onClick);
    return button;
  }
}

/**
 * 从日志数组中提取唯一的消息类型
 * @param {Array} logs - 日志数组
 * @param {string} typeField - 类型字段名
 * @returns {Array<string>}
 */
export function extractUniqueTypes(logs, typeField = 'messageType') {
  const types = new Set();
  logs.forEach(log => {
    const type = log[typeField];
    if (type) {
      types.add(type);
    }
  });
  return Array.from(types).sort();
}

/**
 * 更新消息类型下拉选项
 * @param {HTMLSelectElement} select - 下拉选择器
 * @param {Array<string>} types - 类型列表
 * @param {string} currentValue - 当前选中值
 */
export function updateTypeSelectOptions(select, types, currentValue = '') {
  // 保存当前值
  const selectedValue = currentValue || select.value;
  
  // 清空现有选项（保留第一个"全部"选项）
  while (select.options.length > 1) {
    select.remove(1);
  }
  
  // 添加新选项
  types.forEach(type => {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = type;
    select.appendChild(option);
  });
  
  // 恢复选中值
  if (selectedValue && types.includes(selectedValue)) {
    select.value = selectedValue;
  }
}
