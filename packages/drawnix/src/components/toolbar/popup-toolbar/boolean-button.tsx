/**
 * 元素布尔运算按钮组件
 * Element Boolean Operations Button Component
 */

import React, { useState, useCallback } from 'react';
import classNames from 'classnames';
import { ToolButton } from '../../tool-button';
import { Popover, PopoverContent, PopoverTrigger } from '../../popover/popover';
import { Island } from '../../island';
import { ATTACHED_ELEMENT_CLASS_NAME, PlaitBoard } from '@plait/core';
import { useI18n } from '../../../i18n';
import { BooleanTransforms } from '../../../transforms/boolean';
import {
  BooleanIcon,
  BooleanUnionIcon,
  BooleanSubtractIcon,
  BooleanIntersectIcon,
  BooleanExcludeIcon,
  BooleanFlattenIcon,
} from '../../icons';
import './boolean-button.scss';

export interface PopupBooleanButtonProps {
  board: PlaitBoard;
  title: string;
}

export const PopupBooleanButton: React.FC<PopupBooleanButtonProps> = ({
  board,
  title,
}) => {
  const { language } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const container = PlaitBoard.getBoardContainer(board);

  // 布尔运算操作
  const handleUnion = useCallback(() => {
    BooleanTransforms.union(board, language as 'zh' | 'en');
    setIsOpen(false);
  }, [board, language]);

  const handleSubtract = useCallback(() => {
    BooleanTransforms.subtract(board, language as 'zh' | 'en');
  }, [board, language]);

  const handleIntersect = useCallback(() => {
    BooleanTransforms.intersect(board, language as 'zh' | 'en');
  }, [board, language]);

  const handleExclude = useCallback(() => {
    BooleanTransforms.exclude(board, language as 'zh' | 'en');
  }, [board, language]);

  const handleFlatten = useCallback(() => {
    BooleanTransforms.flatten(board, language as 'zh' | 'en');
  }, [board, language]);

  const booleanActions = [
    {
      key: 'union',
      icon: <BooleanUnionIcon size={16} />,
      label: language === 'zh' ? '合并' : 'Union',
      shortcut: '⌥⇧U',
      handler: handleUnion,
    },
    {
      key: 'subtract',
      icon: <BooleanSubtractIcon size={16} />,
      label: language === 'zh' ? '减去' : 'Subtract',
      shortcut: '⌥⇧S',
      handler: handleSubtract,
    },
    {
      key: 'intersect',
      icon: <BooleanIntersectIcon size={16} />,
      label: language === 'zh' ? '相交' : 'Intersect',
      shortcut: '⌥⇧I',
      handler: handleIntersect,
    },
    {
      key: 'exclude',
      icon: <BooleanExcludeIcon size={16} />,
      label: language === 'zh' ? '排除' : 'Exclude',
      shortcut: '⌥⇧E',
      handler: handleExclude,
    },
    {
      key: 'flatten',
      icon: <BooleanFlattenIcon size={16} />,
      label: language === 'zh' ? '扁平化' : 'Flatten',
      shortcut: '⇧⌥F',
      handler: handleFlatten,
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
          className={classNames('property-button', 'boolean-button')}
          selected={isOpen}
          visible={true}
          icon={<BooleanIcon size={16} />}
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
            'boolean-panel'
          )}
        >
          <div className="boolean-actions">
            {booleanActions.map((action) => (
              <button
                key={action.key}
                className="boolean-action-btn"
                onClick={action.handler}
                title={action.label}
              >
                {action.icon}
                <span className="boolean-label">{action.label}</span>
                <span className="boolean-shortcut">{action.shortcut}</span>
              </button>
            ))}
          </div>
        </Island>
      </PopoverContent>
    </Popover>
  );
};

export default PopupBooleanButton;
