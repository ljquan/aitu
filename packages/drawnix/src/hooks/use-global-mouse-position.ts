import { useEffect, useRef, useState } from 'react';

interface MousePosition {
  x: number;
  y: number;
}

// 全局鼠标位置状态
let globalMousePosition: MousePosition = { x: 0, y: 0 };
let listeners: Set<(position: MousePosition) => void> = new Set();
let isListening = false;

// 全局鼠标事件处理器
const handleMouseMove = (event: MouseEvent) => {
  globalMousePosition = {
    x: event.clientX,
    y: event.clientY
  };
  listeners.forEach(listener => listener(globalMousePosition));
};

const handleMouseDown = (event: MouseEvent) => {
  globalMousePosition = {
    x: event.clientX,
    y: event.clientY
  };
  listeners.forEach(listener => listener(globalMousePosition));
};

const handleMouseUp = (event: MouseEvent) => {
  globalMousePosition = {
    x: event.clientX,
    y: event.clientY
  };
  listeners.forEach(listener => listener(globalMousePosition));
};

// 开始监听全局鼠标事件
const startGlobalMouseTracking = () => {
  if (!isListening) {
    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('mouseup', handleMouseUp, true);
    isListening = true;
  }
};

// 停止监听全局鼠标事件
const stopGlobalMouseTracking = () => {
  if (isListening && listeners.size === 0) {
    document.removeEventListener('mousemove', handleMouseMove, true);
    document.removeEventListener('mousedown', handleMouseDown, true);
    document.removeEventListener('mouseup', handleMouseUp, true);
    isListening = false;
  }
};

/**
 * 全局鼠标位置跟踪Hook
 * 提供实时的鼠标位置信息，适用于需要在任意时刻获取鼠标位置的场景
 */
export const useGlobalMousePosition = () => {
  const [mousePosition, setMousePosition] = useState<MousePosition>(() => globalMousePosition);
  const listenerRef = useRef<(position: MousePosition) => void>();

  useEffect(() => {
    // 创建当前组件的监听器
    listenerRef.current = (position: MousePosition) => {
      setMousePosition(position);
    };

    // 添加监听器
    listeners.add(listenerRef.current);
    startGlobalMouseTracking();

    // 立即设置当前鼠标位置
    setMousePosition(globalMousePosition);

    return () => {
      // 清理监听器
      if (listenerRef.current) {
        listeners.delete(listenerRef.current);
      }
      stopGlobalMouseTracking();
    };
  }, []);

  return mousePosition;
};

/**
 * 获取当前全局鼠标位置（同步获取）
 * 用于在不需要响应式更新的场景下快速获取鼠标位置
 */
export const getCurrentMousePosition = (): MousePosition => {
  return { ...globalMousePosition };
};