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
import { calculateDimensions, DEFAULT_ASPECT_RATIO } from '../../constants/image-aspect-ratios';
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
import { initializeMCP } from '../../mcp';
import classNames from 'classnames';
import './ai-input-bar.scss';

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
  const [selectedContent, setSelectedContent] = useState<SelectedContent[]>([]);
  const [selectedText, setSelectedText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [aspectRatio] = useState(DEFAULT_ASPECT_RATIO);
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
    if (isGenerating) return;

    setIsGenerating(true);

    try {
      // Collect all reference images (exclude text type)
      const referenceImages: string[] = selectedContent
        .filter((item) => item.type !== 'text' && item.url)
        .map((item) => item.url!);

      // 获取清理后的提示词（移除模型/参数/个数标记）
      const cleanPrompt = parseResult.cleanText || prompt.trim();
      
      // Combine selected text with user prompt
      const finalPrompt = selectedText 
        ? `${selectedText}\n${cleanPrompt}`.trim()
        : cleanPrompt;

      // Save prompt to history if not empty
      if (cleanPrompt) {
        addHistory(cleanPrompt);
      }

      // 使用解析出的图片模型，如果没有则使用默认模型
      const modelToUse = parseResult.selectedImageModel || 'gemini-2.5-flash';
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
  }, [prompt, selectedContent, selectedText, aspectRatio, createTask, isGenerating, addHistory, parseResult]);

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
