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
import { useTaskQueue } from '../../hooks/useTaskQueue';
import { TaskType, TaskStatus } from '../../types/task.types';
import { taskQueueService } from '../../services/task-queue-service';
import { processSelectedContentForAI } from '../../utils/selection-utils';
import { VIDEO_MODEL_CONFIGS } from '../../constants/video-model-config';
import type { VideoModel } from '../../types/video.types';
import { useTextSelection } from '../../hooks/useTextSelection';
import { usePromptHistory } from '../../hooks/usePromptHistory';
import { useChatDrawerControl } from '../../contexts/ChatDrawerContext';
import { AI_INSTRUCTIONS } from '../../constants/prompts';
import { 
  SmartSuggestionPanel, 
  useTriggerDetection,
  insertToInput,
  type PromptItem,
} from './smart-suggestion-panel';
import { agentExecutor } from '../../services/agent';
import { initializeMCP, setCanvasBoard } from '../../mcp';
import { parseAIInput } from '../../utils/ai-input-parser';
import { convertToWorkflow, type WorkflowDefinition } from './workflow-converter';
import { useWorkflowControl } from '../../contexts/WorkflowContext';
import { geminiSettings } from '../../utils/settings-manager';
import type { WorkflowMessageData } from '../../types/chat.types';
import type { AgentExecutionContext } from '../../mcp/types';
import classNames from 'classnames';
import './ai-input-bar.scss';

/**
 * 将 WorkflowDefinition 转换为 WorkflowMessageData
 */
function toWorkflowMessageData(workflow: WorkflowDefinition): WorkflowMessageData {
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
    })),
  };
}

// 初始化 MCP 模块
let mcpInitialized = false;
if (!mcpInitialized) {
  initializeMCP();
  mcpInitialized = true;
}

export type GenerationType = 'image' | 'video';

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
    return () => setCanvasBoard(null);
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

  // 只获取需要的函数，避免整个对象变化导致重渲染
  const { createTask } = useTaskQueue();
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

  // State
  const [prompt, setPrompt] = useState('');
  const [selectedContent, setSelectedContent] = useState<SelectedContent[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false); // 仅用于防止重复点击，不阻止并行任务
  const [isFocused, setIsFocused] = useState(false);

  // 使用新的 useTriggerDetection hook 解析输入
  const parseResult = useTriggerDetection(prompt);

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

        // 同步更新 ChatDrawer 中的工作流消息
        const updatedWorkflow = workflowControl.getWorkflow();
        if (updatedWorkflow) {
          updateWorkflowMessageRef.current(toWorkflowMessageData(updatedWorkflow));
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

    const historyPrompts = history.map(item => ({
      id: item.id,
      content: item.content,
      source: 'history' as const,
      timestamp: item.timestamp,
    }));

    return [...historyPrompts, ...presetPrompts];
  }, [language, history]);

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

      // 发送工作流消息到 ChatDrawer（创建新对话并显示）
      const workflowMessageData = toWorkflowMessageData(workflow);
      await sendWorkflowMessageRef.current({
        context: aiContext,
        workflow: workflowMessageData,
        textModel, // 传递全局文本模型
      });

      // 获取最终 prompt（用于任务创建）
      const finalPrompt = parsedParams.prompt;

      // 根据场景处理
      if (parsedParams.scenario === 'direct_generation') {
        // 场景 1-3: 直接生成（无额外内容）
        // 直接创建任务添加到任务队列
        
        const { generationType, modelId, count, size, duration } = parsedParams;
        
        console.log(`[AIInputBar] Direct generation: type=${generationType}, model=${modelId}, count=${count}, size=${size}, duration=${duration}`);
        
        // 将参考图片转换为 uploadedImages 格式（与 AI 图片/视频弹窗一致）
        const uploadedImages = referenceImages.map((url, index) => ({
          type: 'url' as const,
          url,
          name: `reference-${index + 1}`,
        }));
        
        // 根据数量创建多个任务，并更新工作流步骤状态
        // 注意：任务创建后状态为 PENDING，需要等任务实际完成后才更新步骤为 completed
        // 这里使用并行创建任务，步骤状态通过 taskQueueService 的事件订阅来更新
        const createdTaskIds: string[] = [];

        // 生成批次ID和全局计数器，用于区分同一批次中的不同任务（与批量图片生成弹窗保持一致）
        const batchId = `input_${Date.now()}`;
        let globalIndex = 0;

        for (let i = 0; i < count; i++) {
          const stepId = `step-${i + 1}`;

          // 更新步骤为运行中（表示任务正在排队或执行中）
          workflowControl.updateStep(stepId, 'running');

          try {
            globalIndex++;
            let task;
            if (generationType === 'image') {
              task = createTask(
                {
                  prompt: finalPrompt,
                  size: size || '1x1',
                  uploadedImages: uploadedImages.length > 0 ? uploadedImages : undefined,
                  model: modelId,
                  // 批量参数：确保同一批次中的不同任务有唯一哈希（与批量图片生成弹窗保持一致）
                  batchId,
                  batchIndex: i + 1,
                  batchTotal: count,
                  globalIndex,
                },
                TaskType.IMAGE
              );
            } else {
              // 视频任务
              const modelConfig = VIDEO_MODEL_CONFIGS[modelId as VideoModel] || VIDEO_MODEL_CONFIGS['veo3'];
              task = createTask(
                {
                  prompt: finalPrompt,
                  size: size || '16x9',
                  duration: parseInt(duration || modelConfig.defaultDuration, 10),
                  model: modelId,
                  uploadedImages: uploadedImages.length > 0 ? uploadedImages : undefined,
                  // 批量参数：确保同一批次中的不同任务有唯一哈希（与批量图片生成弹窗保持一致）
                  batchId,
                  batchIndex: i + 1,
                  batchTotal: count,
                  globalIndex,
                },
                TaskType.VIDEO
              );
            }

            if (task) {
              createdTaskIds.push(task.id);
              // 记录任务 ID 到步骤中，便于后续状态同步
              workflowControl.updateStep(stepId, 'running', { taskId: task.id });
            } else {
              // 任务创建失败
              workflowControl.updateStep(stepId, 'failed', undefined, '任务创建失败');
            }
          } catch (stepError) {
            // 更新步骤为失败
            workflowControl.updateStep(stepId, 'failed', undefined, String(stepError));
          }
        }

        // 同步更新 ChatDrawer 中的工作流消息
        const updatedWorkflow = workflowControl.getWorkflow();
        if (updatedWorkflow) {
          updateWorkflowMessageRef.current(toWorkflowMessageData(updatedWorkflow));
        }
      } else {
        // 场景 4: Agent 流程
        // 有额外内容，需要调用 Agent
        console.log('[AIInputBar] Using Agent mode with model:', parsedParams.modelId);

        // 更新分析步骤为运行中
        const analyzeStartTime = Date.now();
        workflowControl.updateStep('step-analyze', 'running');
        // 同步更新 ChatDrawer 中的工作流消息
        const runningWorkflow = workflowControl.getWorkflow();
        if (runningWorkflow) {
          updateWorkflowMessageRef.current(toWorkflowMessageData(runningWorkflow));
        }

        // 构建 Agent 执行上下文
        const agentContext: AgentExecutionContext = {
          userInstruction: parsedParams.userInstruction,
          rawInput: parsedParams.rawInput,
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
          finalPrompt,
        };

        // 记录当前工具调用的名称，用于日志
        let currentToolName = '';

        const result = await agentExecutor.execute(agentContext, {
          model: parsedParams.modelId,
          onChunk: (chunk) => {
            console.log('[AIInputBar] Agent chunk:', chunk);
            // 流式追加 AI 思考内容到日志
            updateThinkingContentRef.current(chunk);
          },
          onToolCall: (toolCall) => {
            console.log('[AIInputBar] Agent calling tool:', toolCall.name);
            currentToolName = toolCall.name;

            // 分析步骤完成，添加工具调用步骤
            if (workflowControl.getWorkflow()?.steps.find(s => s.id === 'step-analyze')?.status === 'running') {
              workflowControl.updateStep('step-analyze', 'completed', { analysis: 'completed' }, undefined, Date.now() - analyzeStartTime);
            }

            // 动态添加工具调用步骤
            const newStepId = `step-tool-${Date.now()}`;
            workflowControl.addSteps([{
              id: newStepId,
              mcp: toolCall.name,
              args: toolCall.arguments || {},
              description: `执行 ${toolCall.name}`,
              status: 'running',
            }]);

            // 追加工具调用日志
            appendAgentLogRef.current({
              type: 'tool_call',
              timestamp: Date.now(),
              toolName: toolCall.name,
              args: toolCall.arguments || {},
            });

            // 同步更新 ChatDrawer 中的工作流消息
            const toolCallWorkflow = workflowControl.getWorkflow();
            if (toolCallWorkflow) {
              updateWorkflowMessageRef.current(toWorkflowMessageData(toolCallWorkflow));
            }
          },
          onToolResult: (toolResult) => {
            console.log('[AIInputBar] Tool result:', toolResult);

            // 追加工具结果日志
            appendAgentLogRef.current({
              type: 'tool_result',
              timestamp: Date.now(),
              toolName: currentToolName,
              success: toolResult.success,
              data: toolResult.data,
              error: toolResult.error,
              resultType: toolResult.type,
            });

            // MCP 工具已经完成了生成任务并返回了 URL
            // 这里只需要更新工作流状态，不需要再创建任务
            // 因为 MCP 工具内部已经调用了生成 API 并等待完成

            // 同步更新 ChatDrawer 中的工作流消息
            const toolResultWorkflow = workflowControl.getWorkflow();
            if (toolResultWorkflow) {
              updateWorkflowMessageRef.current(toWorkflowMessageData(toolResultWorkflow));
            }

            // 如果生成成功，结果已经在 toolResult.data 中
            // TODO: 这里可以直接把生成的图片/视频添加到画布上
            // 目前 MCP 工具返回的是 URL，需要决定是否自动添加到画布
            if (toolResult.success && toolResult.data) {
              const data = toolResult.data as any;
              console.log('[AIInputBar] Generation completed, URL:', data.url);
              // 未来可以在这里调用 addToCanvas(data.url, toolResult.type)
            }
          },
        });

        if (!result.success && result.error) {
          console.error('[AIInputBar] Agent execution failed:', result.error);
          // 更新分析步骤为失败（如果还在运行中）
          const currentWorkflow = workflowControl.getWorkflow();
          const analyzeStep = currentWorkflow?.steps.find(s => s.id === 'step-analyze');
          if (analyzeStep?.status === 'running') {
            workflowControl.updateStep('step-analyze', 'failed', undefined, result.error, Date.now() - analyzeStartTime);
            // 同步更新 ChatDrawer 中的工作流消息
            const failedWorkflow = workflowControl.getWorkflow();
            if (failedWorkflow) {
              updateWorkflowMessageRef.current(toWorkflowMessageData(failedWorkflow));
            }
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
  }, [prompt, selectedContent, createTask, isSubmitting, addHistory, workflowControl]);

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
          visible={isFocused && parseResult.mode !== null}
          mode={parseResult.mode}
          filterKeyword={parseResult.mode === 'prompt' ? parseResult.cleanText : parseResult.keyword}
          selectedImageModel={parseResult.selectedImageModel}
          selectedVideoModel={parseResult.selectedVideoModel}
          selectedParams={parseResult.selectedParams}
          selectedCount={parseResult.selectedCount}
          prompts={allPrompts}
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
