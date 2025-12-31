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
import { TaskType } from '../../types/task.types';
import { processSelectedContentForAI } from '../../utils/selection-utils';
import { VIDEO_MODEL_CONFIGS } from '../../constants/video-model-config';
import type { VideoModel } from '../../types/video.types';
import { useTextSelection } from '../../hooks/useTextSelection';
import { usePromptHistory } from '../../hooks/usePromptHistory';
import { useChatDrawerControl } from '../../contexts/ChatDrawerContext';
import { AI_IMAGE_PROMPTS } from '../../constants/prompts';
import { 
  SmartSuggestionPanel, 
  useTriggerDetection,
  insertToInput,
  type PromptItem,
} from './smart-suggestion-panel';
import { agentExecutor } from '../../services/agent';
import { initializeMCP, setCanvasBoard } from '../../mcp';
import { parseAIInput, generateDefaultPrompt } from '../../utils/ai-input-parser';
import { convertToWorkflow, type WorkflowDefinition } from './workflow-converter';
import { useWorkflowControl } from '../../contexts/WorkflowContext';
import type { WorkflowMessageData } from '../../types/chat.types';
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
  onSelectionChange: (content: SelectedContent[], text: string) => void;
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
        onSelectionChangeRef.current([], '');
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

        onSelectionChangeRef.current(content, processedContent.remainingText || '');
      } catch (error) {
        console.error('Failed to process selected content:', error);
        onSelectionChangeRef.current([], '');
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

  // State
  const [prompt, setPrompt] = useState('');
  const [selectedContent, setSelectedContent] = useState<SelectedContent[]>([]);
  const [selectedText, setSelectedText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false); // 仅用于防止重复点击，不阻止并行任务
  const [isFocused, setIsFocused] = useState(false);
  const [showSuggestionPanel, setShowSuggestionPanel] = useState(false);

  // 使用新的 useTriggerDetection hook 解析输入
  const parseResult = useTriggerDetection(prompt);

  // Auto-show suggestion panel when input is cleared and focused
  useEffect(() => {
    if (isFocused && parseResult.cleanText === '') {
      setShowSuggestionPanel(true);
    }
  }, [parseResult.cleanText, isFocused]);

  // 点击外部关闭输入框的展开状态
  useEffect(() => {
    if (!isFocused) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // 检查点击是否在 AIInputBar 容器外部
      if (containerRef.current && !containerRef.current.contains(target)) {
        setIsFocused(false);
        setShowSuggestionPanel(false);
      }
    };

    // 使用 mousedown 而不是 click，以便在失焦前处理
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isFocused]);
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

  // 合并预设提示词和历史提示词
  const allPrompts = useMemo((): PromptItem[] => {
    const presetPrompts = AI_IMAGE_PROMPTS[language].map((item, index) => ({
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
  const handleSelectionChange = useCallback((content: SelectedContent[], text: string) => {
    setSelectedContent(content);
    setSelectedText(text);
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
      // 收集所有参考图片（排除文字类型）
      const referenceImages: string[] = selectedContent
        .filter((item) => item.type !== 'text' && item.url)
        .map((item) => item.url!);

      // 收集选中的文字内容
      const selectedTexts: string[] = selectedContent
        .filter((item) => item.type === 'text' && item.text)
        .map((item) => item.text!);

      // 图片数量（包括图形）
      const imageCount = selectedContent.filter(
        (item) => item.type === 'image' || item.type === 'graphics'
      ).length;

      // 解析输入内容
      const parsedParams = parseAIInput(
        prompt,
        selectedContent.length > 0,
        selectedTexts,
        imageCount
      );

      console.log('[AIInputBar] Parsed params:', parsedParams);

      // 构建最终提示词
      let finalPrompt = parsedParams.prompt;
      
      // 如果有选中的文字且用户也输入了内容，合并它们
      if (selectedText && parsedParams.parseResult.cleanText) {
        finalPrompt = `${selectedText}\n${parsedParams.parseResult.cleanText}`.trim();
      } else if (selectedText && !parsedParams.parseResult.cleanText) {
        // 只有选中文字，没有用户输入
        finalPrompt = selectedText;
      }

      // 如果最终没有 prompt，使用默认 prompt
      if (!finalPrompt) {
        finalPrompt = generateDefaultPrompt(
          selectedContent.length > 0,
          selectedTexts,
          imageCount
        );
      }

      // 更新 parsedParams 的 prompt
      const updatedParams = { ...parsedParams, prompt: finalPrompt };

      // 保存提示词到历史记录
      if (parsedParams.parseResult.cleanText) {
        addHistory(parsedParams.parseResult.cleanText);
      }

      console.log('[AIInputBar] Final prompt:', finalPrompt);
      console.log('[AIInputBar] Scenario:', parsedParams.scenario);

      // 创建工作流定义
      const workflow = convertToWorkflow(updatedParams, referenceImages);
      console.log('[AIInputBar] Created workflow:', workflow);

      // 启动工作流（内部状态管理）
      workflowControl.startWorkflow(workflow);

      // 发送工作流消息到 ChatDrawer（创建新对话并显示）
      const workflowMessageData = toWorkflowMessageData(workflow);
      await sendWorkflowMessageRef.current({
        prompt: finalPrompt,
        images: referenceImages,
        workflow: workflowMessageData,
      });

      // 根据场景处理
      if (parsedParams.scenario === 'direct_generation') {
        // 场景 1-3: 直接生成（无额外内容）
        // 直接创建任务添加到任务队列
        
        const { generationType, modelId, count, width, height, duration } = parsedParams;
        
        console.log(`[AIInputBar] Direct generation: type=${generationType}, model=${modelId}, count=${count}`);
        
        // 将参考图片转换为 uploadedImages 格式（与 AI 图片/视频弹窗一致）
        const uploadedImages = referenceImages.map((url, index) => ({
          type: 'url' as const,
          url,
          name: `reference-${index + 1}`,
        }));
        
        // 根据数量创建多个任务，并更新工作流步骤状态
        for (let i = 0; i < count; i++) {
          const stepId = `step-${i + 1}`;
          const startTime = Date.now();
          
          // 更新步骤为运行中
          workflowControl.updateStep(stepId, 'running');
          // 同步更新 ChatDrawer 中的工作流消息
          const currentWorkflow = workflowControl.getWorkflow();
          if (currentWorkflow) {
            updateWorkflowMessageRef.current(toWorkflowMessageData(currentWorkflow));
          }
          
          try {
            if (generationType === 'image') {
              createTask(
                {
                  prompt: finalPrompt,
                  width: width || 1024,
                  height: height || 1024,
                  uploadedImages: uploadedImages.length > 0 ? uploadedImages : undefined,
                  model: modelId,
                },
                TaskType.IMAGE
              );
            } else {
              // 视频任务
              const modelConfig = VIDEO_MODEL_CONFIGS[modelId as VideoModel] || VIDEO_MODEL_CONFIGS['veo3'];
              createTask(
                {
                  prompt: finalPrompt,
                  width: width || 1280,
                  height: height || 720,
                  duration: parseInt(duration || modelConfig.defaultDuration, 10),
                  model: modelId,
                  uploadedImages: uploadedImages.length > 0 ? uploadedImages : undefined,
                },
                TaskType.VIDEO
              );
            }
            
            // 更新步骤为完成（任务已添加到队列）
            workflowControl.updateStep(stepId, 'completed', { taskAdded: true }, undefined, Date.now() - startTime);
            // 同步更新 ChatDrawer 中的工作流消息
            const updatedWorkflow = workflowControl.getWorkflow();
            if (updatedWorkflow) {
              updateWorkflowMessageRef.current(toWorkflowMessageData(updatedWorkflow));
            }
          } catch (stepError) {
            // 更新步骤为失败
            workflowControl.updateStep(stepId, 'failed', undefined, String(stepError), Date.now() - startTime);
            // 同步更新 ChatDrawer 中的工作流消息
            const failedWorkflow = workflowControl.getWorkflow();
            if (failedWorkflow) {
              updateWorkflowMessageRef.current(toWorkflowMessageData(failedWorkflow));
            }
          }
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
        
        // 将参考图片转换为 uploadedImages 格式
        const uploadedImages = referenceImages.map((url, index) => ({
          type: 'url' as const,
          url,
          name: `reference-${index + 1}`,
        }));
        
        const result = await agentExecutor.execute(finalPrompt, {
          model: parsedParams.modelId,
          referenceImages,
          onChunk: (chunk) => {
            console.log('[AIInputBar] Agent chunk:', chunk);
          },
          onToolCall: (toolCall) => {
            console.log('[AIInputBar] Agent calling tool:', toolCall.name);
            
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
            
            // 同步更新 ChatDrawer 中的工作流消息
            const toolCallWorkflow = workflowControl.getWorkflow();
            if (toolCallWorkflow) {
              updateWorkflowMessageRef.current(toWorkflowMessageData(toolCallWorkflow));
            }
          },
          onToolResult: (toolResult) => {
            console.log('[AIInputBar] Tool result:', toolResult);
            
            // 如果生成成功，创建任务并添加到画布
            if (toolResult.success && toolResult.data) {
              const data = toolResult.data as any;
              
              if (toolResult.type === 'image') {
                // 创建图片任务
                createTask(
                  {
                    prompt: data.prompt || finalPrompt,
                    width: parsedParams.width || 1024,
                    height: parsedParams.height || 1024,
                    uploadedImages: uploadedImages.length > 0 ? uploadedImages : undefined,
                    // 直接使用生成的 URL
                    generatedUrl: data.url,
                  },
                  TaskType.IMAGE
                );
              } else if (toolResult.type === 'video') {
                // 创建视频任务
                const modelConfig = VIDEO_MODEL_CONFIGS[data.model as VideoModel] || VIDEO_MODEL_CONFIGS['veo3'];
                const [videoWidth, videoHeight] = (data.size || modelConfig.defaultSize).split('x').map(Number);
                
                createTask(
                  {
                    prompt: data.prompt || finalPrompt,
                    width: videoWidth,
                    height: videoHeight,
                    duration: parseInt(data.seconds || modelConfig.defaultDuration, 10),
                    model: data.model || 'veo3',
                    uploadedImages: uploadedImages.length > 0 ? uploadedImages : undefined,
                    // 直接使用生成的 URL
                    generatedUrl: data.url,
                  },
                  TaskType.VIDEO
                );
              }
            }
            
            // 同步更新 ChatDrawer 中的工作流消息
            const toolResultWorkflow = workflowControl.getWorkflow();
            if (toolResultWorkflow) {
              updateWorkflowMessageRef.current(toWorkflowMessageData(toolResultWorkflow));
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
      setSelectedText('');
      setShowSuggestionPanel(false);
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
  }, [prompt, selectedContent, selectedText, createTask, isSubmitting, addHistory, workflowControl]);

  // Handle key press
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      // Shift+Enter, Alt/Option+Enter 换行
      if (event.key === 'Enter' && (event.shiftKey || event.altKey)) {
        return;
      }

      // 单独 Enter 发送（当不在输入触发字符后的内容时）
      // 检查是否在输入模型/参数/个数
      const isTypingTrigger = parseResult.mode === 'model' || 
                              parseResult.mode === 'param' || 
                              parseResult.mode === 'count';
      
      if (event.key === 'Enter' && !isTypingTrigger) {
        event.preventDefault();
        handleGenerate();
        return;
      }

      // Close panels on Escape
      if (event.key === 'Escape') {
        setShowSuggestionPanel(false);
      }
    },
    [handleGenerate, parseResult.mode]
  );

  // Handle input focus
  const handleFocus = useCallback(() => {
    setIsFocused(prev => {
      if (prev) return prev; // 已经是 true，不触发更新
      return true;
    });
    setShowSuggestionPanel(prev => {
      if (prev) return prev;
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
    setShowSuggestionPanel(false);
    inputRef.current?.focus();
  }, [prompt, parseResult.cleanText]);

  // Handle close suggestion panel
  const handleCloseSuggestionPanel = useCallback(() => {
    setShowSuggestionPanel(prev => {
      if (!prev) return prev;
      return false;
    });
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
          visible={(showSuggestionPanel || parseResult.mode !== 'prompt') && isFocused}
          mode={parseResult.mode}
          filterKeyword={parseResult.keyword}
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
