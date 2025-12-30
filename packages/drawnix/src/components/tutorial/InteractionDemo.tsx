import React from 'react';
import { motion } from 'framer-motion';
import './interaction-demo.scss';

export type InteractionType =
  | 'ai-generate'    // AI 生成动画
  | 'drag-pan'       // 拖拽画布
  | 'draw-shape'     // 绘制形状
  | 'zoom-canvas';   // 缩放画布

interface InteractionDemoProps {
  type: InteractionType;
}

// 手形图标
const HandIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M18 11V6.5C18 5.67 17.33 5 16.5 5S15 5.67 15 6.5V11M15 10.5V4.5C15 3.67 14.33 3 13.5 3S12 3.67 12 4.5V11M12 9.5V5.5C12 4.67 11.33 4 10.5 4S9 4.67 9 5.5V12M9 11.5V8.5C9 7.67 8.33 7 7.5 7S6 7.67 6 8.5V15C6 18.87 9.13 22 13 22C16.87 22 20 18.87 20 15V11C20 10.17 19.33 9.5 18.5 9.5S17 10.17 17 11"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="white"
    />
  </svg>
);

// 鼠标指针图标
const CursorIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M4 4L10.5 20L13 13L20 10.5L4 4Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// AI 图标
const AISparkleIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12 2L14.09 8.26L20 10L14.09 11.74L12 18L9.91 11.74L4 10L9.91 8.26L12 2Z"
      fill="url(#ai-gradient)"
      stroke="url(#ai-gradient)"
      strokeWidth="1"
    />
    <path
      d="M5 3L5.5 4.5L7 5L5.5 5.5L5 7L4.5 5.5L3 5L4.5 4.5L5 3Z"
      fill="url(#ai-gradient)"
    />
    <path
      d="M19 17L19.5 18.5L21 19L19.5 19.5L19 21L18.5 19.5L17 19L18.5 18.5L19 17Z"
      fill="url(#ai-gradient)"
    />
    <defs>
      <linearGradient id="ai-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#F39C12" />
        <stop offset="50%" stopColor="#5A4FCF" />
        <stop offset="100%" stopColor="#E91E63" />
      </linearGradient>
    </defs>
  </svg>
);

// 网格背景
const GridBackground = () => (
  <div className="interaction-demo__grid" />
);

/**
 * 交互演示动画组件
 * 用于在教程中展示各种操作动画
 */
export const InteractionDemo: React.FC<InteractionDemoProps> = ({ type }) => {
  // AI 生成动画
  if (type === 'ai-generate') {
    return (
      <div className="interaction-demo">
        <GridBackground />

        {/* AI 图标脉冲动画 */}
        <motion.div
          className="interaction-demo__ai-icon"
          animate={{
            scale: [1, 1.1, 1],
            rotate: [0, 5, -5, 0],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          <AISparkleIcon />
        </motion.div>

        {/* 生成进度环 */}
        <motion.div
          className="interaction-demo__progress-ring"
          animate={{ rotate: 360 }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'linear',
          }}
        />

        {/* 粒子效果 */}
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="interaction-demo__particle"
            style={{
              left: `${50 + Math.cos((i * 60 * Math.PI) / 180) * 40}%`,
              top: `${50 + Math.sin((i * 60 * Math.PI) / 180) * 40}%`,
            }}
            animate={{
              scale: [0, 1, 0],
              opacity: [0, 1, 0],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              delay: i * 0.2,
              ease: 'easeOut',
            }}
          />
        ))}

        {/* 文字提示 */}
        <motion.div
          className="interaction-demo__label"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          生成中...
        </motion.div>
      </div>
    );
  }

  // 拖拽画布动画
  if (type === 'drag-pan') {
    return (
      <div className="interaction-demo">
        <motion.div
          className="interaction-demo__grid"
          animate={{ x: [0, -40, -40, 0], y: [0, -20, -20, 0] }}
          transition={{
            duration: 2.5,
            ease: 'easeInOut',
            times: [0, 0.4, 0.8, 1],
            repeat: Infinity,
            repeatDelay: 1,
          }}
        />

        {/* 示例内容 */}
        <motion.div
          className="interaction-demo__sample-box"
          animate={{ x: [0, -40, -40, 0], y: [0, -20, -20, 0] }}
          transition={{
            duration: 2.5,
            ease: 'easeInOut',
            times: [0, 0.4, 0.8, 1],
            repeat: Infinity,
            repeatDelay: 1,
          }}
        />

        {/* 手形光标 */}
        <motion.div
          className="interaction-demo__cursor"
          animate={{
            x: [20, -20, -20, 20],
            y: [20, 0, 0, 20],
            scale: [1, 0.9, 0.9, 1],
          }}
          transition={{
            duration: 2.5,
            ease: 'easeInOut',
            times: [0, 0.4, 0.8, 1],
            repeat: Infinity,
            repeatDelay: 1,
          }}
        >
          <HandIcon />
          {/* 点击涟漪 */}
          <motion.div
            className="interaction-demo__ripple"
            animate={{ scale: [0, 1.5, 0], opacity: [0, 0.5, 0] }}
            transition={{
              duration: 0.5,
              times: [0, 0.5, 1],
              repeat: Infinity,
              repeatDelay: 2,
            }}
          />
        </motion.div>
      </div>
    );
  }

  // 绘制形状动画
  if (type === 'draw-shape') {
    return (
      <div className="interaction-demo">
        <GridBackground />

        {/* 绘制矩形 */}
        <motion.div
          className="interaction-demo__drawing-rect"
          animate={{
            width: [0, 100, 100, 0],
            height: [0, 70, 70, 0],
            opacity: [1, 1, 0, 0],
          }}
          transition={{
            duration: 2,
            times: [0, 0.6, 0.8, 1],
            repeat: Infinity,
            repeatDelay: 0.5,
          }}
        />

        {/* 鼠标光标 */}
        <motion.div
          className="interaction-demo__cursor"
          animate={{
            x: [0, 100, 100, 0],
            y: [0, 70, 70, 0],
          }}
          transition={{
            duration: 2,
            times: [0, 0.6, 0.8, 1],
            repeat: Infinity,
            repeatDelay: 0.5,
          }}
        >
          <CursorIcon />
        </motion.div>
      </div>
    );
  }

  // 缩放画布动画
  if (type === 'zoom-canvas') {
    return (
      <div className="interaction-demo">
        <motion.div
          className="interaction-demo__zoom-container"
          animate={{ scale: [0.8, 1.2, 0.8] }}
          transition={{
            duration: 4,
            ease: 'easeInOut',
            repeat: Infinity,
          }}
        >
          <GridBackground />
          <div className="interaction-demo__zoom-objects">
            <div className="interaction-demo__circle" />
            <div className="interaction-demo__square" />
          </div>
        </motion.div>

        {/* 缩放比例提示 */}
        <motion.div
          className="interaction-demo__zoom-label"
          animate={{ opacity: 1 }}
        >
          <motion.span
            animate={{ scale: [0.8, 1.2, 0.8] }}
            transition={{ duration: 4, ease: 'easeInOut', repeat: Infinity }}
          >
            80% → 120%
          </motion.span>
        </motion.div>
      </div>
    );
  }

  return null;
};
