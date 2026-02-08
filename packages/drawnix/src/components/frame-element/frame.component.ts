/**
 * Frame 元素组件
 *
 * 继承 CommonElementFlavour，集成到 Plait 渲染流程
 */
import {
  PlaitBoard,
  PlaitPluginElementContext,
  OnContextChanged,
  ACTIVE_STROKE_WIDTH,
} from '@plait/core';
import {
  CommonElementFlavour,
  createActiveGenerator,
  ActiveGenerator,
  hasResizeHandle,
} from '@plait/common';
import { PlaitFrame } from '../../types/frame.types';
import { FrameGenerator } from './frame.generator';
import { RectangleClient } from '@plait/core';

export class FrameComponent
  extends CommonElementFlavour<PlaitFrame, PlaitBoard>
  implements OnContextChanged<PlaitFrame, PlaitBoard>
{
  frameGenerator!: FrameGenerator;
  activeGenerator!: ActiveGenerator<PlaitFrame>;
  private renderedG?: SVGGElement;

  constructor() {
    super();
  }

  initializeGenerator(): void {
    this.activeGenerator = createActiveGenerator(this.board, {
      getRectangle: (element: PlaitFrame) => {
        return RectangleClient.getRectangleByPoints(element.points);
      },
      getStrokeWidth: () => ACTIVE_STROKE_WIDTH,
      getStrokeOpacity: () => 1,
      hasResizeHandle: () => {
        return hasResizeHandle(this.board, this.element);
      },
    });

    this.frameGenerator = new FrameGenerator();
  }

  initialize(): void {
    super.initialize();
    this.initializeGenerator();

    const elementG = this.getElementG();
    this.renderedG = this.frameGenerator.processDrawing(this.element, elementG);

    this.activeGenerator.processDrawing(
      this.element,
      PlaitBoard.getActiveHost(this.board),
      { selected: this.selected }
    );
  }

  onContextChanged(
    value: PlaitPluginElementContext<PlaitFrame, PlaitBoard>,
    previous: PlaitPluginElementContext<PlaitFrame, PlaitBoard>
  ): void {
    if (value.element !== previous.element || value.hasThemeChanged) {
      if (this.renderedG) {
        this.frameGenerator.updateDrawing(this.element, this.renderedG);
      }
      this.activeGenerator.processDrawing(
        this.element,
        PlaitBoard.getActiveHost(this.board),
        { selected: this.selected }
      );
    } else {
      const needUpdate = value.selected !== previous.selected;
      if (needUpdate || value.selected) {
        this.activeGenerator.processDrawing(
          this.element,
          PlaitBoard.getActiveHost(this.board),
          { selected: this.selected }
        );
      }
    }
  }

  destroy(): void {
    super.destroy();
    if (this.activeGenerator) {
      this.activeGenerator.destroy();
    }
    if (this.frameGenerator) {
      this.frameGenerator.destroy();
    }
    this.renderedG = undefined;
  }
}
