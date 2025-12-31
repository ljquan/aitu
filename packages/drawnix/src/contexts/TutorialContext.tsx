/**
 * 新手引导 Context
 * 用于在组件树中共享引导状态和控制方法
 */

import React, { createContext, useContext } from 'react';
import { useTutorial } from '../hooks/useTutorial';
import { TUTORIAL_STEPS } from '../components/tutorial';

/** Tutorial Context 值类型 */
interface TutorialContextValue {
  /** 是否显示引导 */
  isOpen: boolean;
  /** 当前步骤索引 */
  activeStepIndex: number;
  /** 是否是最后一步 */
  isLastStep: boolean;
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
  /** 重置引导状态 */
  reset: () => void;
}

const TutorialContext = createContext<TutorialContextValue | null>(null);

/** Tutorial Provider Props */
interface TutorialProviderProps {
  children: React.ReactNode;
}

/**
 * Tutorial Provider
 * 提供引导状态和控制方法给子组件
 */
export const TutorialProvider: React.FC<TutorialProviderProps> = ({ children }) => {
  const tutorial = useTutorial({
    steps: TUTORIAL_STEPS,
    autoShow: true,
    delay: 1000,
  });

  return (
    <TutorialContext.Provider value={tutorial}>
      {children}
    </TutorialContext.Provider>
  );
};

/**
 * 使用 Tutorial Context 的 Hook
 * @returns Tutorial Context 值
 * @throws 如果在 TutorialProvider 外部使用会抛出错误
 */
export const useTutorialContext = (): TutorialContextValue => {
  const context = useContext(TutorialContext);
  if (!context) {
    throw new Error('useTutorialContext must be used within a TutorialProvider');
  }
  return context;
};
