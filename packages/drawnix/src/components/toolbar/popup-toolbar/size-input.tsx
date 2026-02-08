import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  PlaitBoard,
  getSelectedElements,
  getRectangleByElements,
  Transforms,
  Point,
  PlaitElement,
  RectangleClient,
} from '@plait/core';
import { PlaitDrawElement } from '@plait/draw';
import { MindElement } from '@plait/mind';
import { Freehand } from '../../../plugins/freehand/type';
import { PenPath } from '../../../plugins/pen/type';
import { isFrameElement } from '../../../types/frame.types';
import { LockIcon, UnlockIcon } from '../../icons';
import { Popover, PopoverContent, PopoverTrigger } from '../../popover/popover';
import { ChevronDown } from 'lucide-react';
import { useI18n } from '../../../i18n';
import { PRESET_SIZES, PresetSize } from '../../../constants/frame-presets';
import './size-input.scss';

export interface SizeInputProps {
  board: PlaitBoard;
}

/**
 * 获取元素的矩形边界
 */
const getElementRectangle = (board: PlaitBoard, element: PlaitElement): RectangleClient | null => {
  try {
    return getRectangleByElements(board, [element], false);
  } catch {
    return null;
  }
};

/**
 * 缩放单个元素
 */
const scaleElement = (
  board: PlaitBoard,
  element: PlaitElement,
  originalRect: RectangleClient,
  newRect: RectangleClient,
  scaleX: number,
  scaleY: number
) => {
  const path = board.children.findIndex((el) => el.id === element.id);
  if (path < 0) return;

  // 计算元素相对于选区的偏移
  const elementRect = getElementRectangle(board, element);
  if (!elementRect) return;

  // 计算新位置（保持相对位置）
  const relativeX = (elementRect.x - originalRect.x) / originalRect.width;
  const relativeY = (elementRect.y - originalRect.y) / originalRect.height;
  const newX = newRect.x + relativeX * newRect.width;
  const newY = newRect.y + relativeY * newRect.height;

  // 计算新尺寸
  const newWidth = elementRect.width * scaleX;
  const newHeight = elementRect.height * scaleY;

  // 根据元素类型更新
  if (isFrameElement(element)) {
    // Frame 元素 — 直接更新两个角点
    const newPoints: [Point, Point] = [
      [newX, newY],
      [newX + newWidth, newY + newHeight],
    ];
    Transforms.setNode(board, { points: newPoints }, [path]);
  } else if (PlaitDrawElement.isDrawElement(element)) {
    // 图片、形状等使用 points 数组
    const newPoints: [Point, Point] = [
      [newX, newY],
      [newX + newWidth, newY + newHeight],
    ];
    Transforms.setNode(board, { points: newPoints }, [path]);
  } else if (MindElement.isMindElement(board, element)) {
    // 思维导图元素
    const newPoints: [Point, Point] = [
      [newX, newY],
      [newX + newWidth, newY + newHeight],
    ];
    Transforms.setNode(board, { points: newPoints }, [path]);
  } else if (Freehand.isFreehand(element)) {
    // 手绘元素 - 缩放所有点
    const freehand = element as Freehand;
    const scaledPoints = freehand.points.map((p: Point) => {
      const relX = (p[0] - originalRect.x) / originalRect.width;
      const relY = (p[1] - originalRect.y) / originalRect.height;
      return [
        newRect.x + relX * newRect.width,
        newRect.y + relY * newRect.height,
      ] as Point;
    });
    Transforms.setNode(board, { points: scaledPoints }, [path]);
  } else if (PenPath.isPenPath(element)) {
    // 钢笔路径 - 缩放锚点和控制柄
    const penPath = element as PenPath;
    const scaledAnchors = penPath.anchors.map((anchor) => {
      const scaledPoint: Point = [
        anchor.point[0] * scaleX,
        anchor.point[1] * scaleY,
      ];
      const scaledHandleIn = anchor.handleIn
        ? ([anchor.handleIn[0] * scaleX, anchor.handleIn[1] * scaleY] as Point)
        : undefined;
      const scaledHandleOut = anchor.handleOut
        ? ([anchor.handleOut[0] * scaleX, anchor.handleOut[1] * scaleY] as Point)
        : undefined;
      return {
        ...anchor,
        point: scaledPoint,
        handleIn: scaledHandleIn,
        handleOut: scaledHandleOut,
      };
    });
    // 更新 points[0] 作为基准点
    const newBasePoint: Point = [newX, newY];
    Transforms.setNode(
      board,
      { points: [newBasePoint, newBasePoint], anchors: scaledAnchors },
      [path]
    );
  }
};

/**
 * 宽高设置输入组件
 */
export const SizeInput: React.FC<SizeInputProps> = ({ board }) => {
  const { language } = useI18n();
  const isZh = language === 'zh';
  const selectedElements = getSelectedElements(board);
  const [locked, setLocked] = useState(true); // 默认锁定比例
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [aspectRatio, setAspectRatio] = useState(1);
  const [presetOpen, setPresetOpen] = useState(false);
  // 用于跟踪用户主动设置的目标尺寸，防止 useEffect 覆盖
  const targetSizeRef = useRef<{ width: number; height: number } | null>(null);
  const container = PlaitBoard.getBoardContainer(board);

  // 获取选中元素的边界矩形
  const selectionRect =
    selectedElements.length > 0
      ? getRectangleByElements(board, selectedElements, false)
      : null;

  // 同步当前选区尺寸
  useEffect(() => {
    if (selectionRect) {
      // 如果有用户设置的目标尺寸，使用目标尺寸而不是实际尺寸
      if (targetSizeRef.current) {
        setWidth(Math.round(targetSizeRef.current.width).toString());
        setHeight(Math.round(targetSizeRef.current.height).toString());
        // 清除目标尺寸，下次选区变化时恢复正常同步
        targetSizeRef.current = null;
      } else {
        setWidth(Math.round(selectionRect.width).toString());
        setHeight(Math.round(selectionRect.height).toString());
      }
      setAspectRatio(selectionRect.width / selectionRect.height);
    }
  }, [selectionRect?.width, selectionRect?.height]);

  // 处理宽度变化
  const handleWidthChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newWidth = e.target.value;
      setWidth(newWidth);
      if (locked && selectionRect) {
        const numWidth = parseFloat(newWidth);
        if (!isNaN(numWidth) && numWidth > 0) {
          const newHeight = Math.round(numWidth / aspectRatio);
          setHeight(newHeight.toString());
        }
      }
    },
    [locked, aspectRatio, selectionRect]
  );

  // 处理高度变化
  const handleHeightChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newHeight = e.target.value;
      setHeight(newHeight);
      if (locked && selectionRect) {
        const numHeight = parseFloat(newHeight);
        if (!isNaN(numHeight) && numHeight > 0) {
          const newWidth = Math.round(numHeight * aspectRatio);
          setWidth(newWidth.toString());
        }
      }
    },
    [locked, aspectRatio, selectionRect]
  );

  // 应用尺寸变化
  const applySize = useCallback(() => {
    if (!selectionRect || selectedElements.length === 0) return;

    const newWidth = parseFloat(width);
    const newHeight = parseFloat(height);
    if (isNaN(newWidth) || isNaN(newHeight) || newWidth <= 0 || newHeight <= 0) {
      // 恢复原值
      setWidth(Math.round(selectionRect.width).toString());
      setHeight(Math.round(selectionRect.height).toString());
      return;
    }

    // 如果尺寸没有变化，直接返回
    if (
      Math.abs(newWidth - selectionRect.width) < 0.5 &&
      Math.abs(newHeight - selectionRect.height) < 0.5
    ) {
      return;
    }

    // 保存用户设置的目标尺寸，防止 useEffect 覆盖
    targetSizeRef.current = { width: newWidth, height: newHeight };

    // 计算缩放比例
    const scaleX = newWidth / selectionRect.width;
    const scaleY = newHeight / selectionRect.height;

    // 计算新的边界矩形
    const newRect: RectangleClient = {
      x: selectionRect.x,
      y: selectionRect.y,
      width: newWidth,
      height: newHeight,
    };

    // 缩放所有选中元素
    selectedElements.forEach((element) => {
      scaleElement(board, element, selectionRect, newRect, scaleX, scaleY);
    });
  }, [board, selectedElements, selectionRect, width, height]);

  // 应用预设尺寸
  const applyPresetSize = useCallback(
    (preset: PresetSize) => {
      if (!selectionRect || selectedElements.length === 0) return;

      const newWidth = preset.width;
      const newHeight = preset.height;

      // 更新输入框
      setWidth(newWidth.toString());
      setHeight(newHeight.toString());

      // 保存目标尺寸
      targetSizeRef.current = { width: newWidth, height: newHeight };

      // 计算缩放比例
      const scaleX = newWidth / selectionRect.width;
      const scaleY = newHeight / selectionRect.height;

      const newRect: RectangleClient = {
        x: selectionRect.x,
        y: selectionRect.y,
        width: newWidth,
        height: newHeight,
      };

      selectedElements.forEach((element) => {
        scaleElement(board, element, selectionRect, newRect, scaleX, scaleY);
      });

      // 更新宽高比
      setAspectRatio(newWidth / newHeight);
      setPresetOpen(false);
    },
    [board, selectedElements, selectionRect]
  );

  // 处理键盘事件
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        applySize();
        (e.target as HTMLInputElement).blur();
      } else if (e.key === 'Escape') {
        if (selectionRect) {
          setWidth(Math.round(selectionRect.width).toString());
          setHeight(Math.round(selectionRect.height).toString());
        }
        (e.target as HTMLInputElement).blur();
      }
    },
    [applySize, selectionRect]
  );

  if (!selectionRect) return null;

  return (
    <div className="size-input-container">
      <div className="size-input-group">
        <span className="size-input-label">W</span>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          className="size-input"
          value={width}
          onChange={handleWidthChange}
          onBlur={applySize}
          onKeyDown={handleKeyDown}
        />
      </div>
      <button
        className={`size-lock-button ${locked ? 'locked' : ''}`}
        onClick={() => setLocked(!locked)}
        title={locked ? '解锁比例' : '锁定比例'}
      >
        {locked ? <LockIcon /> : <UnlockIcon />}
      </button>
      <div className="size-input-group">
        <span className="size-input-label">H</span>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          className="size-input"
          value={height}
          onChange={handleHeightChange}
          onBlur={applySize}
          onKeyDown={handleKeyDown}
        />
      </div>
      <Popover
        open={presetOpen}
        onOpenChange={setPresetOpen}
        placement="bottom-end"
        sideOffset={8}
      >
        <PopoverTrigger asChild>
          <button
            className={`size-preset-button ${presetOpen ? 'active' : ''}`}
            title={isZh ? '常用尺寸' : 'Preset Sizes'}
            onClick={() => setPresetOpen(!presetOpen)}
          >
            <ChevronDown size={12} />
          </button>
        </PopoverTrigger>
        <PopoverContent container={container}>
          <div className="size-preset-panel">
            {PRESET_SIZES.map((group) => (
              <div key={group.category} className="size-preset-category">
                <div className="size-preset-category-label">
                  {isZh ? group.category : group.categoryEn}
                </div>
                {group.items.map((preset) => (
                  <button
                    key={`${preset.width}x${preset.height}-${preset.label}`}
                    className="size-preset-item"
                    onClick={() => applyPresetSize(preset)}
                  >
                    <span className="size-preset-item-label">
                      {isZh ? preset.label : preset.labelEn}
                    </span>
                    <span className="size-preset-item-size">
                      {preset.width} x {preset.height}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};
