import {
  PlaitBoard,
  Point,
  toHostPoint,
  toViewBoxPoint,
} from '@plait/core';
import { isDrawingMode } from '@plait/common';
import { createFreehandElement } from './utils';
import { Freehand, FreehandShape } from './type';
import { FreehandGenerator } from './freehand.generator';
import { FreehandSmoother } from './smoother';

const LASER_COLOR = '#e91e63';
const LASER_WIDTH = 3;
const FADE_DURATION_MS = 2000;

/**
 * 激光笔插件
 *
 * 作为画笔工具组的一员，复用 FreehandGenerator 进行 SVG 渲染。
 * 与普通画笔的区别：
 * - 笔迹不持久化到画板（临时 SVG）
 * - 鼠标松开 2 秒后，笔迹自动淡出消失
 * - 固定颜色（玫红）和线宽，不支持压力感应
 */
export const withLaserPointer = (board: PlaitBoard) => {
  const { pointerDown, pointerMove, pointerUp, globalPointerUp } = board;

  let isDrawing = false;
  let points: Point[] = [];

  const generator = new FreehandGenerator(board);
  const smoother = new FreehandSmoother({
    smoothing: 0.7,
    pressureSensitivity: 0,
  });

  let temporaryElement: Freehand | null = null;

  // 存储正在淡出的轨迹 SVG 和定时器
  const fadingTrails: { g: SVGGElement; timer: number }[] = [];

  const isLaserPointer = () =>
    PlaitBoard.isPointer(board, FreehandShape.laserPointer);

  /**
   * 完成一笔：不插入元素，启动淡出动画
   */
  const complete = () => {
    if (!isDrawing) return;

    isDrawing = false;

    // 获取当前 generator 持有的 SVG <g> 元素
    const currentG = generator.g;
    if (currentG) {
      // 断开 generator 对该 g 的引用（避免下次绘制时被移除）
      generator.g = undefined;
      startFadeOut(currentG);
    } else {
      generator.destroy();
    }

    temporaryElement = null;
    points = [];
    smoother.reset();
  };

  /**
   * 淡出动画：2 秒内 opacity 从 1 → 0，然后移除 DOM
   */
  const startFadeOut = (g: SVGGElement) => {
    g.style.transition = `opacity ${FADE_DURATION_MS}ms ease-out`;
    g.style.opacity = '1';

    // 触发 reflow 以确保 transition 能正常启动
    g.getBoundingClientRect();

    g.style.opacity = '0';

    const timer = window.setTimeout(() => {
      g.remove();
      // 从列表中移除
      const idx = fadingTrails.findIndex((t) => t.g === g);
      if (idx >= 0) fadingTrails.splice(idx, 1);
    }, FADE_DURATION_MS);

    fadingTrails.push({ g, timer });
  };

  board.pointerDown = (event: PointerEvent) => {
    if (isLaserPointer() && isDrawingMode(board)) {
      isDrawing = true;
      const screenPoint: Point = [event.x, event.y];
      const smoothed = smoother.process(screenPoint);
      if (smoothed) {
        const point = toViewBoxPoint(
          board,
          toHostPoint(board, smoothed[0], smoothed[1])
        );
        points.push(point);
      }
      return; // 不传递给下层插件
    }
    pointerDown(event);
  };

  board.pointerMove = (event: PointerEvent) => {
    if (isDrawing) {
      const screenPoint: Point = [event.x, event.y];
      const smoothed = smoother.process(screenPoint);
      if (smoothed) {
        generator.destroy();
        const newPoint = toViewBoxPoint(
          board,
          toHostPoint(board, smoothed[0], smoothed[1])
        );
        points.push(newPoint);

        temporaryElement = createFreehandElement(
          FreehandShape.laserPointer,
          points,
          {
            strokeWidth: LASER_WIDTH,
            strokeColor: LASER_COLOR,
          }
        );
        generator.processDrawing(
          temporaryElement,
          PlaitBoard.getElementTopHost(board)
        );
      }
      return; // 不传递给下层插件
    }
    pointerMove(event);
  };

  board.pointerUp = (event: PointerEvent) => {
    if (isDrawing) {
      complete();
    }
    pointerUp(event);
  };

  board.globalPointerUp = (event: PointerEvent) => {
    if (isDrawing) {
      complete();
    }
    globalPointerUp(event);
  };

  return board;
};
