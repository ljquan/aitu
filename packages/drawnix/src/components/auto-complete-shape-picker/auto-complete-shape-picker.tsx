import React, { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import classNames from 'classnames';
import { BasicShapes, DrawPointerType, FlowchartSymbols } from '@plait/draw';
import { Island } from '../island';
import Stack from '../stack';
import { ToolButton } from '../tool-button';
import {
  RectangleIcon,
  EllipseIcon,
  TriangleIcon,
  DiamondIcon,
  ParallelogramIcon,
  RoundRectangleIcon,
  TerminalIcon,
} from '../icons';
import './auto-complete-shape-picker.scss';

export interface ShapeOption {
  icon: React.ReactNode;
  title: string;
  pointer: DrawPointerType;
}

const SHAPES: ShapeOption[] = [
  { icon: RectangleIcon, title: 'Rectangle', pointer: BasicShapes.rectangle },
  { icon: EllipseIcon, title: 'Ellipse', pointer: BasicShapes.ellipse },
  { icon: TriangleIcon, title: 'Triangle', pointer: BasicShapes.triangle },
  { icon: TerminalIcon, title: 'Terminal', pointer: FlowchartSymbols.terminal },
  { icon: DiamondIcon, title: 'Diamond', pointer: BasicShapes.diamond },
  { icon: ParallelogramIcon, title: 'Parallelogram', pointer: BasicShapes.parallelogram },
  { icon: RoundRectangleIcon, title: 'RoundRectangle', pointer: BasicShapes.roundRectangle },
];

export interface AutoCompleteShapePickerProps {
  /** 是否显示 */
  visible: boolean;
  /** 位置 */
  position: { x: number; y: number };
  /** 当前源元素的形状（用于高亮默认选项） */
  currentShape?: DrawPointerType;
  /** 选择形状的回调 */
  onSelectShape: (shape: DrawPointerType) => void;
  /** 关闭回调 */
  onClose: () => void;
  /** 容器元素 */
  container?: HTMLElement | null;
}

export const AutoCompleteShapePicker: React.FC<AutoCompleteShapePickerProps> = ({
  visible,
  position,
  currentShape,
  onSelectShape,
  onClose,
  container,
}) => {
  const pickerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    if (!visible) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    // 延迟添加监听器，避免立即触发
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }, 50);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [visible, onClose]);

  const handleShapeSelect = useCallback((shape: DrawPointerType) => {
    onSelectShape(shape);
    onClose();
  }, [onSelectShape, onClose]);

  if (!visible) return null;

  // 计算位置，确保不超出视口且值有效
  const adjustedPosition = { 
    x: isNaN(position.x) ? 0 : position.x,
    y: isNaN(position.y) ? 0 : position.y,
  };
  const pickerWidth = 200;
  const pickerHeight = 80;
  
  if (typeof window !== 'undefined') {
    if (adjustedPosition.x + pickerWidth > window.innerWidth) {
      adjustedPosition.x = window.innerWidth - pickerWidth - 10;
    }
    if (adjustedPosition.y + pickerHeight > window.innerHeight) {
      adjustedPosition.y = position.y - pickerHeight - 20;
    }
  }

  const content = (
    <div
      ref={pickerRef}
      className="auto-complete-shape-picker"
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
      }}
    >
      <Island padding={1}>
        <Stack.Col gap={1}>
          <Stack.Row gap={1}>
            {SHAPES.map((shape, index) => (
              <ToolButton
                key={index}
                className={classNames('shape-button', {
                  'is-current': currentShape === shape.pointer,
                })}
                type="icon"
                size="small"
                visible={true}
                icon={shape.icon}
                title={shape.title}
                aria-label={shape.title}
                onPointerDown={({ event }) => {
                  event.stopPropagation();
                  handleShapeSelect(shape.pointer);
                }}
              />
            ))}
          </Stack.Row>
        </Stack.Col>
      </Island>
    </div>
  );

  // 如果提供了容器，使用 Portal
  if (container) {
    return createPortal(content, container);
  }

  return content;
};

export default AutoCompleteShapePicker;
