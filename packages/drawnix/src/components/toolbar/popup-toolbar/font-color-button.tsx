import React, { useState, useCallback } from 'react';
import { UnifiedColorPicker } from '../../unified-color-picker';
import { ToolButton } from '../../tool-button';
import classNames from 'classnames';
import { Island } from '../../island';
import { ATTACHED_ELEMENT_CLASS_NAME, PlaitBoard } from '@plait/core';
import { Popover, PopoverContent, PopoverTrigger } from '../../popover/popover';
import {
  setTextColor,
  setTextColorOpacity,
} from '../../../transforms/property';
import type { ReactNode } from 'react';

export type PopupFontColorButtonProps = {
  board: PlaitBoard;
  currentColor: string | undefined;
  fontColorIcon: ReactNode;
  title: string;
};

export const PopupFontColorButton: React.FC<PopupFontColorButtonProps> = ({
  board,
  currentColor,
  fontColorIcon,
  title,
}) => {
  const [isFontColorPropertyOpen, setIsFontColorPropertyOpen] = useState(false);
  const container = PlaitBoard.getBoardContainer(board);

  const handleColorChange = useCallback((color: string) => {
    setTextColor(
      board,
      currentColor ? currentColor : color,
      color
    );
  }, [board, currentColor]);

  const handleOpacityChange = useCallback((opacity: number) => {
    if (currentColor) {
      setTextColorOpacity(board, currentColor, opacity);
    }
  }, [board, currentColor]);

  return (
    <Popover
      sideOffset={12}
      open={isFontColorPropertyOpen}
      onOpenChange={(open) => {
        setIsFontColorPropertyOpen(open);
      }}
      placement={'top'}
    >
      <PopoverTrigger asChild>
        <ToolButton
          className={classNames(`property-button`)}
          selected={isFontColorPropertyOpen}
          visible={true}
          icon={fontColorIcon}
          type="button"
          title={title}
          aria-label={title}
          onPointerUp={() => {
            setIsFontColorPropertyOpen(!isFontColorPropertyOpen);
          }}
        ></ToolButton>
      </PopoverTrigger>
      <PopoverContent container={container}>
        <Island
          padding={4}
          className={classNames(`${ATTACHED_ELEMENT_CLASS_NAME}`)}
        >
          <UnifiedColorPicker
            value={currentColor}
            onChange={handleColorChange}
            onOpacityChange={handleOpacityChange}
          />
        </Island>
      </PopoverContent>
    </Popover>
  );
};
