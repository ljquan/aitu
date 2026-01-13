/**
 * 拖拽排序 Hook
 * 使用原生 HTML5 Drag and Drop API 实现
 */

import { useState, useCallback, useRef, DragEvent } from 'react';

export interface DragSortState {
  /** 正在拖拽的元素 ID */
  draggingId: string | null;
  /** 拖拽悬停的目标 ID */
  dragOverId: string | null;
  /** 拖拽悬停的位置 */
  dragOverPosition: 'before' | 'after' | null;
}

export interface UseDragSortOptions<T> {
  /** 元素列表 */
  items: T[];
  /** 获取元素 ID 的函数 */
  getId: (item: T) => string;
  /** 排序完成后的回调 */
  onReorder: (fromIndex: number, toIndex: number) => void;
  /** 是否启用拖拽 */
  enabled?: boolean;
}

export interface UseDragSortReturn {
  /** 拖拽状态 */
  dragState: DragSortState;
  /** 获取拖拽属性 */
  getDragProps: (id: string, index: number) => {
    draggable: boolean;
    onDragStart: (e: DragEvent) => void;
    onDragEnd: (e: DragEvent) => void;
    onDragOver: (e: DragEvent) => void;
    onDragEnter: (e: DragEvent) => void;
    onDragLeave: (e: DragEvent) => void;
    onDrop: (e: DragEvent) => void;
    'data-dragging': boolean;
    'data-drag-over': boolean;
    'data-drag-position': string | undefined;
  };
  /** 是否正在拖拽 */
  isDragging: boolean;
}

export function useDragSort<T>({
  items,
  getId,
  onReorder,
  enabled = true,
}: UseDragSortOptions<T>): UseDragSortReturn {
  const [dragState, setDragState] = useState<DragSortState>({
    draggingId: null,
    dragOverId: null,
    dragOverPosition: null,
  });

  const dragIndexRef = useRef<number | null>(null);

  // 开始拖拽
  const handleDragStart = useCallback(
    (e: DragEvent, id: string, index: number) => {
      if (!enabled) return;

      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
      
      // 设置拖拽图片（可选）
      const target = e.currentTarget as HTMLElement;
      if (target) {
        e.dataTransfer.setDragImage(target, target.offsetWidth / 2, target.offsetHeight / 2);
      }

      dragIndexRef.current = index;
      
      // 延迟设置状态，避免拖拽图片问题
      requestAnimationFrame(() => {
        setDragState({
          draggingId: id,
          dragOverId: null,
          dragOverPosition: null,
        });
      });
    },
    [enabled]
  );

  // 拖拽结束
  const handleDragEnd = useCallback(() => {
    dragIndexRef.current = null;
    setDragState({
      draggingId: null,
      dragOverId: null,
      dragOverPosition: null,
    });
  }, []);

  // 拖拽经过
  const handleDragOver = useCallback(
    (e: DragEvent, id: string, index: number) => {
      if (!enabled || dragState.draggingId === null || dragState.draggingId === id) {
        return;
      }

      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      // 计算拖拽位置（上半部分还是下半部分）
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const position: 'before' | 'after' = e.clientY < midY ? 'before' : 'after';

      if (dragState.dragOverId !== id || dragState.dragOverPosition !== position) {
        setDragState((prev) => ({
          ...prev,
          dragOverId: id,
          dragOverPosition: position,
        }));
      }
    },
    [enabled, dragState.draggingId, dragState.dragOverId, dragState.dragOverPosition]
  );

  // 拖拽进入
  const handleDragEnter = useCallback(
    (e: DragEvent, id: string) => {
      if (!enabled || dragState.draggingId === null || dragState.draggingId === id) {
        return;
      }
      e.preventDefault();
    },
    [enabled, dragState.draggingId]
  );

  // 拖拽离开
  const handleDragLeave = useCallback(
    (e: DragEvent, id: string) => {
      if (!enabled) return;

      // 检查是否真的离开了元素（而不是进入子元素）
      const relatedTarget = e.relatedTarget as HTMLElement;
      const currentTarget = e.currentTarget as HTMLElement;
      
      if (!currentTarget.contains(relatedTarget)) {
        if (dragState.dragOverId === id) {
          setDragState((prev) => ({
            ...prev,
            dragOverId: null,
            dragOverPosition: null,
          }));
        }
      }
    },
    [enabled, dragState.dragOverId]
  );

  // 放置
  const handleDrop = useCallback(
    (e: DragEvent, id: string, index: number) => {
      if (!enabled || dragIndexRef.current === null) {
        return;
      }

      e.preventDefault();

      const fromIndex = dragIndexRef.current;
      let toIndex = index;

      // 根据放置位置调整目标索引
      if (dragState.dragOverPosition === 'after') {
        toIndex = index + 1;
      }

      // 如果从后往前拖，需要调整索引
      if (fromIndex < toIndex) {
        toIndex -= 1;
      }

      if (fromIndex !== toIndex) {
        onReorder(fromIndex, toIndex);
      }

      // 重置状态
      handleDragEnd();
    },
    [enabled, dragState.dragOverPosition, onReorder, handleDragEnd]
  );

  // 获取拖拽属性
  const getDragProps = useCallback(
    (id: string, index: number) => ({
      draggable: enabled,
      onDragStart: (e: DragEvent) => handleDragStart(e, id, index),
      onDragEnd: handleDragEnd,
      onDragOver: (e: DragEvent) => handleDragOver(e, id, index),
      onDragEnter: (e: DragEvent) => handleDragEnter(e, id),
      onDragLeave: (e: DragEvent) => handleDragLeave(e, id),
      onDrop: (e: DragEvent) => handleDrop(e, id, index),
      'data-dragging': dragState.draggingId === id,
      'data-drag-over': dragState.dragOverId === id,
      'data-drag-position': dragState.dragOverId === id ? dragState.dragOverPosition || undefined : undefined,
    }),
    [
      enabled,
      handleDragStart,
      handleDragEnd,
      handleDragOver,
      handleDragEnter,
      handleDragLeave,
      handleDrop,
      dragState.draggingId,
      dragState.dragOverId,
      dragState.dragOverPosition,
    ]
  );

  return {
    dragState,
    getDragProps,
    isDragging: dragState.draggingId !== null,
  };
}
