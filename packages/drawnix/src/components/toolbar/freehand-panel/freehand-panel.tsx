import classNames from 'classnames';
import { Island } from '../../island';
import Stack from '../../stack';
import { ToolButton } from '../../tool-button';
import {
  EraseIcon,
  FeltTipPenIcon,
  VectorPenIcon,
} from '../../icons';
import { BoardTransforms } from '@plait/core';
import React from 'react';
import { BoardCreationMode, setCreationMode } from '@plait/common';
import { FreehandShape } from '../../../plugins/freehand/type';
import { PenShape } from '../../../plugins/pen/type';
import { finishPenOnToolSwitch } from '../../../plugins/pen/with-pen-create';
import { useBoard } from '@plait-board/react-board';
import { splitRows } from '@aitu/utils';
import {
    DrawnixPointerType,
} from '../../../hooks/use-drawnix';
import { useI18n, Translations } from '../../../i18n';

export interface FreehandProps {
    titleKey: string;
    icon: React.ReactNode;
    pointer: DrawnixPointerType;
}

export const FREEHANDS: FreehandProps[] = [
  {
      icon: FeltTipPenIcon,
      pointer: FreehandShape.feltTipPen,
      titleKey: 'toolbar.pen',
    },
    {
      icon: VectorPenIcon,
      pointer: PenShape.pen,
      titleKey: 'toolbar.vectorPen',
    },
    {
      icon: EraseIcon,
      pointer: FreehandShape.eraser,
      titleKey: 'toolbar.eraser',
    },
];

const ROW_FREEHANDS = splitRows(FREEHANDS, 5);

export type FreehandPickerProps = {
  onPointerUp: (pointer: DrawnixPointerType) => void;
};

export const FreehandPanel: React.FC<FreehandPickerProps> = ({
  onPointerUp,
}) => {
  const { t } = useI18n();
  const board = useBoard();

  return (
    <Island padding={1}>
      <Stack.Row gap={1} align="center">
        {/* 绘图工具选择 */}
        <Stack.Row gap={1}>
          {ROW_FREEHANDS.map((rowFreehands) => {
            return rowFreehands.map((freehand, index) => {
              return (
                <ToolButton
                  key={index}
                  className={classNames({ fillable: false })}
                  selected={board.pointer === freehand.pointer}
                  type="icon"
                  size={'small'}
                  visible={true}
                  icon={freehand.icon}
                  title={t(freehand.titleKey as keyof Translations)}
                  aria-label={t(freehand.titleKey as keyof Translations)}
                  onPointerDown={() => {
                    // 切换工具前，结束钢笔绘制（如果切换到非钢笔工具）
                    if (freehand.pointer !== PenShape.pen) {
                      finishPenOnToolSwitch(board);
                    }
                    setCreationMode(board, BoardCreationMode.dnd);
                    BoardTransforms.updatePointerType(board, freehand.pointer);
                  }}
                  onPointerUp={() => {
                    setCreationMode(board, BoardCreationMode.drawing);
                    onPointerUp(freehand.pointer);
                  }}
                />
              );
            });
          })}
        </Stack.Row>
      </Stack.Row>
    </Island>
  );
};
