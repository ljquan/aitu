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
import { downloadMediaFile } from '../../utils/download-utils';
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
import { DialogTaskList } from '../task-queue/DialogTaskList';

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
  initialWidth?: number;
  initialHeight?: number;
  initialResultUrl?: string;
}

const AIImageGeneration = ({
  initialPrompt = '',
  initialImages = [],
  selectedElementIds = [],
  initialWidth,
  initialHeight,
  initialResultUrl
}: AIImageGenerationProps = {}) => {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [width, setWidth] = useState<number | string>(initialWidth || DEFAULT_IMAGE_DIMENSIONS.width);
  const [height, setHeight] = useState<number | string>(initialHeight || DEFAULT_IMAGE_DIMENSIONS.height);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [generatedImagePrompt, setGeneratedImagePrompt] = useState<string>(''); // Track prompt for current image
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

  // Track task IDs created in this dialog session
  const [dialogTaskIds, setDialogTaskIds] = useState<string[]>([]);

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
      setGeneratedImagePrompt(cachedData.prompt); // Set prompt for download
    }
  }, []);


  // 处理 props 变化，更新内部状态
  useEffect(() => {
    setPrompt(initialPrompt);
    setUploadedImages(initialImages);
    if (initialWidth) setWidth(initialWidth);
    if (initialHeight) setHeight(initialHeight);

    // 如果编辑任务且有结果URL,显示预览图
    if (initialResultUrl) {
      setGeneratedImage(initialResultUrl);
      setGeneratedImagePrompt(initialPrompt);
    } else if (initialPrompt || initialImages.length > 0) {
      // 当弹窗重新打开时（有新的初始数据），清除预览图片
      setGeneratedImage(null);
      // 清除缓存
      try {
        localStorage.removeItem(PREVIEW_CACHE_KEY);
      } catch (error) {
        console.warn('Failed to clear cache:', error);
      }
    }
  }, [initialPrompt, initialImages, initialWidth, initialHeight, initialResultUrl]);

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
    setDialogTaskIds([]); // 清除任务列表
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
    setGeneratedImagePrompt(historyItem.prompt); // Save prompt for download

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

        // 保存任务ID到对话框任务列表
        setDialogTaskIds(prev => [...prev, task.id]);

        // 保存提示词到历史记录
        savePromptToHistory(prompt);

        // 完全清空表单（prompt、参考图、预览）
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
              className="action-button primary"
            >
              {imageLoading
                ? (language === 'zh' ? '加载中...' : 'Loading...')
                : (language === 'zh' ? '插入图片' : 'Insert Image')
              }
            </button>
            <button
              onClick={async () => {
                if (generatedImage) {
                  try {
                    // Extract file extension from URL
                    let format = 'png';
                    try {
                      const urlPath = new URL(generatedImage).pathname;
                      const ext = urlPath.substring(urlPath.lastIndexOf('.') + 1).toLowerCase();
                      if (ext && ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
                        format = ext;
                      }
                    } catch (e) {
                      // Keep default format
                    }

                    await downloadMediaFile(
                      generatedImage,
                      generatedImagePrompt || 'image',
                      format,
                      'image'
                    );
                    MessagePlugin.success(language === 'zh' ? '下载成功' : 'Download successful');
                  } catch (err) {
                    console.error('Download failed:', err);
                    MessagePlugin.error(
                      language === 'zh'
                        ? '下载失败，请重试'
                        : 'Download failed, please try again'
                    );
                  }
                }
              }}
              disabled={isGenerating || imageLoading}
              className="action-button secondary"
            >
              {imageLoading
                ? (language === 'zh' ? '加载中...' : 'Loading...')
                : (language === 'zh' ? '下载' : 'Download')
              }
            </button>

          </div>
        )}
            {/* 统一历史记录组件 */}
            <GenerationHistory
              historyItems={imageHistory}
              onSelectFromHistory={handleSelectFromHistory}
            />
      </div>
      </div>


      {/* 对话框任务列表 - 只显示本次对话框生成的任务 */}
      <DialogTaskList taskIds={dialogTaskIds} taskType={TaskType.IMAGE} />
    </div>
  );
};

export default AIImageGeneration;