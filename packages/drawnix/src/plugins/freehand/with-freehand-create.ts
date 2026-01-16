import {
  PlaitBoard,
  Point,
  Transforms,
  distanceBetweenPointAndPoint,
  toHostPoint,
  toViewBoxPoint,
} from '@plait/core';
import { isDrawingMode } from '@plait/common';
import { createFreehandElement, getFreehandPointers } from './utils';
import { Freehand, FreehandShape } from './type';
import { FreehandGenerator } from './freehand.generator';
import { FreehandSmoother } from './smoother';
import { getFreehandSettings, FreehandStrokeStyle } from './freehand-settings';

export const withFreehandCreate = (board: PlaitBoard) => {
  const { pointerDown, pointerMove, pointerUp, globalPointerUp } = board;

  let isDrawing = false;

  let isSnappingStartAndEnd = false;

  let points: Point[] = [];

  // 存储每个点对应的压力值
  let pressures: number[] = [];

  let originScreenPoint: Point | null = null;

  const generator = new FreehandGenerator(board);

  const smoother = new FreehandSmoother({
    smoothing: 0.7,
    pressureSensitivity: 0.6,
  });

  let temporaryElement: Freehand | null = null;

  // 缓存当前绘制期间的设置，避免频繁读取
  let cachedSettings: {
    strokeWidth: number;
    strokeColor: string;
    strokeStyle: FreehandStrokeStyle;
    pressureEnabled: boolean;
  } | null = null;

  // 用于计算速度的上一个点和时间
  let lastPoint: Point | null = null;
  let lastTime: number = 0;

  // 获取当前画笔设置（带缓存）
  const getCurrentSettings = (forceRefresh = false): NonNullable<typeof cachedSettings> => {
    if (!cachedSettings || forceRefresh) {
      const settings = getFreehandSettings(board);
      cachedSettings = {
        strokeWidth: settings.strokeWidth,
        strokeColor: settings.strokeColor,
        strokeStyle: settings.strokeStyle,
        pressureEnabled: settings.pressureEnabled,
      };
    }
    return cachedSettings!;
  };

  /**
   * 获取压力值
   * 优先使用设备真实压力（支持压感笔的设备）
   * 如果设备不支持，则使用速度模拟：慢速=粗，快速=细
   */
  const getPressure = (event: PointerEvent, pressureEnabled: boolean): number => {
    if (!pressureEnabled) {
      return 1; // 未启用压力感应时返回最大值
    }
    
    // 检查设备是否支持真实压力感应
    // pointerType 为 'pen' 时通常支持压力感应
    const hasPenPressure = event.pointerType === 'pen' && event.pressure > 0 && event.pressure !== 0.5;
    
    if (hasPenPressure) {
      // 使用设备真实压力值
      return event.pressure;
    }
    
    // 对于鼠标/触控板，使用速度模拟压力
    const currentPoint: Point = [event.x, event.y];
    const currentTime = performance.now(); // 使用 performance.now() 更精确
    
    if (lastPoint && lastTime > 0) {
      const dx = currentPoint[0] - lastPoint[0];
      const dy = currentPoint[1] - lastPoint[1];
      const distance = Math.sqrt(dx * dx + dy * dy);
      const timeDiff = currentTime - lastTime;
      
      if (timeDiff > 0) {
        // 计算速度 (像素/毫秒)
        const velocity = distance / timeDiff;
        
        // 速度映射到压力：速度越慢压力越大
        const minPressure = 0.2;
        const maxPressure = 1.0;
        const velocityThreshold = 1.5;
        
        // 慢速 -> 高压力，快速 -> 低压力
        const normalizedVelocity = Math.min(velocity / velocityThreshold, 1);
        const pressure = maxPressure - normalizedVelocity * (maxPressure - minPressure);
        
        lastPoint = currentPoint;
        lastTime = currentTime;
        
        return pressure;
      }
    }
    
    lastPoint = currentPoint;
    lastTime = currentTime;
    
    return 0.6; // 默认中等压力
  };

  const complete = (cancel?: boolean) => {
    if (isDrawing) {
      const pointer = PlaitBoard.getPointer(board) as FreehandShape;
      if (isSnappingStartAndEnd) {
        points.push(points[0]);
        // 闭合时复制第一个压力值
        if (pressures.length > 0) {
          pressures.push(pressures[0]);
        }
      }
      const settings = getCurrentSettings();
      temporaryElement = createFreehandElement(pointer, points, {
        ...settings,
        pressures: settings.pressureEnabled ? pressures : undefined,
      });
    }
    if (temporaryElement && !cancel) {
      Transforms.insertNode(board, temporaryElement, [board.children.length]);
    }
    generator?.destroy();
    temporaryElement = null;
    isDrawing = false;
    points = [];
    pressures = [];
    lastPoint = null;
    lastTime = 0;
    cachedSettings = null; // 清除缓存
    smoother.reset();
  };

  board.pointerDown = (event: PointerEvent) => {
    const freehandPointers = getFreehandPointers();
    const isFreehandPointer = PlaitBoard.isInPointer(board, freehandPointers);
    if (isFreehandPointer && isDrawingMode(board)) {
      isDrawing = true;
      // 在绘制开始时刷新缓存设置
      const settings = getCurrentSettings(true);
      originScreenPoint = [event.x, event.y];
      const smoothingPoint = smoother.process(originScreenPoint);
      if (smoothingPoint) {
        const point = toViewBoxPoint(
          board,
          toHostPoint(board, smoothingPoint[0], smoothingPoint[1])
        );
        points.push(point);
        
        // 收集压力数据
        pressures.push(getPressure(event, settings.pressureEnabled));
      }
    }
    pointerDown(event);
  };

  board.pointerMove = (event: PointerEvent) => {
    if (isDrawing) {
      const currentScreenPoint: Point = [event.x, event.y];
      if (
        originScreenPoint &&
        distanceBetweenPointAndPoint(
          originScreenPoint[0],
          originScreenPoint[1],
          currentScreenPoint[0],
          currentScreenPoint[1]
        ) < 8
      ) {
        isSnappingStartAndEnd = true;
      } else {
        isSnappingStartAndEnd = false;
      }
      const smoothingPoint = smoother.process(currentScreenPoint);
      if (smoothingPoint) {
        generator?.destroy();
        const newPoint = toViewBoxPoint(
          board,
          toHostPoint(board, smoothingPoint[0], smoothingPoint[1])
        );
        points.push(newPoint);
        
        // 使用缓存的设置
        const settings = getCurrentSettings();
        pressures.push(getPressure(event, settings.pressureEnabled));
        
        const pointer = PlaitBoard.getPointer(board) as FreehandShape;
        temporaryElement = createFreehandElement(pointer, points, {
          ...settings,
          pressures: settings.pressureEnabled ? pressures : undefined,
        });
        generator.processDrawing(
          temporaryElement,
          PlaitBoard.getElementTopHost(board)
        );
      }
      return;
    }

    pointerMove(event);
  };

  board.pointerUp = (event: PointerEvent) => {
    complete();
    pointerUp(event);
  };

  board.globalPointerUp = (event: PointerEvent) => {
    complete(true);
    globalPointerUp(event);
  };

  return board;
};
