import {
  PlaitBoard,
  Point,
  Transforms,
  toViewBoxPoint,
  toHostPoint,
  throttleRAF,
  getSelectedElements,
} from '@plait/core';
import { PenPath, PEN_TYPE } from './type';
import {
  hitTestAnchor,
  AnchorHitResult,
  updateAnchorPosition,
  updateHandlePosition,
  updatePenPathPoints,
  getAbsoluteAnchors,
  anchorsToRelative,
} from './utils';
import { isPenPointerType } from './with-pen-create';
import { getPathBoundingBox } from './bezier-utils';

/**
 * 钢笔编辑状态
 */
interface PenEditState {
  /** 正在编辑的元素 */
  editingElement: PenPath | null;
  /** 正在拖拽的锚点/控制柄信息 */
  dragging: AnchorHitResult | null;
  /** 拖拽起始点 */
  dragStartPoint: Point | null;
}

const BOARD_TO_PEN_EDIT_STATE = new WeakMap<PlaitBoard, PenEditState>();

/**
 * 获取编辑状态
 */
function getPenEditState(board: PlaitBoard): PenEditState {
  let state = BOARD_TO_PEN_EDIT_STATE.get(board);
  if (!state) {
    state = {
      editingElement: null,
      dragging: null,
      dragStartPoint: null,
    };
    BOARD_TO_PEN_EDIT_STATE.set(board, state);
  }
  return state;
}

/**
 * 获取当前选中的钢笔路径元素
 */
function getSelectedPenPath(board: PlaitBoard): PenPath | null {
  const selected = getSelectedElements(board);
  if (selected.length === 1 && PenPath.isPenPath(selected[0])) {
    return selected[0] as PenPath;
  }
  return null;
}

/**
 * 扩展钢笔工具编辑功能
 */
export const withPenEdit = (board: PlaitBoard) => {
  const { pointerDown, pointerMove, pointerUp, dblClick } = board;

  board.pointerDown = (event: PointerEvent) => {
    // 如果正在创建模式，跳过编辑逻辑
    if (isPenPointerType(board)) {
      pointerDown(event);
      return;
    }

    const selectedPen = getSelectedPenPath(board);
    if (!selectedPen) {
      pointerDown(event);
      return;
    }

    const state = getPenEditState(board);
    const point = toViewBoxPoint(board, toHostPoint(board, event.x, event.y)) as Point;

    // 检测是否点击了锚点或控制柄
    const hitResult = hitTestAnchor(selectedPen, point);
    
    if (hitResult.anchorIndex >= 0) {
      // 开始拖拽
      state.editingElement = selectedPen;
      state.dragging = hitResult;
      state.dragStartPoint = point;
      
      // 阻止默认行为
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    pointerDown(event);
  };

  board.pointerMove = (event: PointerEvent) => {
    const state = getPenEditState(board);
    
    if (!state.dragging || !state.editingElement) {
      pointerMove(event);
      return;
    }

    const point = toViewBoxPoint(board, toHostPoint(board, event.x, event.y)) as Point;

    // 使用节流更新
    throttleRAF(board, 'pen-edit', () => {
      if (!state.dragging || !state.editingElement) return;

      const element = state.editingElement;
      const { anchorIndex, handleType } = state.dragging;
      
      // 将相对坐标转换为绝对坐标进行编辑
      let absoluteAnchors = getAbsoluteAnchors(element);

      if (handleType === 'anchor') {
        // 移动锚点（使用绝对坐标）
        absoluteAnchors = updateAnchorPosition(absoluteAnchors, anchorIndex, point);
      } else if (handleType === 'handleIn' || handleType === 'handleOut') {
        // 移动控制柄（使用绝对坐标）
        absoluteAnchors = updateHandlePosition(absoluteAnchors, anchorIndex, handleType, point);
      }
      
      // 计算新的包围盒
      const boundingBox = getPathBoundingBox(absoluteAnchors, element.closed);
      const newOrigin: Point = [boundingBox.x, boundingBox.y];
      const newPoints: Point[] = [
        newOrigin,
        [boundingBox.x + boundingBox.width, boundingBox.y + boundingBox.height],
      ];
      
      // 转换回相对坐标存储
      const newAnchors = anchorsToRelative(absoluteAnchors, newOrigin);

      // 更新元素
      const elementIndex = board.children.findIndex(
        (el) => el.id === element.id
      );
      if (elementIndex >= 0) {
        Transforms.setNode(
          board,
          { anchors: newAnchors, points: newPoints },
          [elementIndex]
        );
        // 更新状态中的元素引用
        state.editingElement = board.children[elementIndex] as PenPath;
      }
    });

    event.preventDefault();
    event.stopPropagation();
  };

  board.pointerUp = (event: PointerEvent) => {
    const state = getPenEditState(board);
    
    if (state.dragging) {
      // 结束拖拽
      state.dragging = null;
      state.dragStartPoint = null;
      state.editingElement = null;
      
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    pointerUp(event);
  };

  board.dblClick = (event: MouseEvent) => {
    const selectedPen = getSelectedPenPath(board);
    if (!selectedPen) {
      dblClick(event);
      return;
    }

    const point = toViewBoxPoint(board, toHostPoint(board, event.x, event.y)) as Point;
    const hitResult = hitTestAnchor(selectedPen, point);

    if (hitResult.anchorIndex >= 0 && hitResult.handleType === 'anchor') {
      // 双击锚点切换类型
      const anchor = selectedPen.anchors[hitResult.anchorIndex];
      let newType: 'corner' | 'smooth' | 'symmetric';
      
      // 循环切换：corner -> smooth -> symmetric -> corner
      if (anchor.type === 'corner') {
        newType = 'smooth';
      } else if (anchor.type === 'smooth') {
        newType = 'symmetric';
      } else {
        newType = 'corner';
        // 角点时清除控制柄
      }

      const newAnchors = [...selectedPen.anchors];
      if (newType === 'corner') {
        newAnchors[hitResult.anchorIndex] = {
          ...anchor,
          type: newType,
          handleIn: undefined,
          handleOut: undefined,
        };
      } else {
        newAnchors[hitResult.anchorIndex] = {
          ...anchor,
          type: newType,
        };
      }

      const elementIndex = board.children.findIndex(
        (el) => el.id === selectedPen.id
      );
      if (elementIndex >= 0) {
        Transforms.setNode(board, { anchors: newAnchors }, [elementIndex]);
      }

      event.preventDefault();
      event.stopPropagation();
      return;
    }

    dblClick(event);
  };

  return board;
};
