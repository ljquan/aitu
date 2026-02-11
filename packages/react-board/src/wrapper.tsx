import {
  BOARD_TO_ON_CHANGE,
  ListRender,
  PlaitElement,
  Viewport,
  createBoard,
  withBoard,
  withHandPointer,
  withHistory,
  withHotkey,
  withMoving,
  withOptions,
  withRelatedFragment,
  withSelection,
  PlaitBoard,
  type PlaitPlugin,
  type PlaitBoardOptions,
  type Selection,
  ThemeColorMode,
  BOARD_TO_AFTER_CHANGE,
  PlaitOperation,
  PlaitTheme,
  isFromScrolling,
  setIsFromScrolling,
  getSelectedElements,
  updateViewportOffset,
  initializeViewBox,
  withI18n,
  updateViewBox,
  FLUSHING,
  BoardTransforms,
} from '@plait/core';
import { BoardChangeData } from './plugins/board';
import { useCallback, useEffect, useRef, useState } from 'react';
import { withReact } from './plugins/with-react';
import { PlaitCommonElementRef, withImage, withText } from '@plait/common';
import { BoardContext, BoardContextValue } from './hooks/use-board';
import React from 'react';
import { withPinchZoom } from './plugins/with-pinch-zoom-plugin';

export type WrapperProps = {
  value: PlaitElement[];
  children: React.ReactNode;
  options: PlaitBoardOptions;
  plugins: PlaitPlugin[];
  viewport?: Viewport;
  theme?: PlaitTheme;
  onChange?: (data: BoardChangeData) => void;
  onSelectionChange?: (selection: Selection | null) => void;
  onValueChange?: (value: PlaitElement[]) => void;
  onViewportChange?: (value: Viewport) => void;
  onThemeChange?: (value: ThemeColorMode) => void;
};

export const Wrapper: React.FC<WrapperProps> = ({
  value,
  children,
  options,
  plugins,
  viewport,
  theme,
  onChange,
  onSelectionChange,
  onValueChange,
  onViewportChange,
  onThemeChange,
}) => {
  const [context, setContext] = useState<BoardContextValue>(() => {
    const board = initializeBoard(value, options, plugins, viewport, theme);
    const listRender = initializeListRender(board);
    return {
      v: 0,
      board,
      listRender,
    };
  });

  const { board, listRender } = context;

  const onContextChange = useCallback(() => {
    if (onChange) {
      const data: BoardChangeData = {
        children: board.children,
        operations: board.operations,
        viewport: board.viewport,
        selection: board.selection,
        theme: board.theme,
      };
      onChange(data);
    }

    const hasSelectionChanged = board.operations.some((o) =>
      PlaitOperation.isSetSelectionOperation(o)
    );
    const hasViewportChanged = board.operations.some((o) =>
      PlaitOperation.isSetViewportOperation(o)
    );
    const hasThemeChanged = board.operations.some((o) =>
      PlaitOperation.isSetThemeOperation(o)
    );
    const hasChildrenChanged =
      board.operations.length > 0 &&
      !board.operations.every(
        (o) =>
          PlaitOperation.isSetSelectionOperation(o) ||
          PlaitOperation.isSetViewportOperation(o) ||
          PlaitOperation.isSetThemeOperation(o)
      );

    if (onValueChange && hasChildrenChanged) {
      onValueChange(board.children);
    }

    if (onSelectionChange && hasSelectionChanged) {
      onSelectionChange(board.selection);
    }

    if (onViewportChange && hasViewportChanged) {
      onViewportChange(board.viewport);
    }

    if (onThemeChange && hasThemeChanged) {
      onThemeChange(board.theme.themeColorMode);
    }

    setContext((prevContext) => ({
      v: prevContext.v + 1,
      board,
      listRender,
    }));
  }, [board, onChange, onSelectionChange, onValueChange, onViewportChange, onThemeChange]);

  useEffect(() => {
    BOARD_TO_ON_CHANGE.set(board, () => {
      const isOnlySetSelection =
        board.operations.length &&
        board.operations.every((op) => op.type === 'set_selection');
      if (isOnlySetSelection) {
        listRender.update(board.children, {
          board: board,
          parent: board,
          parentG: PlaitBoard.getElementHost(board),
        });
        return;
      }
      const isSetViewport =
        board.operations.length &&
        board.operations.some((op) => op.type === 'set_viewport');
      if (isSetViewport && isFromScrolling(board)) {
        setIsFromScrolling(board, false);
        listRender.update(board.children, {
          board: board,
          parent: board,
          parentG: PlaitBoard.getElementHost(board),
        });
        return;
      }
      listRender.update(board.children, {
        board: board,
        parent: board,
        parentG: PlaitBoard.getElementHost(board),
      });
      if (isSetViewport) {
        initializeViewBox(board);
      } else {
        updateViewBox(board);
      }
      updateViewportOffset(board);
      const selectedElements = getSelectedElements(board);
      selectedElements.forEach((element) => {
        const elementRef =
          PlaitElement.getElementRef<PlaitCommonElementRef>(element);
        elementRef?.updateActiveSection();
      });
    });

    BOARD_TO_AFTER_CHANGE.set(board, () => {
      onContextChange();
    });

    return () => {
      BOARD_TO_ON_CHANGE.delete(board);
      BOARD_TO_AFTER_CHANGE.delete(board);
    };
  }, [board]);

  const isFirstRender = useRef(true);
  const prevViewportRef = useRef<Viewport | undefined>(viewport);

  // 处理 viewport prop 变化（用于恢复保存的视图状态）
  useEffect(() => {
    const prevViewport = prevViewportRef.current;
    prevViewportRef.current = viewport;

    // 如果外部传入了有效的 viewport，且与当前不同，则应用它
    if (viewport && !FLUSHING.get(board)) {
      // 检查是否是从 undefined 变为有值，或者值发生了变化
      const isNewViewport = !prevViewport;
      const isDifferent = prevViewport && (
        prevViewport.zoom !== viewport.zoom ||
        prevViewport.offsetX !== viewport.offsetX ||
        prevViewport.offsetY !== viewport.offsetY
      );
      
      if (isNewViewport || isDifferent) {
        board.viewport = viewport;
        initializeViewBox(board);
        updateViewportOffset(board);
      }
    }
  }, [viewport, board]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (value !== context.board.children && !FLUSHING.get(board)) {
      board.children = value;
      listRender.update(board.children, {
        board: board,
        parent: board,
        parentG: PlaitBoard.getElementHost(board),
      });
      // 只有当没有传入 viewport 时才自动适配视图
      // 如果传入了 viewport，说明是恢复保存的视图，不应该重置
      if (!viewport) {
        BoardTransforms.fitViewport(board);
      }
    }
  }, [value, viewport]);

  return (
    <BoardContext.Provider value={context}>{children}</BoardContext.Provider>
  );
};

const initializeBoard = (
  value: PlaitElement[],
  options: PlaitBoardOptions,
  plugins: PlaitPlugin[],
  viewport?: Viewport,
  theme?: PlaitTheme
) => {
  let board = withRelatedFragment(
    withHotkey(
      withHandPointer(
        withHistory(
          withSelection(
            withMoving(
              withBoard(
                withI18n(
                  withOptions(
                    withReact(withImage(withText(createBoard(value, options))))
                  )
                )
              )
            )
          )
        )
      )
    )
  );
  plugins.forEach((plugin: any) => {
    board = plugin(board);
  });
  withPinchZoom(board);

  if (viewport) {
    board.viewport = viewport;
  }

  if (theme) {
    board.theme = theme;
  }

  return board;
};

const initializeListRender = (board: PlaitBoard) => {
  const listRender = new ListRender(board);
  return listRender;
};
