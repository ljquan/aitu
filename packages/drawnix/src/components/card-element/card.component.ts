/**
 * Card 标签贴元素组件
 *
 * 继承 CommonElementFlavour，集成到 Plait 渲染流程
 * 支持选中、拖拽、缩放、删除等标准画布操作
 * Card 在画布上仅作只读展示，编辑通过知识库进行
 */
import {
  PlaitBoard,
  PlaitPluginElementContext,
  OnContextChanged,
  ACTIVE_STROKE_WIDTH,
  RectangleClient,
} from '@plait/core';
import {
  CommonElementFlavour,
  createActiveGenerator,
  ActiveGenerator,
  hasResizeHandle,
} from '@plait/common';
import { PlaitCard } from '../../types/card.types';
import { CardGenerator } from './card.generator';

export class CardComponent
  extends CommonElementFlavour<PlaitCard, PlaitBoard>
  implements OnContextChanged<PlaitCard, PlaitBoard>
{
  cardGenerator!: CardGenerator;
  activeGenerator!: ActiveGenerator<PlaitCard>;
  private renderedG?: SVGGElement;

  constructor() {
    super();
  }

  initializeGenerator(): void {
    this.activeGenerator = createActiveGenerator(this.board, {
      getRectangle: (element: PlaitCard) => {
        return RectangleClient.getRectangleByPoints(element.points);
      },
      getStrokeWidth: () => ACTIVE_STROKE_WIDTH,
      getStrokeOpacity: () => 1,
      hasResizeHandle: () => {
        return hasResizeHandle(this.board, this.element);
      },
    });

    this.cardGenerator = new CardGenerator();
  }

  initialize(): void {
    super.initialize();
    this.initializeGenerator();

    const elementG = this.getElementG();
    this.renderedG = this.cardGenerator.processDrawing(this.element, elementG);

    this.activeGenerator.processDrawing(
      this.element,
      PlaitBoard.getActiveHost(this.board),
      { selected: this.selected }
    );
  }

  onContextChanged(
    value: PlaitPluginElementContext<PlaitCard, PlaitBoard>,
    previous: PlaitPluginElementContext<PlaitCard, PlaitBoard>
  ): void {
    const viewportChanged =
      value.board.viewport.zoom !== previous.board.viewport.zoom ||
      value.board.viewport.offsetX !== previous.board.viewport.offsetX ||
      value.board.viewport.offsetY !== previous.board.viewport.offsetY;

    if (value.element !== previous.element || value.hasThemeChanged) {
      if (this.renderedG) {
        this.cardGenerator.updateDrawing(this.element, this.renderedG);
      }
      this.activeGenerator.processDrawing(
        this.element,
        PlaitBoard.getActiveHost(this.board),
        { selected: this.selected }
      );
    } else if (viewportChanged && value.selected) {
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
    if (this.cardGenerator) {
      this.cardGenerator.destroy();
    }
    this.renderedG = undefined;
  }
}
