/**
 * 新手引导状态管理 Hook
 */

import { useState, useCallback, useEffect } from 'react';
import { TutorialStep } from '../types/tutorial.types';
import {
  hasCompletedTutorial,
  markTutorialCompleted,
  resetTutorialStatus,
} from '../utils/tutorial-utils';

interface UseTutorialOptions {
  /** 引导步骤列表 */
  steps: TutorialStep[];
  /** 是否在组件挂载时自动检查并显示引导（仅对新用户） */
  autoShow?: boolean;
  /** 延迟显示时间（毫秒），等待页面元素加载完成 */
  delay?: number;
}

interface UseTutorialReturn {
  /** 是否显示引导 */
  isOpen: boolean;
  /** 当前步骤索引 */
  activeStepIndex: number;
  /** 当前步骤 */
  currentStep: TutorialStep | undefined;
  /** 是否是最后一步 */
  isLastStep: boolean;
  /** 是否是第一步 */
  isFirstStep: boolean;
  /** 下一步 */
  next: () => void;
  /** 上一步 */
  prev: () => void;
  /** 跳过引导 */
  skip: () => void;
  /** 完成引导 */
  complete: () => void;
  /** 打开引导 */
  open: () => void;
  /** 重置引导状态（允许重新显示） */
  reset: () => void;
}

/**
 * 新手引导 Hook
 *
 * @param options 配置选项
 * @returns 引导状态和控制方法
 *
 * @example
 * ```tsx
 * const { isOpen, activeStepIndex, next, skip, complete } = useTutorial({
 *   steps: TUTORIAL_STEPS,
 *   autoShow: true,
 *   delay: 500,
 * });
 * ```
 */
export const useTutorial = ({
  steps,
  autoShow = true,
  delay = 800,
}: UseTutorialOptions): UseTutorialReturn => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState(0);

  // 自动显示引导（仅对新用户）
  useEffect(() => {
    if (!autoShow) return;

    // 检查是否已完成过引导
    if (hasCompletedTutorial()) return;

    // 延迟显示，等待页面加载完成
    const timer = setTimeout(() => {
      setIsOpen(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [autoShow, delay]);

  // 下一步
  const next = useCallback(() => {
    if (activeStepIndex < steps.length - 1) {
      setActiveStepIndex((prev) => prev + 1);
    }
  }, [activeStepIndex, steps.length]);

  // 上一步
  const prev = useCallback(() => {
    if (activeStepIndex > 0) {
      setActiveStepIndex((prev) => prev - 1);
    }
  }, [activeStepIndex]);

  // 跳过引导
  const skip = useCallback(() => {
    setIsOpen(false);
    markTutorialCompleted();
  }, []);

  // 完成引导
  const complete = useCallback(() => {
    setIsOpen(false);
    setActiveStepIndex(0);
    markTutorialCompleted();
  }, []);

  // 打开引导
  const open = useCallback(() => {
    setActiveStepIndex(0);
    setIsOpen(true);
  }, []);

  // 重置引导状态
  const reset = useCallback(() => {
    resetTutorialStatus();
    setActiveStepIndex(0);
  }, []);

  return {
    isOpen,
    activeStepIndex,
    currentStep: steps[activeStepIndex],
    isLastStep: activeStepIndex === steps.length - 1,
    isFirstStep: activeStepIndex === 0,
    next,
    prev,
    skip,
    complete,
    open,
    reset,
  };
};
