import {
  PlaitBoard,
  Point,
  Transforms,
  toViewBoxPoint,
  toHostPoint,
  throttleRAF,
  clearSelectedElement,
} from '@plait/core';
import { PenAnchor, PenPath, PenShape, PEN_TYPE } from './type';
import { createPenPath, isHitStartAnchor, updatePenPathPoints } from './utils';
import { createSymmetricHandles, distanceBetweenPoints } from './bezier-utils';
import { drawPenPreview } from './pen.generator';
import { getPenSettings } from './pen-settings';

/** 最小拖拽距离，小于此值视为点击 */
const MIN_DRAG_DISTANCE = 3;

/** 闭合路径的最小锚点数 */
const MIN_ANCHORS_FOR_CLOSE = 3;

/**
 * 钢笔工具创建状态
 */
interface PenCreateState {
  /** 是否正在创建路径 */
  isCreating: boolean;
  /** 当前路径的锚点 */
  anchors: PenAnchor[];
  /** 是否正在拖拽控制柄 */
  isDraggingHandle: boolean;
  /** 拖拽起点 */
  dragStartPoint: Point | null;
  /** 当前鼠标位置 */
  currentPoint: Point | null;
  /** 预览 SVG 组 */
  previewG: SVGGElement | null;
}

const BOARD_TO_PEN_STATE = new WeakMap<PlaitBoard, PenCreateState>();

/**
 * 获取钢笔创建状态
 */
function getPenState(board: PlaitBoard): PenCreateState {
  let state = BOARD_TO_PEN_STATE.get(board);
  if (!state) {
    state = {
      isCreating: false,
      anchors: [],
      isDraggingHandle: false,
      dragStartPoint: null,
      currentPoint: null,
      previewG: null,
    };
    BOARD_TO_PEN_STATE.set(board, state);
  }
  return state;
}

/**
 * 重置钢笔创建状态
 */
function resetPenState(board: PlaitBoard) {
  const state = getPenState(board);
  // 清理预览
  if (state.previewG) {
    state.previewG.remove();
  }
  // 额外清理：移除所有可能残留的预览元素
  cleanupPenPreviewElements(board);
  
  state.isCreating = false;
  state.anchors = [];
  state.isDraggingHandle = false;
  state.dragStartPoint = null;
  state.currentPoint = null;
  state.previewG = null;
}

/**
 * 清理所有钢笔预览元素
 */
function cleanupPenPreviewElements(board: PlaitBoard) {
  const host = PlaitBoard.getElementHost(board);
  // 移除所有 pen-preview 类的元素
  const previewElements = host.querySelectorAll('.pen-preview');
  previewElements.forEach(el => el.remove());
}

/**
 * 更新预览
 */
function updatePreview(board: PlaitBoard) {
  const state = getPenState(board);
  const host = PlaitBoard.getElementHost(board);

  // 移除旧预览
  if (state.previewG) {
    state.previewG.remove();
  }

  // 创建新预览
  state.previewG = drawPenPreview(
    state.anchors,
    state.currentPoint as [number, number] | null
  );

  host.appendChild(state.previewG);
}

/**
 * 完成路径创建
 */
function finishPath(board: PlaitBoard, closed: boolean = false) {
  const state = getPenState(board);

  // 先保存锚点副本，然后立即清理预览
  const anchorsCopy = [...state.anchors];
  
  // 立即移除预览 - 在任何其他操作之前
  if (state.previewG) {
    state.previewG.remove();
    state.previewG = null;
  }
  // 彻底清理所有可能残留的预览元素
  cleanupPenPreviewElements(board);

  if (anchorsCopy.length >= 2) {
    // 创建钢笔路径元素
    const penPath = createPenPath(board, anchorsCopy, closed);
    
    // 重置状态（在插入前清理，避免状态残留）
    state.isCreating = false;
    state.anchors = [];
    state.isDraggingHandle = false;
    state.dragStartPoint = null;
    state.currentPoint = null;
    
    // 插入到画布
    Transforms.insertNode(board, penPath, [board.children.length]);
    
    // 清除选中状态，保持钢笔工具激活，可继续绘制新路径
    clearSelectedElement(board);
  } else {
    // 锚点不足，只重置状态
    resetPenState(board);
  }
}

/**
 * 判断是否是钢笔工具模式
 */
export function isPenPointerType(board: PlaitBoard): boolean {
  const pointerType = PlaitBoard.getPointer(board);
  return pointerType === PenShape.pen;
}

/**
 * 检测并处理工具切换
 * 如果正在创建路径且切换到其他工具，完成或取消创建
 */
function checkAndFinishOnToolSwitch(board: PlaitBoard) {
  const state = getPenState(board);
  
  if (!state.isCreating) return;
  
  // 如果正在创建且当前不是钢笔工具
  if (!isPenPointerType(board)) {
    if (state.anchors.length >= 2) {
      // 有足够锚点，完成路径
      finishPath(board, false);
    } else {
      // 锚点不足，取消创建
      resetPenState(board);
    }
  }
}

/**
 * 扩展钢笔工具创建功能
 */
export const withPenCreate = (board: PlaitBoard) => {
  const { pointerDown, pointerMove, pointerUp, globalPointerUp, keyDown } = board;

  board.pointerDown = (event: PointerEvent) => {
    // 检测工具切换，如果正在创建路径且切换到其他工具，完成或取消
    checkAndFinishOnToolSwitch(board);
    
    if (!isPenPointerType(board)) {
      pointerDown(event);
      return;
    }

    const state = getPenState(board);
    const point = toViewBoxPoint(board, toHostPoint(board, event.x, event.y)) as Point;

    // 检查是否点击了起始锚点（闭合路径）
    if (state.isCreating && state.anchors.length >= MIN_ANCHORS_FOR_CLOSE) {
      const tempPath = { anchors: state.anchors, closed: false } as PenPath;
      if (isHitStartAnchor(tempPath, point)) {
        finishPath(board, true);
        return;
      }
    }

    // 开始创建或添加锚点
    state.isCreating = true;
    state.isDraggingHandle = true;
    state.dragStartPoint = point;

    // 获取默认锚点类型
    const settings = getPenSettings(board);
    const defaultAnchorType = settings.defaultAnchorType;

    // 添加新锚点
    const newAnchor: PenAnchor = {
      point,
      type: defaultAnchorType,
    };
    state.anchors.push(newAnchor);

    updatePreview(board);
  };

  board.pointerMove = (event: PointerEvent) => {
    if (!isPenPointerType(board)) {
      pointerMove(event);
      return;
    }

    const state = getPenState(board);
    const point = toViewBoxPoint(board, toHostPoint(board, event.x, event.y)) as Point;
    state.currentPoint = point;

    if (state.isDraggingHandle && state.dragStartPoint && state.anchors.length > 0) {
      // 正在拖拽控制柄
      const dragDistance = distanceBetweenPoints(state.dragStartPoint, point);
      
      if (dragDistance > MIN_DRAG_DISTANCE) {
        // 更新最后一个锚点的控制柄
        const lastIndex = state.anchors.length - 1;
        const anchor = state.anchors[lastIndex];
        
        // 根据锚点类型决定是否创建控制柄
        if (anchor.type === 'corner') {
          // 角点：不创建控制柄，保持直线连接
          // 不做任何修改
        } else if (anchor.type === 'smooth' || anchor.type === 'symmetric') {
          // 平滑点和对称点：创建对称控制柄
          const handles = createSymmetricHandles(anchor.point, point);
          
          state.anchors[lastIndex] = {
            ...anchor,
            handleIn: handles.handleIn,
            handleOut: handles.handleOut,
          };
        }
      }
    }

    // 使用节流更新预览
    if (state.isCreating) {
      throttleRAF(board, 'pen-preview', () => {
        updatePreview(board);
      });
    }

    pointerMove(event);
  };

  board.pointerUp = (event: PointerEvent) => {
    if (!isPenPointerType(board)) {
      pointerUp(event);
      return;
    }

    const state = getPenState(board);
    
    // 结束控制柄拖拽
    state.isDraggingHandle = false;
    state.dragStartPoint = null;

    updatePreview(board);
    pointerUp(event);
  };

  board.globalPointerUp = (event: PointerEvent) => {
    globalPointerUp(event);
  };

  board.keyDown = (event: KeyboardEvent) => {
    if (!isPenPointerType(board)) {
      keyDown(event);
      return;
    }

    const state = getPenState(board);

    // Enter 键完成路径
    if (event.key === 'Enter' && state.isCreating) {
      finishPath(board, false);
      event.preventDefault();
      return;
    }

    // Escape 键取消创建
    if (event.key === 'Escape' && state.isCreating) {
      resetPenState(board);
      event.preventDefault();
      return;
    }

    // Backspace/Delete 删除最后一个锚点
    if ((event.key === 'Backspace' || event.key === 'Delete') && state.isCreating) {
      if (state.anchors.length > 0) {
        state.anchors.pop();
        updatePreview(board);
      }
      if (state.anchors.length === 0) {
        resetPenState(board);
      }
      event.preventDefault();
      return;
    }

    keyDown(event);
  };

  return board;
};

/**
 * 导出取消创建函数（供外部调用）
 */
export function cancelPenCreation(board: PlaitBoard) {
  resetPenState(board);
}

/**
 * 导出完成创建函数（供外部调用）
 */
export function completePenCreation(board: PlaitBoard, closed: boolean = false) {
  finishPath(board, closed);
}

/**
 * 检查是否正在创建钢笔路径
 */
export function isPenCreating(board: PlaitBoard): boolean {
  const state = BOARD_TO_PEN_STATE.get(board);
  return state?.isCreating ?? false;
}

/**
 * 工具切换时调用，结束钢笔绘制
 * 如果有足够锚点则完成路径，否则取消
 */
export function finishPenOnToolSwitch(board: PlaitBoard) {
  const state = BOARD_TO_PEN_STATE.get(board);
  if (!state?.isCreating) return;
  
  if (state.anchors.length >= 2) {
    finishPath(board, false);
  } else {
    resetPenState(board);
  }
}
