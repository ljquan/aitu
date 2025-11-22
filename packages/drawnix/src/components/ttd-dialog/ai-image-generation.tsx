import React, { useState, useEffect } from 'react';
import './ttd-dialog.scss';
import './ai-image-generation.scss';
import { useDrawnix } from '../../hooks/use-drawnix';
import { useI18n } from '../../i18n';
import { useBoard } from '@plait-board/react-board';
import { type Language } from '../../constants/prompts';
import { getSelectedElements, PlaitElement, getRectangleByElements, Point } from '@plait/core';
import { defaultGeminiClient } from '../../utils/gemini-api';
import { insertImageFromUrl } from '../../data/image';
import { useTaskQueue } from '../../hooks/useTaskQueue';
import { TaskType } from '../../types/task.types';
import { MessagePlugin } from 'tdesign-react';
import {
  GenerationHistory,
  ImageHistoryItem,
  VideoHistoryItem
} from '../generation-history';
import { useGenerationHistory } from '../../hooks/useGenerationHistory';
import {
  useGenerationState,
  useKeyboardShortcuts,
  handleApiKeyError,
  isInvalidTokenError,
  createCacheManager,
  PreviewCacheBase,
  ActionButtons,
  ErrorDisplay,
  ImageUpload,
  LoadingState,
  PromptInput,
  type ImageFile,
  calculateInsertionPointFromIds,
  getMergedPresetPrompts,
  savePromptToHistory as savePromptToHistoryUtil,
  preloadImage,
  DEFAULT_IMAGE_DIMENSIONS,
  getReferenceDimensionsFromIds
} from './shared';
import { AI_IMAGE_GENERATION_PREVIEW_CACHE_KEY as PREVIEW_CACHE_KEY } from '../../constants/storage';

interface PreviewCache extends PreviewCacheBase {
  generatedImage: string | null;
  width: number | string;
  height: number | string;
}

const cacheManager = createCacheManager<PreviewCache>(PREVIEW_CACHE_KEY);



interface AIImageGenerationProps {
  initialPrompt?: string;
  initialImages?: ImageFile[];
  selectedElementIds?: string[];
}

const AIImageGeneration = ({ initialPrompt = '', initialImages = [], selectedElementIds = [] }: AIImageGenerationProps = {}) => {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [width, setWidth] = useState<number | string>(DEFAULT_IMAGE_DIMENSIONS.width);
  const [height, setHeight] = useState<number | string>(DEFAULT_IMAGE_DIMENSIONS.height);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [useImageAPI] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<ImageFile[]>(initialImages);
  // Use generation history from task queue
  const { imageHistory } = useGenerationHistory();
  
  const { isGenerating, isLoading: imageLoading, updateIsGenerating, updateIsLoading: updateImageLoading } = useGenerationState('image');

  const { appState, setAppState } = useDrawnix();
  const { language } = useI18n();
  const board = useBoard();
  const { createTask } = useTaskQueue();

  // 计算插入位置
  const calculateInsertionPoint = (): Point | undefined => {
    return calculateInsertionPointFromIds(board, selectedElementIds);
  };



  useEffect(() => {
    const cachedData = cacheManager.load();
    if (cachedData) {
      setPrompt(cachedData.prompt);
      setWidth(cachedData.width);
      setHeight(cachedData.height);
      setGeneratedImage(cachedData.generatedImage);
    }
  }, []);


  // 处理 props 变化，更新内部状态
  useEffect(() => {
    setPrompt(initialPrompt);
    setUploadedImages(initialImages);
    // 当弹窗重新打开时（有新的初始数据），清除预览图片
    if (initialPrompt || initialImages.length > 0) {
      setGeneratedImage(null);
      // 清除缓存
      try {
        localStorage.removeItem(PREVIEW_CACHE_KEY);
      } catch (error) {
        console.warn('Failed to clear cache:', error);
      }
    }
  }, [initialPrompt, initialImages]);

  // 清除错误状态当组件挂载时（对话框打开时）
  useEffect(() => {
    // 组件挂载时清除之前的错误状态
    setError(null);
    
    // 清理函数：组件卸载时也清除错误状态
    return () => {
      setError(null);
    };
  }, []); // 空依赖数组，只在组件挂载/卸载时执行


  // 重置所有状态
  const handleReset = () => {
    setPrompt('');
    setUploadedImages([]);
    setGeneratedImage(null);
    setError(null);
    // 清除缓存
    try {
      localStorage.removeItem(PREVIEW_CACHE_KEY);
    } catch (error) {
      console.warn('Failed to clear cache:', error);
    }
    // 触发Footer组件更新
    window.dispatchEvent(new CustomEvent('ai-image-clear'));
  };


  // 设置生成图片并预加载
  const setGeneratedImageWithPreload = async (imageUrl: string) => {
    updateImageLoading(true);
    try {
      // 预加载图片
      await preloadImage(imageUrl);
      setGeneratedImage(imageUrl);
      
      // 保存到缓存
      const cacheData: PreviewCache = {
        prompt,
        generatedImage: imageUrl,
        timestamp: Date.now(),
        width,
        height
      };
      cacheManager.save(cacheData);
    } catch (error) {
      console.warn('Failed to preload image, setting anyway:', error);
      // 即使预加载失败，也设置图片URL，让浏览器正常加载
      setGeneratedImage(imageUrl);
      
      // 保存到缓存
      const cacheData: PreviewCache = {
        prompt,
        generatedImage: imageUrl,
        timestamp: Date.now(),
        width,
        height
      };
      cacheManager.save(cacheData);
    } finally {
      updateImageLoading(false);
    }
  };

  // 从历史记录选择图片
  const selectFromHistory = (historyItem: ImageHistoryItem) => {
    setPrompt(historyItem.prompt);
    setWidth(historyItem.width);
    setHeight(historyItem.height);
    setGeneratedImage(historyItem.imageUrl);
    
    // 更新预览缓存
    const cacheData: PreviewCache = {
      prompt: historyItem.prompt,
      generatedImage: historyItem.imageUrl,
      timestamp: Date.now(),
      width: historyItem.width,
      height: historyItem.height
    };
    cacheManager.save(cacheData);
  };

  // 通用历史选择处理器（兼容各种类型）
  const handleSelectFromHistory = (item: ImageHistoryItem | VideoHistoryItem) => {
    if (item.type === 'image') {
      selectFromHistory(item as ImageHistoryItem);
    }
    // 图片生成组件不处理视频类型
  };

  // 使用useMemo优化性能，当imageHistory或language变化时重新计算
  const presetPrompts = React.useMemo(() =>
    getMergedPresetPrompts('image', language as Language, imageHistory),
    [imageHistory, language]
  );

  // 保存提示词到历史记录（去重）
  const savePromptToHistory = (promptText: string) => {
    const dimensions = {
      width: typeof width === 'string' ? parseInt(width) || DEFAULT_IMAGE_DIMENSIONS.width : width,
      height: typeof height === 'string' ? parseInt(height) || DEFAULT_IMAGE_DIMENSIONS.height : height
    };
    savePromptToHistoryUtil('image', promptText, dimensions);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError(language === 'zh' ? '请输入图像描述' : 'Please enter image description');
      return;
    }

    try {
      const finalWidth = typeof width === 'string' ? (parseInt(width) || 1024) : width;
      const finalHeight = typeof height === 'string' ? (parseInt(height) || 1024) : height;
      
      // 创建任务参数
      const taskParams = {
        prompt: prompt.trim(),
        width: finalWidth,
        height: finalHeight,
        // 保存上传的图片引用（如果有）
        uploadedImages: uploadedImages.map(img => {
          if (img instanceof File) {
            return { type: 'file', name: img.name };
          } else {
            return { type: 'url', url: img.url, name: img.name };
          }
        })
      };

      // 创建任务并添加到队列
      const task = createTask(taskParams, TaskType.IMAGE);
      
      if (task) {
        // 任务创建成功
        MessagePlugin.success(
          language === 'zh' 
            ? '任务已添加到队列，将在后台生成' 
            : 'Task added to queue, will be generated in background'
        );

        // 保存提示词到历史记录
        savePromptToHistory(prompt);

        // 清空表单，允许用户继续生成
        handleReset();
      } else {
        // 任务创建失败（可能是重复提交）
        setError(
          language === 'zh' 
            ? '任务创建失败，请检查参数或稍后重试' 
            : 'Failed to create task, please check parameters or try again later'
        );
      }
    } catch (err: any) {
      console.error('Failed to create task:', err);
      setError(
        language === 'zh' 
          ? `创建任务失败: ${err.message}` 
          : `Failed to create task: ${err.message}`
      );
    }
  };


  useKeyboardShortcuts(isGenerating, prompt, handleGenerate);






  return (
    <div className="ai-image-generation-container">
      <div className="main-content">
        {/* AI 图像生成表单 */}
        <div className="ai-image-generation-section">
        <div className="ai-image-generation-form">
          
          {!useImageAPI && (
            <ImageUpload
              images={uploadedImages}
              onImagesChange={setUploadedImages}
              language={language}
              disabled={isGenerating}
              multiple={true}
              onError={setError}
            />
          )}
          
          <PromptInput
            prompt={prompt}
            onPromptChange={setPrompt}
            presetPrompts={presetPrompts}
            language={language}
            type="image"
            disabled={isGenerating}
            onError={setError}
          />
          
          {/* 图片尺寸选择 */}
          {/* <div className="form-field">
            <label className="form-label">
              {language === 'zh' ? '图片尺寸' : 'Image Size'}
            </label>
            <div className="size-inputs">
              <div className="size-input-row">
                <label className="size-label">
                  {language === 'zh' ? '宽度' : 'Width'}
                </label>
                <input
                  type="number"
                  className="size-input"
                  value={width}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '') {
                      setWidth('');
                    } else {
                      const numValue = parseInt(value);
                      if (!isNaN(numValue) && numValue >= 0) {
                        setWidth(Math.min(2048, numValue));
                      }
                    }
                  }}
                  onBlur={(e) => {
                    const value = e.target.value;
                    if (value === '' || isNaN(parseInt(value)) || parseInt(value) < 256) {
                      setWidth(1024);
                    } else {
                      const numValue = Math.max(256, Math.min(2048, parseInt(value)));
                      setWidth(numValue);
                    }
                  }}
                  min="256"
                  max="2048"
                  disabled={isGenerating}
                />
              </div>
              <div className="size-input-row">
                <label className="size-label">
                  {language === 'zh' ? '高度' : 'Height'}
                </label>
                <input
                  type="number"
                  className="size-input"
                  value={height}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '') {
                      setHeight('');
                    } else {
                      const numValue = parseInt(value);
                      if (!isNaN(numValue) && numValue >= 0) {
                        setHeight(Math.min(2048, numValue));
                      }
                    }
                  }}
                  onBlur={(e) => {
                    const value = e.target.value;
                    if (value === '' || isNaN(parseInt(value)) || parseInt(value) < 256) {
                      setHeight(1024);
                    } else {
                      const numValue = Math.max(256, Math.min(2048, parseInt(value)));
                      setHeight(numValue);
                    }
                  }}
                  min="256"
                  max="2048"
                  disabled={isGenerating}
                />
                <div className="size-shortcuts-tooltip">
                  <span className="tooltip-trigger">📐</span>
                  <div className="tooltip-content">
                    <div className="tooltip-header">
                      {language === 'zh' ? '常用尺寸' : 'Common Sizes'}
                    </div>
                    <div className="shortcuts-grid">
                      <button
                        type="button"
                        className="shortcut-button"
                        onClick={() => { setWidth(512); setHeight(512); }}
                        disabled={isGenerating}
                      >
                        512×512
                      </button>
                      <button
                        type="button"
                        className="shortcut-button"
                        onClick={() => { setWidth(768); setHeight(768); }}
                        disabled={isGenerating}
                      >
                        768×768
                      </button>
                      <button
                        type="button"
                        className="shortcut-button"
                        onClick={() => { setWidth(1024); setHeight(1024); }}
                        disabled={isGenerating}
                      >
                        1024×1024
                      </button>
                      <button
                        type="button"
                        className="shortcut-button"
                        onClick={() => { setWidth(1024); setHeight(768); }}
                        disabled={isGenerating}
                      >
                        1024×768
                      </button>
                      <button
                        type="button"
                        className="shortcut-button"
                        onClick={() => { setWidth(1280); setHeight(720); }}
                        disabled={isGenerating}
                      >
                        1280×720
                      </button>
                      <button
                        type="button"
                        className="shortcut-button"
                        onClick={() => { setWidth(1920); setHeight(1080); }}
                        disabled={isGenerating}
                      >
                        1920×1080
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div> */}
          
          {/* API 模式选择 */}
          {/* <div className="form-field">
            <label className="form-label">
              {language === 'zh' ? 'API 模式' : 'API Mode'}
            </label>
            <div className="api-mode-selector">
              <label className="api-mode-option">
                <input
                  type="radio"
                  name="api-mode"
                  checked={useImageAPI}
                  onChange={() => setUseImageAPI(true)}
                  disabled={isGenerating}
                />
                <span className="api-mode-label">
                  {language === 'zh' ? '图像生成API' : 'Image Generation API'}
                </span>
                <span className="api-mode-desc">
                  {language === 'zh' ? '(images/generations)' : '(images/generations)'}
                </span>
              </label>
              <label className="api-mode-option">
                <input
                  type="radio"
                  name="api-mode"
                  checked={!useImageAPI}
                  onChange={() => setUseImageAPI(false)}
                  disabled={isGenerating}
                />
                <span className="api-mode-label">
                  {language === 'zh' ? '聊天API' : 'Chat API'}
                </span>
                <span className="api-mode-desc">
                  {language === 'zh' ? '(chat/completions)' : '(chat/completions)'}
                </span>
              </label>
            </div>
          </div> */}
          
          <ErrorDisplay error={error} />
        </div>
        
        <ActionButtons
          language={language}
          type="image"
          isGenerating={isGenerating}
          hasGenerated={!!generatedImage}
          canGenerate={!!prompt.trim()}
          onGenerate={handleGenerate}
          onReset={handleReset}
        />
        
      </div>
      
      {/* 预览区域 */}
      <div className="preview-section">
        <div className="image-preview-container">
          <LoadingState
            language={language}
            type="image"
            isGenerating={isGenerating}
            isLoading={imageLoading}
            hasContent={!!generatedImage}
          />
          
          {generatedImage && (
            <div className="preview-image-wrapper">
              <img 
                src={generatedImage} 
                alt="Generated" 
                className="preview-image"
                loading="eager"
                decoding="async"
                onLoad={() => console.log('Preview image loaded successfully')}
                onError={() => {
                  console.warn('Preview image failed to load:', generatedImage);
                }}
              />
            </div>
          )}
              {/* 统一历史记录组件 */}
              <GenerationHistory
                historyItems={imageHistory}
                onSelectFromHistory={handleSelectFromHistory}
              />

        </div>
        
        {/* 插入和清除按钮区域 */}
        {generatedImage && (
          <div className="section-actions">
            <button
              onClick={() => {
                setGeneratedImage(null);
                try {
                  localStorage.removeItem(PREVIEW_CACHE_KEY);
                } catch (error) {
                  console.warn('Failed to clear cache:', error);
                }
              }}
              disabled={isGenerating || imageLoading}
              className="action-button tertiary"
            >
              {language === 'zh' ? '清除' : 'Clear'}
            </button>
            <button
              onClick={async () => {
                if (generatedImage) {
                  try {
                    console.log('Starting image insertion with URL...', generatedImage);

                    // 调试：检查当前选中状态
                    const currentSelectedElements = board ? getSelectedElements(board) : [];
                    console.log('Current selected elements:', currentSelectedElements.length, currentSelectedElements);
                    console.log('Saved selected element IDs:', selectedElementIds);

                    // 计算参考尺寸（用于适应选中元素的大小）
                    const referenceDimensions = getReferenceDimensionsFromIds(board, selectedElementIds);
                    console.log('Reference dimensions for image insertion:', referenceDimensions);

                    // 计算插入位置
                    const insertionPoint = calculateInsertionPoint();
                    console.log('Calculated insertion point:', insertionPoint);

                    await insertImageFromUrl(board, generatedImage, insertionPoint, false, referenceDimensions);

                    console.log('Image inserted successfully!');

                    // 清除缓存
                    try {
                      localStorage.removeItem(PREVIEW_CACHE_KEY);
                    } catch (error) {
                      console.warn('Failed to clear cache:', error);
                    }

                    // 关闭对话框
                    setAppState({ ...appState, openDialogType: null });

                  } catch (err) {
                    console.error('Insert image error:', err);
                    setError(
                      language === 'zh'
                        ? `插入图片失败: ${err instanceof Error ? err.message : '未知错误'}`
                        : `Failed to insert image: ${err instanceof Error ? err.message : 'Unknown error'}`
                    );
                  }
                }
              }}
              disabled={isGenerating || imageLoading}
              className="action-button secondary"
            >
              {imageLoading
                ? (language === 'zh' ? '加载中...' : 'Loading...')
                : (language === 'zh' ? '插入' : 'Insert')
              }
            </button>
          </div>
        )}
        
      </div>
      </div>
      
    </div>
  );
};

export default AIImageGeneration;