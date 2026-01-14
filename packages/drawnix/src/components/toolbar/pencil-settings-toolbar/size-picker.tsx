/**
 * 大小选择器公共组件
 * 用于画笔和橡皮擦的大小选择
 */

import React, { useState, useCallback } from 'react';
import { Slider } from 'tdesign-react';
import classNames from 'classnames';
import { PlaitBoard } from '@plait/core';
import { Island } from '../../island';
import { ToolButton } from '../../tool-button';
import { Popover, PopoverContent, PopoverTrigger } from '../../popover/popover';
import Stack from '../../stack';
import { useI18n } from '../../../i18n';

export interface SizePickerProps {
  /** 当前大小值 */
  size: number;
  /** 大小变化回调 */
  onSizeChange: (size: number) => void;
  /** 预设大小列表 */
  presets: number[];
  /** 预览颜色 */
  previewColor: string;
  /** 标题 */
  title: string;
  /** 容器元素 */
  container: HTMLElement | null;
  /** 图标 */
  icon?: React.ReactNode;
}

// 默认图标
const DefaultSizeIcon = () => (
  <svg className="size-picker-icon" viewBox="0 0 24 24">
    <line x1="4" y1="8" x2="20" y2="8" strokeWidth="1" stroke="currentColor" />
    <line x1="4" y1="12" x2="20" y2="12" strokeWidth="2" stroke="currentColor" />
    <line x1="4" y1="16" x2="20" y2="16" strokeWidth="3" stroke="currentColor" />
  </svg>
);

export const SizePicker: React.FC<SizePickerProps> = ({
  size,
  onSizeChange,
  presets,
  previewColor,
  title,
  container,
  icon,
}) => {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(String(size));

  // 同步外部 size 变化
  React.useEffect(() => {
    setInputValue(String(size));
  }, [size]);

  // 处理输入框变化
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  }, []);

  // 处理输入确认
  const handleInputConfirm = useCallback(() => {
    const value = parseInt(inputValue, 10);
    if (!isNaN(value) && value >= 1) {
      onSizeChange(value);
    } else {
      setInputValue(String(size));
    }
  }, [inputValue, size, onSizeChange]);

  // 处理键盘事件
  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleInputConfirm();
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      setInputValue(String(size));
      (e.target as HTMLInputElement).blur();
    }
  }, [handleInputConfirm, size]);

  return (
    <>
      {/* 大小选择弹出层 */}
      <Popover
        sideOffset={12}
        open={isOpen}
        onOpenChange={setIsOpen}
        placement="bottom"
      >
        <PopoverTrigger asChild>
          <ToolButton
            className="size-picker-button"
            type="button"
            visible={true}
            title={title}
            aria-label={title}
            onPointerUp={() => setIsOpen(!isOpen)}
          >
            {icon || <DefaultSizeIcon />}
          </ToolButton>
        </PopoverTrigger>
        <PopoverContent container={container}>
          <Island
            padding={4}
            className={classNames('size-picker-popover')}
          >
            <Stack.Row gap={3} align="center" style={{ padding: '4px 8px' }}>
              <div className="size-picker-value" style={{ minWidth: '40px', fontSize: '13px', fontWeight: 500, color: 'var(--color-on-surface)' }}>
                {size}px
              </div>
              <div className="size-picker-slider-wrapper" style={{ flex: 1, minWidth: '160px' }}>
                <Slider
                  value={size}
                  min={1}
                  max={Math.max(256, ...presets)}
                  step={1}
                  onChange={(val) => {
                    const newSize = val as number;
                    setInputValue(String(newSize));
                    onSizeChange(newSize);
                  }}
                  label={false}
                />
              </div>
            </Stack.Row>
          </Island>
        </PopoverContent>
      </Popover>

      {/* 大小输入框 */}
      <div className="size-picker-input-wrapper">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleInputConfirm}
          onKeyDown={handleInputKeyDown}
          className="size-picker-input"
        />
        <span className="size-picker-input-unit">px</span>
      </div>
    </>
  );
};

export default SizePicker;
