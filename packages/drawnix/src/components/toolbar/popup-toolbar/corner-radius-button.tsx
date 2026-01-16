/**
 * 圆角设置按钮组件
 * 用于在 popup-toolbar 中设置选中的 PenPath 元素的圆角半径
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { PlaitBoard, Transforms, getSelectedElements, ATTACHED_ELEMENT_CLASS_NAME } from '@plait/core';
import classNames from 'classnames';
import { ToolButton } from '../../tool-button';
import { Island } from '../../island';
import { Slider } from 'tdesign-react';
import { PenPath } from '../../../plugins/pen/type';
import { useI18n } from '../../../i18n';
import { createPortal } from 'react-dom';

interface PopupCornerRadiusButtonProps {
  board: PlaitBoard;
  currentRadius: number | undefined;
  title?: string;
  /** 选中元素的位置信息，用于定位弹窗 */
  selectionRect?: { top: number; left: number; right: number; bottom: number; width: number; height: number };
}

export const PopupCornerRadiusButton: React.FC<PopupCornerRadiusButtonProps> = ({
  board,
  currentRadius,
  title,
  selectionRect,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [inputValue, setInputValue] = useState<string>('');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const container = PlaitBoard.getBoardContainer(board);
  const { t } = useI18n();
  const displayTitle = title || t('toolbar.cornerRadius') || '圆角';

  const effectiveRadius = currentRadius ?? 0;

  // 同步输入框值
  useEffect(() => {
    setInputValue(String(effectiveRadius));
  }, [effectiveRadius]);

  // 计算弹窗位置 - 在按钮正下方显示
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const buttonRect = buttonRef.current.getBoundingClientRect();
      const panelWidth = 220;
      const gap = 8;

      // 默认在按钮正下方显示
      let panelLeft = buttonRect.left + buttonRect.width / 2 - panelWidth / 2;
      let panelTop = buttonRect.bottom + gap;

      // 确保面板不超出视口
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // 如果超出右侧，向左调整
      if (panelLeft + panelWidth > viewportWidth - 16) {
        panelLeft = viewportWidth - panelWidth - 16;
      }
      // 如果超出左侧，向右调整
      if (panelLeft < 16) {
        panelLeft = 16;
      }

      // 如果超出底部，显示在按钮上方
      if (panelTop + 40 > viewportHeight - 16) {
        panelTop = buttonRect.top - 40 - gap;
      }

      setPosition({
        left: panelLeft,
        top: panelTop,
      });
    }
  }, [isOpen]);

  // 点击外部关闭
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      if (panelRef.current && panelRef.current.contains(target)) {
        return;
      }
      if (buttonRef.current && buttonRef.current.contains(target)) {
        return;
      }
      const isToolbarClick = target.closest('.popup-toolbar') !== null;
      if (isToolbarClick) {
        return;
      }

      setIsOpen(false);
    };

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // 应用圆角值
  const applyRadius = useCallback(
    (radius: number) => {
      const clampedRadius = Math.max(0, Math.min(100, radius));
      const selectedPenPaths = getSelectedElements(board).filter((el) => 
        PenPath.isPenPath(el)
      ) as PenPath[];
      
      selectedPenPaths.forEach((element) => {
        const elementIndex = board.children.findIndex(
          (el) => el.id === element.id
        );
        if (elementIndex >= 0) {
          Transforms.setNode(board, { cornerRadius: clampedRadius }, [elementIndex]);
        }
      });
    },
    [board]
  );

  const handleRadiusChange = useCallback(
    (radius: number) => {
      setInputValue(String(radius));
      applyRadius(radius);
    },
    [applyRadius]
  );

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  }, []);

  const handleInputBlur = useCallback(() => {
    const num = parseInt(inputValue, 10);
    if (!isNaN(num)) {
      const clamped = Math.max(0, Math.min(100, num));
      setInputValue(String(clamped));
      applyRadius(clamped);
    } else {
      setInputValue(String(effectiveRadius));
    }
  }, [inputValue, effectiveRadius, applyRadius]);

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  }, []);

  const handleToggle = useCallback(() => {
    setIsOpen(!isOpen);
  }, [isOpen]);

  return (
    <>
      <ToolButton
        ref={buttonRef}
        className={classNames('property-button', 'corner-radius-button', { 'is-active': isOpen })}
        visible={true}
        type="button"
        title={displayTitle}
        aria-label={displayTitle}
        onPointerUp={handleToggle}
      >
        <svg viewBox="0 0 24 24" width="18" height="18">
          <path
            d="M4 4 L4 14 Q4 20 10 20 L20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </ToolButton>

      {isOpen && container && createPortal(
        <div
          ref={panelRef}
          className={classNames(ATTACHED_ELEMENT_CLASS_NAME, 'corner-radius-panel')}
          style={{
            position: 'fixed',
            top: position.top,
            left: position.left,
            zIndex: 5000,
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Island padding={2} className="corner-radius-setting-compact">
            <div className="corner-radius-row">
              <span className="corner-radius-label">{displayTitle}</span>
              <div className="corner-radius-slider">
                <Slider
                  value={effectiveRadius}
                  min={0}
                  max={100}
                  step={1}
                  onChange={(val) => handleRadiusChange(val as number)}
                  label={false}
                />
              </div>
              <input
                type="text"
                className="corner-radius-input"
                value={inputValue}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                onKeyDown={handleInputKeyDown}
              />
              <span className="corner-radius-unit">%</span>
            </div>
          </Island>
        </div>,
        container
      )}
    </>
  );
};
