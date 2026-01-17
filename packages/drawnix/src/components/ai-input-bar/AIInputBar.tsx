/**
 * AI Input Bar Component
 *
 * A floating input bar at the bottom center of the canvas for AI generation.
 * Similar to mixboard.google.com's interaction pattern.
 *
 * Features:
 * - Single row horizontal layout
 * - Orange theme border
 * - Text input for prompts
 * - Selected images display
 * - Model dropdown selector in bottom-left corner
 * - Send button to trigger generation
 * - Integration with ChatDrawer for conversation display
 * - Agent mode: AI decides which MCP tool to use (image/video generation)
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Send, Check, ImagePlus } from 'lucide-react';
import { useBoard } from '@plait-board/react-board';
import { SelectedContentPreview } from '../shared/SelectedContentPreview';
import { getSelectedElements, ATTACHED_ELEMENT_CLASS_NAME, getRectangleByElements, PlaitBoard, getViewportOrigination, PlaitElement } from '@plait/core';
import { useI18n } from '../../i18n';
import { TaskStatus } from '../../types/task.types';
import { taskQueueService } from '../../services/task-queue';
import { processSelectedContentForAI, scrollToPointIfNeeded } from '../../utils/selection-utils';
import { useTextSelection } from '../../hooks/useTextSelection';
import { useChatDrawerControl } from '../../contexts/ChatDrawerContext';
import { useAssets } from '../../contexts/AssetContext';
import { AssetType, AssetSource } from '../../types/asset.types';
import { ModelDropdown } from './ModelDropdown';
import { SizeDropdown } from './SizeDropdown';
import { PromptHistoryPopover } from './PromptHistoryPopover';
import { usePromptHistory } from '../../hooks/usePromptHistory';
import { getDefaultImageModel, IMAGE_MODELS, getModelConfig, getDefaultSizeForModel } from '../../constants/model-config';
import { BUILT_IN_TOOLS, DEFAULT_TOOL_CONFIG } from '../../constants/built-in-tools';
import { initializeMCP, mcpRegistry } from '../../mcp';
import { setCanvasBoard } from '../../services/canvas-operations/canvas-insertion';
import { setBoard } from '../../mcp/tools/shared';
import { setCapabilitiesBoard } from '../../services/sw-capabilities/handler';
import { initializeLongVideoChainService } from '../../services/long-video-chain-service';
import { gridImageService } from '../../services/photo-wall';
import type { MCPTaskResult } from '../../mcp/types';
import { parseAIInput, type GenerationType } from '../../utils/ai-input-parser';
import { convertToWorkflow, type WorkflowDefinition, type WorkflowStepOptions } from './workflow-converter';
import { useWorkflowControl } from '../../contexts/WorkflowContext';
import { geminiSettings } from '../../utils/settings-manager';
import type { WorkflowMessageData } from '../../types/chat.types';
import { analytics } from '../../utils/posthog-analytics';
import classNames from 'classnames';
import { InspirationBoard } from '../inspiration-board';
import './ai-input-bar.scss';

import type { WorkflowRetryContext, PostProcessingStatus } from '../../types/chat.types';
import { workflowCompletionService } from '../../services/workflow-completion-service';
import { BoardTransforms } from '@plait/core';
import { WorkZoneTransforms } from '../../plugins/with-workzone';
import { ToolTransforms } from '../../plugins/with-tool';
import type { PlaitWorkZone } from '../../types/workzone.types';
import { useWorkflowSubmission } from '../../hooks/useWorkflowSubmission';

/**
 * 将 WorkflowDefinition 转换为 WorkflowMessageData
 * @param workflow 工作流定义
 * @param retryContext 可选的重试上下文
 * @param postProcessingStatus 后处理状态
 * @param insertedCount 插入数量
 */
function toWorkflowMessageData(
  workflow: WorkflowDefinition,
  retryContext?: WorkflowRetryContext,
  postProcessingStatus?: PostProcessingStatus,
  insertedCount?: number
): WorkflowMessageData {
  // Safely access metadata with defaults
  const metadata = workflow.metadata || {};
  
  return {
    id: workflow.id,
    name: workflow.name,
    generationType: workflow.generationType,
    prompt: metadata.prompt || retryContext?.aiContext?.finalPrompt || '',
    aiAnalysis: workflow.aiAnalysis,
    count: metadata.count,
    steps: workflow.steps.map(step => ({
      id: step.id,
      description: step.description,
      status: step.status,
      mcp: step.mcp,
      args: step.args,
      result: step.result,
      error: step.error,
      duration: step.duration,
      options: step.options,
    })),
    retryContext,
    postProcessingStatus,
    insertedCount,
  };
}

// 初始化 MCP 模块和长视频链服务
let mcpInitialized = false;
if (!mcpInitialized) {
  initializeMCP();
  initializeLongVideoChainService();
  mcpInitialized = true;
}

// 选中内容类型：图片、视频、图形、文字
type SelectedContentType = 'image' | 'video' | 'graphics' | 'text';

interface SelectedContent {
  type: SelectedContentType;
  url?: string;       // 图片/视频/图形的 URL
  text?: string;      // 文字内容
  name: string;       // 显示名称
  width?: number;     // 图片/视频宽度
  height?: number;    // 图片/视频高度
}

/**
 * 检查 URL 是否为视频
 */
function isVideoUrl(url: string): boolean {
  if (!url) return false;
  const lowerUrl = url.toLowerCase();
  
  // 检查 #video 标识符
  if (lowerUrl.includes('#video')) {
    return true;
  }
  
  // 检查视频扩展名
  const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v', '.flv', '.wmv'];
  return videoExtensions.some(ext => lowerUrl.includes(ext));
}

interface AIInputBarProps {
  className?: string;
  /** 数据是否已准备好（用于判断画布是否为空） */
  isDataReady?: boolean;
}

/**
 * 独立的选择内容监听组件
 * 将 useBoard 隔离在这个组件中，避免 board context 变化导致主组件重渲染
 */
const SelectionWatcher: React.FC<{
  language: string;
  onSelectionChange: (content: SelectedContent[]) => void;
  /** 用于存储 board 引用的 ref，供父组件使用 */
  externalBoardRef?: React.MutableRefObject<any>;
  /** 画板空状态变化回调 */
  onCanvasEmptyChange?: (isEmpty: boolean) => void;
  /** 数据是否已准备好 */
  isDataReady?: boolean;
}> = React.memo(({ language, onSelectionChange, externalBoardRef, onCanvasEmptyChange, isDataReady }) => {
  const board = useBoard();
  const boardRef = useRef(board);
  boardRef.current = board;

  // 设置 canvas board 引用给 MCP 工具使用
  useEffect(() => {
    setCanvasBoard(board);
    setBoard(board);
    setCapabilitiesBoard(board);
    gridImageService.setBoard(board);
    // 同时设置外部 ref
    if (externalBoardRef) {
      externalBoardRef.current = board;
    }
    return () => {
      setCanvasBoard(null);
      setBoard(null);
      setCapabilitiesBoard(null);
      gridImageService.setBoard(null);
      if (externalBoardRef) {
        externalBoardRef.current = null;
      }
    };
  }, [board, externalBoardRef]);

  // 监听画板元素数量变化，通知父组件画板是否为空
  const onCanvasEmptyChangeRef = useRef(onCanvasEmptyChange);
  onCanvasEmptyChangeRef.current = onCanvasEmptyChange;

  useEffect(() => {
    if (!board || !onCanvasEmptyChangeRef.current) return;

    // 只有在数据准备好后才检查是否为空
    if (!isDataReady) {
      return;
    }

    // 检查画布是否为空
    const checkEmpty = () => {
      const elements = board.children || [];
      onCanvasEmptyChangeRef.current?.(elements.length === 0);
    };



    // 定期检查（因为 Plait 的数据变化可能不会触发 DOM 变化）
    const interval = setInterval(checkEmpty, 500);

    return () => {
      clearInterval(interval);
    };
  }, [board, isDataReady]);

  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  useEffect(() => {
    const handleSelectionChange = async () => {
      const currentBoard = boardRef.current;
      if (!currentBoard) return;
      
      const selectedElements = getSelectedElements(currentBoard);
      
      if (selectedElements.length === 0) {
        onSelectionChangeRef.current([]);
        return;
      }

      try {
        const processedContent = await processSelectedContentForAI(currentBoard);
        const content: SelectedContent[] = [];

        if (processedContent.graphicsImage) {
          content.push({
            url: processedContent.graphicsImage,
            name: language === 'zh' ? '图形元素' : 'Graphics',
            type: 'graphics',
            // 使用异步获取的图形图片尺寸
            width: processedContent.graphicsImageDimensions?.width,
            height: processedContent.graphicsImageDimensions?.height,
          });
        }

        for (const img of processedContent.remainingImages) {
          const imgUrl = img.url || '';
          const isVideo = isVideoUrl(imgUrl);
          
          content.push({
            url: imgUrl,
            name: img.name || (isVideo ? `video-${Date.now()}` : `image-${Date.now()}`),
            type: isVideo ? 'video' : 'image',
            width: img.width,
            height: img.height,
          });
        }

        if (processedContent.remainingText && processedContent.remainingText.trim()) {
          content.push({
            type: 'text',
            text: processedContent.remainingText.trim(),
            name: language === 'zh' ? '文字内容' : 'Text Content',
          });
        }

        onSelectionChangeRef.current(content);
      } catch (error) {
        console.error('Failed to process selected content:', error);
        onSelectionChangeRef.current([]);
      }
    };

    handleSelectionChange();

    const handleMouseUp = () => {
      setTimeout(handleSelectionChange, 50);
    };
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [language]);

  return null; // 这个组件不渲染任何内容
});

SelectionWatcher.displayName = 'SelectionWatcher';

export const AIInputBar: React.FC<AIInputBarProps> = React.memo(({ className, isDataReady }) => {
  // console.log('[AIInputBar] Component rendering');

  const { language } = useI18n();

  const chatDrawerControl = useChatDrawerControl();
  const workflowControl = useWorkflowControl();
  const { addHistory: addPromptHistory } = usePromptHistory();
  const { addAsset } = useAssets();
  // 使用 ref 存储，避免依赖变化
  const sendWorkflowMessageRef = useRef(chatDrawerControl.sendWorkflowMessage);
  sendWorkflowMessageRef.current = chatDrawerControl.sendWorkflowMessage;
  const updateWorkflowMessageRef = useRef(chatDrawerControl.updateWorkflowMessage);
  updateWorkflowMessageRef.current = chatDrawerControl.updateWorkflowMessage;
  const appendAgentLogRef = useRef(chatDrawerControl.appendAgentLog);
  appendAgentLogRef.current = chatDrawerControl.appendAgentLog;
  const updateThinkingContentRef = useRef(chatDrawerControl.updateThinkingContent);
  updateThinkingContentRef.current = chatDrawerControl.updateThinkingContent;
  const setSelectedContentRef = useRef(chatDrawerControl.setSelectedContent);
  setSelectedContentRef.current = chatDrawerControl.setSelectedContent;
  const registerRetryHandlerRef = useRef(chatDrawerControl.registerRetryHandler);
  registerRetryHandlerRef.current = chatDrawerControl.registerRetryHandler;

  // 当前工作流的重试上下文（用于在更新时保持 retryContext）
  const currentRetryContextRef = useRef<WorkflowRetryContext | null>(null);

  // 当前 WorkZone 元素 ID（用于在画布上显示工作流进度）
  const currentWorkZoneIdRef = useRef<string | null>(null);

  // State
  const [prompt, setPrompt] = useState('');
  const [selectedContent, setSelectedContent] = useState<SelectedContent[]>([]); // 画布选中内容
  const [uploadedContent, setUploadedContent] = useState<SelectedContent[]>([]); // 用户上传内容
  const [isSubmitting, setIsSubmitting] = useState(false); // 防止快速重复点击（3秒防抖）
  const submitCooldownRef = useRef<NodeJS.Timeout | null>(null); // 提交冷却定时器
  const [isFocused, setIsFocused] = useState(false);
  const [isCanvasEmpty, setIsCanvasEmpty] = useState<boolean | null>(null); // null=加载中, true=空, false=有内容
  // 当前选中的图片模型（通过环境变量或默认值初始化）
  const [selectedModel, setSelectedModel] = useState(getDefaultImageModel);
  // 当前选中的尺寸（默认为模型的默认尺寸）
  const [selectedSize, setSelectedSize] = useState(() => getDefaultSizeForModel(getDefaultImageModel()));

  // @ 触发模型选择相关状态
  const [showAtSuggestion, setShowAtSuggestion] = useState(false);
  const [atQuery, setAtQuery] = useState(''); // @ 后面的查询文本
  const [atHighlightIndex, setAtHighlightIndex] = useState(0); // 当前高亮的选项索引
  const atSuggestionRef = useRef<HTMLDivElement>(null);

  // 合并画布选中内容和用户上传内容
  const allContent = useMemo(() => {
    return [...uploadedContent, ...selectedContent];
  }, [uploadedContent, selectedContent]);

  // 点击外部关闭输入框的展开状态
  useEffect(() => {
    if (!isFocused) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // 检查点击是否在 AIInputBar 容器外部
      if (containerRef.current && !containerRef.current.contains(target)) {
        setIsFocused(false);
      }
    };

    // 使用 mousedown 而不是 click，以便在失焦前处理
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isFocused]);

  // 清理提交冷却定时器
  useEffect(() => {
    return () => {
      if (submitCooldownRef.current) {
        clearTimeout(submitCooldownRef.current);
      }
    };
  }, []);

  // 监听 AI 生成完成事件（思维导图、流程图等同步操作）
  useEffect(() => {
    const handleGenerationComplete = (event: CustomEvent) => {
      // console.log('[AIInputBar] ai-generation-complete event received:', event.detail);
      // 立即重置提交状态，允许用户继续输入
      if (submitCooldownRef.current) {
        clearTimeout(submitCooldownRef.current);
        submitCooldownRef.current = null;
      }
      setIsSubmitting(false);
    };

    window.addEventListener('ai-generation-complete', handleGenerationComplete as EventListener);
    return () => {
      window.removeEventListener('ai-generation-complete', handleGenerationComplete as EventListener);
    };
  }, []);

  // 监听任务状态变化，同步更新工作流步骤状态
  useEffect(() => {
    const subscription = taskQueueService.observeTaskUpdates().subscribe((event) => {
      const task = event.task;
      const workflow = workflowControl.getWorkflow();

      if (!workflow) return;

      // 查找与此任务关联的步骤
      const step = workflow.steps.find((s) => {
        const result = s.result as { taskId?: string } | undefined;
        return result?.taskId === task.id;
      });

      if (!step) return;

      // 根据任务状态更新步骤状态
      let newStatus: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' = step.status;
      let stepResult = step.result;
      let stepError = step.error;

      switch (task.status) {
        case TaskStatus.PENDING:
        case TaskStatus.PROCESSING:
          newStatus = 'running';
          break;
        case TaskStatus.COMPLETED:
          newStatus = 'completed';
          // 添加任务结果信息
          stepResult = {
            ...(typeof stepResult === 'object' ? stepResult : {}),
            taskId: task.id,
            result: task.result,
          };
          break;
        case TaskStatus.FAILED:
          newStatus = 'failed';
          stepError = task.error?.message || '任务执行失败';
          break;
        case TaskStatus.CANCELLED:
          newStatus = 'skipped';
          break;
      }

      // 只有状态变化时才更新
      if (newStatus !== step.status) {
        workflowControl.updateStep(step.id, newStatus, stepResult, stepError);

        // 如果步骤失败，将同批次中其他 running 状态的步骤标记为 skipped
        if (newStatus === 'failed') {
          const stepBatchId = step.options?.batchId;
          if (stepBatchId) {
            workflow.steps.forEach((s) => {
              if (s.id !== step.id && s.options?.batchId === stepBatchId && s.status === 'running') {
                workflowControl.updateStep(s.id, 'skipped', undefined, '前置任务失败');
              }
            });
          }
        }

        // 同步更新 ChatDrawer 中的工作流消息
        const updatedWorkflow = workflowControl.getWorkflow();
        if (updatedWorkflow) {
          const workflowData = toWorkflowMessageData(updatedWorkflow, currentRetryContextRef.current || undefined);
          updateWorkflowMessageRef.current(workflowData);

          // 同步更新 WorkZone（如果存在）
          const workZoneId = currentWorkZoneIdRef.current;
          const board = SelectionWatcherBoardRef.current;
          if (workZoneId && board) {
            WorkZoneTransforms.updateWorkflow(board, workZoneId, workflowData);
          }
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [workflowControl]);

  // 当前后处理状态 ref
  const postProcessingStatusRef = useRef<PostProcessingStatus | undefined>(undefined);
  const insertedCountRef = useRef<number | undefined>(undefined);

  // 监听后处理完成事件（图片拆分、插入画布等）
  useEffect(() => {
    const subscription = workflowCompletionService.observeCompletionEvents().subscribe((event) => {
      const workflow = workflowControl.getWorkflow();
      
      // 查找与此任务关联的步骤（即使 workflow 为 null 也继续处理 postProcessingCompleted）
      const step = workflow?.steps.find((s) => {
        const result = s.result as { taskId?: string } | undefined;
        return result?.taskId === event.taskId;
      });

      // 更新后处理状态
      let newPostProcessingStatus: PostProcessingStatus | undefined;
      let newInsertedCount: number | undefined;

      switch (event.type) {
        case 'postProcessingStarted':
          newPostProcessingStatus = 'processing';
          break;
        case 'postProcessingCompleted':
          newPostProcessingStatus = 'completed';
          newInsertedCount = event.result.insertedCount;
          break;
        case 'postProcessingFailed':
          newPostProcessingStatus = 'failed';
          break;
      }

      // 保存状态到 ref
      postProcessingStatusRef.current = newPostProcessingStatus;
      if (newInsertedCount !== undefined) {
        insertedCountRef.current = (insertedCountRef.current || 0) + newInsertedCount;
      }

      // 同步更新 ChatDrawer 中的工作流消息（仅当 workflow 和 step 都存在时）
      if (workflow && step) {
        const updatedWorkflow = workflowControl.getWorkflow();
        if (updatedWorkflow) {
          const workflowData = toWorkflowMessageData(
            updatedWorkflow,
            currentRetryContextRef.current || undefined,
            newPostProcessingStatus,
            insertedCountRef.current
          );
          updateWorkflowMessageRef.current(workflowData);

          // 同步更新 WorkZone（如果存在）
          const workZoneId = currentWorkZoneIdRef.current;
          const board = SelectionWatcherBoardRef.current;
          if (workZoneId && board) {
            WorkZoneTransforms.updateWorkflow(board, workZoneId, workflowData);
          }
        }
      }

      // 如果后处理完成，执行后续操作
      // 注意：即使找不到 workflow 或 step，也要删除 WorkZone（通过 currentWorkZoneIdRef）
      if (event.type === 'postProcessingCompleted') {
        const position = event.result.firstElementPosition;

        // 立即重置提交状态，允许用户继续输入
        // console.log('[AIInputBar] postProcessingCompleted: resetting isSubmitting');
        if (submitCooldownRef.current) {
          clearTimeout(submitCooldownRef.current);
          submitCooldownRef.current = null;
        }
        setIsSubmitting(false);

        // 关闭 ChatDrawer（如果是由 AIInputBar 触发的对话）
        // 注意：这里使用 setTimeout 确保消息更新后再关闭
        setTimeout(() => {
          chatDrawerControl.closeChatDrawer();

          // 删除 WorkZone（因为图片已经插入画布）
          const workZoneId = currentWorkZoneIdRef.current;
          const board = SelectionWatcherBoardRef.current;
          if (workZoneId && board) {
            WorkZoneTransforms.removeWorkZone(board, workZoneId);
            currentWorkZoneIdRef.current = null;
            // console.log('[AIInputBar] Removed WorkZone after completion:', workZoneId);
          }

          // 滚动画布到插入元素的位置
          if (position) {
            if (board) {
              // 计算新的视口原点，使元素位于视口中心
              const containerRect = board.host?.getBoundingClientRect();
              if (containerRect) {
                const zoom = board.viewport.zoom;
                const newOriginationX = position[0] - containerRect.width / (2 * zoom);
                const newOriginationY = position[1] - containerRect.height / (2 * zoom);
                BoardTransforms.updateViewport(board, [newOriginationX, newOriginationY], zoom);
              }
            }
          }
        }, 500);

        // 重置状态
        postProcessingStatusRef.current = undefined;
        insertedCountRef.current = undefined;
      }
    });

    return () => subscription.unsubscribe();
  }, [workflowControl, chatDrawerControl]);

  // 保存 board 引用供后处理完成后使用
  const SelectionWatcherBoardRef = useRef<any>(null);

  // 使用 SW 工作流提交 Hook
  const {
    submitWorkflow: submitWorkflowToSW,
  } = useWorkflowSubmission({
    boardRef: SelectionWatcherBoardRef,
    workZoneIdRef: currentWorkZoneIdRef,
    useSWExecution: true, // 启用 SW 执行
  });

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 使用自定义 hook 处理文本选择和复制，同时阻止事件冒泡
  useTextSelection(inputRef, {
    enableCopy: true,
    stopPropagation: true,
  });

  // 处理灵感模版选择：将提示词替换到输入框
  const handleSelectInspirationPrompt = useCallback((inspirationPrompt: string) => {
    setPrompt(inspirationPrompt);
    inputRef.current?.focus();
  }, []);

  // 处理历史提示词选择：将提示词回填到输入框
  const handleSelectHistoryPrompt = useCallback((content: string) => {
    setPrompt(content);
    inputRef.current?.focus();
  }, []);

  // 处理打开提示词工具（香蕉提示词）- 复用工具箱的逻辑
  const handleOpenPromptTool = useCallback(() => {
    const board = SelectionWatcherBoardRef.current;
    if (!board) {
      console.warn('[AIInputBar] Board not ready for prompt tool');
      return;
    }

    // 从内置工具列表中获取香蕉提示词工具配置
    const tool = BUILT_IN_TOOLS.find(t => t.id === 'banana-prompt');
    if (!tool) {
      console.warn('[AIInputBar] Banana prompt tool not found');
      return;
    }

    // 计算画布中心位置（与 ToolboxDrawer 相同的逻辑）
    const boardContainerRect = PlaitBoard.getBoardContainer(board).getBoundingClientRect();
    const focusPoint = [
      boardContainerRect.width / 2,
      boardContainerRect.height / 2,
    ];
    const zoom = board.viewport.zoom;
    const origination = getViewportOrigination(board);
    const centerX = origination![0] + focusPoint[0] / zoom;
    const centerY = origination![1] + focusPoint[1] / zoom;

    // 工具尺寸
    const width = tool.defaultWidth || DEFAULT_TOOL_CONFIG.defaultWidth;
    const height = tool.defaultHeight || DEFAULT_TOOL_CONFIG.defaultHeight;

    // 插入到画布（中心对齐）
    ToolTransforms.insertTool(
      board,
      tool.id,
      tool.url,
      [centerX - width / 2, centerY - height / 2],
      { width, height },
      {
        name: tool.name,
        category: tool.category,
        permissions: tool.permissions,
      }
    );

    // console.log('[AIInputBar] Prompt tool inserted to canvas');
  }, []);

  // 处理上传按钮点击
  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // 将文件转换为 base64 data URL 并获取尺寸
  const fileToBase64WithDimensions = useCallback((file: File): Promise<{ url: string; width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64Url = reader.result as string;
        // 创建 Image 对象获取尺寸
        const img = new Image();
        img.onload = () => {
          resolve({
            url: base64Url,
            width: img.naturalWidth,
            height: img.naturalHeight,
          });
        };
        img.onerror = () => {
          // 即使获取尺寸失败，也返回 URL（尺寸为 0）
          resolve({ url: base64Url, width: 0, height: 0 });
        };
        img.src = base64Url;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }, []);

  // 处理文件选择
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // 处理选中的文件（转换为 base64 并获取尺寸）
    const newContent: SelectedContent[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // 只处理图片文件
      if (!file.type.startsWith('image/')) continue;

      // Add to asset library (async, don't block UI)
      addAsset(file, AssetType.IMAGE, AssetSource.LOCAL, file.name).catch((err) => {
        console.warn('[AIInputBar] Failed to add asset to library:', err);
      });

      try {
        // 转换为 base64 data URL 并获取尺寸
        const { url, width, height } = await fileToBase64WithDimensions(file);
        newContent.push({
          type: 'image',
          url,
          name: file.name || `上传图片 ${i + 1}`,
          width: width || undefined,
          height: height || undefined,
        });
      } catch (error) {
        console.error('Failed to convert file to base64:', error);
      }
    }

    if (newContent.length > 0) {
      // 追加到用户上传内容（独立于画布选中内容）
      setUploadedContent(prev => [...prev, ...newContent]);
    }

    // 重置 input 以便可以再次选择相同文件
    e.target.value = '';
  }, [fileToBase64WithDimensions, addAsset]);

  // 处理选择变化的回调（由 SelectionWatcher 调用）
  const handleSelectionChange = useCallback((content: SelectedContent[]) => {
    setSelectedContent(content);
  }, []);

  // 处理删除上传的图片（index 是在 allContent 中的索引）
  const handleRemoveUploadedContent = useCallback((index: number) => {
    // allContent = [...uploadedContent, ...selectedContent]
    // 所以 index < uploadedContent.length 表示是上传的内容
    if (index < uploadedContent.length) {
      setUploadedContent(prev => prev.filter((_, i) => i !== index));
    }
  }, [uploadedContent.length]);

  // 同步 allContent 到 ChatDrawer Context
  useEffect(() => {
    setSelectedContentRef.current(allContent.map(c => ({
      type: c.type,
      url: c.url,
      text: c.text,
      name: c.name,
    })));
  }, [allContent]);

  // 处理模型选择（从下拉菜单）
  const handleModelSelect = useCallback((modelId: string) => {
    analytics.track('ai_input_change_model_dropdown', { model: modelId });
    setSelectedModel(modelId);
  }, []);

  // 过滤模型列表（根据 @ 后的查询文本）
  const filteredModels = useMemo(() => {
    if (!atQuery) return IMAGE_MODELS;
    const query = atQuery.toLowerCase();
    return IMAGE_MODELS.filter(model =>
      (model.shortCode?.toLowerCase().includes(query)) ||
      (model.shortLabel?.toLowerCase().includes(query)) ||
      (model.label.toLowerCase().includes(query))
    );
  }, [atQuery]);

  // 检测输入中的 @ 触发
  const detectAtTrigger = useCallback((text: string, cursorPos: number) => {
    // 从光标位置往前找 @
    let atPos = -1;
    for (let i = cursorPos - 1; i >= 0; i--) {
      const char = text[i];
      // 遇到空格或换行，停止搜索
      if (char === ' ' || char === '\n') break;
      // 找到 @
      if (char === '@') {
        atPos = i;
        break;
      }
    }

    if (atPos >= 0) {
      // 提取 @ 后面的查询文本
      const query = text.slice(atPos + 1, cursorPos);
      setAtQuery(query);
      setShowAtSuggestion(true);
      setAtHighlightIndex(0);
    } else {
      setShowAtSuggestion(false);
      setAtQuery('');
    }
  }, []);

  // 处理输入变化
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setPrompt(newValue);

    // 检测 @ 触发
    const cursorPos = e.target.selectionStart || 0;
    detectAtTrigger(newValue, cursorPos);
  }, [detectAtTrigger]);

  // 处理 @ 选择模型
  const handleAtSelectModel = useCallback((modelId: string) => {
    // 从 prompt 中移除 @query
    const textarea = inputRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart || 0;
    const text = prompt;

    // 找到 @ 的位置
    let atPos = -1;
    for (let i = cursorPos - 1; i >= 0; i--) {
      if (text[i] === '@') {
        atPos = i;
        break;
      }
      if (text[i] === ' ' || text[i] === '\n') break;
    }

    if (atPos >= 0) {
      // 移除 @query 部分
      const newText = text.slice(0, atPos) + text.slice(cursorPos);
      setPrompt(newText);
    }

    // 选择模型
    setSelectedModel(modelId);
    setShowAtSuggestion(false);
    setAtQuery('');

    // 保持焦点在输入框
    textarea.focus();
  }, [prompt]);

  // Handle generation
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() && allContent.length === 0) return;
    if (isSubmitting) {
      return; // 仅防止快速重复点击
    }

    setIsSubmitting(true);

    try {
      // 构建选中元素的分类信息（使用合并后的 allContent）
      // 收集图片和图形的尺寸信息（按顺序：先 images，后 graphics）
      const imageItems = allContent.filter((item) => item.type === 'image' && item.url);
      const graphicsItems = allContent.filter((item) => item.type === 'graphics' && item.url);
      const imageDimensions = [...imageItems, ...graphicsItems]
        .map((item) => {
          if (item.width && item.height) {
            return { width: item.width, height: item.height };
          }
          return undefined;
        })
        .filter((dim): dim is { width: number; height: number } => dim !== undefined);

      const selection = {
        texts: allContent
          .filter((item) => item.type === 'text' && item.text)
          .map((item) => item.text!),
        images: imageItems.map((item) => item.url!),
        videos: allContent
          .filter((item) => item.type === 'video' && item.url)
          .map((item) => item.url!),
        graphics: graphicsItems.map((item) => item.url!),
        // 添加图片尺寸信息（始终传递数组，避免下游处理 undefined）
        imageDimensions: imageDimensions,
      };

      // 解析输入内容，使用选中的模型和尺寸
      const parsedParams = parseAIInput(prompt, selection, { modelId: selectedModel, size: selectedSize });

      // 收集所有参考媒体（图片 + 图形 + 视频）
      const referenceImages = [...selection.images, ...selection.graphics];

      // 创建工作流定义（仅用于 WorkZone 显示，实际工作流由 submitWorkflowToSW 创建）
      const workflow = convertToWorkflow(parsedParams, referenceImages);

      // 注意：不在这里调用 workflowControl.startWorkflow，由 submitWorkflowToSW 统一处理
      // 避免重复创建工作流导致多次请求

      // 在画布上创建 WorkZone 显示工作流进度
      const board = SelectionWatcherBoardRef.current;
      // console.log('[AIInputBar] Board ref:', board ? 'exists' : 'null');
      if (board) {
        // WorkZone 固定尺寸（画布坐标）
        // 因为容器已经应用了 scale(1/zoom)，所以这里不需要除以 zoom
        const WORKZONE_WIDTH = 360;
        const WORKZONE_HEIGHT = 240;
        const GAP = 50; // 间距

        const containerRect = board.host?.getBoundingClientRect();
        const zoom = board.viewport?.zoom || 1;
        const originX = board.viewport?.origination?.[0] || 0;
        const originY = board.viewport?.origination?.[1] || 0;

        // 获取所有非 WorkZone 元素
        const allElements = board.children.filter(
          (el: { type?: string }) => el.type !== 'workzone'
        );

        // 初始化默认值（视口中心）
        const viewportCenterX = originX + (containerRect?.width || 0) / 2 / zoom;
        const viewportCenterY = originY + (containerRect?.height || 0) / 2 / zoom;

        let expectedInsertLeftX: number = viewportCenterX - 200; // 插入元素的左边缘X坐标（默认偏左一点）
        let expectedInsertY: number = viewportCenterY;
        let workzoneX: number = expectedInsertLeftX;
        let workzoneY: number = viewportCenterY - WORKZONE_HEIGHT / 2;
        let positionStrategy = 'viewport-center'; // 用于日志

        if (allElements.length > 0) {
          // 获取选中的元素
          const selectedElements = getSelectedElements(board);
          let positionCalculated = false;

          // 策略1: 优先放在选中元素下方（如果有选中）
          if (selectedElements.length > 0) {
            try {
              const selectedRect = getRectangleByElements(board, selectedElements, false);
              const selectedBottomY = selectedRect.y + selectedRect.height;

              // console.log('[AIInputBar] === Strategy 1: Below Selected Elements ===');
              // console.log('[AIInputBar] Selected elements count:', selectedElements.length);
              // console.log('[AIInputBar] Selected rect:', selectedRect);
              // console.log('[AIInputBar] Selected bottom Y:', selectedBottomY);

              // 直接放在选中元素下方，不检查视口空间
              // 因为我们有滚动功能，可以滚动到 WorkZone 位置
              expectedInsertLeftX = selectedRect.x; // 左对齐
              expectedInsertY = selectedBottomY + GAP;
              workzoneX = expectedInsertLeftX;
              workzoneY = expectedInsertY;
              positionStrategy = 'below-selected';
              positionCalculated = true;

              // console.log('[AIInputBar] ✓ Using strategy: below selected elements');
              // console.log('[AIInputBar] WorkZone will be at:', [workzoneX, workzoneY]);
            } catch (error) {
              console.warn('[AIInputBar] Failed to calculate position for selected elements:', error);
            }
          } else {
            // console.log('[AIInputBar] No selected elements, will use strategy 2');
          }

          // 策略2: 如果策略1未成功，放在最底部元素下方
          if (!positionCalculated) {
            // console.log('[AIInputBar] === Strategy 2: Below Bottommost Element ===');

            let bottommostElement: PlaitElement | null = null;
            let maxBottomY = -Infinity;

            for (const element of allElements) {
              try {
                const rect = getRectangleByElements(board, [element as PlaitElement], false);
                const bottomY = rect.y + rect.height;
                if (bottomY > maxBottomY) {
                  maxBottomY = bottomY;
                  bottommostElement = element as PlaitElement;
                }
              } catch (error) {
                console.warn('[AIInputBar] Failed to get rectangle for element:', error);
              }
            }

            if (bottommostElement) {
              const bottommostRect = getRectangleByElements(board, [bottommostElement], false);
              expectedInsertLeftX = bottommostRect.x;
              expectedInsertY = bottommostRect.y + bottommostRect.height + GAP;
              workzoneX = expectedInsertLeftX;
              workzoneY = expectedInsertY;
              positionStrategy = 'below-bottommost';

              // console.log('[AIInputBar] ✓ Using strategy: below bottommost element');
              // console.log('[AIInputBar] Bottommost rect:', bottommostRect);
              // console.log('[AIInputBar] WorkZone will be at:', [workzoneX, workzoneY]);
            } else {
              // console.log('[AIInputBar] ✗ No valid elements found, using viewport center');
            }
          }
        } else {
          // 画布为空，使用默认值（视口中心）
          // console.log('[AIInputBar] ✓ Using strategy: viewport center (empty canvas)');
        }

        // 创建 WorkZone
        const workflowMessageData = toWorkflowMessageData(workflow);
        const workzoneElement = WorkZoneTransforms.insertWorkZone(board, {
          workflow: workflowMessageData,
          position: [workzoneX, workzoneY],
          size: { width: WORKZONE_WIDTH, height: WORKZONE_HEIGHT },
          expectedInsertPosition: [expectedInsertLeftX, expectedInsertY],
          zoom,
        });

        // 保存 WorkZone ID 用于后续更新
        currentWorkZoneIdRef.current = workzoneElement.id;
        // console.log('[AIInputBar] Created WorkZone:', workzoneElement.id);
        // console.log('[AIInputBar] WorkZone position (left-top):', [workzoneX, workzoneY]);
        // console.log('[AIInputBar] WorkZone size:', [WORKZONE_WIDTH, WORKZONE_HEIGHT]);
        // console.log('[AIInputBar] Expected insert position (leftX, topY):', [expectedInsertLeftX, expectedInsertY]);
        // console.log('[AIInputBar] Position strategy:', positionStrategy);
        // console.log('[AIInputBar] Zoom:', zoom);

        // 延迟滚动到 WorkZone 位置，确保 DOM 已渲染
        setTimeout(() => {
          // 计算 WorkZone 中心点
          const workzoneCenterX = workzoneX + WORKZONE_WIDTH / 2;
          const workzoneCenterY = workzoneY + WORKZONE_HEIGHT / 2;

          // 使用现有的滚动工具函数，如果 WorkZone 不在视口内则滚动
          scrollToPointIfNeeded(board, [workzoneCenterX, workzoneCenterY], 100);
          // console.log('[AIInputBar] Scroll check completed for WorkZone center:', [workzoneCenterX, workzoneCenterY]);
        }, 100);
      } else {
        console.warn('[AIInputBar] Board not available, skipping WorkZone creation');
      }

      // 构建完整的 AI 输入上下文
      const aiContext = {
        rawInput: prompt,
        userInstruction: parsedParams.userInstruction,
        model: {
          id: parsedParams.modelId,
          type: parsedParams.generationType,
          isExplicit: parsedParams.isModelExplicit,
        },
        params: {
          count: parsedParams.count,
          size: parsedParams.size,
          duration: parsedParams.duration,
        },
        selection,
        finalPrompt: parsedParams.prompt,
      };

      // 获取全局设置的文本模型（用于 Agent 流程）
      const globalSettings = geminiSettings.get();
      const textModel = globalSettings.textModelName;

      // 创建重试上下文（保存用于重试的必要信息）
      const retryContext: WorkflowRetryContext = {
        aiContext,
        referenceImages,
        textModel,
      };
      // 保存到 ref，用于后续更新时保持 retryContext
      currentRetryContextRef.current = retryContext;

      // 注意：不在这里发送 ChatDrawer 消息，由 submitWorkflowToSW 统一处理
      // 避免重复发送消息导致多次请求

      // 所有工作流都通过 SW 执行
      // SW 会根据工具类型决定是在 SW 中执行还是委托给主线程
      try {
        // 传递已创建的 workflow，避免重复创建导致 ID 不一致
        const { usedSW } = await submitWorkflowToSW(parsedParams, referenceImages, retryContext, workflow);
        if (usedSW) {
          // console.log('[AIInputBar] Workflow submitted to SW');
          // SW 执行成功
          // 保存提示词到历史记录
          if (prompt.trim()) {
            const hasSelection = allContent.length > 0;
            addPromptHistory(prompt.trim(), hasSelection);
          }
          // 清空输入，保持面板打开以便用户继续创作
          setPrompt('');
          setSelectedContent([]);
          setUploadedContent([]);
          
          // 启动 1 秒冷却定时器，之后允许用户继续输入
          if (submitCooldownRef.current) {
            clearTimeout(submitCooldownRef.current);
          }
          // console.log('[AIInputBar] SW execution success, starting 1s cooldown timer');
          submitCooldownRef.current = setTimeout(() => {
            // console.log('[AIInputBar] 1s cooldown expired: setting isSubmitting=false');
            setIsSubmitting(false);
            submitCooldownRef.current = null;
          }, 1000);
          
          return; // 提前返回
        }
      } catch (swError) {
        console.warn('[AIInputBar] SW execution failed, falling back to main thread:', swError);
        // SW 执行失败，继续使用主线程执行（fallback）
      }

      // Fallback: 主线程执行（仅当 SW 不可用时）
      // console.log(`[AIInputBar] Fallback: Executing workflow in main thread: ${workflow.steps.length} steps`);

      const createdTaskIds: string[] = [];

      // 收集动态添加的步骤（用于后续执行）
      const pendingNewSteps: Array<{
        id: string;
        mcp: string;
        args: Record<string, unknown>;
        description: string;
        options?: WorkflowStepOptions;
      }> = [];

      // 创建标准回调（所有工具都可使用，不需要的会忽略）
      const createStepCallbacks = (currentStep: typeof workflow.steps[0], stepStartTime: number) => ({
        // 流式输出回调
        onChunk: (chunk: string) => {
          updateThinkingContentRef.current(chunk);
        },
        // 动态添加步骤回调
        onAddSteps: (newSteps: Array<{ id: string; mcp: string; args: Record<string, unknown>; description: string; status: string }>) => {
          // 当前步骤完成
          workflowControl.updateStep(currentStep.id, 'completed', { analysis: 'completed' }, undefined, Date.now() - stepStartTime);

          // 为新步骤添加 queue 模式选项（尊重传入的 status，若为 completed 则保留）
          const stepsWithOptions = newSteps.map((s, index) => ({
            ...s,
            status: (s.status === 'completed' ? 'completed' : 'pending') as 'pending' | 'completed',
            options: {
              mode: 'queue' as const,
              batchId: `agent_${Date.now()}`,
              batchIndex: index + 1,
              batchTotal: newSteps.length,
              globalIndex: index + 1,
            },
          }));

          // 添加新步骤到工作流
          workflowControl.addSteps(stepsWithOptions);

          // 收集待执行的步骤
          pendingNewSteps.push(...stepsWithOptions);

          // 追加工具调用日志
          newSteps.forEach(s => {
            appendAgentLogRef.current({
              type: 'tool_call',
              timestamp: Date.now(),
              toolName: s.mcp,
              args: s.args,
            });
          });

          const workflowData = toWorkflowMessageData(workflowControl.getWorkflow()!, currentRetryContextRef.current || undefined);
          updateWorkflowMessageRef.current(workflowData);
          // 同步更新 WorkZone
          if (currentWorkZoneIdRef.current && board) {
            WorkZoneTransforms.updateWorkflow(board, currentWorkZoneIdRef.current, workflowData);
          }
        },
        // 更新步骤状态回调
        onUpdateStep: (stepId: string, status: string, result?: unknown, error?: string) => {
          workflowControl.updateStep(stepId, status as 'pending' | 'running' | 'completed' | 'failed' | 'skipped', result, error);

          // 追加工具结果日志
          appendAgentLogRef.current({
            type: 'tool_result',
            timestamp: Date.now(),
            toolName: stepId,
            success: status === 'completed',
            data: result,
            error,
          });

          const workflowData = toWorkflowMessageData(workflowControl.getWorkflow()!, currentRetryContextRef.current || undefined);
          updateWorkflowMessageRef.current(workflowData);
          // 同步更新 WorkZone
          if (currentWorkZoneIdRef.current && board) {
            WorkZoneTransforms.updateWorkflow(board, currentWorkZoneIdRef.current, workflowData);
          }
        },
      });

      let workflowFailed = false;

      // 辅助函数：同步更新 ChatDrawer 和 WorkZone
      const syncWorkflowUpdates = () => {
        const workflowData = toWorkflowMessageData(workflowControl.getWorkflow()!, currentRetryContextRef.current || undefined);
        updateWorkflowMessageRef.current(workflowData);
        if (currentWorkZoneIdRef.current && board) {
          WorkZoneTransforms.updateWorkflow(board, currentWorkZoneIdRef.current, workflowData);
        }
      };

      // 执行单个步骤的函数
      const executeStep = async (step: typeof workflow.steps[0]) => {
        const stepStartTime = Date.now();

        // 更新步骤为运行中
        workflowControl.updateStep(step.id, 'running');
        syncWorkflowUpdates();

        try {
          // 合并步骤选项和标准回调（工具自行决定是否使用回调）
          const executeOptions = {
            ...step.options,
            ...createStepCallbacks(step, stepStartTime),
          };

          // 通过 MCP Registry 执行工具
          const result = await mcpRegistry.executeTool(
            { name: step.mcp, arguments: step.args },
            executeOptions
          ) as MCPTaskResult;

          // 根据结果更新步骤状态
          const currentStepStatus = workflowControl.getWorkflow()?.steps.find(s => s.id === step.id)?.status;

          if (!result.success) {
            // 执行失败，标记工作流失败
            workflowControl.updateStep(step.id, 'failed', undefined, result.error || '执行失败', Date.now() - stepStartTime);
            return false; // 返回失败
          } else if (result.taskId) {
            // 队列模式：记录任务 ID（状态保持 running，等任务完成后更新）
            createdTaskIds.push(result.taskId);
            workflowControl.updateStep(step.id, 'running', { taskId: result.taskId });
          } else if (currentStepStatus === 'running') {
            // 同步模式且未被回调更新：标记为完成
            workflowControl.updateStep(step.id, 'completed', result.data, undefined, Date.now() - stepStartTime);
          }

          return true; // 返回成功
        } catch (stepError) {
          // 更新步骤为失败
          workflowControl.updateStep(step.id, 'failed', undefined, String(stepError));
          return false; // 返回失败
        } finally {
          // 同步更新 ChatDrawer 和 WorkZone
          syncWorkflowUpdates();
        }
      };

      // 执行初始步骤
      for (const step of workflow.steps) {
        // 如果工作流已失败，跳过剩余步骤
        if (workflowFailed) {
          workflowControl.updateStep(step.id, 'skipped');
          syncWorkflowUpdates();
          continue;
        }

        const success = await executeStep(step);
        if (!success) {
          workflowFailed = true;
        }
      }

      // 执行动态添加的步骤（由 ai_analyze 通过 onAddSteps 添加）
      if (!workflowFailed && pendingNewSteps.length > 0) {
        // console.log(`[AIInputBar] Executing ${pendingNewSteps.length} dynamically added steps`);

        // 获取当前工作流状态用于调试
        const currentWorkflow = workflowControl.getWorkflow();
        // console.log(`[AIInputBar] Current workflow steps:`, currentWorkflow?.steps.map(s => ({ id: s.id, mcp: s.mcp, status: s.status })));
        // console.log(`[AIInputBar] Pending steps to execute:`, pendingNewSteps.map(s => ({ id: s.id, mcp: s.mcp })));

        for (const newStep of pendingNewSteps) {
          if (workflowFailed) {
            workflowControl.updateStep(newStep.id, 'skipped');
            syncWorkflowUpdates();
            continue;
          }

          // 从 workflowControl 获取完整的步骤信息
          const fullStep = workflowControl.getWorkflow()?.steps.find(s => s.id === newStep.id);
          // console.log(`[AIInputBar] Looking for step ${newStep.id}, found:`, fullStep ? 'yes' : 'no', 'status:', fullStep?.status);

          if (!fullStep) {
            console.warn(`[AIInputBar] Step ${newStep.id} not found in workflow!`);
            continue;
          }

          // 如果步骤已标记为 completed（如 long-video-generation 预创建的任务），跳过执行
          if (fullStep.status === 'completed') {
            // console.log(`[AIInputBar] Skipping already completed step: ${fullStep.mcp}`);
            continue;
          }

          // console.log(`[AIInputBar] Executing dynamic step: ${fullStep.mcp}`, fullStep.args);
          const success = await executeStep(fullStep);
          if (!success) {
            workflowFailed = true;
          }
        }
      }

      // 保存提示词到历史记录（只保存有实际内容的提示词）
      if (prompt.trim()) {
        const hasSelection = allContent.length > 0;
        addPromptHistory(prompt.trim(), hasSelection);
      }

      // 检查工作流是否已完成（所有步骤都是 completed 或 failed/skipped）
      // 如果没有创建任务（createdTaskIds 为空），则立即删除 WorkZone
      const finalWorkflow = workflowControl.getWorkflow();
      const allStepsFinished = finalWorkflow?.steps.every(
        s => s.status === 'completed' || s.status === 'failed' || s.status === 'skipped'
      );
      const hasCreatedTasks = createdTaskIds.length > 0;

      if (allStepsFinished && !hasCreatedTasks) {
        // 所有步骤都已完成且没有创建任务，立即删除 WorkZone
        const workZoneId = currentWorkZoneIdRef.current;
        const board = SelectionWatcherBoardRef.current;
        if (workZoneId && board) {
          // 延迟删除，让用户看到完成状态
          setTimeout(() => {
            WorkZoneTransforms.removeWorkZone(board, workZoneId);
            currentWorkZoneIdRef.current = null;
            // console.log('[AIInputBar] Removed WorkZone after all steps completed (no tasks):', workZoneId);
          }, 1500);
        }
      }

      // 清空输入，保持面板打开以便用户继续创作
      setPrompt('');
      setSelectedContent([]);
      setUploadedContent([]); // 同时清空用户上传内容
      // 不关闭面板，让用户可以继续输入
    } catch (error) {
      console.error('Failed to create generation task:', error);
      // 中止工作流
      workflowControl.abortWorkflow();
      // 出错时立即允许重试
      setIsSubmitting(false);
    }
    // 成功提交后，1秒内不允许重复提交（防止误操作双击）
    // 清除之前的定时器
    if (submitCooldownRef.current) {
      clearTimeout(submitCooldownRef.current);
    }
    // console.log('[AIInputBar] Starting 1s cooldown timer');
    submitCooldownRef.current = setTimeout(() => {
      // console.log('[AIInputBar] 1s cooldown expired: setting isSubmitting=false');
      setIsSubmitting(false);
      submitCooldownRef.current = null;
    }, 1000);
  }, [prompt, allContent, isSubmitting, selectedModel, workflowControl, submitWorkflowToSW, addPromptHistory, selectedSize]);

  // 处理工作流重试（从指定步骤开始）
  const handleWorkflowRetry = useCallback(async (
    workflowMessageData: WorkflowMessageData,
    startStepIndex: number
  ) => {
    const retryContext = workflowMessageData.retryContext;
    if (!retryContext) {
      console.error('[AIInputBar] No retry context available for workflow');
      return;
    }

    // console.log(`[AIInputBar] Retrying workflow from step ${startStepIndex}`, workflowMessageData);

    // 将 WorkflowMessageData 转换为 WorkflowDefinition（用于内部状态管理）
    const workflowDefinition: WorkflowDefinition = {
      id: workflowMessageData.id,
      name: workflowMessageData.name,
      description: `重试: ${workflowMessageData.name}`,
      scenarioType: workflowMessageData.steps.some(s => s.mcp === 'ai_analyze')
        ? 'agent_flow'
        : 'direct_generation',
      generationType: workflowMessageData.generationType as GenerationType,
      steps: workflowMessageData.steps.map((step, index) => ({
        id: step.id,
        mcp: step.mcp,
        args: step.args,
        description: step.description,
        // 重置从 startStepIndex 开始的步骤状态
        status: index < startStepIndex ? step.status : 'pending',
        // 保留已完成步骤的结果，清除失败步骤的结果
        result: index < startStepIndex ? step.result : undefined,
        error: index < startStepIndex ? step.error : undefined,
        duration: index < startStepIndex ? step.duration : undefined,
        options: step.options,
      })),
      metadata: {
        prompt: workflowMessageData.prompt,
        userInstruction: retryContext.aiContext.userInstruction,
        rawInput: retryContext.aiContext.rawInput,
        modelId: retryContext.aiContext.model.id,
        isModelExplicit: retryContext.aiContext.model.isExplicit,
        count: workflowMessageData.count,
        size: retryContext.aiContext.params.size,
        duration: retryContext.aiContext.params.duration,
        referenceImages: retryContext.referenceImages,
        selection: retryContext.aiContext.selection,
      },
      createdAt: Date.now(),
    };

    // 启动工作流（内部状态管理）
    workflowControl.startWorkflow(workflowDefinition);

    // 添加重试日志
    appendAgentLogRef.current({
      type: 'retry',
      timestamp: Date.now(),
      reason: `从步骤 ${startStepIndex + 1} 开始重试`,
      attempt: 1,
    });

    // 更新 ChatDrawer 显示
    updateWorkflowMessageRef.current(toWorkflowMessageData(workflowDefinition, retryContext));

    // 创建标准回调
    const createStepCallbacks = (currentStep: typeof workflowDefinition.steps[0], stepStartTime: number) => ({
      onChunk: (chunk: string) => {
        updateThinkingContentRef.current(chunk);
      },
      onAddSteps: (newSteps: Array<{ id: string; mcp: string; args: Record<string, unknown>; description: string; status: string }>) => {
        workflowControl.updateStep(currentStep.id, 'completed', { analysis: 'completed' }, undefined, Date.now() - stepStartTime);
        const stepsWithOptions = newSteps.map((s, index) => ({
          ...s,
          status: (s.status === 'completed' ? 'completed' : 'pending') as 'pending' | 'completed',
          options: {
            mode: 'queue' as const,
            batchId: `agent_${Date.now()}`,
            batchIndex: index + 1,
            batchTotal: newSteps.length,
            globalIndex: index + 1,
          },
        }));
        workflowControl.addSteps(stepsWithOptions);
        pendingNewStepsForRetry.push(...stepsWithOptions);
        newSteps.forEach(s => {
          appendAgentLogRef.current({
            type: 'tool_call',
            timestamp: Date.now(),
            toolName: s.mcp,
            args: s.args,
          });
        });
        updateWorkflowMessageRef.current(toWorkflowMessageData(workflowControl.getWorkflow()!, retryContext));
      },
      onUpdateStep: (stepId: string, status: string, result?: unknown, error?: string) => {
        workflowControl.updateStep(stepId, status as 'pending' | 'running' | 'completed' | 'failed' | 'skipped', result, error);
        appendAgentLogRef.current({
          type: 'tool_result',
          timestamp: Date.now(),
          toolName: stepId,
          success: status === 'completed',
          data: result,
          error,
        });
        updateWorkflowMessageRef.current(toWorkflowMessageData(workflowControl.getWorkflow()!, retryContext));
      },
    });

    // 收集动态添加的步骤
    const pendingNewStepsForRetry: Array<{
      id: string;
      mcp: string;
      args: Record<string, unknown>;
      description: string;
      options?: WorkflowStepOptions;
    }> = [];

    let workflowFailed = false;

    // 从原始步骤中获取任务 ID 的映射（用于重试时复用任务）
    const stepTaskIdMap = new Map<string, string>();
    workflowMessageData.steps.forEach(step => {
      const taskId = (step.result as { taskId?: string })?.taskId;
      if (taskId) {
        stepTaskIdMap.set(step.id, taskId);
      }
    });

    // 执行单个步骤
    const executeStep = async (step: typeof workflowDefinition.steps[0]) => {
      const stepStartTime = Date.now();
      workflowControl.updateStep(step.id, 'running');
      updateWorkflowMessageRef.current(toWorkflowMessageData(workflowControl.getWorkflow()!, retryContext));

      try {
        // 获取原始步骤的任务 ID（如果有的话，用于重试时复用任务）
        const retryTaskId = stepTaskIdMap.get(step.id);
        
        const executeOptions = {
          ...step.options,
          ...createStepCallbacks(step, stepStartTime),
          // 如果有原始任务 ID，传递给 MCP 工具以复用任务
          ...(retryTaskId ? { retryTaskId } : {}),
        };
        const result = await mcpRegistry.executeTool(
          { name: step.mcp, arguments: step.args },
          executeOptions
        ) as MCPTaskResult;

        const currentStepStatus = workflowControl.getWorkflow()?.steps.find(s => s.id === step.id)?.status;

        if (!result.success) {
          workflowControl.updateStep(step.id, 'failed', undefined, result.error || '执行失败', Date.now() - stepStartTime);
          return false;
        } else if (result.taskId) {
          workflowControl.updateStep(step.id, 'running', { taskId: result.taskId });
        } else if (currentStepStatus === 'running') {
          workflowControl.updateStep(step.id, 'completed', result.data, undefined, Date.now() - stepStartTime);
        }
        return true;
      } catch (stepError) {
        workflowControl.updateStep(step.id, 'failed', undefined, String(stepError));
        return false;
      } finally {
        updateWorkflowMessageRef.current(toWorkflowMessageData(workflowControl.getWorkflow()!, retryContext));
      }
    };

    // 执行步骤（从 startStepIndex 开始）
    const stepsToExecute = workflowDefinition.steps.slice(startStepIndex);
    for (const step of stepsToExecute) {
      if (workflowFailed) {
        workflowControl.updateStep(step.id, 'skipped');
        updateWorkflowMessageRef.current(toWorkflowMessageData(workflowControl.getWorkflow()!, retryContext));
        continue;
      }
      const success = await executeStep(step);
      if (!success) {
        workflowFailed = true;
      }
    }

    // 执行动态添加的步骤
    if (!workflowFailed && pendingNewStepsForRetry.length > 0) {
      // console.log(`[AIInputBar] Executing ${pendingNewStepsForRetry.length} dynamically added steps during retry`);
      for (const newStep of pendingNewStepsForRetry) {
        if (workflowFailed) {
          workflowControl.updateStep(newStep.id, 'skipped');
          updateWorkflowMessageRef.current(toWorkflowMessageData(workflowControl.getWorkflow()!, retryContext));
          continue;
        }
        const fullStep = workflowControl.getWorkflow()?.steps.find(s => s.id === newStep.id);
        if (!fullStep) {
          continue;
        }
        // 如果步骤已标记为 completed（如 long-video-generation 预创建的任务），跳过执行
        if (fullStep.status === 'completed') {
          // console.log(`[AIInputBar] Skipping already completed step during retry: ${fullStep.mcp}`);
          continue;
        }
        const success = await executeStep(fullStep);
        if (!success) {
          workflowFailed = true;
        }
      }
    }

    // 检查工作流是否已完成（所有步骤都是 completed 或 failed/skipped）
    // 如果没有创建任务，则立即删除 WorkZone
    const finalWorkflow = workflowControl.getWorkflow();
    const allStepsFinished = finalWorkflow?.steps.every(
      s => s.status === 'completed' || s.status === 'failed' || s.status === 'skipped'
    );
    // 检查是否有任何步骤创建了任务（通过检查 result.taskId）
    const hasCreatedTasks = finalWorkflow?.steps.some(
      s => (s.result as { taskId?: string })?.taskId
    );

    if (allStepsFinished && !hasCreatedTasks) {
      // 所有步骤都已完成且没有创建任务，立即删除 WorkZone
      const workZoneId = currentWorkZoneIdRef.current;
      const board = SelectionWatcherBoardRef.current;
      if (workZoneId && board) {
        // 延迟删除，让用户看到完成状态
        setTimeout(() => {
          WorkZoneTransforms.removeWorkZone(board, workZoneId);
          currentWorkZoneIdRef.current = null;
        }, 1500);
      }
    }

    // console.log('[AIInputBar] Retry workflow completed, failed:', workflowFailed);
  }, [workflowControl]);

  // 注册重试处理器
  useEffect(() => {
    registerRetryHandlerRef.current(handleWorkflowRetry);
  }, [handleWorkflowRetry]);

  // Handle key press
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      // 检测 IME 组合输入状态（如中文拼音输入法）
      // 在组合输入时按回车是确认拼音转换，不应触发发送
      if (event.nativeEvent.isComposing) {
        return;
      }

      // @ 建议面板打开时的键盘处理
      if (showAtSuggestion && filteredModels.length > 0) {
        // 上下箭头导航
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setAtHighlightIndex(prev =>
            prev < filteredModels.length - 1 ? prev + 1 : 0
          );
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setAtHighlightIndex(prev =>
            prev > 0 ? prev - 1 : filteredModels.length - 1
          );
          return;
        }
        // Tab 或 Enter 选择当前高亮项
        if (event.key === 'Tab' || event.key === 'Enter') {
          event.preventDefault();
          const selectedModelItem = filteredModels[atHighlightIndex];
          if (selectedModelItem) {
            analytics.track('ai_input_select_model_at_keyboard', {
              model: selectedModelItem.id
            });
            handleAtSelectModel(selectedModelItem.id);
          }
          return;
        }
        // Escape 关闭建议面板
        if (event.key === 'Escape') {
          event.preventDefault();
          setShowAtSuggestion(false);
          setAtQuery('');
          return;
        }
      }

      // Shift+Enter, Alt/Option+Enter 换行
      if (event.key === 'Enter' && (event.shiftKey || event.altKey)) {
        return;
      }

      // Enter 发送
      if (event.key === 'Enter') {
        event.preventDefault();
        analytics.track('ai_input_submit_keyboard');
        handleGenerate();
        return;
      }

      // Escape 关闭
      if (event.key === 'Escape') {
        setIsFocused(false);
        inputRef.current?.blur();
        return;
      }
    },
    [handleGenerate, showAtSuggestion, filteredModels, atHighlightIndex, handleAtSelectModel]
  );

  // Handle input focus
  const handleFocus = useCallback(() => {
    analytics.track('ai_input_focus_textarea');
    setIsFocused(prev => {
      if (prev) return prev; // 已经是 true，不触发更新
      return true;
    });
  }, []);

  // Handle input blur
  const handleBlur = useCallback(() => {
    analytics.track('ai_input_blur_textarea');
    setIsFocused(prev => {
      if (!prev) return prev; // 已经是 false，不触发更新
      return false;
    });
  }, []);


  const canGenerate = prompt.trim().length > 0 || allContent.length > 0;

  // 是否显示灵感板（画布数据加载完成且为空时显示，加载中不显示避免闪烁）
  const showInspirationBoard = isCanvasEmpty === true;

  return (
    <div
      ref={containerRef}
      className={classNames('ai-input-bar', ATTACHED_ELEMENT_CLASS_NAME, className, {
        'ai-input-bar--with-inspiration': showInspirationBoard
      })}
    >
      {/* 独立的选择监听组件，隔离 useBoard 的 context 变化 */}
      <SelectionWatcher
        language={language}
        onSelectionChange={handleSelectionChange}
        externalBoardRef={SelectionWatcherBoardRef}
        onCanvasEmptyChange={setIsCanvasEmpty}
        isDataReady={isDataReady}
      />

      {/* 灵感创意板块：画板确定为空且聚焦时显示 */}
      <InspirationBoard
        isCanvasEmpty={showInspirationBoard}
        onSelectPrompt={handleSelectInspirationPrompt}
        onOpenPromptTool={handleOpenPromptTool}
      />

      {/* Main input container - flex-column-reverse to expand upward */}
      <div className={classNames('ai-input-bar__container', {
        'ai-input-bar__container--expanded': isFocused || allContent.length > 0
      })}>
        {/* Bottom bar - fixed position with model selector and send button */}
        <div className="ai-input-bar__bottom-bar">
          {/* Hidden file input for image upload */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />

          {/* Left: Upload button */}
          <button
            className="ai-input-bar__upload-btn"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={handleUploadClick}
            title={language === 'zh' ? '上传图片' : 'Upload images'}
            data-track="ai_input_click_upload"
          >
            <ImagePlus size={18} />
          </button>

          {/* Left: Model dropdown selector */}
          <ModelDropdown
            selectedModel={selectedModel}
            onSelect={handleModelSelect}
            language={language}
          />

          {/* Size dropdown selector */}
          <SizeDropdown
            selectedSize={selectedSize}
            onSelect={setSelectedSize}
            modelId={selectedModel}
            language={language}
          />

          {/* Spacer to push send button to the right */}
          <div className="ai-input-bar__bottom-spacer" />

          {/* Right: Send button */}
          <button
            className={`ai-input-bar__send-btn ${canGenerate ? 'active' : ''} ${isSubmitting ? 'loading' : ''}`}
            onMouseDown={(e) => {
              e.preventDefault(); // 阻止点击按钮时输入框失焦
              e.stopPropagation(); // 阻止事件冒泡到 document 监听器（避免触发 handleClickOutside）
            }}
            onClick={handleGenerate}
            disabled={!canGenerate || isSubmitting}
            data-track="ai_input_click_send"
          >
            <Send size={18} />
          </button>
        </div>

        {/* Input area - expands upward */}
        <div className={classNames('ai-input-bar__input-area', {
          'ai-input-bar__input-area--expanded': isFocused
        })}>
          {/* Selected content preview - using shared component */}
          {allContent.length > 0 && (
            <div className="ai-input-bar__content-preview">
              <SelectedContentPreview
                items={allContent}
                language={language}
                enableHoverPreview={true}
                onRemove={handleRemoveUploadedContent}
                removableStartIndex={uploadedContent.length}
              />
            </div>
          )}

          {/* History prompt popover - top right corner */}
          <PromptHistoryPopover
            onSelectPrompt={handleSelectHistoryPrompt}
            language={language}
          />

          {/* Text input */}
          <div className="ai-input-bar__rich-input">
            <textarea
              ref={inputRef}
              className={classNames('ai-input-bar__input', {
                'ai-input-bar__input--focused': isFocused,
              })}
              value={prompt}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={handleFocus}
              onBlur={handleBlur}
              placeholder={language === 'zh' ? '描述你想要创建什么，输入 @ 选择模型' : 'Describe what you want to create, type @ to select model'}
              rows={isFocused ? 4 : 1}
              disabled={isSubmitting}
            />

            {/* @ 触发的模型建议面板 */}
            {showAtSuggestion && filteredModels.length > 0 && (
              <div
                className="ai-input-bar__at-suggestion"
                ref={atSuggestionRef}
                role="listbox"
                aria-label={language === 'zh' ? '选择模型' : 'Select Model'}
              >
                <div className="ai-input-bar__at-suggestion-header">
                  {language === 'zh' ? '选择图片模型' : 'Select Image Model'}
                </div>
                <div className="ai-input-bar__at-suggestion-list">
                  {filteredModels.map((model, index) => {
                    const isHighlighted = index === atHighlightIndex;
                    const isSelected = model.id === selectedModel;
                    return (
                      <div
                        key={model.id}
                        className={classNames('ai-input-bar__at-suggestion-item', {
                          'ai-input-bar__at-suggestion-item--highlighted': isHighlighted,
                          'ai-input-bar__at-suggestion-item--selected': isSelected,
                        })}
                        onClick={() => handleAtSelectModel(model.id)}
                        onMouseEnter={() => setAtHighlightIndex(index)}
                        role="option"
                        aria-selected={isSelected}
                      >
                        <div className="ai-input-bar__at-suggestion-item-content">
                          <div className="ai-input-bar__at-suggestion-item-name">
                            <span className="ai-input-bar__at-suggestion-item-code">@{model.shortCode}</span>
                            <span className="ai-input-bar__at-suggestion-item-label">
                              {model.shortLabel || model.label}
                            </span>
                            {model.isVip && (
                              <span className="ai-input-bar__at-suggestion-item-vip">VIP</span>
                            )}
                          </div>
                          {model.description && (
                            <div className="ai-input-bar__at-suggestion-item-desc">
                              {model.description}
                            </div>
                          )}
                        </div>
                        {isSelected && (
                          <Check size={16} className="ai-input-bar__at-suggestion-item-check" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

// 设置 displayName 便于调试
AIInputBar.displayName = 'AIInputBar';

export default AIInputBar;
