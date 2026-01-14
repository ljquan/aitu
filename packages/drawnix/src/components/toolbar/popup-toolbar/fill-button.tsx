import React, { useState, useCallback } from 'react';
import { ToolButton } from '../../tool-button';
import classNames from 'classnames';
import { ATTACHED_ELEMENT_CLASS_NAME, PlaitBoard } from '@plait/core';
import { Island } from '../../island';
import { UnifiedColorPicker } from '../../unified-color-picker';
import {
  hexAlphaToOpacity,
  isFullyTransparent,
  removeHexAlpha,
} from '@aitu/utils';
import { BackgroundColorIcon } from '../../icons';
import { Popover, PopoverContent, PopoverTrigger } from '../../popover/popover';
import {
  setFillColor,
  setFillColorOpacity,
} from '../../../transforms/property';

export type PopupFillButtonProps = {
  board: PlaitBoard;
  currentColor: string | undefined;
  title: string;
  children?: React.ReactNode;
};

export const PopupFillButton: React.FC<PopupFillButtonProps> = ({
  board,
  currentColor,
  title,
  children,
}) => {
  const [isFillPropertyOpen, setIsFillPropertyOpen] = useState(false);
  const hexColor = currentColor && removeHexAlpha(currentColor);
  const opacity = currentColor ? hexAlphaToOpacity(currentColor) : 100;
  const container = PlaitBoard.getBoardContainer(board);
  const icon =
    !hexColor || isFullyTransparent(opacity) ? BackgroundColorIcon : undefined;

  const handleColorChange = useCallback((color: string) => {
    setFillColor(board, color);
  }, [board]);

  const handleOpacityChange = useCallback((opacity: number) => {
    setFillColorOpacity(board, opacity);
  }, [board]);

  return (
    <Popover
      sideOffset={12}
      open={isFillPropertyOpen}
      onOpenChange={(open) => {
        setIsFillPropertyOpen(open);
      }}
      placement={'top'}
    >
      <PopoverTrigger asChild>
        <ToolButton
          className={classNames(`property-button`)}
          visible={true}
          icon={icon}
          type="button"
          title={title}
          aria-label={title}
          onPointerUp={() => {
            setIsFillPropertyOpen(!isFillPropertyOpen);
          }}
        >
          {!icon && children}
        </ToolButton>
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
