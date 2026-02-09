import {
  PlaitBoard,
  PlaitPluginElementContext,
  OnContextChanged,
  isSelectionMoving,
  ACTIVE_STROKE_WIDTH,
} from '@plait/core';
import {
  ActiveGenerator,
  CommonElementFlavour,
  createActiveGenerator,
  hasResizeHandle,
} from '@plait/common';
import { Freehand } from './type';
import { FreehandGenerator } from './freehand.generator';
import { getFreehandRectangle } from './utils';

export class FreehandComponent
  extends CommonElementFlavour<Freehand, PlaitBoard>
  implements OnContextChanged<Freehand, PlaitBoard>
{
  constructor() {
    super();
  }

  activeGenerator!: ActiveGenerator<Freehand>;

  generator!: FreehandGenerator;

  initializeGenerator() {
    this.activeGenerator = createActiveGenerator(this.board, {
      getRectangle: (element: Freehand) => {
        return getFreehandRectangle(element);
      },
      getStrokeWidth: () => ACTIVE_STROKE_WIDTH,
      getStrokeOpacity: () => 1,
      hasResizeHandle: () => {
        return hasResizeHandle(this.board, this.element);
      },
    });
    this.generator = new FreehandGenerator(this.board);
  }

  initialize(): void {
    super.initialize();
    this.initializeGenerator();
    this.generator.processDrawing(this.element, this.getElementG());
  }

  onContextChanged(
    value: PlaitPluginElementContext<Freehand, PlaitBoard>,
    previous: PlaitPluginElementContext<Freehand, PlaitBoard>
  ) {
    // 检查 viewport (zoom/scroll) 是否改变
    const viewportChanged =
      value.board.viewport.zoom !== previous.board.viewport.zoom ||
      value.board.viewport.offsetX !== previous.board.viewport.offsetX ||
      value.board.viewport.offsetY !== previous.board.viewport.offsetY;

    // 检查元素或主题是否变化
    if (value.element !== previous.element || value.hasThemeChanged) {
      this.generator.processDrawing(this.element, this.getElementG());
      this.activeGenerator.processDrawing(
        this.element,
        PlaitBoard.getActiveHost(this.board),
        { selected: this.selected }
      );
    } else if (viewportChanged && value.selected) {
      // viewport 改变且元素被选中时，更新选择框位置
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
    this.activeGenerator?.destroy();
  }
}
