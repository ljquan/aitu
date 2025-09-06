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
  const [inputValue, setInputValue] = useState('');
  const container = PlaitBoard.getBoardContainer(board);

  const handlePresetSizeClick = (size: string) => {
    if (isValidFontSize(size)) {
      const fontSize = getFontSizeFromString(size);
      setTextFontSize(board, fontSize);
    }
    setIsFontSizePropertyOpen(false);
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(event.target.value);
  };

  const handleInputSubmit = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      const value = inputValue.trim();
      if (isValidFontSize(value)) {
        const fontSize = getFontSizeFromString(value);
        setTextFontSize(board, fontSize);
        setInputValue('');
        setIsFontSizePropertyOpen(false);
      }
    } else if (event.key === 'Escape') {
      setInputValue('');
      setIsFontSizePropertyOpen(false);
    }
  };

  const displaySize = currentFontSize || '16';

  return (
    <Popover
      sideOffset={12}
      open={isFontSizePropertyOpen}
      onOpenChange={(open) => {
        setIsFontSizePropertyOpen(open);
      }}
      placement={'bottom'}
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
          <Stack.Col gap={1} style={{ minWidth: '140px' }}>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>字体大小</div>
            
            {/* 自定义输入框 */}
            <div style={{ 
              padding: '6px 8px', 
              borderBottom: '1px solid #f0f0f0',
              backgroundColor: '#fafafa'
            }}>
              <input
                type="number"
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleInputSubmit}
                placeholder="输入自定义大小"
                min="8"
                max="100"
                style={{
                  width: '100%',
                  padding: '3px 6px',
                  border: '1px solid #dcdcdc',
                  borderRadius: '3px',
                  fontSize: '12px',
                  backgroundColor: '#fff',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            
            {/* 预设选项列表 */}
            <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
              {fontSizeOptions.map((option) => (
                <div
                  key={option.value}
                  onClick={() => handlePresetSizeClick(option.value)}
                  style={{
                    padding: '6px 8px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    backgroundColor: currentFontSize === option.value ? '#f0f7ff' : 'transparent',
                    color: currentFontSize === option.value ? '#0052d9' : '#333',
                    borderLeft: currentFontSize === option.value ? '3px solid #0052d9' : '3px solid transparent',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    if (currentFontSize !== option.value) {
                      (e.target as HTMLElement).style.backgroundColor = '#f5f5f5';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (currentFontSize !== option.value) {
                      (e.target as HTMLElement).style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  {option.label}px
                </div>
              ))}
            </div>
          </Stack.Col>
        </Island>
      </PopoverContent>
    </Popover>
  );
};