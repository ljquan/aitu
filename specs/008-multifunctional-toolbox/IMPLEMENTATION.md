# 多功能工具箱实施指南

> Feature: feat/08-multifunctional-toolbox
> Created: 2025-12-08
> Status: 实施阶段

本文档提供详细的代码实现指南和示例。

---

## 📋 实施检查清单

### Phase 1: 基础架构 ✓

- [ ] 创建类型定义文件
- [ ] 实现 withTool 插件
- [ ] 实现 ToolComponent
- [ ] 实现 ToolGenerator
- [ ] 集成到 drawnix.tsx
- [ ] 手动测试工具元素渲染

### Phase 2: UI 组件 ✓

- [ ] 实现 ToolboxDrawer 组件
- [ ] 实现 ToolList 和 ToolItem
- [ ] 实现 ToolboxService
- [ ] 配置内置工具
- [ ] 集成到 UnifiedToolbar
- [ ] 测试用户交互流程

### Phase 3: 优化完善 (可选)

- [ ] 样式优化和响应式
- [ ] postMessage 通信协议
- [ ] 自定义工具支持
- [ ] 错误处理和提示

---

## 📁 文件创建顺序

### 1. 类型定义

**文件**: `packages/drawnix/src/types/toolbox.types.ts`

```typescript
import { PlaitElement, Point } from '@plait/core';

/**
 * 工具元素 - 画布上的工具实例
 */
export interface PlaitTool extends PlaitElement {
  type: 'tool';
  points: [Point, Point];
  angle: number;
  toolId: string;
  url: string;
  metadata?: {
    name?: string;
    category?: string;
    permissions?: string[];
  };
}

/**
 * 工具定义 - 工具箱配置
 */
export interface ToolDefinition {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  category?: string;
  url: string;
  defaultWidth?: number;
  defaultHeight?: number;
  permissions?: string[];
}

/**
 * 工具分类
 */
export enum ToolCategory {
  AI_TOOLS = 'ai-tools',
  CONTENT_TOOLS = 'content-tools',
  UTILITIES = 'utilities',
  CUSTOM = 'custom',
}
```

---

### 2. 工具箱服务

**文件**: `packages/drawnix/src/services/toolbox-service.ts`

```typescript
import { ToolDefinition } from '../types/toolbox.types';
import { BUILT_IN_TOOLS } from '../constants/built-in-tools';

/**
 * 工具箱管理服务（单例）
 */
class ToolboxService {
  private static instance: ToolboxService;
  private customTools: ToolDefinition[] = [];

  private constructor() {}

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
   * 根据 ID 获取工具
   */
  getToolById(id: string): ToolDefinition | null {
    const allTools = this.getAvailableTools();
    return allTools.find(tool => tool.id === id) || null;
  }

  /**
   * 添加自定义工具
   */
  addCustomTool(tool: ToolDefinition): void {
    const exists = this.customTools.some(t => t.id === tool.id);
    if (!exists) {
      this.customTools.push(tool);
    }
  }

  /**
   * 移除自定义工具
   */
  removeCustomTool(id: string): void {
    this.customTools = this.customTools.filter(t => t.id !== id);
  }

  /**
   * 获取工具列表（按分类）
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
}

// 导出单例实例
export const toolboxService = ToolboxService.getInstance();
```

---

### 3. 内置工具配置

**文件**: `packages/drawnix/src/constants/built-in-tools.ts`

```typescript
import { ToolDefinition, ToolCategory } from '../types/toolbox.types';

/**
 * 内置工具列表
 */
export const BUILT_IN_TOOLS: ToolDefinition[] = [
  {
    id: 'banana-prompt',
    name: '香蕉提示词',
    description: '查看和复制优质 AI 提示词',
    icon: '🍌',
    category: ToolCategory.AI_TOOLS,
    url: 'https://aiprompt.cn',
    defaultWidth: 800,
    defaultHeight: 600,
    permissions: ['allow-scripts', 'allow-same-origin'],
  },
  {
    id: 'xiaohongshu-tool',
    name: '小红薯工具',
    description: '小红书文案和图片处理',
    icon: '📝',
    category: ToolCategory.CONTENT_TOOLS,
    url: 'https://www.xiaohongshu.com',
    defaultWidth: 700,
    defaultHeight: 500,
    permissions: ['allow-scripts', 'allow-same-origin', 'allow-forms'],
  },
  {
    id: 'unsplash-images',
    name: 'Unsplash 图片',
    description: '免费高质量图片素材',
    icon: '🖼️',
    category: ToolCategory.CONTENT_TOOLS,
    url: 'https://unsplash.com',
    defaultWidth: 900,
    defaultHeight: 700,
    permissions: ['allow-scripts', 'allow-same-origin'],
  },
];

/**
 * 默认工具配置
 */
export const DEFAULT_TOOL_CONFIG = {
  defaultWidth: 600,
  defaultHeight: 400,
  defaultPermissions: ['allow-scripts', 'allow-same-origin'],
};
```

---

### 4. ToolGenerator 渲染生成器

**文件**: `packages/drawnix/src/components/tool-element/tool.generator.ts`

```typescript
import { PlaitBoard, RectangleClient } from '@plait/core';
import { Generator } from '@plait/common';
import { PlaitTool } from '../../types/toolbox.types';

/**
 * 工具元素渲染生成器
 */
export class ToolGenerator extends Generator<PlaitTool> {
  private board: PlaitBoard;
  private iframeCache = new Map<string, HTMLIFrameElement>();

  constructor(board: PlaitBoard) {
    super();
    this.board = board;
  }

  /**
   * 判断是否可以绘制
   */
  canDraw(element: PlaitTool): boolean {
    return element && element.type === 'tool' && !!element.url;
  }

  /**
   * 绘制工具元素
   */
  draw(element: PlaitTool): SVGGElement {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('data-element-id', element.id);
    g.classList.add('plait-tool-element');

    // 创建 foreignObject
    const foreignObject = this.createForeignObject(element);
    g.appendChild(foreignObject);

    return g;
  }

  /**
   * 更新工具元素
   */
  updateImage(
    nodeG: SVGGElement,
    previous: PlaitTool,
    current: PlaitTool
  ): void {
    // 如果 URL 变化，重新创建
    if (previous.url !== current.url) {
      nodeG.innerHTML = '';
      const foreignObject = this.createForeignObject(current);
      nodeG.appendChild(foreignObject);
      return;
    }

    // 更新位置和尺寸
    const foreignObject = nodeG.querySelector('foreignObject');
    if (foreignObject) {
      const rect = this.getRectangle(current);
      foreignObject.setAttribute('x', rect.x.toString());
      foreignObject.setAttribute('y', rect.y.toString());
      foreignObject.setAttribute('width', rect.width.toString());
      foreignObject.setAttribute('height', rect.height.toString());
    }

    // 更新旋转
    if (current.angle && current.angle !== 0) {
      const rect = this.getRectangle(current);
      const centerX = rect.x + rect.width / 2;
      const centerY = rect.y + rect.height / 2;
      nodeG.setAttribute(
        'transform',
        `rotate(${current.angle} ${centerX} ${centerY})`
      );
    } else {
      nodeG.removeAttribute('transform');
    }
  }

  /**
   * 创建 foreignObject 容器
   */
  private createForeignObject(element: PlaitTool): SVGForeignObjectElement {
    const rect = this.getRectangle(element);

    // 创建 foreignObject
    const foreignObject = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'foreignObject'
    );
    foreignObject.setAttribute('x', rect.x.toString());
    foreignObject.setAttribute('y', rect.y.toString());
    foreignObject.setAttribute('width', rect.width.toString());
    foreignObject.setAttribute('height', rect.height.toString());
    foreignObject.classList.add('plait-tool-foreign-object');

    // 创建容器
    const container = document.createElement('div');
    container.className = 'plait-tool-container';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.overflow = 'hidden';
    container.style.borderRadius = '8px';
    container.style.boxShadow = '0 2px 12px rgba(0, 0, 0, 0.15)';
    container.style.backgroundColor = '#fff';

    // 创建 iframe
    const iframe = this.createIframe(element);
    container.appendChild(iframe);

    // 添加加载提示
    const loader = document.createElement('div');
    loader.className = 'plait-tool-loader';
    loader.textContent = '加载中...';
    loader.style.position = 'absolute';
    loader.style.top = '50%';
    loader.style.left = '50%';
    loader.style.transform = 'translate(-50%, -50%)';
    loader.style.color = '#999';
    container.appendChild(loader);

    // iframe 加载完成后移除 loader
    iframe.onload = () => {
      loader.remove();
    };

    foreignObject.appendChild(container);
    return foreignObject;
  }

  /**
   * 创建 iframe
   */
  private createIframe(element: PlaitTool): HTMLIFrameElement {
    const iframe = document.createElement('iframe');
    iframe.src = element.url;
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.style.display = 'block';

    // 设置 sandbox 权限
    const permissions = element.metadata?.permissions || [
      'allow-scripts',
      'allow-same-origin',
    ];
    iframe.setAttribute('sandbox', permissions.join(' '));

    // 设置 allow 属性
    iframe.setAttribute('allow', 'clipboard-read; clipboard-write');

    // 缓存 iframe
    this.iframeCache.set(element.id, iframe);

    return iframe;
  }

  /**
   * 获取工具元素的矩形区域
   */
  private getRectangle(element: PlaitTool): RectangleClient {
    const [start, end] = element.points;
    const x = Math.min(start[0], end[0]);
    const y = Math.min(start[1], end[1]);
    const width = Math.abs(end[0] - start[0]);
    const height = Math.abs(end[1] - start[1]);

    return { x, y, width, height };
  }

  /**
   * 清理资源
   */
  destroy(): void {
    this.iframeCache.clear();
  }
}
```

---

### 5. ToolComponent 组件

**文件**: `packages/drawnix/src/components/tool-element/tool.component.ts`

```typescript
import {
  PlaitBoard,
  PlaitPluginElementContext,
  OnContextChanged,
} from '@plait/core';
import { CommonElementFlavour } from '@plait/common';
import { PlaitTool } from '../../types/toolbox.types';
import { ToolGenerator } from './tool.generator';

/**
 * 工具元素组件
 */
export class ToolComponent
  extends CommonElementFlavour<PlaitTool, PlaitBoard>
  implements OnContextChanged<PlaitTool, PlaitBoard>
{
  toolGenerator!: ToolGenerator;

  constructor() {
    super();
  }

  /**
   * 初始化生成器
   */
  initializeGenerator(): void {
    this.toolGenerator = new ToolGenerator(this.board);
  }

  /**
   * 组件初始化
   */
  initialize(): void {
    this.initializeGenerator();

    // 绘制初始状态
    const g = this.toolGenerator.draw(this.element);
    const elementG = this.getElementG();
    elementG.appendChild(g);
  }

  /**
   * 响应上下文变化
   */
  onContextChanged(
    value: PlaitPluginElementContext<PlaitTool, PlaitBoard>,
    previous: PlaitPluginElementContext<PlaitTool, PlaitBoard>
  ): void {
    // 元素属性变化时更新
    if (
      value.element !== previous.element ||
      JSON.stringify(value.element) !== JSON.stringify(previous.element)
    ) {
      const g = this.getElementG().querySelector('g');
      if (g) {
        this.toolGenerator.updateImage(
          g as SVGGElement,
          previous.element,
          value.element
        );
      }
    }
  }

  /**
   * 清理资源
   */
  destroy(): void {
    if (this.toolGenerator) {
      this.toolGenerator.destroy();
    }
    super.destroy();
  }
}
```

---

### 6. withTool 插件

**文件**: `packages/drawnix/src/plugins/with-tool.ts`

```typescript
import { PlaitBoard, PlaitPlugin, Point, Transforms } from '@plait/core';
import { PlaitDrawElement } from '@plait/draw';
import { ToolComponent } from '../components/tool-element/tool.component';
import { PlaitTool } from '../types/toolbox.types';
import { v4 as uuidv4 } from 'uuid';

/**
 * 工具插件 - 注册 ToolComponent
 */
export const withTool: PlaitPlugin = (board: PlaitBoard) => {
  const { drawElement } = board;

  // 注册工具元素渲染组件
  board.drawElement = (element: PlaitDrawElement) => {
    if (element.type === 'tool') {
      return ToolComponent;
    }
    return drawElement(element);
  };

  return board;
};

/**
 * 判断是否为工具元素
 */
export function isToolElement(element: any): element is PlaitTool {
  return element && element.type === 'tool';
}

/**
 * 工具元素操作 API
 */
export const ToolTransforms = {
  /**
   * 插入工具到画布
   */
  insertTool(
    board: PlaitBoard,
    toolId: string,
    url: string,
    position: Point,
    size: { width: number; height: number },
    metadata?: PlaitTool['metadata']
  ): PlaitTool {
    const toolElement: PlaitTool = {
      id: uuidv4(),
      type: 'tool',
      toolId,
      url,
      points: [
        position,
        [position[0] + size.width, position[1] + size.height],
      ],
      angle: 0,
      metadata,
    };

    Transforms.insertNodes(board, [toolElement], {
      at: [board.children.length],
    });

    return toolElement;
  },

  /**
   * 更新工具尺寸
   */
  resizeTool(
    board: PlaitBoard,
    element: PlaitTool,
    newSize: { width: number; height: number }
  ): void {
    const [start] = element.points;
    const newElement: Partial<PlaitTool> = {
      points: [start, [start[0] + newSize.width, start[1] + newSize.height]],
    };

    const path = board.children.findIndex(el => el.id === element.id);
    if (path >= 0) {
      Transforms.setNodes(board, newElement, { at: [path] });
    }
  },

  /**
   * 删除工具
   */
  removeTool(board: PlaitBoard, elementId: string): void {
    const path = board.children.findIndex(el => el.id === elementId);
    if (path >= 0) {
      Transforms.removeNodes(board, { at: [path] });
    }
  },

  /**
   * 更新工具 URL
   */
  updateToolUrl(board: PlaitBoard, elementId: string, newUrl: string): void {
    const path = board.children.findIndex(el => el.id === elementId);
    if (path >= 0) {
      Transforms.setNodes(board, { url: newUrl }, { at: [path] });
    }
  },
};
```

---

### 7. 样式文件

**文件**: `packages/drawnix/src/components/tool-element/tool.component.scss`

```scss
.plait-tool-element {
  // 工具元素基础样式
  cursor: move;

  .plait-tool-foreign-object {
    overflow: visible;
  }

  .plait-tool-container {
    position: relative;
    background: #fff;
    border-radius: 8px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
    transition: box-shadow 0.2s ease;

    &:hover {
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    }
  }

  .plait-tool-loader {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 14px;
    color: #999;
    pointer-events: none;
  }

  // 选中状态
  &.selected {
    .plait-tool-container {
      outline: 2px solid var(--brand-primary, #F39C12);
      outline-offset: 2px;
    }
  }
}
```

---

## 🧪 测试代码

### 手动测试脚本

在浏览器控制台执行：

```javascript
// 获取 board 实例
const board = window.__PLAIT_BOARD__;

// 插入香蕉提示词工具
ToolTransforms.insertTool(
  board,
  'banana-prompt',
  'https://aiprompt.cn',
  [100, 100],
  { width: 800, height: 600 }
);
```

---

## 🔧 调试技巧

### 1. 检查元素是否正确插入

```javascript
console.log('Board children:', board.children);
console.log('Tool elements:', board.children.filter(el => el.type === 'tool'));
```

### 2. 检查 foreignObject 渲染

```javascript
const toolElements = document.querySelectorAll('.plait-tool-element');
console.log('Rendered tool elements:', toolElements);
```

### 3. 检查 iframe 加载

```javascript
const iframes = document.querySelectorAll('.plait-tool-container iframe');
iframes.forEach((iframe, i) => {
  console.log(`Iframe ${i}:`, iframe.src, iframe.contentWindow);
});
```

---

## 📚 下一步

完成 Phase 1 后，继续实现：

1. **ToolboxDrawer UI 组件** - 用户可见的工具箱界面
2. **集成到 UnifiedToolbar** - 添加工具箱按钮
3. **测试完整流程** - 从点击到渲染的端到端测试

详见 `ARCHITECTURE.md` 中的 Phase 2 实施计划。
