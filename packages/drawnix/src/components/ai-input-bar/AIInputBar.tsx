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
 * - Model selection dropdown with "#模型名" syntax support
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
import { calculateDimensions, DEFAULT_ASPECT_RATIO } from '../../constants/image-aspect-ratios';
import { useTextSelection } from '../../hooks/useTextSelection';
import { usePromptHistory } from '../../hooks/usePromptHistory';
import { useChatDrawerControl } from '../../contexts/ChatDrawerContext';
import { AI_IMAGE_PROMPTS } from '../../constants/prompts';
import { PromptSuggestionPanel, type PromptItem } from './PromptSuggestionPanel';
import { ModelSelector } from './ModelSelector';
import { parseModelFromInput, insertModelToInput } from '../../utils/model-parser';
import { agentExecutor } from '../../services/agent';
import { initializeMCP } from '../../mcp';
import classNames from 'classnames';
import './ai-input-bar.scss';
import './model-selector.scss';

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
  // 使用 ref 存储，避免依赖变化
  const sendMessageToChatDrawerRef = useRef(chatDrawerControl.sendMessageToChatDrawer);
  sendMessageToChatDrawerRef.current = chatDrawerControl.sendMessageToChatDrawer;

  // State
  const [prompt, setPrompt] = useState('');
  const [generationType] = useState<GenerationType>('image');
  const [selectedContent, setSelectedContent] = useState<SelectedContent[]>([]);
  const [selectedText, setSelectedText] = useState('');
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [videoModel] = useState<VideoModel>('veo3');
  const [isGenerating, setIsGenerating] = useState(false);
  const [aspectRatio] = useState(DEFAULT_ASPECT_RATIO);
  const [isFocused, setIsFocused] = useState(false);
  const [showSuggestionPanel, setShowSuggestionPanel] = useState(false);
  
  // Agent mode state
  const [agentMode] = useState(true); // 默认启用 Agent 模式
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [modelKeyword, setModelKeyword] = useState('');

  // 解析输入中的模型标记（需要在 useEffect 之前定义）
  const modelParseResult = useMemo(() => {
    return parseModelFromInput(prompt);
  }, [prompt]);

  // Auto-show suggestion panel when input is cleared (or only has model tags) and focused
  useEffect(() => {
    if (isFocused && modelParseResult.cleanText === '') {
      setShowSuggestionPanel(true);
    }
  }, [modelParseResult.cleanText, isFocused]);
  const [hoveredContent, setHoveredContent] = useState<{
    type: SelectedContentType;
    url?: string;
    text?: string;
    x: number;
    y: number;
  } | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const richDisplayRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 使用自定义 hook 处理文本选择和复制，同时阻止事件冒泡
  useTextSelection(inputRef, {
    enableCopy: true,
    stopPropagation: true,
  });

  // 合并预设提示词和历史提示词
  const allPrompts = useMemo((): PromptItem[] => {
    const presetPrompts = AI_IMAGE_PROMPTS[language].map((content, index) => ({
      id: `preset_${index}`,
      content,
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

  // Close model menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(event.target as Node)) {
        setIsModelMenuOpen(false);
      }
    };

    if (isModelMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isModelMenuOpen]);

  // 当检测到 # 时显示模型选择器
  useEffect(() => {
    if (modelParseResult.isTypingModel) {
      setShowModelSelector(true);
      setModelKeyword(modelParseResult.modelKeyword);
      setShowSuggestionPanel(false); // 隐藏提示词面板
    } else {
      setShowModelSelector(false);
      setModelKeyword('');
    }
  }, [modelParseResult]);

  // 处理模型选择
  const handleModelSelect = useCallback((modelId: string) => {
    // 将模型插入到输入中
    const newPrompt = insertModelToInput(prompt, modelId, modelParseResult.hashPosition);
    setPrompt(newPrompt);
    setShowModelSelector(false);
    // 聚焦输入框
    inputRef.current?.focus();
  }, [prompt, modelParseResult.hashPosition]);

  // Handle generation
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() && selectedContent.length === 0) return;
    if (isGenerating) return;

    setIsGenerating(true);

    try {
      // Collect all reference images (exclude text type)
      const referenceImages: string[] = selectedContent
        .filter((item) => item.type !== 'text' && item.url)
        .map((item) => item.url!);

      // 获取清理后的提示词（移除模型标记）
      const cleanPrompt = modelParseResult.cleanText || prompt.trim();
      
      // Combine selected text with user prompt
      const finalPrompt = selectedText 
        ? `${selectedText}\n${cleanPrompt}`.trim()
        : cleanPrompt;

      // Save prompt to history if not empty
      if (cleanPrompt) {
        addHistory(cleanPrompt);
      }

      // Agent 模式：让 AI 决定使用哪个工具
      if (agentMode) {
        // 使用解析出的图片模型，如果没有则使用默认模型
        const modelToUse = modelParseResult.imageModelId || 'gemini-2.5-flash';
        console.log('[AIInputBar] Using Agent mode with model:', modelToUse);
        
        const result = await agentExecutor.execute(finalPrompt, {
          model: modelToUse,
          referenceImages,
          onChunk: (chunk) => {
            console.log('[AIInputBar] Agent chunk:', chunk);
          },
          onToolCall: (toolCall) => {
            console.log('[AIInputBar] Agent calling tool:', toolCall.name);
          },
          onToolResult: (toolResult) => {
            console.log('[AIInputBar] Tool result:', toolResult);
            
            // 如果生成成功，创建任务并添加到画布
            if (toolResult.success && toolResult.data) {
              const data = toolResult.data as any;
              
              if (toolResult.type === 'image') {
                // 创建图片任务
                const { width, height } = calculateDimensions(aspectRatio);
                createTask(
                  {
                    prompt: data.prompt || finalPrompt,
                    width,
                    height,
                    referenceImages,
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
                    referenceImages,
                    // 直接使用生成的 URL
                    generatedUrl: data.url,
                  },
                  TaskType.VIDEO
                );
              }
            }
          },
        });

        // Send message to ChatDrawer
        await sendMessageToChatDrawerRef.current(finalPrompt);

        if (!result.success && result.error) {
          console.error('[AIInputBar] Agent execution failed:', result.error);
        }
      } else {
        // 传统模式：直接创建任务
        const { width, height } = calculateDimensions(aspectRatio);

        if (generationType === 'image') {
          createTask(
            {
              prompt: finalPrompt,
              width,
              height,
              referenceImages,
            },
            TaskType.IMAGE
          );
        } else {
          const modelConfig = VIDEO_MODEL_CONFIGS[videoModel];
          const [videoWidth, videoHeight] = modelConfig.defaultSize.split('x').map(Number);

          createTask(
            {
              prompt: finalPrompt,
              width: videoWidth,
              height: videoHeight,
              duration: parseInt(modelConfig.defaultDuration, 10),
              model: videoModel,
              referenceImages,
            },
            TaskType.VIDEO
          );
        }

        await sendMessageToChatDrawerRef.current(finalPrompt);
      }

      // Clear input after successful submission
      setPrompt('');
      setSelectedContent([]);
      setSelectedText('');
      setShowSuggestionPanel(false);
    } catch (error) {
      console.error('Failed to create generation task:', error);
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, selectedContent, selectedText, generationType, videoModel, aspectRatio, createTask, isGenerating, addHistory, agentMode, modelParseResult]);

  // Handle key press
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      // console.log('[AIInputBar] handleKeyDown called, key:', event.key, 'isTypingModel:', modelParseResult.isTypingModel);

      // Shift+Enter, Alt/Option+Enter 换行
      if (event.key === 'Enter' && (event.shiftKey || event.altKey)) {
        // 允许默认行为（换行）
        return;
      }

      // 单独 Enter 发送（当不在输入模型名时）
      // 使用 modelParseResult.isTypingModel 而不是 showModelSelector，避免状态更新延迟问题
      if (event.key === 'Enter' && !modelParseResult.isTypingModel) {
        // console.log('[AIInputBar] Enter pressed, will call handleGenerate');
        event.preventDefault();
        handleGenerate();
        return;
      }

      // Close panels on Escape
      if (event.key === 'Escape') {
        setShowSuggestionPanel(false);
        setShowModelSelector(false);
      }
    },
    [handleGenerate, modelParseResult.isTypingModel]
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
    // 保留模型标记，把提示词追加到后面
    const modelPrefix = prompt.replace(modelParseResult.cleanText, '').trim();
    const newPrompt = modelPrefix ? `${modelPrefix} ${promptItem.content}` : promptItem.content;
    setPrompt(newPrompt);
    setShowSuggestionPanel(false);
    // Focus input after selection
    inputRef.current?.focus();
  }, [prompt, modelParseResult.cleanText]);

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

  // Get placeholder text
  const getPlaceholder = () => {
    if (selectedContent.length > 0) {
      return language === 'zh' ? '想要做什么改变？' : 'What do you want to change?';
    }
    return language === 'zh' ? '想要创建什么？' : 'What do you want to create?';
  };

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
        {/* Model Selector - shown when typing # */}
        <ModelSelector
          visible={showModelSelector && isFocused}
          filterKeyword={modelKeyword}
          selectedImageModel={modelParseResult.imageModelId}
          selectedVideoModel={modelParseResult.videoModelId}
          onSelect={handleModelSelect}
          onClose={() => setShowModelSelector(false)}
          language={language}
        />

        {/* Prompt Suggestion Panel - shown above the input container */}
        <PromptSuggestionPanel
          visible={showSuggestionPanel && isFocused && !showModelSelector}
          prompts={allPrompts}
          filterKeyword={modelParseResult.cleanText}
          onSelect={handlePromptSelect}
          onClose={handleCloseSuggestionPanel}
          onDeleteHistory={handleDeleteHistory}
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
            {/* 高亮背景层 - 只显示模型标签的背景色块 */}
            {modelParseResult.modelTags.length > 0 && (
              <div
                ref={richDisplayRef}
                className="ai-input-bar__highlight-layer"
                aria-hidden="true"
              >
                {modelParseResult.segments.map((segment, index) => {
                  if (segment.type === 'text') {
                    // 文本部分使用透明文字，只占位
                    return <span key={index} className="ai-input-bar__highlight-text">{segment.content}</span>;
                  }
                  // 模型标签部分显示背景色块
                  const tagClass = segment.type === 'image-model'
                    ? 'ai-input-bar__highlight-tag--image'
                    : 'ai-input-bar__highlight-tag--video';
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
              placeholder={agentMode
                ? (language === 'zh' ? '描述你想创建的内容，输入 # 选择模型' : 'Describe what you want to create, type # to select model')
                : getPlaceholder()
              }
              rows={isFocused ? 4 : 1}
              disabled={isGenerating}
            />
          </div>

          {/* Right: Send button */}
          <button
            className={`ai-input-bar__send-btn ${canGenerate ? 'active' : ''} ${isGenerating ? 'loading' : ''}`}
            onClick={handleGenerate}
            disabled={!canGenerate || isGenerating}
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
