/**
 * 元素间距分布按钮组件
 * Element Distribution Button Component
 */

import React, { useState, useCallback } from 'react';
import classNames from 'classnames';
import { ToolButton } from '../../tool-button';
import { Popover, PopoverContent, PopoverTrigger } from '../../popover/popover';
import { Island } from '../../island';
import { ATTACHED_ELEMENT_CLASS_NAME, PlaitBoard } from '@plait/core';
import { useI18n } from '../../../i18n';
import { DistributeTransforms } from '../../../transforms/distribute';
import {
  DistributeIcon,
  DistributeHorizontalIcon,
  DistributeVerticalIcon,
  AutoArrangeIcon,
} from '../../icons';
import './distribute-button.scss';

export interface PopupDistributeButtonProps {
  board: PlaitBoard;
  title: string;
}

export const PopupDistributeButton: React.FC<PopupDistributeButtonProps> = ({
  board,
  title,
}) => {
  const { language } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const container = PlaitBoard.getBoardContainer(board);

  // 间距操作
  const handleDistributeHorizontal = useCallback(() => {
    DistributeTransforms.distributeHorizontal(board);
  }, [board]);

  const handleDistributeVertical = useCallback(() => {
    DistributeTransforms.distributeVertical(board);
  }, [board]);

  const handleAutoArrange = useCallback(() => {
    DistributeTransforms.autoArrange(board);
  }, [board]);

  const distributeActions = [
    {
      key: 'horizontal',
      icon: <DistributeHorizontalIcon size={16} />,
      label: language === 'zh' ? '水平间距' : 'Horizontal Spacing',
      shortcut: '⇧ H',
      handler: handleDistributeHorizontal,
    },
    {
      key: 'vertical',
      icon: <DistributeVerticalIcon size={16} />,
      label: language === 'zh' ? '垂直间距' : 'Vertical Spacing',
      shortcut: '⇧ V',
      handler: handleDistributeVertical,
    },
    {
      key: 'auto',
      icon: <AutoArrangeIcon size={16} />,
      label: language === 'zh' ? '自动排列' : 'Auto Arrange',
      shortcut: '⇧ A',
      handler: handleAutoArrange,
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
          className={classNames('property-button', 'distribute-button')}
          selected={isOpen}
          visible={true}
          icon={<DistributeIcon size={16} />}
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
            'distribute-panel'
          )}
        >
          <div className="distribute-actions">
            {distributeActions.map((action) => (
              <button
                key={action.key}
                className="distribute-action-btn"
                onClick={action.handler}
                title={action.label}
              >
                {action.icon}
                <span className="distribute-label">{action.label}</span>
                <span className="distribute-shortcut">{action.shortcut}</span>
              </button>
            ))}
          </div>
        </Island>
      </PopoverContent>
    </Popover>
  );
};

export default PopupDistributeButton;
