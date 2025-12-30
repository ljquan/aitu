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
 * - Model selection dropdown
 * - Send button to trigger generation
 * - Prompt suggestion panel with history and presets
 * - Integration with ChatDrawer for conversation display
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
import classNames from 'classnames';
import './ai-input-bar.scss';

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

export const AIInputBar: React.FC<AIInputBarProps> = ({ className }) => {
  const board = useBoard();
  const { language } = useI18n();
  const { createTask } = useTaskQueue();
  const { history, addHistory, removeHistory } = usePromptHistory();
  const { sendMessageToChatDrawer } = useChatDrawerControl();

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

  // Auto-show suggestion panel when input is cleared and focused
  useEffect(() => {
    if (isFocused && prompt.trim() === '') {
      setShowSuggestionPanel(true);
    }
  }, [prompt, isFocused]);
  const [hoveredContent, setHoveredContent] = useState<{
    type: SelectedContentType;
    url?: string;
    text?: string;
    x: number;
    y: number;
  } | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
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

  // Handle selection change - process all selected elements using the same logic as AI generation
  useEffect(() => {
    if (!board) return;

    const handleSelectionChange = async () => {
      const selectedElements = getSelectedElements(board);
      
      if (selectedElements.length === 0) {
        setSelectedContent([]);
        setSelectedText('');
        return;
      }

      try {
        // Use the same processing logic as AI image/video generation
        const processedContent = await processSelectedContentForAI(board);
        const content: SelectedContent[] = [];

        // Add graphics image if exists (converted from graphics elements)
        if (processedContent.graphicsImage) {
          content.push({
            url: processedContent.graphicsImage,
            name: language === 'zh' ? '图形元素' : 'Graphics',
            type: 'graphics',
          });
        }

        // Add remaining images - distinguish between images and videos (sync, no thumbnail generation)
        for (const img of processedContent.remainingImages) {
          const imgUrl = img.url || '';
          const isVideo = isVideoUrl(imgUrl);
          
          content.push({
            url: imgUrl,
            name: img.name || (isVideo ? `video-${Date.now()}` : `image-${Date.now()}`),
            type: isVideo ? 'video' : 'image',
          });
        }

        // Add text content if exists
        if (processedContent.remainingText && processedContent.remainingText.trim()) {
          content.push({
            type: 'text',
            text: processedContent.remainingText.trim(),
            name: language === 'zh' ? '文字内容' : 'Text Content',
          });
        }

        setSelectedContent(content);
        setSelectedText(processedContent.remainingText || '');
      } catch (error) {
        console.error('Failed to process selected content:', error);
        setSelectedContent([]);
        setSelectedText('');
      }
    };

    // Initial check
    handleSelectionChange();

    // Listen to selection changes via board events
    const observer = new MutationObserver(() => {
      handleSelectionChange();
    });

    // Observe the board container for selection changes
    const boardContainer = document.querySelector('.plait-board-container');
    if (boardContainer) {
      observer.observe(boardContainer, {
        attributes: true,
        subtree: true,
        attributeFilter: ['class'],
      });
    }

    // Also listen to mouseup for selection changes
    const handleMouseUp = () => {
      setTimeout(handleSelectionChange, 50);
    };
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      observer.disconnect();
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [board, language]);

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

  // Handle generation
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() && selectedContent.length === 0) return;
    if (isGenerating) return;

    setIsGenerating(true);

    try {
      // Get aspect ratio dimensions
      const { width, height } = calculateDimensions(aspectRatio);

      // Collect all reference images (exclude text type)
      const referenceImages: string[] = selectedContent
        .filter((item) => item.type !== 'text' && item.url)
        .map((item) => item.url!);

      // Combine selected text with user prompt
      const finalPrompt = selectedText 
        ? `${selectedText}\n${prompt.trim()}`.trim()
        : prompt.trim();

      // Save prompt to history if not empty
      if (prompt.trim()) {
        addHistory(prompt.trim());
      }

      if (generationType === 'image') {
        // Create image generation task
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
        // Create video generation task
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

      // Send message to ChatDrawer and open it
      await sendMessageToChatDrawer(finalPrompt);

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
  }, [prompt, selectedContent, selectedText, generationType, videoModel, aspectRatio, createTask, isGenerating, addHistory, sendMessageToChatDrawer]);

  // Handle key press
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleGenerate();
      }
      // Close suggestion panel on Escape
      if (event.key === 'Escape') {
        setShowSuggestionPanel(false);
      }
    },
    [handleGenerate]
  );

  // Handle input focus
  const handleFocus = useCallback(() => {
    setIsFocused(true);
    setShowSuggestionPanel(true);
  }, []);

  // Handle input blur
  const handleBlur = useCallback(() => {
    setIsFocused(false);
    // Don't close suggestion panel immediately - let click events process first
  }, []);

  // Handle prompt selection from suggestion panel
  const handlePromptSelect = useCallback((promptItem: PromptItem) => {
    setPrompt(promptItem.content);
    setShowSuggestionPanel(false);
    // Focus input after selection
    inputRef.current?.focus();
  }, []);

  // Handle close suggestion panel
  const handleCloseSuggestionPanel = useCallback(() => {
    setShowSuggestionPanel(false);
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
        {/* Prompt Suggestion Panel - shown above the input container */}
        <PromptSuggestionPanel
          visible={showSuggestionPanel && isFocused}
          prompts={allPrompts}
          filterKeyword={prompt}
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
          {/* Text input */}
          <textarea
            ref={inputRef}
            className={classNames('ai-input-bar__input', { 'ai-input-bar__input--focused': isFocused })}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={getPlaceholder()}
            rows={isFocused ? 4 : 1}
            disabled={isGenerating}
          />

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
};

export default AIInputBar;
