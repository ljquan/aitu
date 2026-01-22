/**
 * 统一媒体预览系统 - 状态管理 Hook
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import type {
  ViewerMode,
  CompareLayout,
  ViewerState,
  ViewerActions,
  MediaItem,
} from './types';

interface UseViewerStateOptions {
  items: MediaItem[];
  initialMode?: ViewerMode;
  initialIndex?: number | number[];
  maxCompareSlots?: 2 | 3 | 4;
  defaultCompareLayout?: CompareLayout;
  visible: boolean;
  onModeChange?: (mode: ViewerMode) => void;
}

export function useViewerState(
  options: UseViewerStateOptions
): [ViewerState, ViewerActions] {
  const {
    items,
    initialMode = 'single',
    initialIndex = 0,
    maxCompareSlots = 4,
    defaultCompareLayout = 'horizontal',
    visible,
    onModeChange,
  } = options;

  // 初始化对比索引数组
  const getInitialCompareIndices = useCallback((): number[] => {
    if (Array.isArray(initialIndex)) {
      return initialIndex.slice(0, maxCompareSlots);
    }
    // 单个索引时，初始化两个槽位
    const idx = typeof initialIndex === 'number' ? initialIndex : 0;
    const nextIdx = (idx + 1) % items.length;
    return items.length > 1 ? [idx, nextIdx] : [idx];
  }, [initialIndex, maxCompareSlots, items.length]);

  // 核心状态
  const [mode, setModeInternal] = useState<ViewerMode>(initialMode);
  const [currentIndex, setCurrentIndex] = useState<number>(
    typeof initialIndex === 'number' ? initialIndex : 0
  );
  const [compareIndices, setCompareIndices] = useState<number[]>(
    getInitialCompareIndices
  );
  const [compareLayout, setCompareLayout] =
    useState<CompareLayout>(defaultCompareLayout);
  const [syncMode, setSyncMode] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [focusedSlot, setFocusedSlotInternal] = useState<number>(0);
  const [slotCount, setSlotCountInternal] = useState<2 | 3 | 4>(2);

  // visible 变化时重置状态
  useEffect(() => {
    if (visible) {
      setModeInternal(initialMode);
      setCurrentIndex(typeof initialIndex === 'number' ? initialIndex : 0);
      setCompareIndices(getInitialCompareIndices());
      setZoomLevel(1);
      setPanOffset({ x: 0, y: 0 });
      setFocusedSlotInternal(0);
    }
  }, [visible, initialMode, initialIndex, getInitialCompareIndices]);

  // 状态对象
  const state: ViewerState = useMemo(
    () => ({
      mode,
      currentIndex,
      compareIndices,
      compareLayout,
      syncMode,
      zoomLevel,
      panOffset,
      focusedSlot,
    }),
    [
      mode,
      currentIndex,
      compareIndices,
      compareLayout,
      syncMode,
      zoomLevel,
      panOffset,
      focusedSlot,
    ]
  );

  // 操作方法
  const setMode = useCallback(
    (newMode: ViewerMode) => {
      if (newMode === mode) return;

      if (newMode === 'compare') {
        // 切换到对比模式：当前项作为第一个槽位
        const nextIdx = (currentIndex + 1) % items.length;
        setCompareIndices(
          items.length > 1 ? [currentIndex, nextIdx] : [currentIndex]
        );
      } else {
        // 切换到单图模式：使用焦点槽位的索引
        const idx = compareIndices[focusedSlot] ?? compareIndices[0] ?? 0;
        setCurrentIndex(idx);
      }

      setModeInternal(newMode);
      setZoomLevel(1);
      setPanOffset({ x: 0, y: 0 });
      onModeChange?.(newMode);
    },
    [mode, currentIndex, items.length, compareIndices, focusedSlot, onModeChange]
  );

  const goTo = useCallback(
    (index: number) => {
      if (index >= 0 && index < items.length) {
        setCurrentIndex(index);
        setZoomLevel(1);
        setPanOffset({ x: 0, y: 0 });
      }
    },
    [items.length]
  );

  const goToPrev = useCallback(() => {
    const newIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
    goTo(newIndex);
  }, [currentIndex, items.length, goTo]);

  const goToNext = useCallback(() => {
    const newIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
    goTo(newIndex);
  }, [currentIndex, items.length, goTo]);

  const addToCompare = useCallback(
    (index: number, slot?: number) => {
      setCompareIndices((prev) => {
        const newIndices = [...prev];
        if (typeof slot === 'number' && slot < slotCount) {
          // 指定槽位
          newIndices[slot] = index;
        } else if (newIndices.length < slotCount) {
          // 添加到下一个空槽位
          newIndices.push(index);
        } else {
          // 替换焦点槽位
          newIndices[focusedSlot] = index;
        }
        return newIndices;
      });
    },
    [slotCount, focusedSlot]
  );

  const removeFromCompare = useCallback(
    (slot: number) => {
      setCompareIndices((prev) => {
        if (prev.length <= 2) return prev; // 至少保留2个
        const newIndices = [...prev];
        newIndices.splice(slot, 1);
        return newIndices;
      });
      if (focusedSlot >= slot && focusedSlot > 0) {
        setFocusedSlotInternal(focusedSlot - 1);
      }
    },
    [focusedSlot]
  );

  const swapSlots = useCallback((slot1: number, slot2: number) => {
    setCompareIndices((prev) => {
      const newIndices = [...prev];
      const temp = newIndices[slot1];
      newIndices[slot1] = newIndices[slot2];
      newIndices[slot2] = temp;
      return newIndices;
    });
  }, []);

  const setLayout = useCallback((layout: CompareLayout) => {
    setCompareLayout(layout);
  }, []);

  const toggleSyncMode = useCallback(() => {
    setSyncMode((prev) => !prev);
  }, []);

  const zoom = useCallback(
    (delta: number) => {
      setZoomLevel((prev) => {
        const newZoom = prev + delta;
        return Math.max(0.1, Math.min(5, newZoom));
      });
    },
    []
  );

  const resetView = useCallback(() => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  const setPan = useCallback((offset: { x: number; y: number }) => {
    setPanOffset(offset);
  }, []);

  const setFocusedSlot = useCallback((slot: number) => {
    setFocusedSlotInternal(slot);
  }, []);

  const setSlotCount = useCallback(
    (count: 2 | 3 | 4) => {
      setSlotCountInternal(count);
      // 调整 compareIndices 长度
      setCompareIndices((prev) => {
        if (prev.length > count) {
          return prev.slice(0, count);
        }
        if (prev.length < count && items.length > prev.length) {
          // 自动填充
          const newIndices = [...prev];
          let nextIdx = (prev[prev.length - 1] + 1) % items.length;
          while (newIndices.length < count && newIndices.length < items.length) {
            if (!newIndices.includes(nextIdx)) {
              newIndices.push(nextIdx);
            }
            nextIdx = (nextIdx + 1) % items.length;
          }
          return newIndices;
        }
        return prev;
      });
    },
    [items.length]
  );

  const actions: ViewerActions = useMemo(
    () => ({
      setMode,
      goTo,
      goToPrev,
      goToNext,
      addToCompare,
      removeFromCompare,
      swapSlots,
      setCompareLayout: setLayout,
      toggleSyncMode,
      zoom,
      setPan,
      resetView,
      setFocusedSlot,
      setSlotCount,
    }),
    [
      setMode,
      goTo,
      goToPrev,
      goToNext,
      addToCompare,
      removeFromCompare,
      swapSlots,
      setLayout,
      toggleSyncMode,
      zoom,
      setPan,
      resetView,
      setFocusedSlot,
      setSlotCount,
    ]
  );

  return [state, actions];
}
