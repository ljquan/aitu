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
  getHitElementByPoint,
  toHostPoint,
  toViewBoxPoint,
} from '@plait/core';
import React, { useState, useRef, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
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
import { PencilSettingsToolbar, EraserSettingsToolbar } from './components/toolbar/pencil-settings-toolbar';
import { CleanConfirm } from './components/clean-confirm/clean-confirm';
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
import { fontManagerService } from './services/font-manager-service';
import { WorkflowProvider } from './contexts/WorkflowContext';
import { useWorkspace } from './hooks/useWorkspace';
import { Board as WorkspaceBoard } from './types/workspace.types';
import { toolTestHelper } from './utils/tool-test-helper';
import { ViewNavigation } from './components/view-navigation';
import { AssetProvider } from './contexts/AssetContext';
import { initializeAssetIntegration } from './services/asset-integration-service';
import { ToolbarConfigProvider } from './hooks/use-toolbar-config';
import { AIInputBar } from './components/ai-input-bar';
import { VersionUpdatePrompt } from './components/version-update/version-update-prompt';
import { QuickCreationToolbar } from './components/toolbar/quick-creation-toolbar/quick-creation-toolbar';
import { CacheQuotaProvider } from './components/cache-quota-provider/CacheQuotaProvider';
import { RecentColorsProvider } from './components/unified-color-picker';
import { usePencilCursor } from './hooks/usePencilCursor';
import { withArrowLineAutoCompleteExtend } from './plugins/with-arrow-line-auto-complete-extend';
import { AutoCompleteShapePicker } from './components/auto-complete-shape-picker';
import { useAutoCompleteShapePicker } from './hooks/useAutoCompleteShapePicker';
import { withDefaultFill } from './plugins/with-default-fill';

const TTDDialog = lazy(() => import('./components/ttd-dialog/ttd-dialog').then(module => ({ default: module.TTDDialog })));
const SettingsDialog = lazy(() => import('./components/settings-dialog/settings-dialog').then(module => ({ default: module.SettingsDialog })));
const ProjectDrawer = lazy(() => import('./components/project-drawer').then(module => ({ default: module.ProjectDrawer })));
const ToolboxDrawer = lazy(() => import('./components/toolbox-drawer/ToolboxDrawer').then(module => ({ default: module.ToolboxDrawer })));
const MediaLibraryModal = lazy(() => import('./components/media-library').then(module => ({ default: module.MediaLibraryModal })));
const BackupRestoreDialog = lazy(() => import('./components/backup-restore').then(module => ({ default: module.BackupRestoreDialog })));

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
  /** 数据是否已准备好（用于判断画布是否为空） */
  isDataReady?: boolean;
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
  isDataReady = false,
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
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false);
  const [backupRestoreOpen, setBackupRestoreOpen] = useState(false);

  // 使用 ref 来保存 board 的最新引用,避免 useCallback 依赖问题
  const boardRef = useRef<DrawnixBoard | null>(null);

  // 关闭所有抽屉
  const closeAllDrawers = useCallback(() => {
    setProjectDrawerOpen(false);
    setToolboxDrawerOpen(false);
    setTaskPanelExpanded(false);
    setMediaLibraryOpen(false);
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

  // 打开素材库（用于缓存满提示）
  const handleOpenMediaLibrary = useCallback(() => {
    closeAllDrawers();
    setMediaLibraryOpen(true);
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

  // 预加载画布中使用的字体（当 value 变化时）
  useEffect(() => {
    if (value && value.length > 0) {
      fontManagerService.preloadBoardFonts(value).then(() => {
        // 字体加载完成后，强制重新渲染
        // PlaitBoard 没有 redraw 方法，字体加载后会自动应用
      }).catch(error => {
        console.warn('Failed to preload board fonts:', error);
      });
    }
  }, [value]);

  // Initialize video recovery service to restore expired blob URLs
  useEffect(() => {
    if (board) {
      import('./services/video-recovery-service').then(({ initVideoRecoveryService }) => {
        initVideoRecoveryService(board);
      });
    }
  }, [board]);

  // Handle interrupted WorkZone elements after page refresh
  // Query task status from Service Worker and restore workflow state
  useEffect(() => {
    if (board && value && value.length > 0) {
      const restoreWorkZones = async () => {
        const { WorkZoneTransforms } = await import('./plugins/with-workzone');
        const { shouldUseSWTaskQueue } = await import('./services/task-queue');
        const { TaskStatus } = await import('./types/task.types');

        // In SW mode, ensure tasks are synced from SW first
        if (shouldUseSWTaskQueue()) {
          const { swTaskQueueService } = await import('./services/sw-task-queue-service');
          // Wait for SW to be initialized and tasks synced
          await swTaskQueueService.initialize();
          await swTaskQueueService.syncTasksFromSW();
        }

        // Query active chat workflows from SW
        // SW will re-send pending tool requests to the new page
        const { chatWorkflowClient } = await import('./services/sw-client/chat-workflow-client');
        const activeChatWorkflows = await chatWorkflowClient.getAllActiveWorkflows();
        const activeChatWorkflowIds = new Set(activeChatWorkflows.map(w => w.id));
        
        // Also query regular workflows
        const { workflowSubmissionService } = await import('./services/workflow-submission-service');
        const activeWorkflows = await workflowSubmissionService.queryAllWorkflows();
        const activeWorkflowIds = new Set(activeWorkflows.map(w => w.id));
        
        // console.log('[Drawnix] Active chat workflows:', activeChatWorkflows.length, 'regular workflows:', activeWorkflows.length);

        // Now import taskQueueService after sync is complete
        const { taskQueueService } = await import('./services/task-queue');

        const workzones = WorkZoneTransforms.getAllWorkZones(board);

        for (const workzone of workzones) {
          const swWorkflow = activeWorkflows.find(w => w.id === workzone.workflow.id);
          
          const hasRunningSteps = workzone.workflow.steps.some(
            step => step.status === 'running' || step.status === 'pending'
          );

          // If we found the workflow in SW, sync the steps list first (for dynamic steps and status)
          if (swWorkflow) {
            const needsSync = swWorkflow.steps.length !== workzone.workflow.steps.length || 
                             swWorkflow.status !== workzone.workflow.status;
            
            if (needsSync) {
              // console.log(`[Drawnix] Syncing workflow for WorkZone ${workzone.id}, SW status: ${swWorkflow.status}, steps: ${swWorkflow.steps.length}`);
              WorkZoneTransforms.updateWorkflow(board, workzone.id, {
                steps: swWorkflow.steps,
                status: swWorkflow.status,
                error: swWorkflow.error,
              });
              // Update local workzone reference for the mapping logic below
              workzone.workflow.steps = swWorkflow.steps;
              workzone.workflow.status = swWorkflow.status;
            }
          }

          if (!hasRunningSteps && !swWorkflow) continue;

          // Check if this workzone's workflow is still active in SW
          // For chat workflows, check activeChatWorkflowIds; for regular workflows, check activeWorkflowIds
          const isChatWorkflowActive = activeChatWorkflowIds.has(workzone.workflow.id);
          const isRegularWorkflowActive = activeWorkflowIds.has(workzone.workflow.id);
          const isWorkflowActive = isChatWorkflowActive || isRegularWorkflowActive;

          // console.log('[Drawnix] Found interrupted WorkZone:', workzone.id, 'chatActive:', isChatWorkflowActive, 'regularActive:', isRegularWorkflowActive);

          // Update steps based on task queue status
          const updatedSteps = workzone.workflow.steps.map(step => {
            if (step.status !== 'running' && step.status !== 'pending') {
              return step;
            }

            // Get taskId from step result
            const taskId = (step.result as { taskId?: string })?.taskId;
            if (!taskId) {
              // No taskId means it's an AI analyze step or similar
              // For ai_analyze (text model), check if workflow is still active in SW
              if (step.mcp === 'ai_analyze') {
                if (isWorkflowActive) {
                  // Workflow is still active in SW, SW will re-send the request
                  // Keep as running, the new page will handle the re-sent request
                  return step;
                }
                // Workflow is not active, mark as failed
                return {
                  ...step,
                  status: 'failed' as const,
                  error: '页面刷新导致中断，请删除后重新发起',
                };
              }
              // For other steps without taskId (like insert_mindmap, insert_mermaid),
              // they are synchronous and should have completed before refresh
              // If they're still running/pending, mark as failed
              if (step.status === 'running') {
                return {
                  ...step,
                  status: 'failed' as const,
                  error: '页面刷新导致中断，请删除后重新发起',
                };
              }
              return step;
            }

            // Query task status from task queue
            const task = taskQueueService.getTask(taskId);
            if (!task) {
              // Task not found in queue, mark as failed
              return {
                ...step,
                status: 'failed' as const,
                error: '任务未找到，请重试',
              };
            }

            // Update step status based on task status
            switch (task.status) {
              case TaskStatus.COMPLETED:
                return {
                  ...step,
                  status: 'completed' as const,
                  result: { taskId, result: task.result },
                };
              case TaskStatus.FAILED:
                return {
                  ...step,
                  status: 'failed' as const,
                  error: task.error?.message || '任务执行失败',
                };
              case TaskStatus.CANCELLED:
                return {
                  ...step,
                  status: 'skipped' as const,
                };
              case TaskStatus.PENDING:
              case TaskStatus.PROCESSING:
              case TaskStatus.RETRYING:
                // Task is still running, keep as running
                return step;
              default:
                return step;
            }
          });

          // Check if any steps were updated
          const hasChanges = updatedSteps.some((step, i) =>
            step.status !== workzone.workflow.steps[i].status
          );

          if (hasChanges) {
            WorkZoneTransforms.updateWorkflow(board, workzone.id, {
              steps: updatedSteps,
            });
            // console.log('[Drawnix] Restored WorkZone state:', workzone.id);
          }
        }
      };

      restoreWorkZones().catch(error => {
        console.error('[Drawnix] Failed to restore WorkZones:', error);
      });
    }
  }, [board]); // Only run once when board is initialized

  // Subscribe to workflow status updates from SW and sync to WorkZone
  // This ensures WorkZone UI stays in sync even after page refresh
  useEffect(() => {
    if (!board) return;

    let subscription: { unsubscribe: () => void } | null = null;

    const setupWorkflowSync = async () => {
      const workflowModule = await import('./services/workflow-submission-service');
      const { WorkZoneTransforms } = await import('./plugins/with-workzone');
      const { workflowSubmissionService } = workflowModule;

      // Subscribe to all workflow events
      subscription = workflowSubmissionService.subscribeToAllEvents((event) => {
        const workflowEvent = event as { 
          type: string; 
          workflowId: string; 
          stepId?: string; 
          status?: string; 
          result?: unknown; 
          error?: string; 
          duration?: number;
          steps?: Array<{ id: string; mcp: string; args: Record<string, unknown>; description: string; status: string }>;
        };
        // console.log('[Drawnix] Workflow event:', workflowEvent.type, workflowEvent.workflowId);
        
        // Find WorkZone with this workflow ID
        const workzones = WorkZoneTransforms.getAllWorkZones(board);
        const workzone = workzones.find(wz => wz.workflow.id === workflowEvent.workflowId);
        
        if (!workzone) {
          // console.log('[Drawnix] No WorkZone found for workflow:', workflowEvent.workflowId);
          return;
        }

        switch (workflowEvent.type) {
          case 'step': {
            // Update specific step status
            const updatedSteps = workzone.workflow.steps.map(step => {
              if (step.id === workflowEvent.stepId) {
                return {
                  ...step,
                  status: (workflowEvent.status || step.status) as 'pending' | 'running' | 'completed' | 'failed' | 'skipped',
                  result: workflowEvent.result ?? step.result,
                  error: workflowEvent.error ?? step.error,
                  duration: workflowEvent.duration ?? step.duration,
                };
              }
              return step;
            });
            WorkZoneTransforms.updateWorkflow(board, workzone.id, {
              steps: updatedSteps,
            });
            break;
          }

          case 'steps_added': {
            // Add new steps to workflow
            const newSteps = (workflowEvent.steps || []).map(step => ({
              id: step.id,
              mcp: step.mcp,
              args: step.args,
              description: step.description,
              status: step.status as 'pending' | 'running' | 'completed' | 'failed' | 'skipped',
            }));
            WorkZoneTransforms.updateWorkflow(board, workzone.id, {
              steps: [...workzone.workflow.steps, ...newSteps],
            });
            break;
          }

          case 'completed':
          case 'failed': {
            // Workflow completed or failed - update all pending/running steps
            const finalStatus = workflowEvent.type === 'completed' ? 'completed' : 'failed';
            const updatedSteps = workzone.workflow.steps.map(step => {
              if (step.status === 'running' || step.status === 'pending') {
                // For steps with taskId, don't force status change - let task queue handle it
                const stepResult = step.result as { taskId?: string } | undefined;
                if (stepResult?.taskId) {
                  return step;
                }
                return {
                  ...step,
                  status: finalStatus as 'completed' | 'failed',
                  error: workflowEvent.type === 'failed' ? workflowEvent.error : undefined,
                };
              }
              return step;
            });
            WorkZoneTransforms.updateWorkflow(board, workzone.id, {
              steps: updatedSteps,
            });
            break;
          }

          case 'recovered': {
            // Full workflow recovery - sync all steps and status
            const swWorkflow = (workflowEvent as any).workflow;
            if (swWorkflow) {
              WorkZoneTransforms.updateWorkflow(board, workzone.id, {
                steps: swWorkflow.steps,
                status: swWorkflow.status,
              });
            }
            break;
          }
        }
      });
    };

    setupWorkflowSync().catch(error => {
      console.error('[Drawnix] Failed to setup workflow sync:', error);
    });

    return () => {
      subscription?.unsubscribe();
    };
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
    withArrowLineAutoCompleteExtend, // 自动完成形状选择 - hover 中点时选择下一个节点形状
    withDefaultFill, // 默认填充 - 让新创建的图形有白色填充，方便双击编辑
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

      // 更新lastSelectedElementIds（包括清空的情况）
      // console.log('Selection changed, saving element IDs:', elementIds);
      updateAppState({ lastSelectedElementIds: elementIds });
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
      <RecentColorsProvider>
        <AssetProvider>
          <ToolbarConfigProvider>
            <CacheQuotaProvider onOpenMediaLibrary={handleOpenMediaLibrary}>
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
                      mediaLibraryOpen={mediaLibraryOpen}
                      backupRestoreOpen={backupRestoreOpen}
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
                      setMediaLibraryOpen={setMediaLibraryOpen}
                      setBackupRestoreOpen={setBackupRestoreOpen}
                      handleBeforeSwitch={handleBeforeSwitch}
                      isDataReady={isDataReady}
                    />
                    <Suspense fallback={null}>
                      <MediaLibraryModal
                        isOpen={mediaLibraryOpen}
                        onClose={() => setMediaLibraryOpen(false)}
                      />
                    </Suspense>
                  </DrawnixContext.Provider>
                </WorkflowProvider>
              </ChatDrawerProvider>
            </CacheQuotaProvider>
          </ToolbarConfigProvider>
        </AssetProvider>
      </RecentColorsProvider>
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
  mediaLibraryOpen: boolean;
  backupRestoreOpen: boolean;
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
  setMediaLibraryOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setBackupRestoreOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleBeforeSwitch: () => Promise<void>;
  isDataReady: boolean;
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
  backupRestoreOpen,
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
  setBackupRestoreOpen,
  handleBeforeSwitch,
  isDataReady,
}) => {
  const { chatDrawerRef } = useChatDrawer();

  // 画笔自定义光标
  usePencilCursor({ board, pointer: appState.pointer });

  // 快捷工具栏状态
  const [quickToolbarVisible, setQuickToolbarVisible] = useState(false);
  const [quickToolbarPosition, setQuickToolbarPosition] = useState<[number, number] | null>(null);

  // 自动完成形状选择器状态
  const {
    state: autoCompleteState,
    selectShape: selectAutoCompleteShape,
    closePicker: closeAutoCompletePicker,
  } = useAutoCompleteShapePicker(board);

  // 监听双击空白区域事件
  useEffect(() => {
    if (!board) return;

    const handleDoubleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      // 只处理画布区域内的双击（正向判断，避免维护浮层组件列表）
      const isInsideCanvas = target.closest('.board-host-svg') ||
                             target.closest('.plait-board-container');

      if (!isInsideCanvas) {
        return;
      }

      // 检查双击位置是否命中了画布上的元素
      // 使用 getHitElementByPoint 直接检测，而不是依赖 selectedElements
      // 因为双击事件触发时，元素可能还没被选中
      const viewBoxPoint = toViewBoxPoint(board, toHostPoint(board, event.clientX, event.clientY));
      const hitElement = getHitElementByPoint(board, viewBoxPoint);

      // 只有双击空白区域时才显示快速创建工具栏
      // 双击图形元素应该由 Plait 框架处理（进入文本编辑模式）
      if (!hitElement) {
        const position: [number, number] = [event.clientX, event.clientY];
        setQuickToolbarPosition(position);
        setQuickToolbarVisible(true);
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('dblclick', handleDoubleClick);
    }

    return () => {
      if (container) {
        container.removeEventListener('dblclick', handleDoubleClick);
      }
    };
  }, [board, containerRef]);

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

              // 预加载画布中使用的字体
              if (board.children && board.children.length > 0) {
                fontManagerService.preloadBoardFonts(board.children).catch(error => {
                  console.warn('Failed to preload board fonts:', error);
                });
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
            onOpenBackupRestore={() => setBackupRestoreOpen(true)}
          />

          <PopupToolbar></PopupToolbar>
          <LinkPopup></LinkPopup>
          <ClosePencilToolbar></ClosePencilToolbar>
          <PencilSettingsToolbar></PencilSettingsToolbar>
          <EraserSettingsToolbar></EraserSettingsToolbar>
          {appState.openDialogType && (
            <Suspense fallback={null}>
              <TTDDialog container={containerRef.current}></TTDDialog>
            </Suspense>
          )}
          <CleanConfirm container={containerRef.current}></CleanConfirm>
          {appState.openSettings && (
            <Suspense fallback={null}>
              <SettingsDialog container={containerRef.current}></SettingsDialog>
            </Suspense>
          )}
          {backupRestoreOpen && (
            <Suspense fallback={null}>
              <BackupRestoreDialog
                open={backupRestoreOpen}
                onOpenChange={setBackupRestoreOpen}
                container={containerRef.current}
              />
            </Suspense>
          )}
          {/* Quick Creation Toolbar - 双击空白区域显示的快捷工具栏 */}
          <QuickCreationToolbar
            position={quickToolbarPosition}
            visible={quickToolbarVisible}
            onClose={() => setQuickToolbarVisible(false)}
          />
          {/* Auto Complete Shape Picker - 自动完成形状选择器 */}
          <AutoCompleteShapePicker
            visible={autoCompleteState.visible}
            position={autoCompleteState.position}
            currentShape={autoCompleteState.currentShape || undefined}
            onSelectShape={selectAutoCompleteShape}
            onClose={closeAutoCompletePicker}
            container={containerRef.current}
          />
          {/* AI Input Bar - 底部 AI 输入框 */}
          <AIInputBar isDataReady={isDataReady} />
          {/* Version Update Prompt - 顶部右上角升级提示 */}
          <VersionUpdatePrompt />
          {/* ViewNavigation - 视图导航（缩放 + 小地图） */}
          <ViewNavigation />
        </Wrapper>
        <ActiveTaskWarning />
        <ChatDrawer ref={chatDrawerRef} />
        <Suspense fallback={null}>
          <ProjectDrawer
            isOpen={projectDrawerOpen}
            onOpenChange={setProjectDrawerOpen}
            onBeforeSwitch={handleBeforeSwitch}
            onBoardSwitch={onBoardSwitch}
          />
        </Suspense>
        <Suspense fallback={null}>
          <ToolboxDrawer
            isOpen={toolboxDrawerOpen}
            onOpenChange={setToolboxDrawerOpen}
          />
        </Suspense>
      </div>
    </div>
  );
};
