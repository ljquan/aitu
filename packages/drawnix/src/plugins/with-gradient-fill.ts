/**
 * With Gradient Fill Plugin
 *
 * 为图形元素支持渐变和图片填充
 * 通过在 afterChange 钩子中修改 SVG DOM 来实现
 */

import { PlaitBoard, PlaitElement, getRectangleByElements } from '@plait/core';
import { isFillConfig, FillConfig } from '../types/fill.types';
import {
  parseFillValue,
  createSVGDefs,
} from '../utils/fill-renderer';
import { isClosedElement } from '../utils/property';

// 存储已处理的元素和它们的填充定义 ID
const processedFillDefs = new WeakMap<PlaitElement, string>();

// MutationObserver 实例
let observer: MutationObserver | null = null;

// 存储 board 引用，用于 MutationObserver 回调
let boardRef: PlaitBoard | null = null;

/**
 * 查找元素对应的 SVG 组元素
 * 优先使用 Plait API，回退到 DOM 查询
 */
function findElementG(board: PlaitBoard, element: PlaitElement): SVGGElement | null {
  // 方法 1: 使用 Plait 的 API 获取元素的 G 元素
  try {
    const g = PlaitElement.getElementG(element);
    if (g) return g;
  } catch {
    // 忽略异常，尝试其他方法
  }

  // 方法 2: 通过 element.id 在 DOM 中查找
  if (element?.id) {
    const host = PlaitBoard.getElementHost(board);
    if (host) {
      const g = host.querySelector(`g[id="${element.id}"]`) as SVGGElement;
      if (g) return g;
    }
  }

  return null;
}

/**
 * 获取元素的填充目标 SVG 元素
 * 对于不同类型的元素，填充应用的目标可能不同
 */
function getFillTargetElement(elementG: SVGGElement): SVGElement | null {
  // 优先查找 path 或 rect 或 ellipse 等形状元素
  const fillTarget = elementG.querySelector('path, rect, ellipse, polygon, circle') as SVGElement;
  return fillTarget;
}

/**
 * 获取或创建 SVG defs 元素
 */
function getOrCreateDefs(svg: SVGSVGElement): SVGDefsElement {
  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = createSVGDefs();
    svg.insertBefore(defs, svg.firstChild);
  }
  return defs;
}

/**
 * 清理旧的填充定义
 */
function cleanupOldFillDef(svg: SVGSVGElement, element: PlaitElement): void {
  const oldDefId = processedFillDefs.get(element);
  if (oldDefId) {
    const oldDef = svg.querySelector(`#${oldDefId}`);
    if (oldDef) {
      oldDef.remove();
    }
  }
}

/**
 * 应用填充配置到元素
 */
function applyFillConfig(
  board: PlaitBoard,
  element: PlaitElement,
  fillConfig: FillConfig
): void {
  const elementG = findElementG(board, element);
  if (!elementG) return;

  const fillTarget = getFillTargetElement(elementG);
  if (!fillTarget) return;

  const svg = elementG.closest('svg');
  if (!svg) return;

  // 获取元素尺寸
  const rect = getRectangleByElements(board, [element], false);
  const width = rect?.width || 100;
  const height = rect?.height || 100;

  // 解析填充值
  const parsed = parseFillValue(fillConfig, element.id, width, height);

  // 清理旧的定义（每次都清理，确保渐变内容更新）
  cleanupOldFillDef(svg, element);
  
  // 同时清理已存在的同 ID 定义（可能由之前的渲染遗留）
  if (parsed.defElement) {
    const existingDef = svg.querySelector(`#${parsed.defElement.id}`);
    if (existingDef) {
      existingDef.remove();
    }
  }

  // 设置填充属性
  fillTarget.setAttribute('fill', parsed.fillValue);

  // 如果有定义元素，添加到 defs
  if (parsed.defElement) {
    const defs = getOrCreateDefs(svg);
    defs.appendChild(parsed.defElement);
    processedFillDefs.set(element, parsed.defElement.id);
  }
}

/**
 * 根据元素 ID 查找 board.children 中的元素
 */
function findElementById(board: PlaitBoard, id: string): PlaitElement | null {
  return board.children.find((el) => el.id === id) || null;
}

/**
 * 处理 DOM 变化，修复被 Plait 重新渲染的元素
 */
function handleDOMMutation(mutations: MutationRecord[]): void {
  if (!boardRef) return;

  const elementsToFix = new Set<PlaitElement>();

  mutations.forEach((mutation) => {
    // 监听属性变化
    if (mutation.type === 'attributes' && mutation.attributeName === 'fill') {
      const target = mutation.target as SVGElement;
      const gElement = target.closest('g[id]') as SVGGElement;
      if (gElement) {
        const elementId = gElement.getAttribute('id');
        if (elementId) {
          const element = findElementById(boardRef!, elementId);
          // 使用统一的 isClosedElement 判断
          if (element && element.fill && isFillConfig(element.fill) && isClosedElement(boardRef!, element)) {
            elementsToFix.add(element);
          }
        }
      }
    }

    // 监听子节点变化（元素被重新渲染）
    if (mutation.type === 'childList') {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof SVGGElement && node.hasAttribute('id')) {
          const elementId = node.getAttribute('id');
          if (elementId) {
            const element = findElementById(boardRef!, elementId);
            // 使用统一的 isClosedElement 判断
            if (element && element.fill && isFillConfig(element.fill) && isClosedElement(boardRef!, element)) {
              elementsToFix.add(element);
            }
          }
        }
      });
    }
  });

  // 延迟修复，避免与 Plait 的渲染冲突
  if (elementsToFix.size > 0) {
    requestAnimationFrame(() => {
      elementsToFix.forEach((element) => {
        if (element.fill && isFillConfig(element.fill)) {
          applyFillConfig(boardRef!, element, element.fill);
        }
      });
    });
  }
}

/**
 * 设置 MutationObserver
 */
function setupMutationObserver(board: PlaitBoard): void {
  if (observer) return;

  const host = PlaitBoard.getElementHost(board);
  if (!host) return;

  boardRef = board;

  observer = new MutationObserver(handleDOMMutation);
  observer.observe(host, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['fill'],
  });
}

/**
 * 处理所有元素的填充渲染
 * @param board - Plait Board 实例
 * @param immediate - 是否立即同步处理（不使用 requestAnimationFrame）
 */
function processAllFillRendering(board: PlaitBoard, immediate = false): void {
  board.children.forEach((element) => {
    const fill = element.fill;
    
    // 只处理 FillConfig 类型的填充
    if (fill && isFillConfig(fill)) {
      // 使用统一的 isClosedElement 判断，支持所有闭合图形类型
      // 包括：DrawElement、Freehand、PenPath、CustomGeometry 等
      if (isClosedElement(board, element)) {
        if (immediate) {
          // 同步处理，用于初始加载
          applyFillConfig(board, element, fill);
        } else {
          // 异步处理，用于变更后的更新
          requestAnimationFrame(() => {
            applyFillConfig(board, element, fill);
          });
        }
      }
    }
  });
}

// 标记是否为首次渲染（用于优化初始加载）
let isFirstRender = true;

/**
 * 插件：支持渐变和图片填充
 */
export const withGradientFill = (board: PlaitBoard): PlaitBoard => {
  const { afterChange } = board;

  board.afterChange = () => {
    // 先调用原始的 afterChange
    afterChange();

    // 设置 MutationObserver（只需一次）
    setupMutationObserver(board);

    // 处理填充渲染
    // 首次渲染时使用同步模式，后续使用异步模式
    if (isFirstRender) {
      isFirstRender = false;
      // 首次渲染：先尝试同步处理，然后再异步补充处理（确保 DOM 完全准备好）
      processAllFillRendering(board, true);
      requestAnimationFrame(() => {
        processAllFillRendering(board, true);
      });
    } else {
      processAllFillRendering(board);
    }
  };

  return board;
};
