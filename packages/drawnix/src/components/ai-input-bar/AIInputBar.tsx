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
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Image, Video, ChevronUp, Send, Upload, Type, Play } from 'lucide-react';
import { useBoard } from '@plait-board/react-board';
import { getSelectedElements, ATTACHED_ELEMENT_CLASS_NAME } from '@plait/core';
import { useI18n } from '../../i18n';
import { useTaskQueue } from '../../hooks/useTaskQueue';
import { TaskType } from '../../types/task.types';
import { processSelectedContentForAI } from '../../utils/selection-utils';
import { VIDEO_MODEL_CONFIGS, getVideoModelOptions } from '../../constants/video-model-config';
import type { VideoModel } from '../../types/video.types';
import { calculateDimensions, DEFAULT_ASPECT_RATIO } from '../../constants/image-aspect-ratios';
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

  // State
  const [prompt, setPrompt] = useState('');
  const [generationType, setGenerationType] = useState<GenerationType>('image');
  const [selectedContent, setSelectedContent] = useState<SelectedContent[]>([]);
  const [selectedText, setSelectedText] = useState('');
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [videoModel, setVideoModel] = useState<VideoModel>('veo3');
  const [isGenerating, setIsGenerating] = useState(false);
  const [aspectRatio] = useState(DEFAULT_ASPECT_RATIO);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get current model label
  const currentModelLabel = generationType === 'video'
    ? VIDEO_MODEL_CONFIGS[videoModel]?.label || 'Veo 3'
    : 'Gemini';

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

  // Handle image upload from local
  const handleImageUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const validFiles = Array.from(files).filter(
      (file) => file.type.startsWith('image/') && file.size <= 10 * 1024 * 1024
    );

    for (const file of validFiles) {
      const reader = new FileReader();
      reader.onload = () => {
        setSelectedContent((prev) => [
          ...prev,
          {
            url: reader.result as string,
            name: file.name,
            type: 'image',
          },
        ]);
      };
      reader.readAsDataURL(file);
    }

    event.target.value = '';
  }, []);

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

      // Clear input after successful submission
      setPrompt('');
      setSelectedContent([]);
      setSelectedText('');
    } catch (error) {
      console.error('Failed to create generation task:', error);
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, selectedContent, selectedText, generationType, videoModel, aspectRatio, createTask, isGenerating]);

  // Handle key press
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleGenerate();
      }
    },
    [handleGenerate]
  );

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
      className={classNames('ai-input-bar', ATTACHED_ELEMENT_CLASS_NAME, className)}
    >
      {/* Selected content preview - shown above the input bar */}
      {selectedContent.length > 0 && (
        <div className="ai-input-bar__content-preview">
          {selectedContent.map((item, index) => (
              <div 
                key={`${item.type}-${index}`} 
                className={`ai-input-bar__content-item ai-input-bar__content-item--${item.type}`}
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

      {/* Main input container - single row layout */}
      <div className="ai-input-bar__container">
        {/* Left: Tool buttons group */}
        <div className="ai-input-bar__tools">
          {/* Image/Video toggle */}
          <div className="ai-input-bar__type-toggle">
            <button
              className={`ai-input-bar__type-btn ${generationType === 'image' ? 'active' : ''}`}
              onClick={() => setGenerationType('image')}
              title={language === 'zh' ? '图片' : 'Image'}
            >
              <Image size={18} />
            </button>
            <button
              className={`ai-input-bar__type-btn ${generationType === 'video' ? 'active' : ''}`}
              onClick={() => setGenerationType('video')}
              title={language === 'zh' ? '视频' : 'Video'}
            >
              <Video size={18} />
            </button>
          </div>

          {/* Model selector */}
          <div className="ai-input-bar__model-selector" ref={modelMenuRef}>
            <button
              className="ai-input-bar__model-btn"
              onClick={() => setIsModelMenuOpen(!isModelMenuOpen)}
            >
              <span>{currentModelLabel}</span>
              <ChevronUp size={14} className={isModelMenuOpen ? '' : 'rotated'} />
            </button>

            {isModelMenuOpen && (
              <div className="ai-input-bar__model-menu">
                {generationType === 'video' ? (
                  getVideoModelOptions().map((option) => (
                    <button
                      key={option.value}
                      className={`ai-input-bar__model-option ${videoModel === option.value ? 'active' : ''}`}
                      onClick={() => {
                        setVideoModel(option.value);
                        setIsModelMenuOpen(false);
                      }}
                    >
                      <span className="model-name">{option.label}</span>
                      <span className="model-desc">
                        {VIDEO_MODEL_CONFIGS[option.value]?.description}
                      </span>
                    </button>
                  ))
                ) : (
                  <button
                    className="ai-input-bar__model-option active"
                    onClick={() => setIsModelMenuOpen(false)}
                  >
                    <span className="model-name">Gemini</span>
                    <span className="model-desc">
                      {language === 'zh' ? 'Google AI 图片生成' : 'Google AI Image Generation'}
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Upload button */}
          <button
            className="ai-input-bar__upload-btn"
            onClick={() => fileInputRef.current?.click()}
            title={language === 'zh' ? '上传图片' : 'Upload Image'}
          >
            <Upload size={18} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageUpload}
            style={{ display: 'none' }}
          />
        </div>

        {/* Center: Text input */}
        <textarea
          ref={inputRef}
          className="ai-input-bar__input"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={getPlaceholder()}
          rows={1}
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
  );
};

export default AIInputBar;
