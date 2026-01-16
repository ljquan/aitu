import React, { useState, useCallback } from 'react';
import { ToolButton } from '../../tool-button';
import classNames from 'classnames';
import { ATTACHED_ELEMENT_CLASS_NAME, PlaitBoard } from '@plait/core';
import { Island } from '../../island';
import { UnifiedColorPicker } from '../../unified-color-picker';
import {
  hexAlphaToOpacity,
  isFullyTransparent,
  isWhite,
  removeHexAlpha,
} from '@aitu/utils';
import {
  StrokeIcon,
  StrokeStyleDashedIcon,
  StrokeStyleDotedIcon,
  StrokeStyleNormalIcon,
  StrokeWhiteIcon,
} from '../../icons';
import { Popover, PopoverContent, PopoverTrigger } from '../../popover/popover';
import Stack from '../../stack';
import { StrokeStyle } from '@plait/common';
import { Slider } from 'tdesign-react';
import {
  setStrokeColor,
  setStrokeColorOpacity,
  setStrokeStyle as setStrokeStyleTransform,
  setStrokeWidth as setStrokeWidthTransform,
} from '../../../transforms/property';

export type PopupStrokeButtonProps = {
  board: PlaitBoard;
  currentColor: string | undefined;
  title: string;
  hasStrokeStyle: boolean;
  hasStrokeWidth?: boolean;
  currentStrokeWidth?: number;
  children?: React.ReactNode;
};

export const PopupStrokeButton: React.FC<PopupStrokeButtonProps> = ({
  board,
  currentColor,
  title,
  hasStrokeStyle,
  hasStrokeWidth,
  currentStrokeWidth,
  children,
}) => {
  const [isStrokePropertyOpen, setIsStrokePropertyOpen] = useState(false);
  const hexColor = currentColor && removeHexAlpha(currentColor);
  const opacity = currentColor ? hexAlphaToOpacity(currentColor) : 100;
  const container = PlaitBoard.getBoardContainer(board);

  const icon = isFullyTransparent(opacity)
    ? StrokeIcon
    : isWhite(hexColor)
    ? StrokeWhiteIcon
    : undefined;

  const setStrokeStyle = (style: StrokeStyle) => {
    setStrokeStyleTransform(board, style);
  };

  const handleColorChange = useCallback((color: string) => {
    setStrokeColor(board, color);
  }, [board]);

  const handleOpacityChange = useCallback((opacity: number) => {
    setStrokeColorOpacity(board, opacity);
  }, [board]);

  const handleStrokeWidthChange = useCallback((width: number) => {
    setStrokeWidthTransform(board, width);
  }, [board]);

  return (
    <Popover
      sideOffset={12}
      crossAxisOffset={40}
      open={isStrokePropertyOpen}
      onOpenChange={(open) => {
        setIsStrokePropertyOpen(open);
      }}
      placement={'left'}
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
            setIsStrokePropertyOpen(!isStrokePropertyOpen);
          }}
        >
          {!icon && children}
        </ToolButton>
      </PopoverTrigger>
      <PopoverContent container={container}>
        <Island
          padding={4}
          className={classNames(
            `${ATTACHED_ELEMENT_CLASS_NAME}`,
            'stroke-setting',
            { 'has-stroke-style': hasStrokeStyle }
          )}
        >
          <Stack.Col>
            {hasStrokeWidth && (
              <div className="stroke-width-section" style={{ marginBottom: '8px' }}>
                <Stack.Row gap={2} align="center">
                  <span style={{ fontSize: '13px', color: 'var(--color-on-surface)', whiteSpace: 'nowrap' }}>线宽：</span>
                  <div style={{ flex: 1, minWidth: '100px' }}>
                    <Slider
                      value={currentStrokeWidth || 2}
                      min={1}
                      max={20}
                      step={1}
                      onChange={(val) => handleStrokeWidthChange(val as number)}
                      label={false}
                    />
                  </div>
                  <span style={{ fontSize: '13px', color: 'var(--color-on-surface)', minWidth: '30px', textAlign: 'right' }}>
                    {currentStrokeWidth || 2}px
                  </span>
                </Stack.Row>
              </div>
            )}
            {hasStrokeStyle && (
              <div className="stroke-style-section">
                <span className="stroke-style-label">样式：</span>
                <Stack.Row className={classNames('stroke-style-picker')}>
                  <ToolButton
                    visible={true}
                    icon={StrokeStyleNormalIcon}
                    type="button"
                    title="实线"
                    aria-label="实线"
                    onPointerUp={() => setStrokeStyle(StrokeStyle.solid)}
                  ></ToolButton>
                  <ToolButton
                    visible={true}
                    icon={StrokeStyleDashedIcon}
                    type="button"
                    title="虚线"
                    aria-label="虚线"
                    onPointerUp={() => setStrokeStyle(StrokeStyle.dashed)}
                  ></ToolButton>
                  <ToolButton
                    visible={true}
                    icon={StrokeStyleDotedIcon}
                    type="button"
                    title="点线"
                    aria-label="点线"
                    onPointerUp={() => setStrokeStyle(StrokeStyle.dotted)}
                  ></ToolButton>
                </Stack.Row>
              </div>
            )}
            <UnifiedColorPicker
              value={currentColor}
              onChange={handleColorChange}
              onOpacityChange={handleOpacityChange}
            />
          </Stack.Col>
        </Island>
      </PopoverContent>
    </Popover>
  );
};
