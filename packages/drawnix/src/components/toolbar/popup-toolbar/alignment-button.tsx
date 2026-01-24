/**
 * 元素对齐按钮组件
 * Element Alignment Button Component
 */

import React, { useState, useCallback } from 'react';
import classNames from 'classnames';
import { ToolButton } from '../../tool-button';
import { Popover, PopoverContent, PopoverTrigger } from '../../popover/popover';
import { Island } from '../../island';
import { ATTACHED_ELEMENT_CLASS_NAME, PlaitBoard } from '@plait/core';
import { useI18n } from '../../../i18n';
import { AlignmentTransforms } from '../../../transforms/alignment';
import {
  AlignmentIcon,
  AlignLeftIcon,
  AlignCenterIcon,
  AlignRightIcon,
  AlignTopIcon,
  AlignMiddleIcon,
  AlignBottomIcon,
} from '../../icons';
import './alignment-button.scss';

export interface PopupAlignmentButtonProps {
  board: PlaitBoard;
  title: string;
}

export const PopupAlignmentButton: React.FC<PopupAlignmentButtonProps> = ({
  board,
  title,
}) => {
  const { language } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const container = PlaitBoard.getBoardContainer(board);

  // 对齐操作
  const handleAlignLeft = useCallback(() => {
    AlignmentTransforms.alignLeft(board);
  }, [board]);

  const handleAlignCenter = useCallback(() => {
    AlignmentTransforms.alignCenter(board);
  }, [board]);

  const handleAlignRight = useCallback(() => {
    AlignmentTransforms.alignRight(board);
  }, [board]);

  const handleAlignTop = useCallback(() => {
    AlignmentTransforms.alignTop(board);
  }, [board]);

  const handleAlignMiddle = useCallback(() => {
    AlignmentTransforms.alignMiddle(board);
  }, [board]);

  const handleAlignBottom = useCallback(() => {
    AlignmentTransforms.alignBottom(board);
  }, [board]);

  const alignActions = [
    {
      key: 'left',
      icon: <AlignLeftIcon size={16} />,
      label: language === 'zh' ? '左对齐' : 'Align Left',
      shortcut: '⌥ A',
      handler: handleAlignLeft,
    },
    {
      key: 'center',
      icon: <AlignCenterIcon size={16} />,
      label: language === 'zh' ? '水平居中' : 'Align Center',
      shortcut: '⌥ H',
      handler: handleAlignCenter,
    },
    {
      key: 'right',
      icon: <AlignRightIcon size={16} />,
      label: language === 'zh' ? '右对齐' : 'Align Right',
      shortcut: '⌥ D',
      handler: handleAlignRight,
    },
    {
      key: 'top',
      icon: <AlignTopIcon size={16} />,
      label: language === 'zh' ? '顶部对齐' : 'Align Top',
      shortcut: '⌥ W',
      handler: handleAlignTop,
    },
    {
      key: 'middle',
      icon: <AlignMiddleIcon size={16} />,
      label: language === 'zh' ? '垂直居中' : 'Align Middle',
      shortcut: '⌥ V',
      handler: handleAlignMiddle,
    },
    {
      key: 'bottom',
      icon: <AlignBottomIcon size={16} />,
      label: language === 'zh' ? '底部对齐' : 'Align Bottom',
      shortcut: '⌥ S',
      handler: handleAlignBottom,
    },
  ];

  return (
    <Popover
      sideOffset={12}
      crossAxisOffset={-100}
      open={isOpen}
      onOpenChange={setIsOpen}
      placement="top-start"
    >
      <PopoverTrigger asChild>
        <ToolButton
          className={classNames('property-button', 'alignment-button')}
          selected={isOpen}
          visible={true}
          icon={<AlignmentIcon size={16} />}
          type="button"
          title={title}
          aria-label={title}
          onPointerUp={() => setIsOpen(!isOpen)}
        />
      </PopoverTrigger>
      <PopoverContent container={container}>
        <Island
          padding={1}
          className={classNames(
            ATTACHED_ELEMENT_CLASS_NAME,
            'alignment-panel'
          )}
        >
          <div className="alignment-actions">
            {alignActions.map((action) => (
              <button
                key={action.key}
                className="alignment-action-btn"
                onClick={action.handler}
                title={action.label}
              >
                {action.icon}
                <span className="alignment-label">{action.label}</span>
                <span className="alignment-shortcut">{action.shortcut}</span>
              </button>
            ))}
          </div>
        </Island>
      </PopoverContent>
    </Popover>
  );
};

export default PopupAlignmentButton;
