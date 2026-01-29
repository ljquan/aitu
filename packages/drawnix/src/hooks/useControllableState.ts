/**
 * useControllableState Hook
 *
 * 提供统一的受控/非受控状态管理模式。
 * 当 controlledValue 提供时为受控模式，否则为非受控模式。
 */

import { useState, useCallback } from 'react';

export interface UseControllableStateOptions<T> {
  /** 受控状态值（外部提供时为受控模式） */
  controlledValue?: T;
  /** 默认值（非受控模式的初始值） */
  defaultValue: T;
  /** 状态变化回调 */
  onChange?: (value: T) => void;
}

export interface UseControllableStateResult<T> {
  /** 当前状态值 */
  value: T;
  /** 设置状态的函数（支持直接值或函数式更新） */
  setValue: (valueOrUpdater: T | ((prev: T) => T)) => void;
}

/**
 * 受控/非受控状态管理 Hook
 *
 * @example
 * ```tsx
 * const { value: isOpen, setValue: setIsOpen } = useControllableState({
 *   controlledValue: props.isOpen,
 *   defaultValue: false,
 *   onChange: props.onOpenChange,
 * });
 * ```
 */
export function useControllableState<T>({
  controlledValue,
  defaultValue,
  onChange,
}: UseControllableStateOptions<T>): UseControllableStateResult<T> {
  const [internalValue, setInternalValue] = useState<T>(defaultValue);

  // 判断是否为受控模式
  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : internalValue;

  const setValue = useCallback(
    (valueOrUpdater: T | ((prev: T) => T)) => {
      const newValue =
        typeof valueOrUpdater === 'function'
          ? (valueOrUpdater as (prev: T) => T)(value)
          : valueOrUpdater;

      // 非受控模式下更新内部状态
      if (!isControlled) {
        setInternalValue(newValue);
      }

      // 始终触发 onChange 回调
      onChange?.(newValue);
    },
    [isControlled, value, onChange]
  );

  return { value, setValue };
}

export default useControllableState;
