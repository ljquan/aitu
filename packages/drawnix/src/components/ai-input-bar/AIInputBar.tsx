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
 * - Generation type toggle (image/video)
 * - Smart suggestion panel with "#模型名", "-参数:值", "+个数" syntax support
 * - Send button to trigger generation
 * - Prompt suggestion panel with history and presets
 * - Integration with ChatDrawer for conversation display
 * - Agent mode: AI decides which MCP tool to use (image/video generation)
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { Video, Send, Type, Play } from 'lucide-react';
import { useBoard } from '@plait-board/react-board';
import { getSelectedElements, ATTACHED_ELEMENT_CLASS_NAME } from '@plait/core';
import { useI18n } from '../../i18n';
import { TaskStatus } from '../../types/task.types';
import { taskQueueService } from '../../services/task-queue-service';
import { processSelectedContentForAI } from '../../utils/selection-utils';
import { useTextSelection } from '../../hooks/useTextSelection';
import { usePromptHistory } from '../../hooks/usePromptHistory';
import { useChatDrawerControl } from '../../contexts/ChatDrawerContext';
import { AI_INSTRUCTIONS, AI_COLD_START_SUGGESTIONS } from '../../constants/prompts';
import {
  SmartSuggestionPanel,
  useTriggerDetection,
  insertToInput,
  type PromptItem,
} from './smart-suggestion-panel';
import { initializeMCP, setCanvasBoard, setBoard, mcpRegistry } from '../../mcp';
import { photoWallService } from '../../services/photo-wall';
import type { MCPTaskResult } from '../../mcp/types';
import { parseAIInput, type GenerationType } from '../../utils/ai-input-parser';
import { convertToWorkflow, type WorkflowDefinition, type WorkflowStepOptions } from './workflow-converter';
import { useWorkflowControl } from '../../contexts/WorkflowContext';
import { geminiSettings } from '../../utils/settings-manager';
import type { WorkflowMessageData } from '../../types/chat.types';
import classNames from 'classnames';
import './ai-input-bar.scss';

import type { WorkflowRetryContext } from '../../types/chat.types';

/**
 * 将 WorkflowDefinition 转换为 WorkflowMessageData
 * @param workflow 工作流定义
 * @param retryContext 可选的重试上下文
 */
function toWorkflowMessageData(
  workflow: WorkflowDefinition,
  retryContext?: WorkflowRetryContext
): WorkflowMessageData {
  return {
    id: workflow.id,
    name: workflow.name,
    generationType: workflow.generationType,
    prompt: workflow.metadata.prompt,
    count: workflow.metadata.count,
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
  };
}

// 初始化 MCP 模块
let mcpInitialized = false;
if (!mcpInitialized) {
  initializeMCP();
  mcpInitialized = true;
}

// 选中内容类型：图片、视频、图形、文字
type SelectedContentType = 'image' | 'video' | 'graphics' | 'text';

interface SelectedContent {
  type: SelectedContentType;
  url?: string;       // 图片/视频/图形的 URL
  text?: string;      // 文字内容
  name: string;       // 显示名称
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
}

/**
 * 独立的选择内容监听组件
 * 将 useBoard 隔离在这个组件中，避免 board context 变化导致主组件重渲染
 */
const SelectionWatcher: React.FC<{
  language: string;
  onSelectionChange: (content: SelectedContent[]) => void;
}> = React.memo(({ language, onSelectionChange }) => {
  const board = useBoard();
  const boardRef = useRef(board);
  boardRef.current = board;

  // 设置 canvas board 引用给 MCP 工具使用
  useEffect(() => {
    setCanvasBoard(board);
    setBoard(board);
    photoWallService.setBoard(board);
    return () => {
      setCanvasBoard(null);
      setBoard(null);
      photoWallService.setBoard(null);
    };
  }, [board]);
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
          });
        }

        for (const img of processedContent.remainingImages) {
          const imgUrl = img.url || '';
          const isVideo = isVideoUrl(imgUrl);
          
          content.push({
            url: imgUrl,
            name: img.name || (isVideo ? `video-${Date.now()}` : `image-${Date.now()}`),
            type: isVideo ? 'video' : 'image',
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

export const AIInputBar: React.FC<AIInputBarProps> = React.memo(({ className }) => {
  // console.log('[AIInputBar] Component rendering');

  const { language } = useI18n();

  const { history, addHistory, removeHistory } = usePromptHistory();
  const chatDrawerControl = useChatDrawerControl();
  const workflowControl = useWorkflowControl();
  // 使用 ref 存储，避免依赖变化
  const sendWorkflowMessageRef = useRef(chatDrawerControl.sendWorkflowMessage);
  sendWorkflowMessageRef.current = chatDrawerControl.sendWorkflowMessage;
  const updateWorkflowMessageRef = useRef(chatDrawerControl.updateWorkflowMessage);
  updateWorkflowMessageRef.current = chatDrawerControl.updateWorkflowMessage;
  const appendAgentLogRef = useRef(chatDrawerControl.appendAgentLog);
  appendAgentLogRef.current = chatDrawerControl.appendAgentLog;
  const updateThinkingContentRef = useRef(chatDrawerControl.updateThinkingContent);
  updateThinkingContentRef.current = chatDrawerControl.updateThinkingContent;
  const registerRetryHandlerRef = useRef(chatDrawerControl.registerRetryHandler);
  registerRetryHandlerRef.current = chatDrawerControl.registerRetryHandler;

  // 当前工作流的重试上下文（用于在更新时保持 retryContext）
  const currentRetryContextRef = useRef<WorkflowRetryContext | null>(null);

  // State
  const [prompt, setPrompt] = useState('');
  const [selectedContent, setSelectedContent] = useState<SelectedContent[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false); // 仅用于防止重复点击，不阻止并行任务
  const [isFocused, setIsFocused] = useState(false);

  // 使用新的 useTriggerDetection hook 解析输入
  // 有选中元素时启用智能提示，无选中元素时只响应触发字符
  const parseResult = useTriggerDetection(prompt, selectedContent.length > 0);

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
        case TaskStatus.RETRYING:
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
          updateWorkflowMessageRef.current(toWorkflowMessageData(updatedWorkflow, currentRetryContextRef.current || undefined));
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [workflowControl]);

  const [hoveredContent, setHoveredContent] = useState<{
    type: SelectedContentType;
    url?: string;
    text?: string;
    x: number;
    y: number;
  } | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const richDisplayRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 使用自定义 hook 处理文本选择和复制，同时阻止事件冒泡
  useTextSelection(inputRef, {
    enableCopy: true,
    stopPropagation: true,
  });

  // 合并预设指令和历史指令
  const allPrompts = useMemo((): PromptItem[] => {
    const presetPrompts = AI_INSTRUCTIONS[language].map((item, index) => ({
      id: `preset_${index}`,
      content: item.content,
      scene: item.scene,
      source: 'preset' as const,
    }));

    // 获取所有预设指令的内容集合，用于过滤
    const presetContents = new Set(presetPrompts.map(p => p.content));

    const historyPrompts = history
      .filter(item => !presetContents.has(item.content)) // 过滤掉与推荐提示词重复的历史记录
      .map(item => ({
        id: item.id,
        content: item.content,
        source: 'history' as const,
        timestamp: item.timestamp,
      }));

    return [...historyPrompts, ...presetPrompts];
  }, [language, history]);

  // 冷启动引导提示词（无选中内容、输入框为空时显示）
  const coldStartPrompts = useMemo((): PromptItem[] => {
    return AI_COLD_START_SUGGESTIONS[language].map((item, index) => ({
      id: `cold_start_${index}`,
      content: item.content,
      scene: item.scene,
      source: 'preset' as const,
    }));
  }, [language]);

  // 判断是否为冷启动场景（无选中内容、输入框为空）
  const isColdStartMode = useMemo(() => {
    return selectedContent.length === 0 && prompt.trim() === '';
  }, [selectedContent.length, prompt]);

  // 处理选择变化的回调（由 SelectionWatcher 调用）
  const handleSelectionChange = useCallback((content: SelectedContent[]) => {
    setSelectedContent(content);
  }, []);

  // 处理模型选择
  const handleModelSelect = useCallback((modelId: string) => {
    const newPrompt = insertToInput(prompt, modelId, parseResult.triggerPosition, '#');
    setPrompt(newPrompt);
    inputRef.current?.focus();
  }, [prompt, parseResult.triggerPosition]);

  // 处理参数选择
  const handleParamSelect = useCallback((paramId: string, value?: string) => {
    const paramValue = value ? `${paramId}=${value}` : paramId;
    const newPrompt = insertToInput(prompt, paramValue, parseResult.triggerPosition, '-');
    setPrompt(newPrompt);
    inputRef.current?.focus();
  }, [prompt, parseResult.triggerPosition]);

  // 处理个数选择
  const handleCountSelect = useCallback((count: number) => {
    const newPrompt = insertToInput(prompt, count.toString(), parseResult.triggerPosition, '+');
    setPrompt(newPrompt);
    inputRef.current?.focus();
  }, [prompt, parseResult.triggerPosition]);

  // Handle generation
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() && selectedContent.length === 0) return;
    if (isSubmitting) return; // 仅防止快速重复点击

    setIsSubmitting(true);

    try {
      // 构建选中元素的分类信息
      const selection = {
        texts: selectedContent
          .filter((item) => item.type === 'text' && item.text)
          .map((item) => item.text!),
        images: selectedContent
          .filter((item) => item.type === 'image' && item.url)
          .map((item) => item.url!),
        videos: selectedContent
          .filter((item) => item.type === 'video' && item.url)
          .map((item) => item.url!),
        graphics: selectedContent
          .filter((item) => item.type === 'graphics' && item.url)
          .map((item) => item.url!),
      };

      // 解析输入内容（使用新的 API）
      const parsedParams = parseAIInput(prompt, selection);

      console.log('[AIInputBar] Parsed params:', parsedParams);
      console.log('[AIInputBar] Key params - model:', parsedParams.modelId, 'count:', parsedParams.count, 'size:', parsedParams.size);

      // 保存提示词到历史记录（只保存用户输入的指令部分）
      if (parsedParams.userInstruction) {
        addHistory(parsedParams.userInstruction);
      }

      // 收集所有参考媒体（图片 + 图形 + 视频）
      const referenceImages = [...selection.images, ...selection.graphics];

      console.log('[AIInputBar] Final prompt:', parsedParams.prompt);
      console.log('[AIInputBar] User instruction:', parsedParams.userInstruction);
      console.log('[AIInputBar] Scenario:', parsedParams.scenario);

      // 创建工作流定义
      const workflow = convertToWorkflow(parsedParams, referenceImages);
      console.log('[AIInputBar] Created workflow:', workflow);

      // 启动工作流（内部状态管理）
      workflowControl.startWorkflow(workflow);

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

      // 发送工作流消息到 ChatDrawer（创建新对话并显示）
      const workflowMessageData = toWorkflowMessageData(workflow, retryContext);
      await sendWorkflowMessageRef.current({
        context: aiContext,
        workflow: workflowMessageData,
        textModel, // 传递全局文本模型
      });

      // 统一处理：遍历工作流步骤，通过 MCP Registry 执行
      console.log(`[AIInputBar] Executing workflow: ${workflow.steps.length} steps, scenario: ${parsedParams.scenario}`);

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

          // 为新步骤添加 queue 模式选项
          const stepsWithOptions = newSteps.map((s, index) => ({
            ...s,
            status: 'pending' as const,
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

          updateWorkflowMessageRef.current(toWorkflowMessageData(workflowControl.getWorkflow()!, currentRetryContextRef.current || undefined));
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

          updateWorkflowMessageRef.current(toWorkflowMessageData(workflowControl.getWorkflow()!, currentRetryContextRef.current || undefined));
        },
      });

      let workflowFailed = false;

      // 执行单个步骤的函数
      const executeStep = async (step: typeof workflow.steps[0]) => {
        const stepStartTime = Date.now();

        // 更新步骤为运行中
        workflowControl.updateStep(step.id, 'running');
        updateWorkflowMessageRef.current(toWorkflowMessageData(workflowControl.getWorkflow()!, currentRetryContextRef.current || undefined));

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
          // 同步更新 ChatDrawer 中的工作流消息
          updateWorkflowMessageRef.current(toWorkflowMessageData(workflowControl.getWorkflow()!, currentRetryContextRef.current || undefined));
        }
      };

      // 执行初始步骤
      for (const step of workflow.steps) {
        // 如果工作流已失败，跳过剩余步骤
        if (workflowFailed) {
          workflowControl.updateStep(step.id, 'skipped');
          updateWorkflowMessageRef.current(toWorkflowMessageData(workflowControl.getWorkflow()!, currentRetryContextRef.current || undefined));
          continue;
        }

        const success = await executeStep(step);
        if (!success) {
          workflowFailed = true;
        }
      }

      // 执行动态添加的步骤（由 ai_analyze 通过 onAddSteps 添加）
      if (!workflowFailed && pendingNewSteps.length > 0) {
        console.log(`[AIInputBar] Executing ${pendingNewSteps.length} dynamically added steps`);

        // 获取当前工作流状态用于调试
        const currentWorkflow = workflowControl.getWorkflow();
        console.log(`[AIInputBar] Current workflow steps:`, currentWorkflow?.steps.map(s => ({ id: s.id, mcp: s.mcp, status: s.status })));
        console.log(`[AIInputBar] Pending steps to execute:`, pendingNewSteps.map(s => ({ id: s.id, mcp: s.mcp })));

        for (const newStep of pendingNewSteps) {
          if (workflowFailed) {
            workflowControl.updateStep(newStep.id, 'skipped');
            updateWorkflowMessageRef.current(toWorkflowMessageData(workflowControl.getWorkflow()!, currentRetryContextRef.current || undefined));
            continue;
          }

          // 从 workflowControl 获取完整的步骤信息
          const fullStep = workflowControl.getWorkflow()?.steps.find(s => s.id === newStep.id);
          console.log(`[AIInputBar] Looking for step ${newStep.id}, found:`, fullStep ? 'yes' : 'no');
          if (fullStep) {
            console.log(`[AIInputBar] Executing dynamic step: ${fullStep.mcp}`, fullStep.args);
            const success = await executeStep(fullStep);
            if (!success) {
              workflowFailed = true;
            }
          } else {
            console.warn(`[AIInputBar] Step ${newStep.id} not found in workflow!`);
          }
        }
      }

      // 清空输入并关闭面板
      setPrompt('');
      setSelectedContent([]);
      setIsFocused(false);
      // 让输入框失去焦点
      inputRef.current?.blur();
    } catch (error) {
      console.error('Failed to create generation task:', error);
      // 中止工作流
      workflowControl.abortWorkflow();
    } finally {
      setIsSubmitting(false);
    }
  }, [prompt, selectedContent, isSubmitting, addHistory, workflowControl]);

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

    console.log(`[AIInputBar] Retrying workflow from step ${startStepIndex}`, workflowMessageData);

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
          status: 'pending' as const,
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

    // 执行单个步骤
    const executeStep = async (step: typeof workflowDefinition.steps[0]) => {
      const stepStartTime = Date.now();
      workflowControl.updateStep(step.id, 'running');
      updateWorkflowMessageRef.current(toWorkflowMessageData(workflowControl.getWorkflow()!, retryContext));

      try {
        const executeOptions = {
          ...step.options,
          ...createStepCallbacks(step, stepStartTime),
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
      console.log(`[AIInputBar] Executing ${pendingNewStepsForRetry.length} dynamically added steps during retry`);
      for (const newStep of pendingNewStepsForRetry) {
        if (workflowFailed) {
          workflowControl.updateStep(newStep.id, 'skipped');
          updateWorkflowMessageRef.current(toWorkflowMessageData(workflowControl.getWorkflow()!, retryContext));
          continue;
        }
        const fullStep = workflowControl.getWorkflow()?.steps.find(s => s.id === newStep.id);
        if (fullStep) {
          const success = await executeStep(fullStep);
          if (!success) {
            workflowFailed = true;
          }
        }
      }
    }

    console.log('[AIInputBar] Retry workflow completed, failed:', workflowFailed);
  }, [workflowControl]);

  // 注册重试处理器
  useEffect(() => {
    registerRetryHandlerRef.current(handleWorkflowRetry);
  }, [handleWorkflowRetry]);

  // Handle key press
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      // Shift+Enter, Alt/Option+Enter 换行
      if (event.key === 'Enter' && (event.shiftKey || event.altKey)) {
        return;
      }

      // 单独 Enter 发送（当不在输入触发字符后的内容时）
      // 检查是否在输入触发字符（有 triggerPosition 表示正在输入 #、-、+ 后的内容）
      const isTypingTrigger = parseResult.triggerPosition !== undefined;
      
      if (event.key === 'Enter' && !isTypingTrigger) {
        event.preventDefault();
        handleGenerate();
        return;
      }

      // Close panels on Escape
      if (event.key === 'Escape') {
        setIsFocused(false);
        inputRef.current?.blur();
        return;
      }

      // 智能删除：Backspace 删除整个标记
      if (event.key === 'Backspace' && inputRef.current) {
        const cursorPos = inputRef.current.selectionStart || 0;
        const selectionEnd = inputRef.current.selectionEnd || 0;
        
        // 如果有选中文本，使用默认行为
        if (cursorPos !== selectionEnd) {
          return;
        }
        
        // 检查光标前的字符，判断是否在标记末尾
        const textBeforeCursor = prompt.substring(0, cursorPos);
        
        // 查找最近的标记（标记后面可能有空格）
        // 模型标记: #xxx
        // 参数标记: -xxx=yyy
        // 数量标记: +数字
        const modelMatch = textBeforeCursor.match(/(#[\w.-]+)\s?$/);
        const paramMatch = textBeforeCursor.match(/(-[\w]+=[\w:x.]+)\s?$/);
        const countMatch = textBeforeCursor.match(/(\+\d+)\s?$/);
        
        // 找出位置最靠后的匹配（最近的标记）
        type MatchInfo = { match: RegExpMatchArray; index: number };
        const matches: MatchInfo[] = [];
        
        if (modelMatch && modelMatch.index !== undefined) {
          matches.push({ match: modelMatch, index: modelMatch.index });
        }
        if (paramMatch && paramMatch.index !== undefined) {
          matches.push({ match: paramMatch, index: paramMatch.index });
        }
        if (countMatch && countMatch.index !== undefined) {
          matches.push({ match: countMatch, index: countMatch.index });
        }
        
        // 按位置排序，取最靠后的
        if (matches.length > 0) {
          matches.sort((a, b) => b.index - a.index);
          const matchToDelete = matches[0];
          
          event.preventDefault();
          const deleteStart = matchToDelete.index;
          const newPrompt = prompt.substring(0, deleteStart) + prompt.substring(cursorPos);
          setPrompt(newPrompt.trim());
          
          // 设置光标位置
          setTimeout(() => {
            if (inputRef.current) {
              inputRef.current.selectionStart = deleteStart;
              inputRef.current.selectionEnd = deleteStart;
            }
          }, 0);
          return;
        }
      }
    },
    [handleGenerate, parseResult.triggerPosition, prompt]
  );

  // Handle input focus
  const handleFocus = useCallback(() => {
    setIsFocused(prev => {
      if (prev) return prev; // 已经是 true，不触发更新
      return true;
    });
  }, []);

  // Handle input blur
  const handleBlur = useCallback(() => {
    setIsFocused(prev => {
      if (!prev) return prev; // 已经是 false，不触发更新
      return false;
    });
    // Don't close suggestion panel immediately - let click events process first
  }, []);

  // Handle textarea scroll - sync with rich display
  const handleScroll = useCallback(() => {
    if (inputRef.current && richDisplayRef.current) {
      richDisplayRef.current.scrollTop = inputRef.current.scrollTop;
    }
  }, []);

  // Handle prompt selection from suggestion panel
  const handlePromptSelect = useCallback((promptItem: PromptItem) => {
    // 保留模型/参数/个数标记，把提示词追加到后面
    const tagsPrefix = prompt.replace(parseResult.cleanText, '').trim();
    const newPrompt = tagsPrefix ? `${tagsPrefix} ${promptItem.content}` : promptItem.content;
    setPrompt(newPrompt);
    inputRef.current?.focus();
  }, [prompt, parseResult.cleanText]);

  // Handle close suggestion panel
  const handleCloseSuggestionPanel = useCallback(() => {
    setIsFocused(false);
    inputRef.current?.blur();
  }, []);

  // Handle delete history
  const handleDeleteHistory = useCallback((id: string) => {
    removeHistory(id);
  }, [removeHistory]);

  // Handle content hover for preview
  const handleContentMouseEnter = useCallback((item: SelectedContent, e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const topY = rect.top - 10;
    setHoveredContent({
      type: item.type,
      url: item.url,
      text: item.text,
      x: centerX,
      y: topY,
    });
  }, []);

  const handleContentMouseLeave = useCallback(() => {
    setHoveredContent(null);
  }, []);

  const canGenerate = prompt.trim().length > 0 || selectedContent.length > 0;

  return (
    <div 
      ref={containerRef}
      className={classNames('ai-input-bar', ATTACHED_ELEMENT_CLASS_NAME, className)}
    >
      {/* 独立的选择监听组件，隔离 useBoard 的 context 变化 */}
      <SelectionWatcher 
        language={language} 
        onSelectionChange={handleSelectionChange} 
      />

      {/* Hover preview - large content (rendered to body via portal) */}
      {hoveredContent && ReactDOM.createPortal(
        <div 
          className={`ai-input-bar__hover-preview ai-input-bar__hover-preview--${hoveredContent.type}`}
          style={{
            left: `${hoveredContent.x}px`,
            top: `${hoveredContent.y}px`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          {/* Image or graphics preview */}
          {(hoveredContent.type === 'image' || hoveredContent.type === 'graphics') && hoveredContent.url && (
            <img src={hoveredContent.url} alt="Preview" />
          )}
          
          {/* Video preview */}
          {hoveredContent.type === 'video' && hoveredContent.url && (
            <div className="ai-input-bar__hover-video">
              <video 
                src={hoveredContent.url} 
                controls 
                autoPlay 
                muted 
                loop
                playsInline
              />
            </div>
          )}
          
          {/* Text preview */}
          {hoveredContent.type === 'text' && hoveredContent.text && (
            <div className="ai-input-bar__hover-text">
              <div className="ai-input-bar__hover-text-header">
                <Type size={16} />
                <span>{language === 'zh' ? '文字内容' : 'Text Content'}</span>
              </div>
              <div className="ai-input-bar__hover-text-content">
                {hoveredContent.text}
              </div>
            </div>
          )}
        </div>,
        document.body
      )}

      {/* Main input container - dynamic layout based on content */}
      <div className={classNames('ai-input-bar__container', {
        'ai-input-bar__container--has-content': selectedContent.length > 0
      })}>
        {/* Smart Suggestion Panel - unified panel for models, params, counts, and prompts */}
        <SmartSuggestionPanel
          visible={isFocused && (isColdStartMode || parseResult.mode !== null)}
          mode={isColdStartMode ? 'cold-start' : parseResult.mode}
          filterKeyword={parseResult.mode === 'prompt' ? parseResult.cleanText : parseResult.keyword}
          selectedImageModel={parseResult.selectedImageModel}
          selectedVideoModel={parseResult.selectedVideoModel}
          selectedParams={parseResult.selectedParams}
          selectedCount={parseResult.selectedCount}
          prompts={isColdStartMode ? coldStartPrompts : allPrompts}
          onSelectModel={handleModelSelect}
          onSelectParam={handleParamSelect}
          onSelectCount={handleCountSelect}
          onSelectPrompt={handlePromptSelect}
          onDeleteHistory={handleDeleteHistory}
          onClose={handleCloseSuggestionPanel}
          language={language}
        />

        {/* Selected content preview - shown inside input container on the left */}
        {selectedContent.length > 0 && (
          <div className="ai-input-bar__content-preview">
            {selectedContent.map((item, index) => (
                <div 
                  key={`${item.type}-${index}`} 
                  className={`ai-input-bar__content-item ai-input-bar__content-item--${item.type}`}
                  onMouseEnter={(e) => handleContentMouseEnter(item, e)}
                  onMouseLeave={handleContentMouseLeave}
                >
                  {/* Render based on content type */}
                  {item.type === 'text' ? (
                    // Text content preview
                    <div className="ai-input-bar__text-preview">
                      <Type size={14} className="ai-input-bar__text-icon" />
                      <span className="ai-input-bar__text-content">
                        {item.text && item.text.length > 20 
                          ? `${item.text.substring(0, 20)}...` 
                          : item.text}
                      </span>
                    </div>
                  ) : item.type === 'video' ? (
                    // Video preview with icon placeholder (no thumbnail generation)
                    <>
                      <div className="ai-input-bar__video-placeholder">
                        <Video size={20} />
                      </div>
                      <div className="ai-input-bar__video-overlay">
                        <Play size={16} fill="white" />
                      </div>
                    </>
                  ) : (
                    // Image or graphics preview
                    <img src={item.url} alt={item.name} />
                  )}
                  
                  {/* Type label for graphics */}
                  {item.type === 'graphics' && (
                    <span className="ai-input-bar__content-label">
                      {language === 'zh' ? '图形' : 'Graphics'}
                    </span>
                  )}
                  
                  {/* Type label for video */}
                  {item.type === 'video' && (
                    <span className="ai-input-bar__content-label ai-input-bar__content-label--video">
                      {language === 'zh' ? '视频' : 'Video'}
                    </span>
                  )}
                </div>
            ))}
          </div>
        )}

        {/* Input row - textarea and send button */}
        <div className="ai-input-bar__input-row">
          {/* Text input wrapper for rich text display */}
          <div className="ai-input-bar__rich-input">
            {/* 高亮背景层 - 显示模型/参数/个数标签的背景色块 */}
            {parseResult.segments.some(s => s.type !== 'text') && (
              <div
                ref={richDisplayRef}
                className="ai-input-bar__highlight-layer"
                aria-hidden="true"
              >
                {parseResult.segments.map((segment, index) => {
                  if (segment.type === 'text') {
                    return <span key={index} className="ai-input-bar__highlight-text">{segment.content}</span>;
                  }
                  // 根据类型显示不同颜色的背景色块
                  let tagClass = '';
                  switch (segment.type) {
                    case 'image-model':
                      tagClass = 'ai-input-bar__highlight-tag--image';
                      break;
                    case 'video-model':
                      tagClass = 'ai-input-bar__highlight-tag--video';
                      break;
                    case 'param':
                      tagClass = 'ai-input-bar__highlight-tag--param';
                      break;
                    case 'count':
                      tagClass = 'ai-input-bar__highlight-tag--count';
                      break;
                  }
                  return (
                    <span key={index} className={`ai-input-bar__highlight-tag ${tagClass}`}>
                      {segment.content}
                    </span>
                  );
                })}
              </div>
            )}

            {/* Actual textarea - 文字直接显示，不透明 */}
            <textarea
              ref={inputRef}
              className={classNames('ai-input-bar__input', {
                'ai-input-bar__input--focused': isFocused,
              })}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onScroll={handleScroll}
              placeholder={isFocused
                ? (language === 'zh' ? '输入 # 选择模型（默认生图），- 选择参数， + 选择个数（默认1），描述你想要创建什么' : 'Enter # to select the model (default graph), - to select parameters, + to select the number (default 1), and describe what you want to create')
                : (language === 'zh' ? '描述你想要创建什么' : 'Describe what you want to create')
              }
              rows={isFocused ? 4 : 1}
              disabled={isSubmitting}
            />
          </div>

          {/* Right: Send button */}
          <button
            className={`ai-input-bar__send-btn ${canGenerate ? 'active' : ''} ${isSubmitting ? 'loading' : ''}`}
            onMouseDown={(e) => {
              e.preventDefault(); // 阻止点击按钮时输入框失焦
              e.stopPropagation(); // 阻止事件冒泡到 document 监听器（避免触发 handleClickOutside）
            }}
            onClick={handleGenerate}
            disabled={!canGenerate || isSubmitting}
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
});

// 设置 displayName 便于调试
AIInputBar.displayName = 'AIInputBar';

export default AIInputBar;
