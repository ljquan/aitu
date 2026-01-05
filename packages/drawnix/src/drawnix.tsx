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
import { withTracking } from './plugins/tracking';
import { withTool } from './plugins/with-tool';
import { withToolFocus } from './plugins/with-tool-focus';
import { withToolResize } from './plugins/with-tool-resize';
import { withWorkZone } from './plugins/with-workzone';
import { ActiveTaskWarning } from './components/task-queue/ActiveTaskWarning';
import { useTaskStorage } from './hooks/useTaskStorage';
import { useTaskExecutor } from './hooks/useTaskExecutor';
import { useAutoInsertToCanvas } from './hooks/useAutoInsertToCanvas';
import { useBeforeUnload } from './hooks/useBeforeUnload';
import { ChatDrawer } from './components/chat-drawer';
import { ChatDrawerProvider, useChatDrawer } from './contexts/ChatDrawerContext';
import { WorkflowProvider } from './contexts/WorkflowContext';
import { ProjectDrawer } from './components/project-drawer';
import { ToolboxDrawer } from './components/toolbox-drawer/ToolboxDrawer';
import { useWorkspace } from './hooks/useWorkspace';
import { Board as WorkspaceBoard } from './types/workspace.types';
import { toolTestHelper } from './utils/tool-test-helper';
import { Minimap } from './components/minimap';
import { AssetProvider } from './contexts/AssetContext';
import { initializeAssetIntegration } from './services/asset-integration-service';
import { ToolbarConfigProvider } from './hooks/use-toolbar-config';
import { AIInputBar } from './components/ai-input-bar';

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
  /** Called when board is switched */
  onBoardSwitch?: (board: WorkspaceBoard) => void;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'>;

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
  onBoardSwitch,
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
  const [projectDrawerOpen, setProjectDrawerOpen] = useState(false);
  const [toolboxDrawerOpen, setToolboxDrawerOpen] = useState(false);
  const [taskPanelExpanded, setTaskPanelExpanded] = useState(false);

  // 使用 ref 来保存 board 的最新引用,避免 useCallback 依赖问题
  const boardRef = useRef<DrawnixBoard | null>(null);

  // 关闭所有抽屉
  const closeAllDrawers = useCallback(() => {
    setProjectDrawerOpen(false);
    setToolboxDrawerOpen(false);
    setTaskPanelExpanded(false);
  }, []);

  // 处理项目抽屉切换（互斥逻辑）
  const handleProjectDrawerToggle = useCallback(() => {
    setProjectDrawerOpen((prev) => {
      if (!prev) closeAllDrawers();
      return !prev;
    });
  }, [closeAllDrawers]);

  // 处理工具箱抽屉切换（互斥逻辑）
  const handleToolboxDrawerToggle = useCallback(() => {
    setToolboxDrawerOpen((prev) => {
      if (!prev) closeAllDrawers();
      return !prev;
    });
  }, [closeAllDrawers]);

  // 处理任务面板切换（互斥逻辑）
  const handleTaskPanelToggle = useCallback(() => {
    setTaskPanelExpanded((prev) => {
      if (!prev) closeAllDrawers();
      return !prev;
    });
  }, [closeAllDrawers]);

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

  // Initialize asset integration service on mount
  useEffect(() => {
    const cleanup = initializeAssetIntegration();
    return cleanup;
  }, []);

  // Initialize video recovery service to restore expired blob URLs
  useEffect(() => {
    if (board) {
      import('./services/video-recovery-service').then(({ initVideoRecoveryService }) => {
        initVideoRecoveryService(board);
      });
    }
  }, [board]);

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
    withTool,
    withToolResize, // 工具缩放功能 - 拖拽缩放手柄
    withToolFocus, // 工具焦点管理 - 双击编辑
    withWorkZone, // 工作区元素 - 在画布上显示工作流进度
    withTracking,
  ];

  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize task storage synchronization
  useTaskStorage();

  // Initialize task executor for background processing
  useTaskExecutor();

  // Auto-insert completed tasks to canvas
  useAutoInsertToCanvas({ enabled: true, insertPrompt: false, groupSimilarTasks: true });

  // Warn users before leaving page with active tasks
  useBeforeUnload();

  // Workspace management
  const { saveBoard } = useWorkspace();

  // Handle saving before board switch
  const handleBeforeSwitch = useCallback(async () => {
    if (onChange && boardRef.current) {
      // Get current data and save
      const currentData = {
        children: boardRef.current.children || [],
        viewport: boardRef.current.viewport,
        theme: boardRef.current.theme,
      };
      await saveBoard(currentData);
    }
  }, [onChange, saveBoard]);

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
      <ToolbarConfigProvider>
        <AssetProvider>
          <ChatDrawerProvider>
            <WorkflowProvider>
              <DrawnixContext.Provider value={contextValue}>
                <DrawnixContent
                  value={value}
                  viewport={viewport}
                  theme={theme}
                  options={options}
                  plugins={plugins}
                  containerRef={containerRef}
                  appState={appState}
                  board={board}
                  setBoard={setBoard}
                  projectDrawerOpen={projectDrawerOpen}
                  toolboxDrawerOpen={toolboxDrawerOpen}
                  taskPanelExpanded={taskPanelExpanded}
                  onChange={onChange}
                  onSelectionChange={handleSelectionChange}
                  onViewportChange={onViewportChange}
                  onThemeChange={onThemeChange}
                  onValueChange={onValueChange}
                  afterInit={afterInit}
                  onBoardSwitch={onBoardSwitch}
                  handleProjectDrawerToggle={handleProjectDrawerToggle}
                  handleToolboxDrawerToggle={handleToolboxDrawerToggle}
                  handleTaskPanelToggle={handleTaskPanelToggle}
                  setProjectDrawerOpen={setProjectDrawerOpen}
                  setToolboxDrawerOpen={setToolboxDrawerOpen}
                  handleBeforeSwitch={handleBeforeSwitch}
                />
              </DrawnixContext.Provider>
            </WorkflowProvider>
          </ChatDrawerProvider>
        </AssetProvider>
      </ToolbarConfigProvider>
    </I18nProvider>
  );
};

// Internal component that uses ChatDrawer context
interface DrawnixContentProps {
  value: PlaitElement[];
  viewport?: Viewport;
  theme?: PlaitTheme;
  options: PlaitBoardOptions;
  plugins: PlaitPlugin[];
  containerRef: React.RefObject<HTMLDivElement>;
  appState: DrawnixState;
  board: DrawnixBoard | null;
  setBoard: React.Dispatch<React.SetStateAction<DrawnixBoard | null>>;
  projectDrawerOpen: boolean;
  toolboxDrawerOpen: boolean;
  taskPanelExpanded: boolean;
  onChange?: (value: BoardChangeData) => void;
  onSelectionChange: (selection: Selection | null) => void;
  onViewportChange?: (value: Viewport) => void;
  onThemeChange?: (value: ThemeColorMode) => void;
  onValueChange?: (value: PlaitElement[]) => void;
  afterInit?: (board: PlaitBoard) => void;
  onBoardSwitch?: (board: WorkspaceBoard) => void;
  handleProjectDrawerToggle: () => void;
  handleToolboxDrawerToggle: () => void;
  handleTaskPanelToggle: () => void;
  setProjectDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setToolboxDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleBeforeSwitch: () => Promise<void>;
}

const DrawnixContent: React.FC<DrawnixContentProps> = ({
  value,
  viewport,
  theme,
  options,
  plugins,
  containerRef,
  appState,
  board,
  setBoard,
  projectDrawerOpen,
  toolboxDrawerOpen,
  taskPanelExpanded,
  onChange,
  onSelectionChange,
  onViewportChange,
  onThemeChange,
  onValueChange,
  afterInit,
  onBoardSwitch,
  handleProjectDrawerToggle,
  handleToolboxDrawerToggle,
  handleTaskPanelToggle,
  setProjectDrawerOpen,
  setToolboxDrawerOpen,
  handleBeforeSwitch,
}) => {
  const { chatDrawerRef } = useChatDrawer();

  return (
    <div
      className={classNames('drawnix', {
        'drawnix--mobile': appState.isMobile,
      })}
      ref={containerRef}
    >
      <div className="drawnix__main">
        <Wrapper
          value={value}
          viewport={viewport}
          theme={theme}
          options={options}
          plugins={plugins}
          onChange={(data: BoardChangeData) => {
            onChange && onChange(data);
          }}
          onSelectionChange={onSelectionChange}
          onViewportChange={onViewportChange}
          onThemeChange={onThemeChange}
          onValueChange={onValueChange}
        >
          <Board
            afterInit={(board) => {
              setBoard(board as DrawnixBoard);
              // 设置测试助手的 board 实例（仅开发环境）
              if (process.env.NODE_ENV === 'development') {
                toolTestHelper.setBoard(board);
              }
              afterInit && afterInit(board);
            }}
          ></Board>
          {/* 统一左侧工具栏 (桌面端和移动端一致) */}
          <UnifiedToolbar
            projectDrawerOpen={projectDrawerOpen}
            onProjectDrawerToggle={handleProjectDrawerToggle}
            toolboxDrawerOpen={toolboxDrawerOpen}
            onToolboxDrawerToggle={handleToolboxDrawerToggle}
            taskPanelExpanded={taskPanelExpanded}
            onTaskPanelToggle={handleTaskPanelToggle}
          />

          <PopupToolbar></PopupToolbar>
          <LinkPopup></LinkPopup>
          <ClosePencilToolbar></ClosePencilToolbar>
          <TTDDialog container={containerRef.current}></TTDDialog>
          <CleanConfirm container={containerRef.current}></CleanConfirm>
          <SettingsDialog container={containerRef.current}></SettingsDialog>
          {/* AI Input Bar - 底部 AI 输入框 */}
          <AIInputBar />
        </Wrapper>
        <ActiveTaskWarning />
        <ChatDrawer ref={chatDrawerRef} />
        <ProjectDrawer
          isOpen={projectDrawerOpen}
          onOpenChange={setProjectDrawerOpen}
          onBeforeSwitch={handleBeforeSwitch}
          onBoardSwitch={onBoardSwitch}
        />
        <ToolboxDrawer
          isOpen={toolboxDrawerOpen}
          onOpenChange={setToolboxDrawerOpen}
        />
        {/* Minimap - 小地图 */}
        {board && <Minimap board={board} />}
      </div>
    </div>
  );
};
