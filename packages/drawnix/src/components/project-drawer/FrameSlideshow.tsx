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
  PlaitPointerType,
  BoardTransforms,
  RectangleClient,
} from '@plait/core';
import { BoardCreationMode, setCreationMode } from '@plait/common';
import { PlaitFrame, isFrameElement } from '../../types/frame.types';
import { Z_INDEX } from '../../constants/z-index';
import { FreehandShape } from '../../plugins/freehand/type';
import { useSetPointer } from '../../hooks/use-drawnix';
import { HandIcon, FeltTipPenIcon, EraseIcon, LaserPointerIcon, StrokeStyleNormalIcon, StrokeStyleDashedIcon, StrokeStyleDotedIcon, StrokeStyleDoubleIcon } from '../icons';
import {
  getFreehandSettings,
  setFreehandStrokeColor,
  setFreehandStrokeWidth,
  setFreehandStrokeStyle,
  FreehandStrokeStyle,
} from '../../plugins/freehand/freehand-settings';

interface FrameSlideshowProps {
  visible: boolean;
  board: PlaitBoard;
  onClose: () => void;
  /** 初始播放的 Frame ID（如画布有选中的 Frame），缺省从第一帧开始 */
  initialFrameId?: string;
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

type ToolType = 'select' | 'pen' | 'eraser' | 'laser';

const PEN_COLORS = [
  '#000000', '#e91e63', '#f39c12', '#4caf50',
  '#2196f3', '#9c27b0', '#ffffff',
];

const STROKE_STYLES: { style: FreehandStrokeStyle; icon: React.ReactNode }[] = [
  { style: FreehandStrokeStyle.solid, icon: <StrokeStyleNormalIcon /> },
  { style: FreehandStrokeStyle.dashed, icon: <StrokeStyleDashedIcon /> },
  { style: FreehandStrokeStyle.dotted, icon: <StrokeStyleDotedIcon /> },
  { style: FreehandStrokeStyle.double, icon: <StrokeStyleDoubleIcon /> },
];

const STROKE_WIDTHS = [1, 2, 4, 8];

export const FrameSlideshow: React.FC<FrameSlideshowProps> = ({
  visible,
  board,
  onClose,
  initialFrameId,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [frameRect, setFrameRect] = useState<FrameScreenRect | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const setPointer = useSetPointer();
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const savedViewportRef = useRef<{
    origination: [number, number] | null;
    zoom: number;
  } | null>(null);
  const savedPointerRef = useRef<string | null>(null);
  const framesRef = useRef<PlaitFrame[]>([]);

  // 画笔设置状态（从 board 初始化）
  const initSettings = visible ? getFreehandSettings(board) : null;
  const [penColor, setPenColor] = useState(initSettings?.strokeColor ?? '#000000');
  const [penStrokeStyle, setPenStrokeStyle] = useState<FreehandStrokeStyle>(initSettings?.strokeStyle ?? FreehandStrokeStyle.solid);
  const [penStrokeWidth, setPenStrokeWidth] = useState(initSettings?.strokeWidth ?? 2);

  const handlePenColorChange = useCallback((color: string) => {
    setPenColor(color);
    setFreehandStrokeColor(board, color);
  }, [board]);

  const handlePenStrokeStyleChange = useCallback((style: FreehandStrokeStyle) => {
    setPenStrokeStyle(style);
    setFreehandStrokeStyle(board, style);
  }, [board]);

  const handlePenStrokeWidthChange = useCallback((width: number) => {
    setPenStrokeWidth(width);
    setFreehandStrokeWidth(board, width);
  }, [board]);

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) {
      clearTimeout(controlsTimerRef.current);
    }
    controlsTimerRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  }, []);

  /** 切换工具 */
  const switchTool = useCallback((tool: ToolType) => {
    setActiveTool(tool);
    resetControlsTimer();

    if (tool === 'select') {
      BoardTransforms.updatePointerType(board, PlaitPointerType.selection);
      setPointer(PlaitPointerType.selection);
    } else {
      const pointerMap: Record<string, FreehandShape> = {
        pen: FreehandShape.feltTipPen,
        eraser: FreehandShape.eraser,
        laser: FreehandShape.laserPointer,
      };
      const pointer = pointerMap[tool];
      setCreationMode(board, BoardCreationMode.drawing);
      BoardTransforms.updatePointerType(board, pointer);
      setPointer(pointer);
    }
  }, [board, resetControlsTimer, setPointer]);

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

  // 进入幻灯片：保存 viewport、pointer、对准第一个 Frame
  useEffect(() => {
    if (!visible) return;

    const frames = getFrames(board);
    if (frames.length === 0) {
      onClose();
      return;
    }
    framesRef.current = frames;

    // 保存当前 viewport 和 pointer
    const vp = board.viewport;
    savedViewportRef.current = {
      origination: vp?.origination
        ? [vp.origination[0], vp.origination[1]]
        : null,
      zoom: vp?.zoom ?? 1,
    };
    savedPointerRef.current = board.pointer;

    // 隐藏所有 UI 覆盖层
    setSlideshowMode(true);

    // 计算起始帧索引：如果指定了 initialFrameId，定位到该 Frame
    let startIndex = 0;
    if (initialFrameId) {
      const idx = frames.findIndex((f) => f.id === initialFrameId);
      if (idx >= 0) {
        startIndex = idx;
      }
    }

    // 先定位到起始帧
    goToFrame(startIndex);

    // 尝试请求全屏，成功后重新定位
    document.documentElement
      .requestFullscreen?.()
      .then(() => {
        setTimeout(() => goToFrame(startIndex), 300);
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

  // 退出时恢复 viewport 和 pointer
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
    // 恢复 pointer（同时更新 board 和 React context）
    if (savedPointerRef.current !== null) {
      BoardTransforms.updatePointerType(board, savedPointerRef.current);
      setPointer(savedPointerRef.current as Parameters<typeof setPointer>[0]);
    }
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
    setFrameRect(null);
    setActiveTool('select');
    onClose();
  }, [board, onClose, setPointer]);

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
        // 恢复 pointer（同时更新 board 和 React context）
        if (savedPointerRef.current !== null) {
          BoardTransforms.updatePointerType(board, savedPointerRef.current);
          setPointer(savedPointerRef.current as Parameters<typeof setPointer>[0]);
        }
        setFrameRect(null);
        setActiveTool('select');
        onClose();
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [visible, board, onClose, setPointer]);

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

      {/* 底部控制栏 */}
      <div
        className="frame-slideshow__controls"
        style={{ opacity: showControls ? 1 : 0 }}
      >
        {/* 左侧：标题 + ESC 提示 */}
        <div className="frame-slideshow__controls-left">
          {currentFrame && (
            <div className="frame-slideshow__title">
              {currentFrame.name || `Frame ${currentIndex + 1}`}
            </div>
          )}
          <div className="frame-slideshow__esc-hint">
            按 <kbd>ESC</kbd> 退出
          </div>
        </div>

        {/* 中间：页码指示器 */}
        {frames.length > 0 && (
          <div className="frame-slideshow__indicator">
            <span className="frame-slideshow__indicator-current">
              {currentIndex + 1}
            </span>
            <span className="frame-slideshow__indicator-sep">/</span>
            <span className="frame-slideshow__indicator-total">
              {frames.length}
            </span>
          </div>
        )}

        {/* 右侧：工具按钮 */}
        <div className="frame-slideshow__controls-right">
          {/* 画笔设置面板 - 显示在工具按钮上方 */}
          {activeTool === 'pen' && (
            <div className="frame-slideshow__settings-panel">
              {/* 颜色选择 */}
              <div className="frame-slideshow__pen-colors">
                {PEN_COLORS.map((color) => (
                  <button
                    key={color}
                    className={`frame-slideshow__pen-color ${penColor === color ? 'frame-slideshow__pen-color--active' : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() => handlePenColorChange(color)}
                  />
                ))}
              </div>
              <div className="frame-slideshow__pen-divider" />
              {/* 线型选择 */}
              <div className="frame-slideshow__pen-styles">
                {STROKE_STYLES.map(({ style, icon }) => (
                  <button
                    key={style}
                    className={`frame-slideshow__pen-style ${penStrokeStyle === style ? 'frame-slideshow__pen-style--active' : ''}`}
                    onClick={() => handlePenStrokeStyleChange(style)}
                  >
                    {icon}
                  </button>
                ))}
              </div>
              <div className="frame-slideshow__pen-divider" />
              {/* 线宽选择 */}
              <div className="frame-slideshow__pen-widths">
                {STROKE_WIDTHS.map((w) => (
                  <button
                    key={w}
                    className={`frame-slideshow__pen-width ${penStrokeWidth === w ? 'frame-slideshow__pen-width--active' : ''}`}
                    onClick={() => handlePenStrokeWidthChange(w)}
                  >
                    <svg width="20" height="20" viewBox="0 0 20 20">
                      <line x1="3" y1="10" x2="17" y2="10" stroke="currentColor" strokeWidth={w} strokeLinecap="round" />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            className={`frame-slideshow__tool-btn ${activeTool === 'select' ? 'frame-slideshow__tool-btn--active' : ''}`}
            onClick={() => switchTool('select')}
            title="选择工具"
          >
            <HandIcon size={20} />
          </button>
          <button
            className={`frame-slideshow__tool-btn ${activeTool === 'pen' ? 'frame-slideshow__tool-btn--active' : ''}`}
            onClick={() => switchTool('pen')}
            title="画笔"
          >
            <FeltTipPenIcon size={20} />
          </button>
          <button
            className={`frame-slideshow__tool-btn ${activeTool === 'eraser' ? 'frame-slideshow__tool-btn--active' : ''}`}
            onClick={() => switchTool('eraser')}
            title="橡皮擦"
          >
            <EraseIcon size={20} />
          </button>
          <button
            className={`frame-slideshow__tool-btn ${activeTool === 'laser' ? 'frame-slideshow__tool-btn--active' : ''}`}
            onClick={() => switchTool('laser')}
            title="激光笔"
          >
            <LaserPointerIcon size={20} />
          </button>
        </div>
      </div>

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

    </div>,
    document.body
  );
};
