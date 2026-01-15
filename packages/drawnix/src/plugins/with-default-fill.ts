/**
 * With Default Fill Plugin
 *
 * 为新创建的几何形状设置默认白色填充
 * 这样可以让图形中间区域可点击，方便双击进入文本编辑
 */

import { PlaitBoard, PlaitElement, Transforms, Path } from '@plait/core';
import { PlaitDrawElement, BasicShapes } from '@plait/draw';

// 默认填充颜色（白色）
const DEFAULT_GEOMETRY_FILL = '#ffffff';

// 需要设置默认填充的形状类型
const SHAPES_NEED_FILL: string[] = [
  BasicShapes.rectangle,
  BasicShapes.ellipse,
  BasicShapes.triangle,
  BasicShapes.diamond,
  BasicShapes.parallelogram,
  BasicShapes.roundRectangle,
];

/**
 * 检查元素是否需要设置默认填充
 */
function shouldSetDefaultFill(element: PlaitElement): boolean {
  // 只处理几何形状
  if (!PlaitDrawElement.isGeometry(element)) {
    return false;
  }
  
  // 排除文本元素
  if (PlaitDrawElement.isText(element)) {
    return false;
  }
  
  // 排除图片元素
  if (PlaitDrawElement.isImage(element)) {
    return false;
  }
  
  // 检查形状类型
  const typedElement = element as PlaitElement & { shape?: string; fill?: string };
  
  // 只处理基本形状
  if (!typedElement.shape || !SHAPES_NEED_FILL.includes(typedElement.shape)) {
    return false;
  }
  
  // 检查是否已经设置了填充（不是 none 或 undefined）
  if (typedElement.fill && typedElement.fill !== 'none') {
    return false;
  }
  
  return true;
}

/**
 * 插件：为新创建的几何形状设置默认填充
 * 使用 afterChange 在变更后检查并设置填充
 */
export const withDefaultFill = (board: PlaitBoard): PlaitBoard => {
  const { afterChange } = board;
  
  // 记录已处理过的元素 ID，避免重复处理
  const processedElements = new Set<string>();
  
  board.afterChange = () => {
    // 先调用原始的 afterChange
    afterChange();
    
    // 收集需要更新的元素
    const updates: { path: Path; element: PlaitElement }[] = [];
    
    board.children.forEach((element, index) => {
      if (shouldSetDefaultFill(element) && !processedElements.has(element.id)) {
        updates.push({ path: [index], element });
        processedElements.add(element.id);
      }
    });
    
    // 在 afterChange 完成后，使用 setTimeout 延迟更新
    // 避免在 afterChange 中直接修改导致的问题
    if (updates.length > 0) {
      setTimeout(() => {
        updates.forEach(({ path }) => {
          // 检查元素是否仍然存在且需要更新
          const currentElement = board.children[path[0]];
          if (currentElement && shouldSetDefaultFill(currentElement)) {
            Transforms.setNode(board, { fill: DEFAULT_GEOMETRY_FILL }, path);
          }
        });
      }, 0);
    }
  };
  
  return board;
};
