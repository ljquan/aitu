import {
  PlaitBoard,
  PlaitPluginElementContext,
  OnContextChanged,
  ACTIVE_STROKE_WIDTH,
  isSelectionMoving,
} from '@plait/core';
import {
  ActiveGenerator,
  CommonElementFlavour,
  createActiveGenerator,
  hasResizeHandle,
} from '@plait/common';
import { PenPath } from './type';
import { PenGenerator, drawPenEditOverlay } from './pen.generator';
import { getPenPathRectangle } from './utils';

/**
 * 钢笔路径组件
 * 用于渲染钢笔工具创建的矢量路径
 * 
 * 注意：anchors 使用相对坐标存储，移动时只需更新 points，
 * 渲染时会自动转换为绝对坐标。
 */
export class PenPathComponent
  extends CommonElementFlavour<PenPath, PlaitBoard>
  implements OnContextChanged<PenPath, PlaitBoard>
{
  constructor() {
    super();
  }

  activeGenerator!: ActiveGenerator<PenPath>;
  generator!: PenGenerator;
  editOverlayG: SVGGElement | null = null;

  initializeGenerator() {
    this.activeGenerator = createActiveGenerator(this.board, {
      getRectangle: (element: PenPath) => {
        return getPenPathRectangle(element);
      },
      getStrokeWidth: () => ACTIVE_STROKE_WIDTH,
      getStrokeOpacity: () => 1,
      hasResizeHandle: () => {
        return hasResizeHandle(this.board, this.element);
      },
    });
    this.generator = new PenGenerator(this.board);
  }

  initialize(): void {
    super.initialize();
    this.initializeGenerator();
    this.generator.processDrawing(this.element, this.getElementG());
    
    // 如果初始化时就是选中状态，绘制选中框
    if (this.selected) {
      this.activeGenerator.processDrawing(
        this.element,
        PlaitBoard.getActiveHost(this.board),
        { selected: this.selected }
      );
      this.updateEditOverlay();
    }
  }

  onContextChanged(
    value: PlaitPluginElementContext<PenPath, PlaitBoard>,
    previous: PlaitPluginElementContext<PenPath, PlaitBoard>
  ) {
    // 检查是否正在移动
    const isMoving = isSelectionMoving(this.board);
    
    // 检查元素或主题是否变化
    if (value.element !== previous.element || value.hasThemeChanged) {
      this.generator.processDrawing(this.element, this.getElementG());
      this.activeGenerator.processDrawing(
        this.element,
        PlaitBoard.getActiveHost(this.board),
        { selected: this.selected }
      );
      // 移动时不更新编辑覆盖层（避免性能问题）
      if (!isMoving) {
        this.updateEditOverlay();
      } else {
        // 移动时隐藏编辑覆盖层
        this.hideEditOverlay();
      }
    } else {
      const needUpdate = value.selected !== previous.selected;
      if (needUpdate || value.selected) {
        this.activeGenerator.processDrawing(
          this.element,
          PlaitBoard.getActiveHost(this.board),
          { selected: this.selected }
        );
        // 更新编辑覆盖层
        if (!isMoving) {
          this.updateEditOverlay();
        }
      }
    }
  }

  /**
   * 隐藏编辑覆盖层
   */
  private hideEditOverlay() {
    if (this.editOverlayG) {
      this.editOverlayG.remove();
      this.editOverlayG = null;
    }
  }

  /**
   * 更新编辑覆盖层（显示锚点和控制柄）
   */
  private updateEditOverlay() {
    // 移除旧的覆盖层
    if (this.editOverlayG) {
      this.editOverlayG.remove();
      this.editOverlayG = null;
    }

    // 如果选中，显示编辑覆盖层
    if (this.selected) {
      this.editOverlayG = drawPenEditOverlay(this.element);
      PlaitBoard.getActiveHost(this.board).appendChild(this.editOverlayG);
    }
  }

  destroy(): void {
    super.destroy();
    this.activeGenerator?.destroy();
    if (this.editOverlayG) {
      this.editOverlayG.remove();
      this.editOverlayG = null;
    }
  }
}
