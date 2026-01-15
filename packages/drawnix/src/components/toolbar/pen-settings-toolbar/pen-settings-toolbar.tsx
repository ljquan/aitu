/**
 * 钢笔设置工具栏
 * 在钢笔工具模式下显示，允许用户修改颜色、粗细、线形和锚点类型
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import classNames from 'classnames';
import { useBoard } from '@plait-board/react-board';
import { DEFAULT_COLOR, PlaitBoard } from '@plait/core';
import { Island } from '../../island';
import { ToolButton } from '../../tool-button';
import { UnifiedColorPicker } from '../../unified-color-picker';
import { Popover, PopoverContent, PopoverTrigger } from '../../popover/popover';
import Stack from '../../stack';
import { useDrawnix } from '../../../hooks/use-drawnix';
import {
  getPenSettings,
  setPenStrokeWidth,
  setPenStrokeColor,
  setPenStrokeStyle,
  setPenDefaultAnchorType,
} from '../../../plugins/pen/pen-settings';
import { PenShape, AnchorType } from '../../../plugins/pen/type';
import { useI18n, Translations } from '../../../i18n';
import { useViewportScale } from '../../../hooks/useViewportScale';
import { StrokeStyle } from '@plait/common';
import { Slider } from 'tdesign-react';
import {
  StrokeStyleNormalIcon,
  StrokeStyleDashedIcon,
  StrokeStyleDotedIcon,
  AnchorCornerIcon,
  AnchorSmoothIcon,
  AnchorSymmetricIcon,
} from '../../icons';
import './pen-settings-toolbar.scss';

// 锚点类型选项
interface AnchorTypeOption {
  icon: React.ReactNode;
  type: AnchorType;
  titleKey: string;
}

const ANCHOR_TYPES: AnchorTypeOption[] = [
  {
    icon: AnchorCornerIcon,
    type: 'corner',
    titleKey: 'toolbar.anchorCorner',
  },
  {
    icon: AnchorSmoothIcon,
    type: 'smooth',
    titleKey: 'toolbar.anchorSmooth',
  },
  {
    icon: AnchorSymmetricIcon,
    type: 'symmetric',
    titleKey: 'toolbar.anchorSymmetric',
  },
];

export const PenSettingsToolbar: React.FC = () => {
  const board = useBoard();
  const { appState } = useDrawnix();
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  
  // 使用 viewport scale hook 确保工具栏保持在视口内且大小不变
  useViewportScale(containerRef, {
    enablePositionTracking: true,
    enableScaleCompensation: true,
  });

  // 从 board 获取当前设置
  const settings = getPenSettings(board);
  const [strokeWidth, setStrokeWidth] = useState(settings.strokeWidth);
  const [strokeColor, setStrokeColor] = useState(settings.strokeColor);
  const [strokeStyle, setStrokeStyleState] = useState(settings.strokeStyle);
  const [anchorType, setAnchorType] = useState(settings.defaultAnchorType);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [isWidthPickerOpen, setIsWidthPickerOpen] = useState(false);
  const [inputValue, setInputValue] = useState(String(settings.strokeWidth));

  // 检查是否是钢笔指针（需要同时检查 appState 和 board.pointer）
  // 因为完成钢笔绘制后会通过 BoardTransforms.updatePointerType 更新 board.pointer，
  // 但 appState.pointer 可能没有及时更新
  const isPenPointer = appState.pointer === PenShape.pen && board.pointer === PenShape.pen;

  // 当 board 变化时同步设置
  useEffect(() => {
    const newSettings = getPenSettings(board);
    setStrokeWidth(newSettings.strokeWidth);
    setStrokeColor(newSettings.strokeColor);
    setStrokeStyleState(newSettings.strokeStyle);
    setAnchorType(newSettings.defaultAnchorType);
    setInputValue(String(newSettings.strokeWidth));
  }, [board, appState.pointer, board.pointer]);

  // 处理输入框值变化
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  }, []);

  // 处理输入框失焦或回车确认
  const handleInputConfirm = useCallback(() => {
    const value = parseInt(inputValue, 10);
    if (!isNaN(value) && value >= 1 && value <= 100) {
      setStrokeWidth(value);
      setPenStrokeWidth(board, value);
    } else {
      // 恢复为当前值
      setInputValue(String(strokeWidth));
    }
  }, [board, inputValue, strokeWidth]);

  // 处理输入框键盘事件
  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleInputConfirm();
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      setInputValue(String(strokeWidth));
      (e.target as HTMLInputElement).blur();
    }
  }, [handleInputConfirm, strokeWidth]);

  // 处理颜色变化
  const handleColorChange = useCallback((color: string) => {
    setStrokeColor(color);
    setPenStrokeColor(board, color);
  }, [board]);

  // 处理描边样式变化
  const handleStrokeStyleChange = useCallback((style: StrokeStyle) => {
    setStrokeStyleState(style);
    setPenStrokeStyle(board, style);
  }, [board]);

  // 处理锚点类型变化
  const handleAnchorTypeChange = useCallback((type: AnchorType) => {
    setAnchorType(type);
    setPenDefaultAnchorType(board, type);
  }, [board]);

  // 只在选择钢笔指针时显示
  if (!isPenPointer) {
    return null;
  }

  const container = PlaitBoard.getBoardContainer(board);

  return (
    <div className="pen-settings-toolbar">
      <Island
        ref={containerRef}
        padding={1}
      >
        <Stack.Row gap={0} align="center">
          {/* 颜色选择按钮 */}
          <Popover
            sideOffset={12}
            open={isColorPickerOpen}
            onOpenChange={setIsColorPickerOpen}
            placement="bottom"
          >
            <PopoverTrigger asChild>
              <ToolButton
                className="pen-color-button"
                type="button"
                visible={true}
                title={t('toolbar.strokeColor')}
                aria-label={t('toolbar.strokeColor')}
                onPointerUp={() => setIsColorPickerOpen(!isColorPickerOpen)}
              >
                <div
                  className="pen-color-preview"
                  style={{ backgroundColor: strokeColor || DEFAULT_COLOR }}
                />
              </ToolButton>
            </PopoverTrigger>
            <PopoverContent container={container}>
              <Island
                padding={4}
                className={classNames('stroke-setting')}
              >
                <UnifiedColorPicker
                  value={strokeColor}
                  onChange={handleColorChange}
                />
              </Island>
            </PopoverContent>
          </Popover>

          {/* 描边样式选择 */}
          <div className="pen-stroke-style-picker">
            <ToolButton
              className={classNames('pen-stroke-style-button', { active: strokeStyle === StrokeStyle.solid })}
              type="button"
              visible={true}
              icon={StrokeStyleNormalIcon}
              title="实线"
              aria-label="实线"
              onPointerUp={() => handleStrokeStyleChange(StrokeStyle.solid)}
            />
            <ToolButton
              className={classNames('pen-stroke-style-button', { active: strokeStyle === StrokeStyle.dashed })}
              type="button"
              visible={true}
              icon={StrokeStyleDashedIcon}
              title="虚线"
              aria-label="虚线"
              onPointerUp={() => handleStrokeStyleChange(StrokeStyle.dashed)}
            />
            <ToolButton
              className={classNames('pen-stroke-style-button', { active: strokeStyle === StrokeStyle.dotted })}
              type="button"
              visible={true}
              icon={StrokeStyleDotedIcon}
              title="点线"
              aria-label="点线"
              onPointerUp={() => handleStrokeStyleChange(StrokeStyle.dotted)}
            />
          </div>

          {/* 线条宽度选择 */}
          <Popover
            sideOffset={12}
            open={isWidthPickerOpen}
            onOpenChange={setIsWidthPickerOpen}
            placement="bottom"
          >
            <PopoverTrigger asChild>
              <ToolButton
                className="pen-width-button"
                type="button"
                visible={true}
                title={t('toolbar.strokeWidth')}
                aria-label={t('toolbar.strokeWidth')}
                onPointerUp={() => setIsWidthPickerOpen(!isWidthPickerOpen)}
              >
                <svg className="pen-width-icon" viewBox="0 0 24 24">
                  <line x1="4" y1="8" x2="20" y2="8" strokeWidth="1" stroke="currentColor" />
                  <line x1="4" y1="12" x2="20" y2="12" strokeWidth="2" stroke="currentColor" />
                  <line x1="4" y1="16" x2="20" y2="16" strokeWidth="3" stroke="currentColor" />
                </svg>
              </ToolButton>
            </PopoverTrigger>
            <PopoverContent container={container}>
              <Island
                padding={4}
                className={classNames('stroke-width-picker')}
              >
                <Stack.Row gap={3} align="center" style={{ padding: '4px 8px' }}>
                  <div className="stroke-width-value" style={{ minWidth: '40px', fontSize: '13px', fontWeight: 500, color: 'var(--color-on-surface)' }}>
                    {strokeWidth}px
                  </div>
                  <div className="stroke-width-slider-wrapper" style={{ flex: 1, minWidth: '160px' }}>
                    <Slider
                      value={strokeWidth}
                      min={1}
                      max={20}
                      step={1}
                      onChange={(val) => {
                        const width = val as number;
                        setStrokeWidth(width);
                        setInputValue(String(width));
                        setPenStrokeWidth(board, width);
                      }}
                      label={false}
                    />
                  </div>
                </Stack.Row>
              </Island>
            </PopoverContent>
          </Popover>

          {/* 大小输入框 */}
          <div className="pen-width-input-wrapper">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={inputValue}
              onChange={handleInputChange}
              onBlur={handleInputConfirm}
              onKeyDown={handleInputKeyDown}
              className="pen-width-input"
            />
            <span className="pen-width-input-unit">px</span>
          </div>

          {/* 分隔线 */}
          <div className="pen-settings-divider" />

          {/* 锚点类型选择 */}
          <div className="pen-anchor-type-picker">
            {ANCHOR_TYPES.map((option) => (
              <ToolButton
                key={option.type}
                className={classNames('pen-anchor-type-button', { active: anchorType === option.type })}
                type="button"
                visible={true}
                icon={option.icon}
                title={t(option.titleKey as keyof Translations)}
                aria-label={t(option.titleKey as keyof Translations)}
                onPointerUp={() => handleAnchorTypeChange(option.type)}
              />
            ))}
          </div>
        </Stack.Row>
      </Island>
    </div>
  );
};

export default PenSettingsToolbar;
