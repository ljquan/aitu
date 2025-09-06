import React, { useState } from 'react';
import { ToolButton } from '../../tool-button';
import classNames from 'classnames';
import { Island } from '../../island';
import { ATTACHED_ELEMENT_CLASS_NAME, PlaitBoard } from '@plait/core';
import { Popover, PopoverContent, PopoverTrigger } from '../../popover/popover';
import { FontSizes } from '@plait/text-plugins';
import { setTextFontSize } from '../../../transforms/property';
// import { Select } from 'tdesign-react';
import Stack from '../../stack';

export type PopupFontSizeButtonProps = {
  board: PlaitBoard;
  currentFontSize: string | undefined;
  title: string;
};

const fontSizeOptions = [
  { value: '12', label: '12' },
  { value: '13', label: '13' },
  { value: '14', label: '14' },
  { value: '15', label: '15' },
  { value: '16', label: '16' },
  { value: '18', label: '18' },
  { value: '20', label: '20' },
  { value: '24', label: '24' },
  { value: '28', label: '28' },
  { value: '32', label: '32' },
  { value: '40', label: '40' },
  { value: '48', label: '48' },
];

// 将数字字符串转换为FontSizes枚举
const getFontSizeFromString = (size: string): FontSizes => {
  // 先检查是否在预定义的FontSizes枚举中
  const enumKey = `fontSize${size}` as keyof typeof FontSizes;
  if (FontSizes[enumKey]) {
    return FontSizes[enumKey];
  }
  // 如果不在枚举中，直接返回字符串值作为FontSizes
  return size as FontSizes;
};

// 验证字体大小是否合理
const isValidFontSize = (size: string): boolean => {
  const num = parseInt(size, 10);
  return !isNaN(num) && num >= 8 && num <= 100;
};

export const PopupFontSizeButton: React.FC<PopupFontSizeButtonProps> = ({
  board,
  currentFontSize,
  title,
}) => {
  const [isFontSizePropertyOpen, setIsFontSizePropertyOpen] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const container = PlaitBoard.getBoardContainer(board);

  const handleSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    
    if (value === 'custom') {
      setShowCustomInput(true);
      setCustomValue(currentFontSize || '16');
      return;
    }
    
    if (isValidFontSize(value)) {
      const fontSize = getFontSizeFromString(value);
      setTextFontSize(board, fontSize);
    }
    setIsFontSizePropertyOpen(false);
  };

  const handleCustomInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setCustomValue(event.target.value);
  };

  const handleCustomInputSubmit = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      const value = customValue.trim();
      if (isValidFontSize(value)) {
        const fontSize = getFontSizeFromString(value);
        setTextFontSize(board, fontSize);
        setShowCustomInput(false);
        setIsFontSizePropertyOpen(false);
      }
    } else if (event.key === 'Escape') {
      setShowCustomInput(false);
      setCustomValue('');
    }
  };

  const handleCustomInputBlur = () => {
    const value = customValue.trim();
    if (isValidFontSize(value)) {
      const fontSize = getFontSizeFromString(value);
      setTextFontSize(board, fontSize);
    }
    setShowCustomInput(false);
    setIsFontSizePropertyOpen(false);
  };

  const displaySize = currentFontSize || '16';

  return (
    <Popover
      sideOffset={12}
      open={isFontSizePropertyOpen}
      onOpenChange={(open) => {
        setIsFontSizePropertyOpen(open);
      }}
      placement={'top'}
    >
      <PopoverTrigger asChild>
        <ToolButton
          className={classNames(`property-button`)}
          selected={isFontSizePropertyOpen}
          visible={true}
          type="button"
          title={title}
          aria-label={title}
          onPointerUp={() => {
            setIsFontSizePropertyOpen(!isFontSizePropertyOpen);
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 'bold', minWidth: '20px' }}>
            {displaySize}
          </div>
        </ToolButton>
      </PopoverTrigger>
      <PopoverContent container={container}>
        <Island
          padding={4}
          className={classNames(`${ATTACHED_ELEMENT_CLASS_NAME}`)}
        >
          <Stack.Col gap={2}>
            <div style={{ fontSize: '12px', color: '#666' }}>字体大小</div>
            {showCustomInput ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <input
                  type="number"
                  value={customValue}
                  onChange={handleCustomInputChange}
                  onKeyDown={handleCustomInputSubmit}
                  onBlur={handleCustomInputBlur}
                  placeholder="输入大小"
                  min="8"
                  max="100"
                  style={{
                    width: '80px',
                    padding: '4px 8px',
                    border: '1px solid #0052d9',
                    borderRadius: '4px',
                    fontSize: '12px',
                    backgroundColor: '#fff',
                    outline: 'none'
                  }}
                  autoFocus
                />
                <button
                  onClick={() => {
                    setShowCustomInput(false);
                    setCustomValue('');
                  }}
                  style={{
                    padding: '2px 6px',
                    border: '1px solid #dcdcdc',
                    borderRadius: '3px',
                    fontSize: '10px',
                    backgroundColor: '#f5f5f5',
                    cursor: 'pointer'
                  }}
                >
                  取消
                </button>
              </div>
            ) : (
              <select
                value=""
                onChange={handleSelectChange}
                style={{ 
                  width: '120px', 
                  padding: '4px 8px',
                  border: '1px solid #dcdcdc',
                  borderRadius: '4px',
                  fontSize: '12px',
                  backgroundColor: '#fff'
                }}
              >
                <option value="" disabled>
                  {currentFontSize ? `${currentFontSize}px` : '选择大小'}
                </option>
                {fontSizeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}px
                  </option>
                ))}
                <option value="custom">其他...</option>
              </select>
            )}
          </Stack.Col>
        </Island>
      </PopoverContent>
    </Popover>
  );
};