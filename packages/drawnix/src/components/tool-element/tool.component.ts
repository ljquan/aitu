/**
 * Tool Component
 *
 * 工具元素组件
 * 继承 CommonElementFlavour，集成到 Plait 渲染流程
 */

import {
  PlaitBoard,
  PlaitPluginElementContext,
  OnContextChanged,
  RectangleClient,
  ACTIVE_STROKE_WIDTH,
} from '@plait/core';
import {
  CommonElementFlavour,
  ActiveGenerator,
  createActiveGenerator,
  hasResizeHandle,
} from '@plait/common';
import { PlaitTool } from '../../types/toolbox.types';
import { ToolGenerator } from './tool.generator';
import {
  registerToolGenerator,
  unregisterToolGenerator,
} from '../../plugins/with-tool-focus';

/**
 * 工具元素组件
 *
 * 负责在画布上渲染工具元素，并响应元素变化
 */
export class ToolComponent
  extends CommonElementFlavour<PlaitTool, PlaitBoard>
  implements OnContextChanged<PlaitTool, PlaitBoard>
{
  toolGenerator!: ToolGenerator;
  activeGenerator!: ActiveGenerator<PlaitTool>;
  private renderedG?: SVGGElement;

  constructor() {
    super();
  }

  /**
   * 初始化生成器
   */
  initializeGenerator(): void {
    // 初始化选中状态生成器
    this.activeGenerator = createActiveGenerator(this.board, {
      getRectangle: (element: PlaitTool) => {
        // 从 points 计算矩形边界
        return RectangleClient.getRectangleByPoints(element.points);
      },
      getStrokeWidth: () => ACTIVE_STROKE_WIDTH,
      getStrokeOpacity: () => 1,
      hasResizeHandle: () => {
        return hasResizeHandle(this.board, this.element);
      },
    });

    // 初始化工具渲染生成器
    this.toolGenerator = new ToolGenerator(this.board);

    // 注册 ToolGenerator 以支持焦点管理
    registerToolGenerator(this.board, this.element.id, this.toolGenerator);
  }

  /**
   * 组件初始化
   * 在元素首次渲染时调用
   */
  initialize(): void {
    super.initialize();
    this.initializeGenerator();

    // console.log('ToolComponent initialize - element:', this.element);
    // console.log('ToolComponent initialize - points:', this.element.points);

    // 检查是否可以绘制
    if (!this.toolGenerator.canDraw(this.element)) {
      console.warn('Cannot draw tool element:', this.element);
      return;
    }

    // 绘制初始状态
    const g = this.toolGenerator.draw(this.element);
    this.renderedG = g;

    // 获取元素容器并添加到 DOM
    const elementG = this.getElementG();
    elementG.appendChild(g);

    // console.log('ToolComponent initialized:', this.element.id);
  }

  /**
   * 响应上下文变化
   * 当元素属性变化时调用
   */
  onContextChanged(
    value: PlaitPluginElementContext<PlaitTool, PlaitBoard>,
    previous: PlaitPluginElementContext<PlaitTool, PlaitBoard>
  ): void {
    // 检查 viewport (zoom/scroll) 是否改变
    const viewportChanged =
      value.board.viewport.zoom !== previous.board.viewport.zoom ||
      value.board.viewport.offsetX !== previous.board.viewport.offsetX ||
      value.board.viewport.offsetY !== previous.board.viewport.offsetY;

    // 如果元素本身改变或主题改变，重新绘制
    if (value.element !== previous.element || value.hasThemeChanged) {
      // 查找已渲染的 g 元素
      const elementG = this.getElementG();
      let g = elementG.querySelector('g.plait-tool-element') as SVGGElement;

      if (!g && this.renderedG) {
        g = this.renderedG;
      }

      if (g) {
        // 更新现有元素
        this.toolGenerator.updateImage(g, previous.element, value.element);
      } else {
        // 如果找不到 g 元素，重新绘制
        console.warn('ToolComponent: g element not found, redrawing');
        this.initialize();
      }

      // 更新选中状态高亮
      this.activeGenerator.processDrawing(
        this.element,
        PlaitBoard.getActiveHost(this.board),
        {
          selected: this.selected,
        }
      );
    } else if (viewportChanged && value.selected) {
      // viewport 改变且元素被选中时，更新高亮位置
      this.activeGenerator.processDrawing(
        this.element,
        PlaitBoard.getActiveHost(this.board),
        {
          selected: this.selected,
        }
      );
    } else {
      // 只有选中状态改变时，只更新高亮
      const needUpdate = value.selected !== previous.selected;
      if (needUpdate || value.selected) {
        this.activeGenerator.processDrawing(
          this.element,
          PlaitBoard.getActiveHost(this.board),
          {
            selected: this.selected,
          }
        );
      }
    }
  }

  /**
   * 清理资源
   * 在元素被销毁时调用
   */
  destroy(): void {
    super.destroy();

    // 取消注册 ToolGenerator
    if (this.element) {
      unregisterToolGenerator(this.board, this.element.id);
    }

    if (this.activeGenerator) {
      this.activeGenerator.destroy();
    }
    if (this.toolGenerator) {
      this.toolGenerator.destroy();
    }
    this.renderedG = undefined;
    // console.log('ToolComponent destroyed');
  }
}
