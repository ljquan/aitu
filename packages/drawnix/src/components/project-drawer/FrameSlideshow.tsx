/**
 * FrameSlideshow Component
 *
 * 全屏幻灯片播放 Frame：
 * - 操纵画布 viewport 对准 Frame
 * - 全屏黑色蒙层遮住非 Frame 区域，只露出 Frame 内容
 * - 支持 PPT 通用快捷键
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  PlaitBoard,
  BoardTransforms,
  RectangleClient,
} from '@plait/core';
import { PlaitFrame, isFrameElement } from '../../types/frame.types';
import { Z_INDEX } from '../../constants/z-index';

interface FrameSlideshowProps {
  visible: boolean;
  board: PlaitBoard;
  onClose: () => void;
}

/** Frame 在屏幕上的位置信息 */
interface FrameScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const PADDING = 60;
const SLIDESHOW_CLASS = 'slideshow-active';

/** 添加/移除 slideshow class，用于 CSS 隐藏所有 UI 覆盖层 */
function setSlideshowMode(active: boolean) {
  if (active) {
    document.documentElement.classList.add(SLIDESHOW_CLASS);
  } else {
    document.documentElement.classList.remove(SLIDESHOW_CLASS);
  }
}

function getFrames(board: PlaitBoard): PlaitFrame[] {
  const frames: PlaitFrame[] = [];
  for (const el of board.children) {
    if (isFrameElement(el)) {
      frames.push(el as PlaitFrame);
    }
  }
  return frames;
}

/**
 * 将 viewport 对准 Frame，返回 Frame 在屏幕上的矩形位置。
 * 
 * 关键：不依赖 toHostPointFromViewBoxPoint（可能有时序问题），
 * 而是根据 viewport 居中算法直接计算 Frame 在屏幕上的位置。
 */
function focusFrameAndGetScreenRect(
  board: PlaitBoard,
  frame: PlaitFrame
): FrameScreenRect {
  const rect = RectangleClient.getRectangleByPoints(frame.points);
  const container = PlaitBoard.getBoardContainer(board);
  const vw = container.clientWidth;
  const vh = container.clientHeight;

  // 计算 zoom 使 Frame 适配视口（留 padding）
  const scaleX = (vw - PADDING * 2) / rect.width;
  const scaleY = (vh - PADDING * 2) / rect.height;
  const zoom = Math.min(scaleX, scaleY, 3);

  // 居中 Frame：origination 是视口左上角在世界坐标中的位置
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const origination: [number, number] = [
    cx - vw / 2 / zoom,
    cy - vh / 2 / zoom,
  ];
  BoardTransforms.updateViewport(board, origination, zoom);

  // 直接计算 Frame 在屏幕上的位置：
  // Frame 左上角在世界坐标中: (rect.x, rect.y)
  // 相对于视口左上角的偏移: (rect.x - origination[0], rect.y - origination[1])
  // 乘以 zoom 得到屏幕像素偏移
  const containerBounds = container.getBoundingClientRect();
  const screenLeft =
    containerBounds.left + (rect.x - origination[0]) * zoom;
  const screenTop =
    containerBounds.top + (rect.y - origination[1]) * zoom;
  const screenWidth = rect.width * zoom;
  const screenHeight = rect.height * zoom;

  return {
    left: screenLeft,
    top: screenTop,
    width: screenWidth,
    height: screenHeight,
  };
}

/**
 * 根据 Frame 屏幕矩形生成四块遮罩的内联样式
 */
function getMaskBlockStyles(r: FrameScreenRect): React.CSSProperties[] {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // 上方
  const top: React.CSSProperties = {
    top: 0,
    left: 0,
    width: vw,
    height: Math.max(0, r.top),
  };
  // 下方
  const bottom: React.CSSProperties = {
    top: r.top + r.height,
    left: 0,
    width: vw,
    height: Math.max(0, vh - r.top - r.height),
  };
  // 左侧
  const left: React.CSSProperties = {
    top: r.top,
    left: 0,
    width: Math.max(0, r.left),
    height: r.height,
  };
  // 右侧
  const right: React.CSSProperties = {
    top: r.top,
    left: r.left + r.width,
    width: Math.max(0, vw - r.left - r.width),
    height: r.height,
  };

  return [top, bottom, left, right];
}

export const FrameSlideshow: React.FC<FrameSlideshowProps> = ({
  visible,
  board,
  onClose,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [frameRect, setFrameRect] = useState<FrameScreenRect | null>(null);
  const [showControls, setShowControls] = useState(true);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const savedViewportRef = useRef<{
    origination: [number, number] | null;
    zoom: number;
  } | null>(null);
  const framesRef = useRef<PlaitFrame[]>([]);

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) {
      clearTimeout(controlsTimerRef.current);
    }
    controlsTimerRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  }, []);

  /** 切换到指定 Frame */
  const goToFrame = useCallback(
    (index: number) => {
      const frames = framesRef.current;
      if (!board || index < 0 || index >= frames.length) return;

      const rect = focusFrameAndGetScreenRect(board, frames[index]);
      setFrameRect(rect);
      setCurrentIndex(index);
      resetControlsTimer();
    },
    [board, resetControlsTimer]
  );

  // 进入幻灯片：保存 viewport、对准第一个 Frame
  useEffect(() => {
    if (!visible) return;

    const frames = getFrames(board);
    if (frames.length === 0) {
      onClose();
      return;
    }
    framesRef.current = frames;

    // 保存当前 viewport
    const vp = board.viewport;
    savedViewportRef.current = {
      origination: vp?.origination
        ? [vp.origination[0], vp.origination[1]]
        : null,
      zoom: vp?.zoom ?? 1,
    };

    // 隐藏所有 UI 覆盖层
    setSlideshowMode(true);

    // 先定位到第一帧
    goToFrame(0);

    // 尝试请求全屏，成功后重新定位
    document.documentElement
      .requestFullscreen?.()
      .then(() => {
        setTimeout(() => goToFrame(0), 300);
      })
      .catch(() => {});

    return () => {
      setSlideshowMode(false);
      if (controlsTimerRef.current) {
        clearTimeout(controlsTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // 退出时恢复 viewport
  const handleClose = useCallback(() => {
    setSlideshowMode(false);
    const saved = savedViewportRef.current;
    if (saved && board) {
      const orig = saved.origination ?? [0, 0];
      BoardTransforms.updateViewport(
        board,
        orig as [number, number],
        saved.zoom
      );
    }
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
    setFrameRect(null);
    onClose();
  }, [board, onClose]);

  // 监听全屏退出 → 关闭幻灯片
  useEffect(() => {
    if (!visible) return;

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && visible) {
        setSlideshowMode(false);
        const saved = savedViewportRef.current;
        if (saved && board) {
          const orig = saved.origination ?? [0, 0];
          BoardTransforms.updateViewport(
            board,
            orig as [number, number],
            saved.zoom
          );
        }
        setFrameRect(null);
        onClose();
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [visible, board, onClose]);

  // 窗口 resize 时重新计算
  useEffect(() => {
    if (!visible) return;

    const handleResize = () => {
      goToFrame(currentIndex);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [visible, currentIndex, goToFrame]);

  // 键盘导航
  useEffect(() => {
    if (!visible) return;
    const frames = framesRef.current;
    if (frames.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      resetControlsTimer();

      switch (e.key) {
        case 'ArrowRight':
        case ' ':
        case 'Enter':
        case 'PageDown':
        case 'ArrowDown': {
          e.preventDefault();
          setCurrentIndex((prev) => {
            const next = Math.min(prev + 1, frames.length - 1);
            if (next !== prev) goToFrame(next);
            return next;
          });
          break;
        }
        case 'ArrowLeft':
        case 'Backspace':
        case 'PageUp':
        case 'ArrowUp': {
          e.preventDefault();
          setCurrentIndex((prev) => {
            const next = Math.max(prev - 1, 0);
            if (next !== prev) goToFrame(next);
            return next;
          });
          break;
        }
        case 'Escape': {
          e.preventDefault();
          handleClose();
          break;
        }
        case 'Home': {
          e.preventDefault();
          goToFrame(0);
          break;
        }
        case 'End': {
          e.preventDefault();
          goToFrame(frames.length - 1);
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, goToFrame, handleClose, resetControlsTimer]);

  // 鼠标移动显示控件
  useEffect(() => {
    if (!visible) return;
    const handleMouseMove = () => resetControlsTimer();
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [visible, resetControlsTimer]);

  if (!visible || !frameRect) return null;

  const frames = framesRef.current;
  const currentFrame = frames[currentIndex];
  const maskStyles = getMaskBlockStyles(frameRect);

  return createPortal(
    <div
      className="frame-slideshow"
      style={{ zIndex: Z_INDEX.SLIDESHOW }}
      onMouseMove={resetControlsTimer}
    >
      {/* 四块黑色遮罩围住 Frame 区域 */}
      <div className="frame-slideshow__mask">
        {maskStyles.map((style, i) => (
          <div key={i} className="frame-slideshow__mask-block" style={style} />
        ))}
      </div>

      {/* Frame 名称 */}
      {currentFrame && (
        <div
          className="frame-slideshow__title"
          style={{ opacity: showControls ? 1 : 0 }}
        >
          {currentFrame.name || `Frame ${currentIndex + 1}`}
        </div>
      )}

      {/* 页码指示器 */}
      {frames.length > 0 && (
        <div
          className="frame-slideshow__indicator"
          style={{ opacity: showControls ? 1 : 0 }}
        >
          <span className="frame-slideshow__indicator-current">
            {currentIndex + 1}
          </span>
          <span className="frame-slideshow__indicator-sep">/</span>
          <span className="frame-slideshow__indicator-total">
            {frames.length}
          </span>
        </div>
      )}

      {/* 导航按钮 */}
      {currentIndex > 0 && (
        <button
          className="frame-slideshow__nav frame-slideshow__nav--prev"
          style={{ opacity: showControls ? 1 : 0 }}
          onClick={() => goToFrame(currentIndex - 1)}
          title="上一页"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M15 18l-6-6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
      {currentIndex < frames.length - 1 && (
        <button
          className="frame-slideshow__nav frame-slideshow__nav--next"
          style={{ opacity: showControls ? 1 : 0 }}
          onClick={() => goToFrame(currentIndex + 1)}
          title="下一页"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M9 18l6-6-6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}

      {/* ESC 提示 */}
      <div
        className="frame-slideshow__esc-hint"
        style={{ opacity: showControls ? 1 : 0 }}
      >
        按 <kbd>ESC</kbd> 退出
      </div>
    </div>,
    document.body
  );
};
