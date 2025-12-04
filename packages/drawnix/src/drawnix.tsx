import { Board, BoardChangeData, Wrapper } from '@plait-board/react-board';
import {
  PlaitBoard,
  PlaitBoardOptions,
  PlaitElement,
  PlaitPlugin,
  PlaitPointerType,
  PlaitTheme,
  Selection,
  ThemeColorMode,
  Viewport,
  getSelectedElements,
} from '@plait/core';
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { withGroup } from '@plait/common';
import { withDraw } from '@plait/draw';
import { MindThemeColors, withMind } from '@plait/mind';
import MobileDetect from 'mobile-detect';
import { withMindExtend } from './plugins/with-mind-extend';
import { withCommonPlugin } from './plugins/with-common';
import { PopupToolbar } from './components/toolbar/popup-toolbar/popup-toolbar';
import { UnifiedToolbar } from './components/toolbar/unified-toolbar';
import classNames from 'classnames';
import './styles/index.scss';
import { buildDrawnixHotkeyPlugin } from './plugins/with-hotkey';
import { withFreehand } from './plugins/freehand/with-freehand';
import { buildPencilPlugin } from './plugins/with-pencil';
import {
  DrawnixBoard,
  DrawnixContext,
  DrawnixState,
} from './hooks/use-drawnix';
import { ClosePencilToolbar } from './components/toolbar/pencil-mode-toolbar';
import { TTDDialog } from './components/ttd-dialog/ttd-dialog';
import { CleanConfirm } from './components/clean-confirm/clean-confirm';
import { SettingsDialog } from './components/settings-dialog/settings-dialog';
import { buildTextLinkPlugin } from './plugins/with-text-link';
import { LinkPopup } from './components/popup/link-popup/link-popup';
import { I18nProvider } from './i18n';
import { withVideo } from './plugins/with-video';
import { ActiveTaskWarning } from './components/task-queue/ActiveTaskWarning';
import { useTaskStorage } from './hooks/useTaskStorage';
import { useTaskExecutor } from './hooks/useTaskExecutor';
import { useBeforeUnload } from './hooks/useBeforeUnload';
import { FeedbackButton } from './components/feedback-button';
import { ChatDrawer } from './components/chat-drawer';

export type DrawnixProps = {
  value: PlaitElement[];
  viewport?: Viewport;
  theme?: PlaitTheme;
  onChange?: (value: BoardChangeData) => void;
  onSelectionChange?: (selection: Selection | null) => void;
  onValueChange?: (value: PlaitElement[]) => void;
  onViewportChange?: (value: Viewport) => void;
  onThemeChange?: (value: ThemeColorMode) => void;
  afterInit?: (board: PlaitBoard) => void;
} & React.HTMLAttributes<HTMLDivElement>;

export const Drawnix: React.FC<DrawnixProps> = ({
  value,
  viewport,
  theme,
  onChange,
  onSelectionChange,
  onViewportChange,
  onThemeChange,
  onValueChange,
  afterInit,
}) => {
  const options: PlaitBoardOptions = {
    readonly: false,
    hideScrollbar: false,
    disabledScrollOnNonFocus: false,
    themeColors: MindThemeColors,
  };

  const [appState, setAppState] = useState<DrawnixState>(() => {
    // TODO: need to consider how to maintenance the pointer state in future
    const md = new MobileDetect(window.navigator.userAgent);
    return {
      pointer: PlaitPointerType.hand,
      isMobile: md.mobile() !== null,
      isPencilMode: false,
      openDialogType: null,
      dialogInitialData: null,
      openCleanConfirm: false,
      openSettings: false,
    };
  });

  const [board, setBoard] = useState<DrawnixBoard | null>(null);

  // 使用 ref 来保存 board 的最新引用,避免 useCallback 依赖问题
  const boardRef = useRef<DrawnixBoard | null>(null);

  // 使用 useCallback 稳定 setAppState 函数引用
  const stableSetAppState = useCallback((newAppState: DrawnixState) => {
    setAppState(newAppState);
  }, []);

  const updateAppState = useCallback((newAppState: Partial<DrawnixState>) => {
    setAppState(prevState => ({
      ...prevState,
      ...newAppState,
    }));
  }, []);

  // 使用 useEffect 来更新 board.appState 和 boardRef，避免在每次渲染时执行
  useEffect(() => {
    if (board) {
      board.appState = appState;
      boardRef.current = board;
    }
  }, [board, appState]);

  const plugins: PlaitPlugin[] = [
    withDraw,
    withGroup,
    withMind,
    withMindExtend,
    withCommonPlugin,
    buildDrawnixHotkeyPlugin(updateAppState),
    withFreehand,
    buildPencilPlugin(updateAppState),
    buildTextLinkPlugin(updateAppState),
    withVideo,
  ];

  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize task storage synchronization
  useTaskStorage();

  // Initialize task executor for background processing
  useTaskExecutor();

  // Warn users before leaving page with active tasks
  useBeforeUnload();

  // 处理选中状态变化,保存最近选中的元素IDs
  const handleSelectionChange = useCallback((selection: Selection | null) => {
    const currentBoard = boardRef.current;
    if (currentBoard && selection) {
      // 使用Plait的getSelectedElements函数来获取选中的元素
      const selectedElements = getSelectedElements(currentBoard);

      const elementIds = selectedElements.map((el: any) => el.id).filter(Boolean);

      // 只有当选中了元素时才更新lastSelectedElementIds
      if (elementIds.length > 0) {
        console.log('Selection changed, saving element IDs:', elementIds);
        updateAppState({ lastSelectedElementIds: elementIds });
      }
    }

    // 调用外部的onSelectionChange回调
    onSelectionChange && onSelectionChange(selection);
  }, [onSelectionChange, updateAppState]);

  // 使用 useMemo 稳定 DrawnixContext.Provider 的 value
  const contextValue = useMemo(() => ({
    appState,
    setAppState: stableSetAppState,
    board
  }), [appState, stableSetAppState, board]);

  return (
    <I18nProvider>
      <DrawnixContext.Provider value={contextValue}>
        <div
          className={classNames('drawnix', {
            'drawnix--mobile': appState.isMobile,
          })}
          ref={containerRef}
        >
          <Wrapper
            value={value}
            viewport={viewport}
            theme={theme}
            options={options}
            plugins={plugins}
            onChange={(data: BoardChangeData) => {
              onChange && onChange(data);
            }}
            onSelectionChange={handleSelectionChange}
            onViewportChange={onViewportChange}
            onThemeChange={onThemeChange}
            onValueChange={onValueChange}
          >
            <Board
              afterInit={(board) => {
                setBoard(board as DrawnixBoard);
                afterInit && afterInit(board);
              }}
            ></Board>
            {/* 统一左侧工具栏 (桌面端和移动端一致) */}
            <UnifiedToolbar />

            <PopupToolbar></PopupToolbar>
            <LinkPopup></LinkPopup>
            <ClosePencilToolbar></ClosePencilToolbar>
            <TTDDialog container={containerRef.current}></TTDDialog>
            <CleanConfirm container={containerRef.current}></CleanConfirm>
            <SettingsDialog container={containerRef.current}></SettingsDialog>
          </Wrapper>
          <ActiveTaskWarning />
          <ChatDrawer />
        </div>
      </DrawnixContext.Provider>
    </I18nProvider>
  );
};
