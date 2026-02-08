import {
  BoardTransforms,
  getSelectedElements,
  PlaitBoard,
  PlaitPointerType,
} from '@plait/core';
import { isHotkey } from 'is-hotkey';
import { addImage, saveAsImage } from '../utils/image';
import { saveAsJSON } from '../data/json';
import { DrawnixState } from '../hooks/use-drawnix';
import { BoardCreationMode, setCreationMode } from '@plait/common';
import { MindPointerType } from '@plait/mind';
import { FreehandShape } from './freehand/type';
import { PenShape } from './pen/type';
import { ArrowLineShape, BasicShapes } from '@plait/draw';
import { AlignmentTransforms } from '../transforms/alignment';
import { DistributeTransforms } from '../transforms/distribute';
import { BooleanTransforms } from '../transforms/boolean';
import { FramePointerType } from './with-frame';

export const buildDrawnixHotkeyPlugin = (
  updateAppState: (appState: Partial<DrawnixState>) => void
) => {
  const withDrawnixHotkey = (board: PlaitBoard) => {
    const { globalKeyDown, keyDown } = board;
    board.globalKeyDown = (event: KeyboardEvent) => {
      const isTypingNormal =
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement;
      // 命令面板和画布搜索快捷键 - 始终可用（不需要画布焦点）
      if (!isTypingNormal) {
        if (isHotkey(['mod+k'])(event)) {
          updateAppState({ openCommandPalette: true });
          event.preventDefault();
          return;
        }
        if (isHotkey(['mod+f'])(event)) {
          updateAppState({ openCanvasSearch: true });
          event.preventDefault();
          return;
        }
      }

      if (
        !isTypingNormal &&
        (PlaitBoard.getMovingPointInBoard(board) ||
          PlaitBoard.isMovingPointInBoard(board)) &&
        !PlaitBoard.hasBeenTextEditing(board)
      ) {
        if (isHotkey(['mod+shift+e'], { byKey: true })(event)) {
          saveAsImage(board, true);
          event.preventDefault();
          return;
        }
        if (isHotkey(['mod+s'], { byKey: true })(event)) {
          saveAsJSON(board);
          event.preventDefault();
          return;
        }
        if (
          isHotkey(['mod+backspace'])(event) ||
          isHotkey(['mod+delete'])(event)
        ) {
          updateAppState({
            openCleanConfirm: true,
          });
          event.preventDefault();
          return;
        }
        if (isHotkey(['mod+u'])(event)) {
          addImage(board);
        }

        // 对齐快捷键 (Alt/Option + 字母) - 仅在多选时生效
        const selectedElements = getSelectedElements(board);
        if (selectedElements.length > 1) {
          // Alt+A: 左对齐
          if (isHotkey(['alt+a'])(event)) {
            AlignmentTransforms.alignLeft(board);
            event.preventDefault();
            return;
          }
          // Alt+H: 水平居中
          if (isHotkey(['alt+h'])(event)) {
            AlignmentTransforms.alignCenter(board);
            event.preventDefault();
            return;
          }
          // Alt+D: 右对齐
          if (isHotkey(['alt+d'])(event)) {
            AlignmentTransforms.alignRight(board);
            event.preventDefault();
            return;
          }
          // Alt+W: 顶部对齐
          if (isHotkey(['alt+w'])(event)) {
            AlignmentTransforms.alignTop(board);
            event.preventDefault();
            return;
          }
          // Alt+V: 垂直居中
          if (isHotkey(['alt+v'])(event)) {
            AlignmentTransforms.alignMiddle(board);
            event.preventDefault();
            return;
          }
          // Alt+S: 底部对齐
          if (isHotkey(['alt+s'])(event)) {
            AlignmentTransforms.alignBottom(board);
            event.preventDefault();
            return;
          }

          // 间距快捷键 (Shift + 字母) - 仅在多选时生效
          // Shift+H: 水平间距
          if (isHotkey(['shift+h'])(event)) {
            DistributeTransforms.distributeHorizontal(board);
            event.preventDefault();
            return;
          }
          // Shift+V: 垂直间距
          if (isHotkey(['shift+v'])(event)) {
            DistributeTransforms.distributeVertical(board);
            event.preventDefault();
            return;
          }
          // Shift+A: 自动排列
          if (isHotkey(['shift+a'])(event)) {
            DistributeTransforms.autoArrange(board);
            event.preventDefault();
            return;
          }

          // 布尔运算快捷键 (Alt+Shift + 字母) - 仅在多选时生效
          // Alt+Shift+U: 合并
          if (isHotkey(['alt+shift+u'])(event)) {
            BooleanTransforms.union(board, 'zh');
            event.preventDefault();
            return;
          }
          // Alt+Shift+S: 减去
          if (isHotkey(['alt+shift+s'])(event)) {
            BooleanTransforms.subtract(board, 'zh');
            event.preventDefault();
            return;
          }
          // Alt+Shift+I: 相交
          if (isHotkey(['alt+shift+i'])(event)) {
            BooleanTransforms.intersect(board, 'zh');
            event.preventDefault();
            return;
          }
          // Alt+Shift+E: 排除
          if (isHotkey(['alt+shift+e'])(event)) {
            BooleanTransforms.exclude(board, 'zh');
            event.preventDefault();
            return;
          }
          // Alt+Shift+F: 扁平化
          if (isHotkey(['alt+shift+f'])(event)) {
            BooleanTransforms.flatten(board, 'zh');
            event.preventDefault();
            return;
          }
        }

        // Note: 复制图片粘贴功能由 with-image.tsx 中的 insertFragment 方法处理
        // 不需要在这里手动处理 Ctrl+V，让 Plait 框架的原生粘贴机制工作
        if (!event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
          if (event.key === 'l') {
            setCreationMode(board, BoardCreationMode.drawing);
            BoardTransforms.updatePointerType(board, FreehandShape.laserPointer);
            updateAppState({ pointer: FreehandShape.laserPointer });
            event.preventDefault();
            return;
          }
          if (event.key === 'Escape' && PlaitBoard.isPointer(board, FreehandShape.laserPointer)) {
            BoardTransforms.updatePointerType(board, PlaitPointerType.selection);
            updateAppState({ pointer: PlaitPointerType.selection });
            event.preventDefault();
            return;
          }
          if (event.key === 'h') {
            BoardTransforms.updatePointerType(board, PlaitPointerType.hand);
            updateAppState({ pointer: PlaitPointerType.hand });
          }
          if (event.key === 'v') {
            BoardTransforms.updatePointerType(
              board,
              PlaitPointerType.selection
            );
            updateAppState({ pointer: PlaitPointerType.selection });
          }
          if (event.key === 'm') {
            setCreationMode(board, BoardCreationMode.dnd);
            BoardTransforms.updatePointerType(board, MindPointerType.mind);
            updateAppState({ pointer: MindPointerType.mind });
          }
          if (event.key === 'e') {
            setCreationMode(board, BoardCreationMode.drawing);
            BoardTransforms.updatePointerType(board, FreehandShape.eraser);
            updateAppState({ pointer: FreehandShape.eraser });
          }
          if (event.key === 'p') {
            if (event.shiftKey) {
              // Shift+P for vector pen tool
              setCreationMode(board, BoardCreationMode.drawing);
              BoardTransforms.updatePointerType(board, PenShape.pen);
              updateAppState({ pointer: PenShape.pen });
            } else {
              // P for freehand pen
              setCreationMode(board, BoardCreationMode.drawing);
              BoardTransforms.updatePointerType(board, FreehandShape.feltTipPen);
              updateAppState({ pointer: FreehandShape.feltTipPen });
            }
          }
          if (event.key === 'a' && !isHotkey(['mod+a'])(event)) {
            // will trigger editing text
            if (getSelectedElements(board).length === 0) {
              setCreationMode(board, BoardCreationMode.drawing);
              BoardTransforms.updatePointerType(board, ArrowLineShape.straight);
              updateAppState({ pointer: ArrowLineShape.straight });
            }
          }
          if (event.key === 'f') {
            setCreationMode(board, BoardCreationMode.drawing);
            BoardTransforms.updatePointerType(board, FramePointerType);
            updateAppState({ pointer: FramePointerType });
          }
          if (event.key === 'r' || event.key === 'o' || event.key === 't') {
            const keyToPointer = {
              r: BasicShapes.rectangle,
              o: BasicShapes.ellipse,
              t: BasicShapes.text,
            };
            if (keyToPointer[event.key] === BasicShapes.text) {
              setCreationMode(board, BoardCreationMode.dnd);
            } else {
              setCreationMode(board, BoardCreationMode.drawing);
            }
            BoardTransforms.updatePointerType(board, keyToPointer[event.key]);
            updateAppState({ pointer: keyToPointer[event.key] });
          }
          event.preventDefault();
          return;
        }
      }
      globalKeyDown(event);
    };

    board.keyDown = (event: KeyboardEvent) => {
      if (isHotkey(['mod+z'], { byKey: true })(event)) {
        board.undo();
        event.preventDefault();
        return;
      }

      if (isHotkey(['mod+shift+z'], { byKey: true })(event)) {
        board.redo();
        event.preventDefault();
        return;
      }

      keyDown(event);
    };

    return board;
  };
  return withDrawnixHotkey;
};
