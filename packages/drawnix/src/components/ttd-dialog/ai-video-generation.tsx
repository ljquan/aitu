import React, { useState, useEffect, useRef, useMemo } from 'react';
import './ttd-dialog.scss';
import './ai-video-generation.scss';
import { useDrawnix } from '../../hooks/use-drawnix';
import { useI18n } from '../../i18n';
import { useBoard } from '@plait-board/react-board';
import { type Language } from '../../constants/prompts';
import { getSelectedElements, PlaitElement, getRectangleByElements, Point } from '@plait/core';
import { videoGeminiClient } from '../../utils/gemini-api';
import { getInsertionPointForSelectedElements } from '../../utils/selection-utils';
import { insertVideoFromUrl } from '../../data/video';
import { downloadMediaFile } from '../../utils/download-utils';
import {
  GenerationHistory,
  VideoHistoryItem,
  ImageHistoryItem
} from '../generation-history';
import { useGenerationHistory } from '../../hooks/useGenerationHistory';
import {
  useGenerationState,
  useKeyboardShortcuts,
  handleApiKeyError,
  isInvalidTokenError,
  createCacheManager,
  PreviewCacheBase,
  getPromptExample,
  ActionButtons,
  ErrorDisplay,
  ImageUpload,
  LoadingState,
  PromptInput,
  type ImageFile,
  getMergedPresetPrompts,
  savePromptToHistory as savePromptToHistoryUtil,
  DEFAULT_VIDEO_DIMENSIONS,
  getReferenceDimensionsFromIds
} from './shared';
import { AI_VIDEO_GENERATION_PREVIEW_CACHE_KEY as PREVIEW_CACHE_KEY } from '../../constants/storage';
import { useTaskQueue } from '../../hooks/useTaskQueue';
import { TaskType } from '../../types/task.types';
import { MessagePlugin } from 'tdesign-react';
import { DialogTaskList } from '../task-queue/DialogTaskList';
import { GenerationCountSelector } from './generation-count-selector/GenerationCountSelector';
import { useGenerationCount } from '../../hooks/useGenerationCount';

// 视频URL接口
interface VideoUrls {
  previewUrl: string;
  downloadUrl: string;
}

interface PreviewCache extends PreviewCacheBase {
  generatedVideo: VideoUrls | null;
  sourceImage?: string;
}

const cacheManager = createCacheManager<PreviewCache>(PREVIEW_CACHE_KEY);



interface AIVideoGenerationProps {
  initialPrompt?: string;
  initialImage?: ImageFile;
  initialDuration?: number;
  initialResultUrl?: string;
}

const AIVideoGeneration = ({
  initialPrompt = '',
  initialImage,
  initialDuration,
  initialResultUrl
}: AIVideoGenerationProps = {}) => {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [generatedVideo, setGeneratedVideo] = useState<{
    previewUrl: string;
    downloadUrl: string;
  } | null>(null);
  const [generatedVideoPrompt, setGeneratedVideoPrompt] = useState<string>(''); // Track prompt for current video
  const [isInserting, setIsInserting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedImage, setUploadedImage] = useState<ImageFile | null>(initialImage || null);

  // Use generation history from task queue
  const { videoHistory } = useGenerationHistory();

  const { isGenerating, isLoading: videoLoading, updateIsGenerating, updateIsLoading: updateVideoLoading } = useGenerationState('video');

  const { appState, setAppState } = useDrawnix();
  const { language } = useI18n();
  const board = useBoard();
  const { createBatchTasks } = useTaskQueue();
  const { count: generationCount, setCount: setGenerationCount } = useGenerationCount();

  // 保存选中元素的ID，用于计算插入位置
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);

  // Track task IDs created in this dialog session
  const [dialogTaskIds, setDialogTaskIds] = useState<string[]>([]);

  // 视频元素引用，用于控制播放状态
  const videoRef = useRef<HTMLVideoElement>(null);


  // 计算视频插入位置
  const calculateInsertionPoint = (): Point | undefined => {
    if (!board) {
      console.warn('Board is not available');
      return undefined;
    }

    // 优先使用保存的选中元素ID
    if (selectedElementIds.length > 0 && board.children && Array.isArray(board.children)) {
      const allElements = board.children as PlaitElement[];
      const savedSelectedElements = allElements.filter(el => 
        selectedElementIds.includes((el as any).id || '')
      );
      
      if (savedSelectedElements.length > 0) {
        const rectangle = getRectangleByElements(board, savedSelectedElements, false);
        const centerX = rectangle.x + rectangle.width / 2;
        const bottomY = rectangle.y + rectangle.height + 20; // 在底部留20px间距
        return [centerX, bottomY] as Point;
      }
    }

    // 使用工具函数获取当前选中元素的插入位置
    const calculatedPoint = getInsertionPointForSelectedElements(board);
    return calculatedPoint || undefined;
  };

  useEffect(() => {
    const cachedData = cacheManager.load();
    if (cachedData) {
      setPrompt(cachedData.prompt);
      setGeneratedVideo(cachedData.generatedVideo);
      setGeneratedVideoPrompt(cachedData.prompt); // Set prompt for download
    }

    if (board) {
      const currentSelectedElements = getSelectedElements(board);
      const elementIds = currentSelectedElements.map(el => (el as any).id || '').filter(Boolean);
      setSelectedElementIds(elementIds);
      console.log('Saved selected element IDs for video insertion:', elementIds);
    }
  }, [board]);


  useEffect(() => {
    setPrompt(initialPrompt);
    setUploadedImage(initialImage || null);
    setError(null);

    // 如果编辑任务且有结果URL,显示预览视频
    if (initialResultUrl) {
      setGeneratedVideo({
        previewUrl: initialResultUrl,
        downloadUrl: initialResultUrl
      });
      setGeneratedVideoPrompt(initialPrompt);
    } else if (initialPrompt || initialImage) {
      // 当弹窗重新打开时（有新的初始数据），清除预览视频
      setGeneratedVideo(null);
      // 清除缓存
      try {
        localStorage.removeItem(PREVIEW_CACHE_KEY);
      } catch (error) {
        console.warn('Failed to clear cache:', error);
      }
    }
  }, [initialPrompt, initialImage, initialResultUrl]);

  useEffect(() => {
    setError(null);
  }, []);


  const handleReset = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = '';
      videoRef.current.load();
    }

    setPrompt('');
    setUploadedImage(null);
    setGeneratedVideo(null);
    setError(null);
    setDialogTaskIds([]); // 清除任务列表
    cacheManager.clear();
    window.dispatchEvent(new CustomEvent('ai-video-clear'));
  };

  // 设置生成视频并预加载
  const setGeneratedVideoWithPreload = async (videoUrls: VideoUrls) => {
    updateVideoLoading(true);
    try {
      setGeneratedVideo(videoUrls);
      
      // 保存到缓存
      const cacheData: PreviewCache = {
        prompt,
        generatedVideo: videoUrls,
        timestamp: Date.now(),
        sourceImage: uploadedImage instanceof File ? URL.createObjectURL(uploadedImage) : uploadedImage?.url
      };
      cacheManager.save(cacheData);

    } catch (error) {
      console.warn('Failed to set generated video:', error);
      setGeneratedVideo(videoUrls);
    } finally {
      updateVideoLoading(false);
    }
  };

  // 从历史记录选择视频
  const selectFromHistory = (historyItem: VideoHistoryItem) => {
    setPrompt(historyItem.prompt);
    setGeneratedVideo({
      previewUrl: historyItem.previewUrl,
      downloadUrl: historyItem.downloadUrl || historyItem.previewUrl
    });
    setGeneratedVideoPrompt(historyItem.prompt); // Save prompt for download

    // 设置参考图片 (如果有的话)
    setUploadedImage(historyItem.uploadedImage || null);

    // 选择历史记录时清除错误状态
    setError(null);

    // 更新预览缓存
    const cacheData: PreviewCache = {
      prompt: historyItem.prompt,
      generatedVideo: {
        previewUrl: historyItem.previewUrl,
        downloadUrl: historyItem.downloadUrl || historyItem.previewUrl
      },
      timestamp: Date.now()
    };
    cacheManager.save(cacheData);
  };

  // 通用历史选择处理器（兼容各种类型）
  const handleSelectFromHistory = (item: VideoHistoryItem | ImageHistoryItem) => {
    if (item.type === 'video') {
      selectFromHistory(item as VideoHistoryItem);
    }
    // 视频生成组件不处理图片类型
  };

  // 使用useMemo优化性能，当videoHistory或language变化时重新计算
  const presetPrompts = React.useMemo(() =>
    getMergedPresetPrompts('video', language as Language, videoHistory),
    [videoHistory, language]
  );

  // 保存提示词到历史记录（去重）
  const savePromptToHistory = (promptText: string) => {
    const dimensions = { width: DEFAULT_VIDEO_DIMENSIONS.width, height: DEFAULT_VIDEO_DIMENSIONS.height };
    savePromptToHistoryUtil('video', promptText, dimensions);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError(language === 'zh' ? '请输入视频描述' : 'Please enter video description');
      return;
    }

    try {
      // Convert File object to base64 data URL for serialization
      let convertedImage: { type: 'url'; url: string; name: string } | undefined;
      if (uploadedImage) {
        if (uploadedImage.file) {
          // Convert File to base64 data URL
          convertedImage = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              resolve({
                type: 'url',
                url: reader.result as string,
                name: uploadedImage.name
              });
            };
            reader.onerror = reject;
            reader.readAsDataURL(uploadedImage.file!);
          });
        } else if (uploadedImage.url) {
          convertedImage = { type: 'url', url: uploadedImage.url, name: uploadedImage.name };
        }
      }

      // 创建任务参数
      const taskParams = {
        prompt: prompt.trim(),
        // 保存上传的图片（已转换为可序列化的格式）
        uploadedImage: convertedImage
      };

      // 创建批量任务并添加到队列
      const tasks = createBatchTasks(taskParams, TaskType.VIDEO, generationCount);

      if (tasks.length > 0) {
        // 任务创建成功
        const message = generationCount > 1
          ? (language === 'zh'
            ? `${tasks.length} 个视频任务已添加到队列，将在后台生成`
            : `${tasks.length} video tasks added to queue, will be generated in background`)
          : (language === 'zh'
            ? '视频任务已添加到队列，将在后台生成'
            : 'Video task added to queue, will be generated in background');
        MessagePlugin.success(message);

        // 保存任务ID到对话框任务列表
        setDialogTaskIds(prev => [...prev, ...tasks.map(t => t.id)]);

        // 保存提示词到历史记录
        savePromptToHistory(prompt);

        // 完全清空表单（prompt、参考图、预览）
        setPrompt('');
        setUploadedImage(null);
        setGeneratedVideo(null);
        setError(null);

        // 清除视频播放
        if (videoRef.current) {
          videoRef.current.pause();
          videoRef.current.src = '';
          videoRef.current.load();
        }

        // 清除缓存
        cacheManager.clear();
      } else {
        // 任务创建失败
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

  // 组件卸载时清理视频播放
  useEffect(() => {
    return () => {
      // 暂停视频播放
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.src = '';
        videoRef.current.load();
      }
    };
  }, []);

  return (
    <div className="ai-video-generation-container">
      <div className="main-content">
        {/* AI 视频生成表单 */}
        <div className="ai-image-generation-section">
          <div className="ai-image-generation-form">
            
            <ImageUpload
              images={uploadedImage ? [uploadedImage] : []}
              onImagesChange={(images) => setUploadedImage(images[0] || null)}
              language={language}
              disabled={isGenerating}
              multiple={false}
              icon="🎬"
              onError={setError}
            />
            
            <PromptInput
              prompt={prompt}
              onPromptChange={setPrompt}
              presetPrompts={presetPrompts}
              language={language}
              type="video"
              disabled={isGenerating}
              onError={setError}
            />

            <GenerationCountSelector
              value={generationCount}
              onChange={setGenerationCount}
              language={language as 'zh' | 'en'}
              disabled={isGenerating}
            />

            <ErrorDisplay error={error} />
          </div>

          <ActionButtons
            language={language}
            type="video"
            isGenerating={isGenerating}
            hasGenerated={!!generatedVideo}
            canGenerate={!!prompt.trim()}
            onGenerate={handleGenerate}
            onReset={handleReset}
          />
        </div>

          <div className="preview-section">
        <div className="image-preview-container">
          <LoadingState
            language={language}
            type="video"
            isGenerating={isGenerating}
            isLoading={videoLoading}
            hasContent={!!generatedVideo}
          />
          
          {generatedVideo && (
            <div className="preview-image-wrapper">
              <video
                ref={videoRef}
                src={generatedVideo.previewUrl}
                controls
                loop
                muted
                className="preview-image"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                onLoadedData={() => console.log('Preview video loaded successfully')}
                onError={() => {
                  console.warn('Preview video failed to load:', generatedVideo.previewUrl);
                }}
              />
            </div>
          )}
        </div>

        {/* 插入、下载和清除按钮区域 */}
        {generatedVideo && (
          <div className="section-actions">
            <button
              onClick={() => {
                // 暂停并清理视频
                if (videoRef.current) {
                  videoRef.current.pause();
                  videoRef.current.src = '';
                  videoRef.current.load();
                }
                
                setGeneratedVideo(null);
                try {
                  localStorage.removeItem(PREVIEW_CACHE_KEY);
                } catch (error) {
                  console.warn('Failed to clear cache:', error);
                }
              }}
              disabled={isGenerating || videoLoading}
              className="action-button tertiary"
            >
              {language === 'zh' ? '清除' : 'Clear'}
            </button>
            <button
              onClick={async () => {
                if (generatedVideo) {
                  try {
                    setIsInserting(true);
                    console.log('Starting video insertion with URL...', generatedVideo.previewUrl);

                    // 调试：检查当前选中状态
                    const currentSelectedElements = board ? getSelectedElements(board) : [];
                    console.log('Current selected elements:', currentSelectedElements.length, currentSelectedElements);
                    console.log('Saved selected element IDs:', selectedElementIds);

                    // 计算参考尺寸（用于适应选中元素的大小）
                    const referenceDimensions = getReferenceDimensionsFromIds(board, selectedElementIds);
                    console.log('Reference dimensions for video insertion:', referenceDimensions);

                    // 计算插入位置
                    const insertionPoint = calculateInsertionPoint();
                    console.log('Calculated insertion point:', insertionPoint);

                    await insertVideoFromUrl(board, generatedVideo.previewUrl, insertionPoint, false, referenceDimensions);

                    console.log('Video inserted successfully!');

                    // 清除缓存
                    try {
                      localStorage.removeItem(PREVIEW_CACHE_KEY);
                    } catch (error) {
                      console.warn('Failed to clear cache:', error);
                    }

                    // 关闭对话框
                    setAppState({ ...appState, openDialogType: null });

                  } catch (err) {
                    console.error('Insert video error:', err);
                    setError(
                      language === 'zh'
                        ? '视频插入失败，请稍后重试'
                        : 'Video insertion failed, please try again later'
                    );
                  } finally {
                    setIsInserting(false);
                  }
                }
              }}
              disabled={isGenerating || videoLoading || isInserting}
              className="action-button primary"
            >
              {isInserting
                ? (language === 'zh' ? '插入中...' : 'Inserting...')
                : videoLoading
                ? (language === 'zh' ? '加载中...' : 'Loading...')
                : (language === 'zh' ? '插入视频' : 'Insert Video')
              }
            </button>
            <button
              onClick={async () => {
                if (generatedVideo) {
                  try {
                    // Extract file extension from URL
                    let format = 'mp4';
                    try {
                      const urlPath = new URL(generatedVideo.downloadUrl).pathname;
                      const ext = urlPath.substring(urlPath.lastIndexOf('.') + 1).toLowerCase();
                      if (ext && ['mp4', 'webm', 'mov'].includes(ext)) {
                        format = ext;
                      }
                    } catch (e) {
                      // Keep default format
                    }

                    await downloadMediaFile(
                      generatedVideo.downloadUrl,
                      generatedVideoPrompt || 'video',
                      format,
                      'video'
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
              disabled={isGenerating || videoLoading || isInserting}
              className="action-button secondary"
            >
              {videoLoading
                ? (language === 'zh' ? '加载中...' : 'Loading...')
                : (language === 'zh' ? '下载' : 'Download')
              }
            </button>

          </div>
        )}
            {/* 统一历史记录组件 */}
            <GenerationHistory
              historyItems={videoHistory}
              onSelectFromHistory={handleSelectFromHistory}
            />
      </div>
      </div>
      
      {/* 预览区域 */}
    

                {/* 对话框任务列表 - 只显示本次对话框生成的任务 */}
          <DialogTaskList taskIds={dialogTaskIds} taskType={TaskType.VIDEO} />
    </div>
  );
};

export default AIVideoGeneration;