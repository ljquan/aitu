/**
 * With Tool Focus Plugin
 *
 * 实现工具元素的双击编辑功能
 * 当用户双击工具元素时,启用 iframe 交互,允许用户与内嵌页面交互
 */

import {
  PlaitBoard,
  PlaitPlugin,
  getSelectedElements,
  Point,
  toHostPoint,
  toViewBoxPoint,
} from '@plait/core';
import { PlaitTool } from '../types/toolbox.types';
import { isToolElement } from './with-tool';
import { ToolGenerator } from '../components/tool-element/tool.generator';

/**
 * 全局存储当前聚焦的工具元素 ID
 */
let focusedToolId: string | null = null;

/**
 * 全局存储所有 ToolGenerator 实例
 * key: board 实例, value: Map<elementId, ToolGenerator>
 */
const toolGenerators = new WeakMap<PlaitBoard, Map<string, ToolGenerator>>();

/**
 * 注册 ToolGenerator 实例
 */
export function registerToolGenerator(
  board: PlaitBoard,
  elementId: string,
  generator: ToolGenerator
): void {
  if (!toolGenerators.has(board)) {
    toolGenerators.set(board, new Map());
  }
  toolGenerators.get(board)!.set(elementId, generator);
}

/**
 * 取消注册 ToolGenerator 实例
 */
export function unregisterToolGenerator(
  board: PlaitBoard,
  elementId: string
): void {
  const generators = toolGenerators.get(board);
  if (generators) {
    generators.delete(elementId);
  }
}

/**
 * 获取 ToolGenerator 实例
 */
function getToolGenerator(
  board: PlaitBoard,
  elementId: string
): ToolGenerator | undefined {
  const generators = toolGenerators.get(board);
  return generators?.get(elementId);
}

/**
 * 设置工具元素的焦点状态
 */
function setToolFocus(board: PlaitBoard, element: PlaitTool, isFocus: boolean): void {
  const generator = getToolGenerator(board, element.id);
  if (generator) {
    generator.setIframeInteraction(element.id, isFocus);

    if (isFocus) {
      focusedToolId = element.id;
      // console.log('Tool element focused:', element.id);
    } else if (focusedToolId === element.id) {
      focusedToolId = null;
      // console.log('Tool element unfocused:', element.id);
    }
  }
}

/**
 * 取消所有工具元素的焦点
 */
function blurAllTools(board: PlaitBoard): void {
  if (!focusedToolId) return;

  const allTools = board.children.filter(isToolElement) as PlaitTool[];
  allTools.forEach((tool) => {
    const generator = getToolGenerator(board, tool.id);
    if (generator) {
      generator.setIframeInteraction(tool.id, false);
    }
  });

  focusedToolId = null;
  // console.log('All tool elements unfocused');
}

/**
 * 判断点击位置是否在工具元素内
 */
function getToolElementAtPoint(board: PlaitBoard, point: Point): PlaitTool | null {
  const viewBoxPoint = toViewBoxPoint(
    board,
    toHostPoint(board, point[0], point[1])
  );

  const allTools = board.children.filter(isToolElement) as PlaitTool[];

  // 从后往前查找 (后面的元素在上层)
  for (let i = allTools.length - 1; i >= 0; i--) {
    const tool = allTools[i];
    if (board.isHit(tool, viewBoxPoint)) {
      return tool;
    }
  }

  return null;
}

/**
 * 工具焦点插件
 *
 * 处理工具元素的双击编辑和焦点管理
 */
export const withToolFocus: PlaitPlugin = (board: PlaitBoard) => {
  const { pointerDown, globalPointerUp, dblClick } = board;

  // 处理双击事件 - 进入编辑模式
  board.dblClick = (event: PointerEvent) => {
    const selectedElements = getSelectedElements(board);

    // 检查是否双击了工具元素
    if (selectedElements.length === 1 && isToolElement(selectedElements[0])) {
      const toolElement = selectedElements[0] as PlaitTool;

      // 启用 iframe 交互
      setToolFocus(board, toolElement, true);

      // 阻止默认行为,避免触发其他编辑操作
      event.preventDefault();
      event.stopPropagation();

      // console.log('Tool element double-clicked, entering edit mode:', toolElement.id);
      return;
    }

    // 调用原始的 dblClick 处理器
    dblClick(event);
  };

  // 处理单击事件 - 检查是否需要退出编辑模式
  board.pointerDown = (event: PointerEvent) => {
    const point: Point = [event.clientX, event.clientY];
    const clickedTool = getToolElementAtPoint(board, point);

    // 如果当前有焦点的工具元素
    if (focusedToolId) {
      // 如果点击的不是焦点工具元素,取消焦点
      if (!clickedTool || clickedTool.id !== focusedToolId) {
        blurAllTools(board);
        // console.log('Clicked outside focused tool, exiting edit mode');
      }
    }

    // 调用原始的 pointerDown 处理器
    pointerDown(event);
  };

  // 处理全局 pointer up 事件 - 检测画布外点击
  board.globalPointerUp = (event: PointerEvent) => {
    // 如果有焦点的工具元素,且点击在画布外,取消焦点
    if (focusedToolId) {
      const boardContainer = PlaitBoard.getBoardContainer(board);
      const rect = boardContainer.getBoundingClientRect();

      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      ) {
        blurAllTools(board);
        // console.log('Clicked outside canvas, exiting edit mode');
      }
    }

    // 调用原始的 globalPointerUp 处理器
    globalPointerUp(event);
  };

  // console.log('withToolFocus plugin initialized');
  return board;
};

/**
 * 检查是否有工具元素处于焦点状态
 */
export function hasToolFocus(): boolean {
  return focusedToolId !== null;
}

/**
 * 获取当前焦点工具元素的 ID
 */
export function getFocusedToolId(): string | null {
  return focusedToolId;
}
