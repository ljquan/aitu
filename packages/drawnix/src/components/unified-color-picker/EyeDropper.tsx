/**
 * 吸管工具组件
 * 支持从屏幕任意位置取色
 */

import React, { useCallback, useState } from 'react';
import classNames from 'classnames';
import type { EyeDropperProps } from './types';

// EyeDropper API 类型声明
declare global {
  interface Window {
    EyeDropper?: new () => {
      open: () => Promise<{ sRGBHex: string }>;
    };
  }
}

/** 检查浏览器是否支持 EyeDropper API */
export const isEyeDropperSupported = (): boolean => {
  return typeof window !== 'undefined' && 'EyeDropper' in window;
};

export const EyeDropper: React.FC<EyeDropperProps> = ({
  onPick,
  disabled = false,
}) => {
  const [isPicking, setIsPicking] = useState(false);

  // 处理吸管取色
  const handlePick = useCallback(async () => {
    if (disabled || !isEyeDropperSupported() || isPicking) return;

    try {
      setIsPicking(true);
      const eyeDropper = new window.EyeDropper!();
      const result = await eyeDropper.open();
      if (result?.sRGBHex) {
        onPick(result.sRGBHex.toUpperCase());
      }
    } catch (error) {
      // 用户取消或其他错误，静默处理
      console.debug('[EyeDropper] Cancelled or failed:', error);
    } finally {
      setIsPicking(false);
    }
  }, [disabled, isPicking, onPick]);

  // 不支持 EyeDropper API 时不渲染
  if (!isEyeDropperSupported()) {
    return null;
  }

  return (
    <button
      type="button"
      className={classNames('ucp-eyedropper', {
        'ucp-eyedropper--picking': isPicking,
      })}
      onClick={handlePick}
      disabled={disabled || isPicking}
      title="拾取屏幕颜色"
    >
      <svg className="ucp-eyedropper__icon" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.71 5.63l-2.34-2.34a1 1 0 0 0-1.41 0l-3.12 3.12-1.42-1.42-1.41 1.42 1.41 1.41-8.42 8.42V20h3.75l8.42-8.42 1.41 1.41 1.42-1.41-1.42-1.42 3.12-3.12a1 1 0 0 0 .01-1.41zM6.92 18H5v-1.92l8.42-8.42 1.92 1.92L6.92 18z" />
      </svg>
    </button>
  );
};

export default EyeDropper;
