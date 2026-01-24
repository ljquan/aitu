import {
  PlaitBoard,
  Point,
  Transforms,
  toViewBoxPoint,
  toHostPoint,
  throttleRAF,
  clearSelectedElement,
  addSelectedElement,
} from '@plait/core';
import { isHotkey } from 'is-hotkey';
import { PenAnchor, PenPath, PenShape, PEN_TYPE } from './type';
import { createPenPath, isHitStartAnchor, updatePenPathPoints } from './utils';
import { createSymmetricHandles, distanceBetweenPoints } from './bezier-utils';
import { drawPenPreview } from './pen.generator';
import { getPenSettings } from './pen-settings';

/** 最小拖拽距离，小于此值视为点击 */
const MIN_DRAG_DISTANCE = 3;

/** 闭合路径的最小锚点数 */
const MIN_ANCHORS_FOR_CLOSE = 3;

/** 磁吸阈值（像素），小于此距离时吸附到对齐位置 */
const SNAP_THRESHOLD = 8;

/**
 * 对齐信息
 */
interface AlignmentInfo {
  /** 是否水平对齐 */
  horizontal: boolean;
  /** 是否垂直对齐 */
  vertical: boolean;
  /** 水平对齐的参考点 */
  horizontalRefPoint: Point | null;
  /** 垂直对齐的参考点 */
  verticalRefPoint: Point | null;
  /** 兼容旧代码的参考点（取第一个有效的） */
  referencePoint: Point | null;
}

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
  /** 当前对齐信息 */
  alignment: AlignmentInfo;
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
      alignment: { horizontal: false, vertical: false, horizontalRefPoint: null, verticalRefPoint: null, referencePoint: null },
    };
    BOARD_TO_PEN_STATE.set(board, state);
  }
  return state;
}

/**
 * 检测对齐并应用磁吸（检测与所有锚点的对齐）
 * @param point 当前鼠标位置
 * @param allAnchors 所有已存在的锚点
 * @param excludeLastAnchor 是否排除最后一个锚点（拖拽控制柄时使用）
 * @returns 磁吸后的位置和对齐信息
 */
function checkAlignmentAndSnap(
  point: Point,
  allAnchors: PenAnchor[],
  excludeLastAnchor: boolean = false
): { snappedPoint: Point; alignment: AlignmentInfo } {
  const alignment: AlignmentInfo = {
    horizontal: false,
    vertical: false,
    horizontalRefPoint: null,
    verticalRefPoint: null,
    referencePoint: null,
  };

  const snappedPoint: Point = [...point];
  
  // 确定要检测的锚点
  const anchorsToCheck = excludeLastAnchor && allAnchors.length > 1 
    ? allAnchors.slice(0, -1) 
    : allAnchors;

  if (anchorsToCheck.length === 0) {
    return { snappedPoint: point, alignment };
  }

  // 找到最近的垂直对齐点（X 坐标最接近的）
  let minDx = SNAP_THRESHOLD;
  let verticalSnapX: number | null = null;
  let verticalRefPoint: Point | null = null;

  // 找到最近的水平对齐点（Y 坐标最接近的）
  let minDy = SNAP_THRESHOLD;
  let horizontalSnapY: number | null = null;
  let horizontalRefPoint: Point | null = null;

  for (const anchor of anchorsToCheck) {
    const dx = Math.abs(point[0] - anchor.point[0]);
    const dy = Math.abs(point[1] - anchor.point[1]);

    // 检测垂直对齐（X 坐标接近）
    if (dx < minDx) {
      minDx = dx;
      verticalSnapX = anchor.point[0];
      verticalRefPoint = anchor.point;
    }

    // 检测水平对齐（Y 坐标接近）
    if (dy < minDy) {
      minDy = dy;
      horizontalSnapY = anchor.point[1];
      horizontalRefPoint = anchor.point;
    }
  }

  // 应用垂直对齐磁吸
  if (verticalSnapX !== null) {
    snappedPoint[0] = verticalSnapX;
    alignment.vertical = true;
    alignment.verticalRefPoint = verticalRefPoint;
  }

  // 应用水平对齐磁吸
  if (horizontalSnapY !== null) {
    snappedPoint[1] = horizontalSnapY;
    alignment.horizontal = true;
    alignment.horizontalRefPoint = horizontalRefPoint;
  }

  // 设置兼容的 referencePoint
  alignment.referencePoint = alignment.verticalRefPoint || alignment.horizontalRefPoint;

  return { snappedPoint, alignment };
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
  state.alignment = { horizontal: false, vertical: false, horizontalRefPoint: null, verticalRefPoint: null, referencePoint: null };
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

  // 创建新预览（带对齐辅助线）
  state.previewG = drawPenPreview(
    state.anchors,
    state.currentPoint as [number, number] | null,
    '#1890ff',
    2,
    state.alignment
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
    
    if (closed) {
      // 闭合路径：自动选中新创建的图形
      clearSelectedElement(board);
      addSelectedElement(board, penPath);
    } else {
      // 非闭合路径：清除选中状态，保持钢笔工具激活，可继续绘制新路径
      clearSelectedElement(board);
    }
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
    let point = toViewBoxPoint(board, toHostPoint(board, event.x, event.y)) as Point;

    // 检查是否点击了起始锚点（闭合路径）
    if (state.isCreating && state.anchors.length >= MIN_ANCHORS_FOR_CLOSE) {
      const tempPath = { anchors: state.anchors, closed: false } as PenPath;
      if (isHitStartAnchor(tempPath, point)) {
        finishPath(board, true);
        return;
      }
    }

    // 应用磁吸 - 对齐到所有已存在的锚点
    if (state.anchors.length > 0) {
      const { snappedPoint } = checkAlignmentAndSnap(point, state.anchors, false);
      point = snappedPoint;
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
    
    // 重置对齐状态
    state.alignment = { horizontal: false, vertical: false, horizontalRefPoint: null, verticalRefPoint: null, referencePoint: null };

    updatePreview(board);
  };

  board.pointerMove = (event: PointerEvent) => {
    if (!isPenPointerType(board)) {
      pointerMove(event);
      return;
    }

    const state = getPenState(board);
    let point = toViewBoxPoint(board, toHostPoint(board, event.x, event.y)) as Point;
    
    // 检测对齐并应用磁吸（检测与所有锚点的对齐）
    // 如果正在拖拽控制柄，排除最后一个锚点（因为它是当前正在编辑的锚点）
    const excludeLastAnchor = state.isDraggingHandle;
    const { snappedPoint, alignment } = checkAlignmentAndSnap(point, state.anchors, excludeLastAnchor);
    state.currentPoint = snappedPoint;
    state.alignment = alignment;

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

    // Cmd+Z / Ctrl+Z 撤销上一个锚点（在钢笔创建过程中）
    if (isHotkey(['mod+z'], { byKey: true })(event) && state.isCreating) {
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
