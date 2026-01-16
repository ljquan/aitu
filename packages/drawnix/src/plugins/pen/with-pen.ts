import {
  PlaitBoard,
  PlaitElement,
  PlaitOptionsBoard,
  PlaitPluginElementContext,
  Selection,
} from '@plait/core';
import { PenPath, PEN_TYPE } from './type';
import { PenPathComponent } from './pen.component';
import { withPenCreate } from './with-pen-create';
import { withPenEdit } from './with-pen-edit';
import { withPenFragment } from './with-pen-fragment';
import {
  isHitPenPath,
  isRectangleHitPenPath,
  getPenPathRectangle,
} from './utils';
import {
  getHitDrawElement,
  WithDrawOptions,
  WithDrawPluginKey,
} from '@plait/draw';

/**
 * 钢笔工具插件
 * 
 * 功能：
 * 1. 点击添加锚点，连点成线
 * 2. 拖拽创建贝塞尔曲线控制柄
 * 3. 点击起始锚点闭合路径
 * 4. 编辑模式下可调整锚点和控制柄
 * 5. 双击锚点切换锚点类型
 */
export const withPen = (board: PlaitBoard) => {
  const {
    getRectangle,
    drawElement,
    isHit,
    isRectangleHit,
    getOneHitElement,
    isMovable,
    isAlign,
  } = board;

  /**
   * 注册组件渲染
   */
  board.drawElement = (context: PlaitPluginElementContext) => {
    if (PenPath.isPenPath(context.element)) {
      return PenPathComponent;
    }
    return drawElement(context);
  };

  /**
   * 获取元素包围矩形
   */
  board.getRectangle = (element: PlaitElement) => {
    if (PenPath.isPenPath(element)) {
      return getPenPathRectangle(element);
    }
    return getRectangle(element);
  };

  /**
   * 矩形选择命中测试
   */
  board.isRectangleHit = (element: PlaitElement, selection: Selection) => {
    if (PenPath.isPenPath(element)) {
      return isRectangleHitPenPath(board, element, selection);
    }
    return isRectangleHit(element, selection);
  };

  /**
   * 点击命中测试
   */
  board.isHit = (element, point, isStrict?: boolean) => {
    if (PenPath.isPenPath(element)) {
      return isHitPenPath(board, element, point);
    }
    return isHit(element, point, isStrict);
  };

  /**
   * 获取命中的单个元素
   */
  board.getOneHitElement = (elements) => {
    const allPenPaths = elements.every((item) => PenPath.isPenPath(item));
    if (allPenPaths) {
      return getHitDrawElement(board, elements as PenPath[]);
    }
    return getOneHitElement(elements);
  };

  /**
   * 是否可移动
   */
  board.isMovable = (element) => {
    if (PenPath.isPenPath(element)) {
      return true;
    }
    return isMovable(element);
  };

  /**
   * 是否参与对齐
   */
  board.isAlign = (element) => {
    if (PenPath.isPenPath(element)) {
      return true;
    }
    return isAlign(element);
  };

  // 注册为自定义几何类型
  (board as PlaitOptionsBoard).setPluginOptions<WithDrawOptions>(
    WithDrawPluginKey,
    { customGeometryTypes: [PEN_TYPE] }
  );

  // 应用创建、编辑和剪贴板插件
  return withPenFragment(withPenEdit(withPenCreate(board)));
};
