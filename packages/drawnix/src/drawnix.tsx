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
  getViewportOrigination,
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
import { withPen } from './plugins/pen/with-pen';
import { buildPencilPlugin } from './plugins/with-pencil';
import {
  DrawnixBoard,
  DrawnixContext,
  DrawnixState,
} from './hooks/use-drawnix';
import { ClosePencilToolbar } from './components/toolbar/pencil-mode-toolbar';
import { PencilSettingsToolbar, EraserSettingsToolbar } from './components/toolbar/pencil-settings-toolbar';
import { PenSettingsToolbar } from './components/toolbar/pen-settings-toolbar';
import { CleanConfirm } from './components/clean-confirm/clean-confirm';
import { buildTextLinkPlugin } from './plugins/with-text-link';
import { LinkPopup } from './components/popup/link-popup/link-popup';
import { I18nProvider } from './i18n';
import { withVideo, isVideoElement } from './plugins/with-video';
import { UnifiedMediaViewer, type MediaItem as UnifiedMediaItem } from './components/shared/media-preview';
import { PlaitDrawElement } from '@plait/draw';
import { withTracking } from './plugins/tracking';
import { withTool } from './plugins/with-tool';
import { withToolFocus } from './plugins/with-tool-focus';
import { withToolResize } from './plugins/with-tool-resize';
import { withMultiResize } from './plugins/with-multi-resize';
import { withWorkZone } from './plugins/with-workzone';
import { MultiSelectionHandles } from './components/multi-selection-handles';
import { ActiveTaskWarning } from './components/task-queue/ActiveTaskWarning';
import { useTaskStorage } from './hooks/useTaskStorage';
import { useTaskExecutor } from './hooks/useTaskExecutor';
import { useAutoInsertToCanvas } from './hooks/useAutoInsertToCanvas';
import { useBeforeUnload } from './hooks/useBeforeUnload';
import { ChatDrawer } from './components/chat-drawer';
import { ChatDrawerProvider, useChatDrawer } from './contexts/ChatDrawerContext';
import { ModelHealthProvider } from './contexts/ModelHealthContext';
import { fontManagerService } from './services/font-manager-service';
import { WorkflowProvider } from './contexts/WorkflowContext';
import { useWorkspace } from './hooks/useWorkspace';
import { workspaceService } from './services/workspace-service';
import { Board as WorkspaceBoard } from './types/workspace.types';
import { toolTestHelper } from './utils/tool-test-helper';
import { ViewNavigation } from './components/view-navigation';
import { AssetProvider } from './contexts/AssetContext';
import { initializeAssetIntegration } from './services/asset-integration-service';
import { ToolbarConfigProvider } from './hooks/use-toolbar-config';
import { AIInputBar } from './components/ai-input-bar';
import { VersionUpdatePrompt } from './components/version-update/version-update-prompt';
import { PerformancePanel } from './components/performance-panel';
import { QuickCreationToolbar } from './components/toolbar/quick-creation-toolbar/quick-creation-toolbar';
import { CacheQuotaProvider } from './components/cache-quota-provider/CacheQuotaProvider';
import { RecentColorsProvider } from './components/unified-color-picker';
import { GitHubSyncProvider } from './contexts/GitHubSyncContext';
import { SyncSettings } from './components/sync-settings';
import { usePencilCursor } from './hooks/usePencilCursor';
import { useToolFromUrl } from './hooks/useToolFromUrl';
import { withArrowLineAutoCompleteExtend } from './plugins/with-arrow-line-auto-complete-extend';
import { AutoCompleteShapePicker } from './components/auto-complete-shape-picker';
import { useAutoCompleteShapePicker } from './hooks/useAutoCompleteShapePicker';
import { ToolWinBoxManager } from './components/toolbox-drawer/ToolWinBoxManager';
import { withDefaultFill } from './plugins/with-default-fill';
import { withGradientFill } from './plugins/with-gradient-fill';
import { API_AUTH_ERROR_EVENT, ApiAuthErrorDetail } from './utils/api-auth-error-event';
import { MessagePlugin } from 'tdesign-react';
import { calculateEditedImagePoints } from './utils/image';

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
      openDialogTypes: new Set(),
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
  const [cloudSyncOpen, setCloudSyncOpen] = useState(false);

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

  // 使用 useCallback 稳定 setAppState 函数引用，支持函数式更新
  const stableSetAppState = useCallback((newAppState: DrawnixState | ((prev: DrawnixState) => DrawnixState)) => {
    if (typeof newAppState === 'function') {
      setAppState(newAppState);
    } else {
      setAppState(newAppState);
    }
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
  // 延迟执行以避免阻塞首屏渲染
  useEffect(() => {
    if (value && value.length > 0) {
      const preloadFonts = () => {
        fontManagerService.preloadBoardFonts(value).then(() => {
          // 字体加载完成后，强制重新渲染
          // PlaitBoard 没有 redraw 方法，字体加载后会自动应用
        }).catch(error => {
          console.warn('Failed to preload board fonts:', error);
        });
      };

      // 延迟字体预加载，优先渲染画布
      if ('requestIdleCallback' in window) {
        (window as Window).requestIdleCallback(preloadFonts, { timeout: 2000 });
      } else {
        setTimeout(preloadFonts, 300);
      }
    }
  }, [value]);

  // Initialize video recovery service to restore expired blob URLs
  // 延迟执行以避免阻塞首屏渲染
  useEffect(() => {
    if (board) {
      const initVideoRecovery = () => {
        import('./services/video-recovery-service').then(({ initVideoRecoveryService }) => {
          initVideoRecoveryService(board);
        });
      };

      if ('requestIdleCallback' in window) {
        (window as Window).requestIdleCallback(initVideoRecovery, { timeout: 3000 });
      } else {
        setTimeout(initVideoRecovery, 500);
      }
    }
  }, [board]);

  // 监听 API 认证错误事件，自动打开设置对话框
  useEffect(() => {
    const handleApiAuthError = (event: Event) => {
      const customEvent = event as CustomEvent<ApiAuthErrorDetail>;
      const { message } = customEvent.detail;
      
      // 显示错误提示
      MessagePlugin.error({
        content: 'API Key 无效或已过期，请重新配置',
        duration: 5000,
      });
      
      console.error('[Drawnix] API auth error:', message);
      
      // 打开设置对话框
      setAppState(prev => ({ ...prev, openSettings: true }));
    };

    window.addEventListener(API_AUTH_ERROR_EVENT, handleApiAuthError);
    return () => {
      window.removeEventListener(API_AUTH_ERROR_EVENT, handleApiAuthError);
    };
  }, []);

  // Handle interrupted WorkZone elements after page refresh
  // Query task status from Service Worker and restore workflow state
  useEffect(() => {
    if (board && value && value.length > 0) {
      const restoreWorkZones = async () => {
        const { WorkZoneTransforms } = await import('./plugins/with-workzone');
        const { shouldUseSWTaskQueue } = await import('./services/task-queue');
        const { TaskStatus } = await import('./types/task.types');

        // In SW mode, initialize SW service (tasks are read directly from IndexedDB)
        let swInitialized = false;
        if (shouldUseSWTaskQueue()) {
          const { swTaskQueueService } = await import('./services/sw-task-queue-service');
          // Wait for SW to be initialized
          swInitialized = await swTaskQueueService.initialize();
        }

        // Query all chat workflows from SW (only if SW is initialized)
        // Now returns ALL workflows including completed ones for proper state sync
        type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
        type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
        let activeChatWorkflows: { id: string; status: string }[] = [];
        let activeWorkflows: Array<{
          id: string;
          status: WorkflowStatus;
          steps: Array<{ id: string; mcp: string; args: Record<string, unknown>; description: string; status: StepStatus; result?: unknown; error?: string; duration?: number }>;
          error?: string;
        }> = [];
        
        if (swInitialized) {
          const { chatWorkflowClient } = await import('./services/sw-channel/chat-workflow-client');
          activeChatWorkflows = await chatWorkflowClient.getAllActiveWorkflows();
          
          // Also query regular workflows
          const { workflowSubmissionService } = await import('./services/workflow-submission-service');
          activeWorkflows = await workflowSubmissionService.queryAllWorkflows();
        }
        
        const activeWorkflowIds = new Set(activeWorkflows.map(w => w.id));
        
        // console.log('[Drawnix] Active chat workflows:', activeChatWorkflows.length, 'regular workflows:', activeWorkflows.length);

        // Now import taskQueueService after sync is complete
        const { taskQueueService } = await import('./services/task-queue');

        const workzones = WorkZoneTransforms.getAllWorkZones(board);

        for (const workzone of workzones) {
          const swWorkflow = activeWorkflows.find(w => w.id === workzone.workflow.id);
          
          // 检查工作流是否已完成，如果是则自动删除 WorkZone
          // 注意：需要确保没有 pending/running 步骤（AI 分析可能会添加后续步骤）
          const workflowStatus = swWorkflow?.status || workzone.workflow.status;
          const stepsToCheck = swWorkflow?.steps || workzone.workflow.steps;
          const hasPendingOrRunningSteps = stepsToCheck.some(
            step => step.status === 'running' || step.status === 'pending' || step.status === 'pending_main_thread'
          );
          
          if (workflowStatus === 'completed' && !hasPendingOrRunningSteps) {
            WorkZoneTransforms.removeWorkZone(board, workzone.id);
            continue;
          }
          
          const hasRunningSteps = workzone.workflow.steps.some(
            step => step.status === 'running' || step.status === 'pending'
          );

          // If we found the workflow in SW, sync the steps list first (for dynamic steps and status)
          // Create a mutable copy of workflow for local use
          let currentWorkflow = { ...workzone.workflow, steps: [...workzone.workflow.steps] };
          
          if (swWorkflow) {
            const needsSync = swWorkflow.steps.length !== currentWorkflow.steps.length || 
                             swWorkflow.status !== currentWorkflow.status;
            
            if (needsSync) {
              // console.log(`[Drawnix] Syncing workflow for WorkZone ${workzone.id}, SW status: ${swWorkflow.status}, steps: ${swWorkflow.steps.length}`);
              WorkZoneTransforms.updateWorkflow(board, workzone.id, {
                steps: swWorkflow.steps,
                status: swWorkflow.status,
                error: swWorkflow.error,
              });
              // Update local reference for the mapping logic below
              currentWorkflow = { ...currentWorkflow, steps: swWorkflow.steps, status: swWorkflow.status };
            }
          }

          if (!hasRunningSteps && !swWorkflow) continue;

          // Check if this workzone's workflow exists in SW (including completed ones)
          // For chat workflows, also get the full workflow object to check actual status
          const chatWorkflow = activeChatWorkflows.find(w => w.id === currentWorkflow.id);
          const isChatWorkflowExists = !!chatWorkflow;
          const isRegularWorkflowExists = activeWorkflowIds.has(currentWorkflow.id);
          const isWorkflowExists = isChatWorkflowExists || isRegularWorkflowExists;
          
          // Check if workflow is still running (not completed/failed)
          const isChatWorkflowRunning = chatWorkflow && 
            chatWorkflow.status !== 'completed' && 
            chatWorkflow.status !== 'failed' && 
            chatWorkflow.status !== 'cancelled';
          const isWorkflowRunning = isChatWorkflowRunning || (swWorkflow && 
            swWorkflow.status !== 'completed' && 
            swWorkflow.status !== 'failed' && 
            swWorkflow.status !== 'cancelled');

          // console.log('[Drawnix] Found interrupted WorkZone:', workzone.id, 'chatExists:', isChatWorkflowExists, 'regularExists:', isRegularWorkflowExists, 'running:', isWorkflowRunning);

          // Update steps based on task queue status
          const updatedSteps = currentWorkflow.steps.map(step => {
            if (step.status !== 'running' && step.status !== 'pending') {
              return step;
            }

            // Get taskId from step result
            const taskId = (step.result as { taskId?: string })?.taskId;
            if (!taskId) {
              // No taskId means it's an AI analyze step or similar
              // For ai_analyze (text model), always keep current status
              // SW will send workflow:status or workflow:stepStatus events to update actual state
              // This prevents incorrectly marking as failed when SW query times out but workflow is still running
              if (step.mcp === 'ai_analyze') {
                // Keep current status - SW event subscription will update if needed
                // If SW workflow failed, we'll receive workflow:failed event
                // If SW workflow completed, we'll receive workflow:completed event
                return step;
              }
              // For media generation steps (generate_image, generate_video, etc.),
              // they may be pending and need to be resumed via fallback engine
              const mediaGenerationSteps = ['generate_image', 'generate_video', 'generate_grid_image', 'generate_inspiration_board'];
              if (mediaGenerationSteps.includes(step.mcp)) {
                // Keep status for fallback engine to resume
                // The WorkZoneContent claim logic will trigger fallback resume
                return step;
              }
              
              // For other steps without taskId (like insert_mindmap, insert_mermaid),
              // they are synchronous and should have completed before refresh
              // If they're still running, mark as failed (pending is ok, will be skipped)
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
                // Task is still running, keep as running
                return step;
              default:
                return step;
            }
          });

          // Check if any steps were updated
          const hasChanges = updatedSteps.some((step, i) =>
            step.status !== currentWorkflow.steps[i]?.status
          );

          if (hasChanges) {
            WorkZoneTransforms.updateWorkflow(board, workzone.id, {
              steps: updatedSteps,
            });
            // console.log('[Drawnix] Restored WorkZone state:', workzone.id);
          }
        }
      };

      // 使用 requestIdleCallback 延迟执行 WorkZone 恢复逻辑
      // 避免阻塞首屏渲染
      const scheduleRestore = () => {
        if ('requestIdleCallback' in window) {
          (window as Window).requestIdleCallback(() => {
            restoreWorkZones().catch(error => {
              console.error('[Drawnix] Failed to restore WorkZones:', error);
            });
          }, { timeout: 2000 }); // 最多延迟 2 秒
        } else {
          // Safari 不支持 requestIdleCallback，使用 setTimeout 兜底
          setTimeout(() => {
            restoreWorkZones().catch(error => {
              console.error('[Drawnix] Failed to restore WorkZones:', error);
            });
          }, 500);
        }
      };

      scheduleRestore();
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
    withPen,
    withMultiResize, // 多选缩放 - 支持 Freehand 和 PenPath 的多选缩放
    buildPencilPlugin(updateAppState),
    buildTextLinkPlugin(updateAppState),
    withVideo,
    withTool,
    withToolResize, // 工具缩放功能 - 拖拽缩放手柄
    withToolFocus, // 工具焦点管理 - 双击编辑
    withWorkZone, // 工作区元素 - 在画布上显示工作流进度
    withArrowLineAutoCompleteExtend, // 自动完成形状选择 - hover 中点时选择下一个节点形状
    withDefaultFill, // 默认填充 - 让新创建的图形有白色填充，方便双击编辑
    withGradientFill, // 渐变填充 - 支持渐变和图片填充渲染
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
  const { saveBoard, createBoard, switchBoard } = useWorkspace();

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

  // 创建新项目并刷新页面（用于释放内存）
  const handleCreateProjectForMemory = useCallback(async () => {
    // 先保存当前画布
    await handleBeforeSwitch();
    
    // 创建新画布
    const newBoard = await createBoard({
      name: '新画布',
    });
    
    if (newBoard) {
      // 切换到新画布
      await switchBoard(newBoard.id);
      
      // 延迟刷新页面，让用户看到切换效果
      setTimeout(() => {
        window.location.reload();
      }, 500);
    }
  }, [handleBeforeSwitch, createBoard, switchBoard]);

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
              <ModelHealthProvider>
                <GitHubSyncProvider>
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
                      cloudSyncOpen={cloudSyncOpen}
                      setCloudSyncOpen={setCloudSyncOpen}
                      handleBeforeSwitch={handleBeforeSwitch}
                      isDataReady={isDataReady}
                      onCreateProjectForMemory={handleCreateProjectForMemory}
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
                </GitHubSyncProvider>
              </ModelHealthProvider>
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
  cloudSyncOpen: boolean;
  setCloudSyncOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleBeforeSwitch: () => Promise<void>;
  isDataReady: boolean;
  onCreateProjectForMemory: () => Promise<void>;
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
  cloudSyncOpen,
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
  setCloudSyncOpen,
  handleBeforeSwitch,
  isDataReady,
  onCreateProjectForMemory,
}) => {
  const { chatDrawerRef } = useChatDrawer();

  // 画笔自定义光标
  usePencilCursor({ board, pointer: appState.pointer });

  // 处理 URL 参数中的工具打开请求
  // 当访问 ?tool=xxx 时，自动以 WinBox 全屏形式打开指定工具并设为常驻
  useToolFromUrl();

  // 快捷工具栏状态
  const [quickToolbarVisible, setQuickToolbarVisible] = useState(false);
  const [quickToolbarPosition, setQuickToolbarPosition] = useState<[number, number] | null>(null);

  // 媒体预览状态
  const [mediaPreviewVisible, setMediaPreviewVisible] = useState(false);
  const [mediaPreviewItems, setMediaPreviewItems] = useState<UnifiedMediaItem[]>([]);
  const [mediaPreviewInitialIndex, setMediaPreviewInitialIndex] = useState(0);

  // 收集画布上所有图片和视频元素
  const collectCanvasMediaItems = useCallback((): { items: UnifiedMediaItem[]; elementIds: string[] } => {
    if (!board || !board.children) return { items: [], elementIds: [] };

    const items: UnifiedMediaItem[] = [];
    const elementIds: string[] = [];

    for (const element of board.children) {
      const url = (element as any).url;
      if (!url || typeof url !== 'string') continue;

      // 检查是否为图片元素
      const isImage = PlaitDrawElement.isDrawElement(element) && PlaitDrawElement.isImage(element);
      // 检查是否为视频元素
      const isVideo = isVideoElement(element);

      if (isImage || isVideo) {
        items.push({
          id: element.id,
          url,
          type: isVideo ? 'video' : 'image',
          title: (element as any).name || undefined,
        });
        elementIds.push(element.id);
      }
    }

    return { items, elementIds };
  }, [board]);

  // 打开媒体预览
  const openMediaPreview = useCallback((targetElementId: string) => {
    const { items, elementIds } = collectCanvasMediaItems();
    if (items.length === 0) return;

    const targetIndex = elementIds.indexOf(targetElementId);
    if (targetIndex === -1) return;

    setMediaPreviewItems(items);
    setMediaPreviewInitialIndex(targetIndex);
    setMediaPreviewVisible(true);
  }, [collectCanvasMediaItems]);

  // 关闭媒体预览
  const closeMediaPreview = useCallback(() => {
    setMediaPreviewVisible(false);
  }, []);

  // 处理图片编辑覆盖保存（内置编辑器回调）
  const handleMediaEditorOverwrite = useCallback(async (editedImageUrl: string, originalItem: UnifiedMediaItem) => {
    const elementId = originalItem.id;
    if (!elementId || !board) return;
    
    try {
      // 导入必要服务
      const { unifiedCacheService } = await import('./services/unified-cache-service');
      const { Transforms } = await import('@plait/core');
      
      const taskId = `edited-image-${Date.now()}`;
      const stableUrl = `/__aitu_cache__/image/${taskId}.png`;
      
      // 将 data URL 转换为 Blob
      const response = await fetch(editedImageUrl);
      const blob = await response.blob();
      
      // 缓存到 Cache API
      await unifiedCacheService.cacheMediaFromBlob(stableUrl, blob, 'image', { taskId });
      
      // 加载图片获取尺寸
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load edited image'));
        img.src = editedImageUrl;
      });
      
      // 找到元素并更新
      const elementIndex = board.children.findIndex(child => child.id === elementId);
      if (elementIndex >= 0) {
        const element = board.children[elementIndex] as any;
        const { newPoints } = await calculateEditedImagePoints(
          {
            url: element.url,
            width: element.width,
            height: element.height,
            points: element.points || [[0, 0], [0, 0]],
          },
          img.naturalWidth,
          img.naturalHeight
        );
        
        Transforms.setNode(board, {
          url: stableUrl,
          width: img.naturalWidth,
          height: img.naturalHeight,
          points: newPoints,
        } as any, [elementIndex]);
      }
    } catch (error) {
      console.error('Failed to update image:', error);
      MessagePlugin.error('更新失败');
    }
  }, [board]);

  // 处理图片编辑插入到画布
  const handleMediaEditorInsert = useCallback(async (editedImageUrl: string) => {
    if (!board) return;
    
    try {
      const { unifiedCacheService } = await import('./services/unified-cache-service');
      const { insertImageFromUrl } = await import('./data/image');
      const { PlaitBoard } = await import('@plait/core');
      
      const taskId = `edited-image-${Date.now()}`;
      const stableUrl = `/__aitu_cache__/image/${taskId}.png`;
      
      // 将 data URL 转换为 Blob
      const response = await fetch(editedImageUrl);
      const blob = await response.blob();
      
      // 缓存到 Cache API
      await unifiedCacheService.cacheMediaFromBlob(stableUrl, blob, 'image', { taskId });
      
      // 加载图片获取尺寸
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load edited image'));
        img.src = editedImageUrl;
      });
      
      // 在当前视口中心位置插入图片
      const origination = getViewportOrigination(board);
      const insertPoint: [number, number] = [
        (origination?.[0] ?? 0) + 100,
        (origination?.[1] ?? 0) + 100
      ];
      
      await insertImageFromUrl(
        board,
        stableUrl,
        insertPoint,
        false,
        { width: img.naturalWidth, height: img.naturalHeight },
        false,
        true
      );
    } catch (error) {
      console.error('Failed to insert image:', error);
      MessagePlugin.error('插入失败');
    }
  }, [board]);

  // 自动完成形状选择器状态
  const {
    state: autoCompleteState,
    selectShape: selectAutoCompleteShape,
    closePicker: closeAutoCompletePicker,
  } = useAutoCompleteShapePicker(board);

  // 监听双击事件 - 处理图片/视频预览和空白区域快捷工具栏
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
      const viewBoxPoint = toViewBoxPoint(board, toHostPoint(board, event.clientX, event.clientY));
      const hitElement = getHitElementByPoint(board, viewBoxPoint);

      // 如果双击了图片或视频元素，打开预览
      if (hitElement) {
        const url = (hitElement as any).url;
        if (url && typeof url === 'string') {
          const isImage = PlaitDrawElement.isDrawElement(hitElement) && PlaitDrawElement.isImage(hitElement);
          const isVideo = isVideoElement(hitElement);

          if (isImage || isVideo) {
            // 打开媒体预览
            openMediaPreview(hitElement.id);
            event.preventDefault();
            event.stopPropagation();
            return;
          }
        }
      }

      // 如果命中了 Plait 元素，或者双击的是工具容器内部（针对 foreignObject 元素）
      const isInsideInteractive = target.closest('.plait-tool-container') || 
                                   target.closest('.plait-workzone-container') ||
                                   target.closest('foreignObject');

      // 只有双击空白区域时才显示快速创建工具栏
      if (!hitElement && !isInsideInteractive) {
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
  }, [board, containerRef, openMediaPreview]);

  // 监听画板点击事件，关闭项目抽屉和工具箱抽屉
  useEffect(() => {
    if (!board) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      // 只处理画布区域内的点击
      const isInsideCanvas = target.closest('.board-host-svg') ||
                             target.closest('.plait-board-container');

      if (!isInsideCanvas) {
        return;
      }

      // 关闭项目抽屉和工具箱抽屉
      if (projectDrawerOpen) {
        setProjectDrawerOpen(false);
      }
      if (toolboxDrawerOpen) {
        setToolboxDrawerOpen(false);
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('click', handleClick);
    }

    return () => {
      if (container) {
        container.removeEventListener('click', handleClick);
      }
    };
  }, [board, containerRef, projectDrawerOpen, toolboxDrawerOpen, setProjectDrawerOpen, setToolboxDrawerOpen]);

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

              // 手动触发 afterChange 以初始化渐变填充等插件
              // listRender.initialize() 不会触发 afterChange，
              // 需要确保 withGradientFill 等依赖 afterChange 的插件逻辑被执行
              if (board.afterChange) {
                board.afterChange();
              }
            }}
          ></Board>
          {/* 多选时的缩放控制点 */}
          <MultiSelectionHandles />
          {/* 统一左侧工具栏 (桌面端和移动端一致) */}
          <UnifiedToolbar
            projectDrawerOpen={projectDrawerOpen}
            onProjectDrawerToggle={handleProjectDrawerToggle}
            toolboxDrawerOpen={toolboxDrawerOpen}
            onToolboxDrawerToggle={handleToolboxDrawerToggle}
            taskPanelExpanded={taskPanelExpanded}
            onTaskPanelToggle={handleTaskPanelToggle}
            onOpenBackupRestore={() => setBackupRestoreOpen(true)}
            onOpenCloudSync={() => setCloudSyncOpen(true)}
          />

          <PopupToolbar></PopupToolbar>
          <LinkPopup></LinkPopup>
          <ClosePencilToolbar></ClosePencilToolbar>
          <PencilSettingsToolbar></PencilSettingsToolbar>
          <PenSettingsToolbar></PenSettingsToolbar>
          <EraserSettingsToolbar></EraserSettingsToolbar>
          {appState.openDialogTypes.size > 0 && (
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
                onBeforeImport={async () => {
                  // 导入前先保存当前画板数据到 IndexedDB
                  if (handleBeforeSwitch) {
                    await handleBeforeSwitch();
                  }
                }}
                onSwitchBoard={async (boardId, viewport) => {
                  // 注意：这里不调用 handleBeforeSwitch
                  // 因为在备份恢复时，onBeforeImport 已经保存了当前画板
                  // 如果在这里再保存，会用旧的内存数据覆盖 IndexedDB 中刚合并的新数据
                  
                  // 切换到目标画板（使用已导入的 workspaceService 单例，确保数据一致性）
                  const board = await workspaceService.switchBoard(boardId);
                  if (board && onBoardSwitch) {
                    // 如果有 viewport，合并到 board 中
                    if (viewport) {
                      board.viewport = viewport;
                    }
                    onBoardSwitch(board);
                  }
                }}
              />
            </Suspense>
          )}
          {/* Cloud Sync Settings - 云端同步设置 */}
          <SyncSettings
            visible={cloudSyncOpen}
            onClose={() => setCloudSyncOpen(false)}
          />
          {/* Quick Creation Toolbar - 双击空白区域显示的快捷工具栏 */}
          <QuickCreationToolbar
            position={quickToolbarPosition}
            visible={quickToolbarVisible}
            onClose={() => setQuickToolbarVisible(false)}
          />
          {/* Media Viewer - 画布图片/视频预览（支持内置编辑模式） */}
          <UnifiedMediaViewer
            visible={mediaPreviewVisible}
            items={mediaPreviewItems}
            initialIndex={mediaPreviewInitialIndex}
            onClose={closeMediaPreview}
            showThumbnails={true}
            useBuiltInEditor={true}
            showEditOverwrite={true}
            onEditOverwrite={handleMediaEditorOverwrite}
            onEditInsert={handleMediaEditorInsert}
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
          <ToolWinBoxManager />
        </Wrapper>
        <ActiveTaskWarning />
        {/* Performance Panel - 性能监控面板 */}
        <PerformancePanel 
          container={containerRef.current} 
          onCreateProject={onCreateProjectForMemory}
          elements={board?.children || value}
        />
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
