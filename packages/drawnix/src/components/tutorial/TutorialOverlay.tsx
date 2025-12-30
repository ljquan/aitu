import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence, Transition } from 'framer-motion';
import { TutorialOverlayProps, ElementRect } from '../../types/tutorial.types';
import { getElementRect, SPOTLIGHT_PADDING } from '../../utils/tutorial-utils';
import { CloseIcon, CheckIcon, ArrowRightIcon } from '../icons';
import './tutorial-overlay.scss';

/**
 * 新手引导覆盖层组件
 * 显示带有高亮效果的引导步骤，支持图片/视频媒体和位置自适应
 */
export const TutorialOverlay: React.FC<TutorialOverlayProps> = ({
  steps,
  activeStepIndex,
  isOpen,
  onNext,
  onSkip,
  onComplete,
}) => {
  const [targetRect, setTargetRect] = useState<ElementRect | null>(null);
  const [windowSize, setWindowSize] = useState({
    w: window.innerWidth,
    h: window.innerHeight,
  });

  const currentStep = steps[activeStepIndex];
  const isLastStep = activeStepIndex === steps.length - 1;

  // 监听窗口大小变化
  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ w: window.innerWidth, h: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 当步骤变化或窗口大小变化时更新目标元素位置
  useEffect(() => {
    if (!isOpen || !currentStep?.targetId) {
      setTargetRect(null);
      return;
    }

    // 延迟获取位置，确保 DOM 已就绪
    const timer = setTimeout(() => {
      const rect = getElementRect(currentStep.targetId!);
      setTargetRect(rect);
    }, 100);

    return () => clearTimeout(timer);
  }, [activeStepIndex, isOpen, currentStep, windowSize]);

  // 计算高亮区域位置 - 必须在所有条件返回之前调用
  const spotlightPosition = useMemo(() => {
    if (!targetRect) {
      return {
        x: windowSize.w / 2,
        y: windowSize.h / 2,
        width: 0,
        height: 0,
      };
    }
    return {
      x: targetRect.left - SPOTLIGHT_PADDING,
      y: targetRect.top - SPOTLIGHT_PADDING,
      width: targetRect.width + SPOTLIGHT_PADDING * 2,
      height: targetRect.height + SPOTLIGHT_PADDING * 2,
    };
  }, [targetRect, windowSize]);

  // 计算提示框位置 - 使用 useCallback 确保 hooks 调用顺序一致
  // 包含边界检测，确保提示框不会超出屏幕
  const getTooltipPosition = useCallback((): React.CSSProperties => {
    const stepPos = currentStep?.position || 'bottom';
    const tooltipWidth = 360; // 提示框最大宽度
    const tooltipHeight = 280; // 提示框估计高度
    const padding = 16; // 距离屏幕边缘的最小间距
    const spacing = 20; // 距离目标元素的间距

    // 居中显示（无目标元素或明确指定 center）
    if (!targetRect || stepPos === 'center') {
      // 使用固定像素值计算居中位置，避免 transform 被 framer-motion 覆盖
      return {
        top: Math.max(padding, (windowSize.h - tooltipHeight) / 2),
        left: Math.max(padding, (windowSize.w - tooltipWidth) / 2),
      };
    }

    // 计算基础位置
    let left: number | undefined;
    let top: number | undefined;
    let right: number | undefined;
    let bottom: number | undefined;
    let transform = '';

    switch (stepPos) {
      case 'right':
        left = targetRect.right + spacing;
        top = targetRect.top + targetRect.height / 2;
        transform = 'translateY(-50%)';
        break;
      case 'left':
        right = windowSize.w - targetRect.left + spacing;
        top = targetRect.top + targetRect.height / 2;
        transform = 'translateY(-50%)';
        break;
      case 'top':
        left = targetRect.left + targetRect.width / 2;
        bottom = windowSize.h - targetRect.top + spacing;
        transform = 'translateX(-50%)';
        break;
      case 'bottom':
      default:
        left = targetRect.left + targetRect.width / 2;
        top = targetRect.bottom + spacing;
        transform = 'translateX(-50%)';
        break;
    }

    // 边界检测和调整
    const result: React.CSSProperties = {};

    if (left !== undefined) {
      // 检查左侧边界
      if (transform.includes('translateX(-50%)')) {
        // 水平居中时，检查左右边界
        const actualLeft = left - tooltipWidth / 2;
        if (actualLeft < padding) {
          result.left = padding;
        } else if (actualLeft + tooltipWidth > windowSize.w - padding) {
          result.left = windowSize.w - tooltipWidth - padding;
        } else {
          result.left = left;
          result.transform = transform;
        }
      } else {
        // 右侧定位时，检查是否超出右边界
        if (left + tooltipWidth > windowSize.w - padding) {
          // 如果超出，改为左侧显示
          result.right = windowSize.w - targetRect.left + spacing;
        } else {
          result.left = Math.max(padding, left);
        }
      }
    }

    if (right !== undefined) {
      result.right = Math.max(padding, right);
    }

    if (top !== undefined) {
      // 检查上下边界
      if (transform.includes('translateY(-50%)')) {
        // 垂直居中时
        const actualTop = top - tooltipHeight / 2;
        if (actualTop < padding) {
          result.top = padding;
        } else if (actualTop + tooltipHeight > windowSize.h - padding) {
          result.top = windowSize.h - tooltipHeight - padding;
        } else {
          result.top = top;
          if (!result.transform) {
            result.transform = transform;
          }
        }
      } else {
        // 检查是否超出底部
        if (top + tooltipHeight > windowSize.h - padding) {
          result.top = windowSize.h - tooltipHeight - padding;
        } else {
          result.top = Math.max(padding, top);
        }
      }
    }

    if (bottom !== undefined) {
      result.bottom = Math.max(padding, bottom);
    }

    return result;
  }, [targetRect, currentStep?.position, windowSize]);

  // 早期返回必须在所有 hooks 之后
  if (!isOpen) return null;

  // 动画配置
  const spotlightTransition: Transition = {
    type: 'spring',
    damping: 25,
    stiffness: 200,
    mass: 0.8,
  };

  const tooltipStyles = getTooltipPosition();
  const isCentered = !targetRect || currentStep?.position === 'center';

  return (
    <div className="tutorial-overlay">
      {/* 高亮遮罩层 - 使用巨大的 box-shadow 创建聚光灯效果 */}
      <motion.div
        className="tutorial-overlay__spotlight"
        initial={false}
        animate={{
          x: spotlightPosition.x,
          y: spotlightPosition.y,
          width: spotlightPosition.width,
          height: spotlightPosition.height,
          opacity: 1,
        }}
        transition={spotlightTransition}
      >
        {/* 高亮边框 */}
        {!isCentered && (
          <motion.div
            className="tutorial-overlay__highlight-ring"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          />
        )}
      </motion.div>

      {/* 提示卡片层 */}
      <div className="tutorial-overlay__tooltip-layer">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep.id}
            className="tutorial-overlay__tooltip"
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            style={tooltipStyles}
          >
            {/* 卡片内容 */}
            <div className="tutorial-overlay__card">
              {/* 装饰背景 */}
              <div className="tutorial-overlay__card-decoration" />

              {/* 头部 */}
              <div className="tutorial-overlay__header">
                <h3 className="tutorial-overlay__title">{currentStep.title}</h3>
                <button
                  className="tutorial-overlay__close-btn"
                  onClick={onSkip}
                  aria-label="跳过引导"
                >
                  {CloseIcon}
                </button>
              </div>

              {/* 媒体区域 */}
              {currentStep.media && (
                <div className="tutorial-overlay__media">
                  {currentStep.mediaType === 'video' ? (
                    <video
                      src={currentStep.media}
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="tutorial-overlay__video"
                    />
                  ) : (
                    <img
                      src={currentStep.media}
                      alt={currentStep.mediaAlt || currentStep.title}
                      className="tutorial-overlay__image"
                    />
                  )}
                </div>
              )}

              {/* 描述 */}
              <p className="tutorial-overlay__description">
                {currentStep.description}
              </p>

              {/* 底部控制区 */}
              <div className="tutorial-overlay__footer">
                {/* 进度指示器 */}
                <div className="tutorial-overlay__progress">
                  {steps.map((_, idx) => (
                    <div
                      key={idx}
                      className={`tutorial-overlay__progress-dot ${
                        idx === activeStepIndex
                          ? 'tutorial-overlay__progress-dot--active'
                          : ''
                      }`}
                    />
                  ))}
                </div>

                {/* 操作按钮 */}
                <button
                  className="tutorial-overlay__next-btn"
                  onClick={isLastStep ? onComplete : onNext}
                >
                  {isLastStep ? '开始探索' : '下一步'}
                  <span className="tutorial-overlay__btn-icon">
                    {isLastStep ? CheckIcon : ArrowRightIcon}
                  </span>
                </button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};
