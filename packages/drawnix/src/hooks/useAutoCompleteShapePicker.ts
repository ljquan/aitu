import { useState, useEffect, useCallback } from 'react';
import { PlaitBoard } from '@plait/core';
import { DrawPointerType, PlaitDrawElement } from '@plait/draw';
import {
  AutoCompleteShapeState,
  getAutoCompleteState,
  registerAutoCompleteStateCallback,
  setAutoCompleteState,
  resetAutoCompleteState,
  createAutoCompleteElements,
  createShapeForArrowLine,
} from '../plugins/with-arrow-line-auto-complete-extend';

const initialState: AutoCompleteShapeState = {
  visible: false,
  position: { x: 0, y: 0 },
  sourceElement: null,
  currentShape: null,
  hitIndex: -1,
  hitPoint: null,
  mode: 'hover',
};

/**
 * 连接插件状态和 React 组件的 Hook
 */
export function useAutoCompleteShapePicker(board: PlaitBoard | null) {
  const [state, setState] = useState<AutoCompleteShapeState>(initialState);

  // 注册状态回调
  useEffect(() => {
    if (!board) return;

    // 初始化状态
    setState(getAutoCompleteState(board));

    // 注册回调
    const unregister = registerAutoCompleteStateCallback(board, (newState) => {
      setState(newState);
    });

    return () => {
      unregister();
    };
  }, [board]);

  // 选择形状并创建元素
  const selectShape = useCallback((shape: DrawPointerType) => {
    if (!board) return;
    
    const currentState = getAutoCompleteState(board);
    
    if (currentState.mode === 'arrowLine') {
      // 箭头线模式：为已存在的箭头线创建形状
      if (currentState.arrowLineElement && currentState.arrowLineEndPoint) {
        createShapeForArrowLine(
          board,
          currentState.arrowLineElement,
          currentState.arrowLineEndPoint,
          shape
        );
      }
    } else {
      // hover 模式：创建并插入连接线和新形状
      if (currentState.sourceElement && 
          currentState.hitPoint && 
          currentState.hitIndex >= 0) {
        createAutoCompleteElements(
          board,
          currentState.sourceElement as PlaitDrawElement,
          currentState.hitIndex,
          currentState.hitPoint,
          shape
        );
      }
    }
    
    // 关闭选择器（createAutoCompleteElements 内部已经会重置状态）
    setAutoCompleteState(board, { ...initialState });
  }, [board]);

  // 关闭选择器
  const closePicker = useCallback(() => {
    if (!board) return;
    resetAutoCompleteState(board);
  }, [board]);

  return {
    state,
    selectShape,
    closePicker,
  };
}
