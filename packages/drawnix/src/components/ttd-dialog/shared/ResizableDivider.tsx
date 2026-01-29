import React, { useCallback, useRef, useState, useEffect } from 'react';
import { ChevronRightIcon, ChevronLeftIcon } from 'tdesign-icons-react';
import { Tooltip } from 'tdesign-react';
import './ResizableDivider.scss';

// Storage keys for different dialog types
const STORAGE_KEY_PREFIX = 'aitu-dialog-task-list-width-';

interface ResizableDividerProps {
  /** 是否显示右侧面板 */
  isRightPanelVisible: boolean;
  /** 切换右侧面板显示/隐藏 */
  onToggleRightPanel: () => void;
  /** 当右侧面板宽度变化时的回调 */
  onWidthChange: (width: number) => void;
  /** 当前右侧面板宽度 */
  rightPanelWidth: number;
  /** 容器最小宽度 */
  minWidth?: number;
  /** 容器最大宽度 */
  maxWidth?: number;
  /** 拖动开始回调 */
  onResizeStart?: () => void;
  /** 拖动结束回调 */
  onResizeEnd?: () => void;
  /** 语言 */
  language?: string;
  /** 是否禁用拖动 */
  disabled?: boolean;
  /** 存储 key 后缀，用于区分不同弹窗的宽度设置 */
  storageKey?: 'image' | 'video';
}

// 默认宽度和限制
const MIN_WIDTH = 240;
const MAX_WIDTH = 800;

/**
 * 计算默认宽度（左2右3的比例，即任务列表占60%）
 * 基于弹窗默认宽度约 1100px 计算
 */
const getDefaultWidth = (): number => {
  // 弹窗宽度约 1100px，左2右3 = 任务列表占 3/5 = 660px
  // 但需要考虑实际限制
  const defaultWidth = Math.round(1100 * 0.6); // 660px
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, defaultWidth));
};

/**
 * 从 localStorage 读取宽度
 */
export const loadSavedWidth = (storageKey: string): number => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_PREFIX + storageKey);
    if (saved) {
      const width = parseInt(saved, 10);
      if (!isNaN(width) && width >= MIN_WIDTH && width <= MAX_WIDTH) {
        return width;
      }
    }
  } catch {
    // ignore
  }
  return getDefaultWidth();
};

/**
 * 保存宽度到 localStorage
 */
const saveWidth = (storageKey: string, width: number): void => {
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + storageKey, width.toString());
  } catch {
    // ignore
  }
};

/**
 * 可拖动的分隔条组件
 * 支持拖动调整左右两侧面板的宽度，以及隐藏/显示右侧面板
 */
export const ResizableDivider: React.FC<ResizableDividerProps> = ({
  isRightPanelVisible,
  onToggleRightPanel,
  onWidthChange,
  rightPanelWidth,
  minWidth = MIN_WIDTH,
  maxWidth = MAX_WIDTH,
  onResizeStart,
  onResizeEnd,
  language = 'zh',
  disabled = false,
  storageKey = 'image',
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);

  // 拖动时禁止文本选择
  useEffect(() => {
    if (isDragging) {
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    } else {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }
    return () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDragging]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (disabled || !isRightPanelVisible) return;
      e.preventDefault();
      e.stopPropagation();
      
      setIsDragging(true);
      startXRef.current = e.clientX;
      startWidthRef.current = rightPanelWidth;
      onResizeStart?.();

      const handleMouseMove = (moveEvent: MouseEvent) => {
        // 向左拖动（deltaX < 0）应该增加右侧面板宽度
        const deltaX = startXRef.current - moveEvent.clientX;
        const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidthRef.current + deltaX));
        onWidthChange(newWidth);
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        onResizeEnd?.();
        // 保存当前宽度到 localStorage
        const currentWidth = startWidthRef.current + (startXRef.current - document.body.getBoundingClientRect().left);
        saveWidth(storageKey, rightPanelWidth);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [disabled, isRightPanelVisible, rightPanelWidth, minWidth, maxWidth, onWidthChange, onResizeStart, onResizeEnd, storageKey]
  );

  // 保存宽度变化
  useEffect(() => {
    if (!isDragging && isRightPanelVisible) {
      saveWidth(storageKey, rightPanelWidth);
    }
  }, [rightPanelWidth, isDragging, isRightPanelVisible, storageKey]);

  const toggleTooltip = isRightPanelVisible
    ? language === 'zh'
      ? '隐藏任务列表'
      : 'Hide Task List'
    : language === 'zh'
    ? '显示任务列表'
    : 'Show Task List';

  return (
    <div
      className={`resizable-divider ${isDragging ? 'is-dragging' : ''} ${
        !isRightPanelVisible ? 'is-collapsed' : ''
      } ${disabled ? 'is-disabled' : ''}`}
      onMouseDown={handleMouseDown}
    >
      <div className="resizable-divider__bar" />
      <Tooltip content={toggleTooltip} theme="light" placement="left">
        <button
          type="button"
          className="resizable-divider__toggle"
          onClick={(e) => {
            e.stopPropagation();
            onToggleRightPanel();
          }}
          aria-label={toggleTooltip}
        >
          {isRightPanelVisible ? (
            <ChevronRightIcon size="14px" />
          ) : (
            <ChevronLeftIcon size="14px" />
          )}
        </button>
      </Tooltip>
    </div>
  );
};

export default ResizableDivider;
