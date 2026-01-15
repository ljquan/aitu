import {
  PlaitBoard,
  PlaitPluginElementContext,
  OnContextChanged,
  ACTIVE_STROKE_WIDTH,
  Point,
  Transforms,
} from '@plait/core';
import {
  ActiveGenerator,
  CommonElementFlavour,
  createActiveGenerator,
  hasResizeHandle,
} from '@plait/common';
import { PenPath, PenAnchor } from './type';
import { PenGenerator, drawPenEditOverlay } from './pen.generator';
import { getPenPathRectangle } from './utils';

/**
 * 钢笔路径组件
 * 用于渲染钢笔工具创建的矢量路径
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
  
  /** 上次的 points[0]，用于检测移动 */
  private lastOrigin: Point | null = null;

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
    // 记录初始原点
    if (this.element.points && this.element.points.length > 0) {
      this.lastOrigin = [...this.element.points[0]] as Point;
    }
  }

  onContextChanged(
    value: PlaitPluginElementContext<PenPath, PlaitBoard>,
    previous: PlaitPluginElementContext<PenPath, PlaitBoard>
  ) {
    // 检查是否需要同步 anchors（points 发生了移动）
    this.syncAnchorsIfMoved(value.element, previous.element);
    
    // 检查元素或主题是否变化
    if (value.element !== previous.element || value.hasThemeChanged) {
      this.generator.processDrawing(this.element, this.getElementG());
      this.activeGenerator.processDrawing(
        this.element,
        PlaitBoard.getActiveHost(this.board),
        { selected: this.selected }
      );
      // 更新编辑覆盖层
      this.updateEditOverlay();
    } else {
      const needUpdate = value.selected !== previous.selected;
      if (needUpdate || value.selected) {
        this.activeGenerator.processDrawing(
          this.element,
          PlaitBoard.getActiveHost(this.board),
          { selected: this.selected }
        );
        // 更新编辑覆盖层
        this.updateEditOverlay();
      }
    }
  }
  
  /**
   * 检测 points 是否发生了位移，如果是则同步更新 anchors
   */
  private syncAnchorsIfMoved(
    current: PenPath,
    previous: PenPath
  ) {
    if (!current.points || current.points.length === 0) return;
    if (!this.lastOrigin) {
      this.lastOrigin = [...current.points[0]] as Point;
      return;
    }
    
    const currentOrigin = current.points[0];
    const deltaX = currentOrigin[0] - this.lastOrigin[0];
    const deltaY = currentOrigin[1] - this.lastOrigin[1];
    
    // 如果有位移，同步更新 anchors
    if (Math.abs(deltaX) > 0.001 || Math.abs(deltaY) > 0.001) {
      // 更新 lastOrigin
      this.lastOrigin = [...currentOrigin] as Point;
      
      // 计算新的 anchors
      const newAnchors: PenAnchor[] = current.anchors.map(anchor => ({
        ...anchor,
        point: [anchor.point[0] + deltaX, anchor.point[1] + deltaY] as Point,
        handleIn: anchor.handleIn 
          ? [anchor.handleIn[0] + deltaX, anchor.handleIn[1] + deltaY] as Point 
          : undefined,
        handleOut: anchor.handleOut 
          ? [anchor.handleOut[0] + deltaX, anchor.handleOut[1] + deltaY] as Point 
          : undefined,
      }));
      
      // 使用 setTimeout 避免在 onContextChanged 中直接修改
      const elementId = current.id;
      setTimeout(() => {
        const path = this.board.children.findIndex(
          (child: any) => child.id === elementId
        );
        if (path >= 0) {
          Transforms.setNode(this.board, { anchors: newAnchors }, [path]);
        }
      }, 0);
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
