import { Dialog, DialogContent } from '../dialog/dialog';
import MermaidToDrawnix from './mermaid-to-drawnix';
import { DialogType, useDrawnix } from '../../hooks/use-drawnix';
import MarkdownToDrawnix from './markdown-to-drawnix';
import AIImageGeneration from './ai-image-generation';
import AIVideoGeneration from './ai-video-generation';
import { useI18n } from '../../i18n';
import { useBoard } from '@plait-board/react-board';
import React, { useState, useEffect, useRef, memo, useCallback, lazy, Suspense } from 'react';
import { processSelectedContentForAI, extractSelectedContent } from '../../utils/selection-utils';
import {
  AI_IMAGE_GENERATION_PREVIEW_CACHE_KEY,
  AI_VIDEO_GENERATION_PREVIEW_CACHE_KEY,
  AI_IMAGE_MODE_CACHE_KEY
} from '../../constants/storage';
import { geminiSettings } from '../../utils/settings-manager';
import { WinBoxWindow } from '../winbox';
import type { VideoModel } from '../../types/video.types';

// 懒加载批量出图组件
const BatchImageGeneration = lazy(() => import('./batch-image-generation'));

// 图像生成模式类型
type ImageGenerationMode = 'single' | 'batch';

const TTDDialogComponent = ({ container }: { container: HTMLElement | null }) => {
  const { appState, setAppState } = useDrawnix();
  const { language } = useI18n();
  const board = useBoard();

  // 使用ref来防止多次并发处理
  const isProcessingRef = useRef(false);
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 模型选择状态
  const [selectedImageModel, setSelectedImageModel] = useState<string>('');
  const [selectedVideoModel, setSelectedVideoModel] = useState<string>('');

  // 加载当前模型设置
  useEffect(() => {
    const config = geminiSettings.get();
    setSelectedImageModel(config.imageModelName || 'gemini-3-pro-image-preview-vip');
    setSelectedVideoModel(config.videoModelName || 'veo3');
  }, []);

  // 监听设置变化,同步更新模型选择器
  useEffect(() => {
    const handleSettingsChange = (newSettings: any) => {
      // console.log('TTDDialog - settings changed:', newSettings);
      if (newSettings.imageModelName) {
        // console.log('Updating selectedImageModel to:', newSettings.imageModelName);
        setSelectedImageModel(newSettings.imageModelName);
      }
      if (newSettings.videoModelName) {
        // console.log('Updating selectedVideoModel to:', newSettings.videoModelName);
        setSelectedVideoModel(newSettings.videoModelName);
      }
    };
    geminiSettings.addListener(handleSettingsChange);
    return () => geminiSettings.removeListener(handleSettingsChange);
  }, []);

  // 图片模型变更处理（同步更新到全局设置）
  const handleImageModelChange = (value: string) => {
    setSelectedImageModel(value);
    const config = geminiSettings.get();
    geminiSettings.update({
      ...config,
      imageModelName: value
    });
  };

  // 视频模型变更处理（同步更新到全局设置）
  const handleVideoModelChange = (value: string) => {
    setSelectedVideoModel(value);
    const config = geminiSettings.get();
    geminiSettings.update({
      ...config,
      videoModelName: value
    });
  };

  // AI 图片生成的初始数据
  const [aiImageData, setAiImageData] = useState<{
    initialPrompt: string;
    initialImages: (File | { url: string; name: string })[];
    selectedElementIds: string[]; // 保存选中元素的IDs
    initialResultUrl?: string; // 初始结果URL,用于显示预览
  }>({
    initialPrompt: '',
    initialImages: [],
    selectedElementIds: []
  });

  // AI 视频生成的初始数据
  const [aiVideoData, setAiVideoData] = useState<{
    initialPrompt: string;
    initialImage?: File | { url: string; name: string };
    initialImages?: any[];  // 支持多图片格式
    initialDuration?: number;
    initialModel?: VideoModel;
    initialSize?: string;
    initialResultUrl?: string;
  }>({
    initialPrompt: '',
    initialImage: undefined
  });

  // 图片生成窗口是否需要最大化（批量模式时自动最大化）
  const [imageDialogAutoMaximize, setImageDialogAutoMaximize] = useState(false);

  // 图片生成模式状态（单图 / 批量）
  const [imageGenerationMode, setImageGenerationMode] = useState<ImageGenerationMode>(() => {
    try {
      const savedMode = localStorage.getItem(AI_IMAGE_MODE_CACHE_KEY);
      return savedMode === 'batch' ? 'batch' : 'single';
    } catch (e) {
      return 'single';
    }
  });

  // 处理图片生成模式变化
  const handleImageModeChange = useCallback((mode: ImageGenerationMode) => {
    setImageGenerationMode(mode);
    setImageDialogAutoMaximize(mode === 'batch');
    try {
      localStorage.setItem(AI_IMAGE_MODE_CACHE_KEY, mode);
    } catch (e) {
      console.warn('Failed to save image mode:', e);
    }
  }, []);

  // 当对话框将要打开时，预先计算是否需要自动放大
  // 这需要在 WinBox 组件渲染前确定，且逻辑需要与 AIImageGeneration 的模式判断一致
  useEffect(() => {
    if (appState.openDialogType === DialogType.aiImageGeneration) {
      // 如果有初始图片或初始提示词，说明是带内容进入，不自动放大（强制单图模式）
      const hasInitialContent =
        (aiImageData.initialImages && aiImageData.initialImages.length > 0) ||
        (aiImageData.initialPrompt && aiImageData.initialPrompt.trim() !== '');

      if (hasInitialContent) {
        setImageDialogAutoMaximize(false);
        return;
      }
      // 否则读取 localStorage 中保存的模式
      try {
        const savedMode = localStorage.getItem(AI_IMAGE_MODE_CACHE_KEY);
        setImageDialogAutoMaximize(savedMode === 'batch');
      } catch (e) {
        setImageDialogAutoMaximize(false);
      }
    }
  }, [appState.openDialogType, aiImageData.initialImages, aiImageData.initialPrompt]);

  // 使用 useRef 来跟踪上一次的 openDialogType，避免不必要的处理
  const prevOpenDialogTypeRef = useRef<typeof appState.openDialogType>(null);
  
  // 当 AI 图片生成对话框打开时，处理选中内容
  useEffect(() => {
    // 确保board存在并且弹窗确实要打开
    if (!board || !appState.openDialogType) {
      prevOpenDialogTypeRef.current = appState.openDialogType;
      return;
    }
    
    // 检查是否真的是新的对话框打开，而不是重复触发
    if (prevOpenDialogTypeRef.current === appState.openDialogType) {
      // console.log('Dialog type unchanged, skipping processing...');
      return;
    }
    
    // 防止多次并发处理
    if (isProcessingRef.current) {
      // console.log('Already processing content, skipping...');
      return;
    }
    
    // 更新上一次的状态
    prevOpenDialogTypeRef.current = appState.openDialogType;
    
    if (appState.openDialogType === DialogType.aiImageGeneration) {
      const processSelection = async () => {
        isProcessingRef.current = true;
        
        // 设置超时保护，防止处理状态被永久锁定
        if (processingTimeoutRef.current) {
          clearTimeout(processingTimeoutRef.current);
        }
        processingTimeoutRef.current = setTimeout(() => {
          console.warn('Processing timeout, resetting processing state');
          isProcessingRef.current = false;
        }, 10000); // 10秒超时
        
        try {
          // 如果有初始数据（从任务编辑传入），直接使用
          if (appState.dialogInitialData) {
            setAiImageData({
              initialPrompt: appState.dialogInitialData.initialPrompt || appState.dialogInitialData.prompt || '',
              initialImages: appState.dialogInitialData.initialImages || appState.dialogInitialData.uploadedImages || [],
              selectedElementIds: [],
              initialResultUrl: appState.dialogInitialData.initialResultUrl || appState.dialogInitialData.resultUrl
            });
            return;
          }

          // 使用保存在appState中的最近选中元素IDs
          const selectedElementIds = appState.lastSelectedElementIds || [];
          // console.log('Using saved selected element IDs for AI image generation:', selectedElementIds);

          // 使用新的处理逻辑来处理选中的内容,传入保存的元素IDs
          const processedContent = await processSelectedContentForAI(board, selectedElementIds);
          
          // 准备图片列表
          const imageItems: (File | { url: string; name: string })[] = [];
          
          // 1. 先添加剩余的图片（非重叠的图片）
          processedContent.remainingImages.forEach(image => {
            imageItems.push({
              url: image.url,
              name: image.name || `selected-image-${Date.now()}.png`
            });
          });
          
          // 2. 后添加由图形元素生成的图片（如果存在）
          if (processedContent.graphicsImage) {
            imageItems.push({
              url: processedContent.graphicsImage,
              name: `graphics-combined-${Date.now()}.png`
            });
          }

          // 设置 AI 图片生成的初始数据
          setAiImageData({
            initialPrompt: processedContent.remainingText || '',
            initialImages: imageItems,
            selectedElementIds: selectedElementIds
          });
          
        } catch (error) {
          console.warn('Error processing selected content for AI:', error);
          
          // 如果新的处理逻辑失败，回退到原来的逻辑
          const selectedContent = extractSelectedContent(board);
          
          const imageItems = selectedContent.images.map(image => ({
            url: image.url,
            name: image.name || `selected-image-${Date.now()}.png`
          }));
          
          setAiImageData({
            initialPrompt: selectedContent.text || '',
            initialImages: imageItems,
            selectedElementIds: [] // 回退情况下没有选中元素信息
          });
        } finally {
          isProcessingRef.current = false;
          if (processingTimeoutRef.current) {
            clearTimeout(processingTimeoutRef.current);
            processingTimeoutRef.current = null;
          }
        }
      };

      processSelection();
    }

    // 处理 AI 视频生成的选中内容
    if (appState.openDialogType === DialogType.aiVideoGeneration) {
      const processVideoSelection = async () => {
        isProcessingRef.current = true;
        
        // 设置超时保护，防止处理状态被永久锁定
        if (processingTimeoutRef.current) {
          clearTimeout(processingTimeoutRef.current);
        }
        processingTimeoutRef.current = setTimeout(() => {
          console.warn('Video processing timeout, resetting processing state');
          isProcessingRef.current = false;
        }, 10000); // 10秒超时
        
        try {
          // 如果有初始数据（从任务编辑传入），直接使用
          if (appState.dialogInitialData) {
            // console.log('Video generation - dialogInitialData:', appState.dialogInitialData);
            const videoData = {
              initialPrompt: appState.dialogInitialData.initialPrompt || appState.dialogInitialData.prompt || '',
              initialImage: appState.dialogInitialData.initialImage || appState.dialogInitialData.uploadedImage,
              initialImages: appState.dialogInitialData.initialImages || appState.dialogInitialData.uploadedImages,
              initialDuration: appState.dialogInitialData.initialDuration || appState.dialogInitialData.duration,
              initialModel: appState.dialogInitialData.initialModel || appState.dialogInitialData.model,
              initialSize: appState.dialogInitialData.initialSize || appState.dialogInitialData.size,
              initialResultUrl: appState.dialogInitialData.initialResultUrl || appState.dialogInitialData.resultUrl
            };
            // console.log('Video generation - setting aiVideoData:', videoData);
            setAiVideoData(videoData);
            return;
          }

          // 使用保存在appState中的最近选中元素IDs
          const selectedElementIds = appState.lastSelectedElementIds || [];
          // console.log('Using saved selected element IDs for AI video generation:', selectedElementIds);

          // 使用新的处理逻辑来处理选中的内容,传入保存的元素IDs
          const processedContent = await processSelectedContentForAI(board, selectedElementIds);

          // 对于视频生成，传入所有选中的图片（支持多图片模型）
          const allImages: Array<{ url: string; name: string }> = [];

          if (processedContent.remainingImages.length > 0) {
            processedContent.remainingImages.forEach((image, index) => {
              allImages.push({
                url: image.url,
                name: image.name || `selected-image-${index + 1}-${Date.now()}.png`
              });
            });
          } else if (processedContent.graphicsImage) {
            allImages.push({
              url: processedContent.graphicsImage,
              name: `graphics-combined-${Date.now()}.png`
            });
          }

          // 设置 AI 视频生成的初始数据，传入所有图片
          setAiVideoData({
            initialPrompt: processedContent.remainingText || '',
            initialImage: allImages.length > 0 ? allImages[0] : undefined,  // 向后兼容
            initialImages: allImages.map((img, index) => ({
              slot: index,
              slotLabel: `参考图${index + 1}`,
              url: img.url,
              name: img.name,
            }))
          });
          
        } catch (error) {
          console.warn('Error processing selected content for AI video:', error);

          // 如果新的处理逻辑失败，回退到原来的逻辑，但同样传入所有图片
          const selectedContent = extractSelectedContent(board);

          const fallbackImages = selectedContent.images.map((image, index) => ({
            url: image.url,
            name: image.name || `selected-image-${index + 1}-${Date.now()}.png`
          }));

          setAiVideoData({
            initialPrompt: selectedContent.text || '',
            initialImage: fallbackImages.length > 0 ? fallbackImages[0] : undefined,
            initialImages: fallbackImages.map((img, index) => ({
              slot: index,
              slotLabel: `参考图${index + 1}`,
              url: img.url,
              name: img.name,
            }))
          });
        } finally {
          isProcessingRef.current = false;
          if (processingTimeoutRef.current) {
            clearTimeout(processingTimeoutRef.current);
            processingTimeoutRef.current = null;
          }
        }
      };

      processVideoSelection();
    }
  }, [appState.openDialogType]); // Remove board dependency to prevent recursive updates
  
  // 清理处理状态当弹窗关闭时
  useEffect(() => {
    if (!appState.openDialogType) {
      isProcessingRef.current = false;
      prevOpenDialogTypeRef.current = null;
    }
  }, [appState.openDialogType]);

  // WinBox 关闭回调
  const handleImageDialogClose = useCallback(() => {
    // 在关闭前保存AI图片生成的缓存
    const cached = localStorage.getItem(AI_IMAGE_GENERATION_PREVIEW_CACHE_KEY);
    if (cached) {
      try {
        const data = JSON.parse(cached);
        data.timestamp = Date.now();
        localStorage.setItem(AI_IMAGE_GENERATION_PREVIEW_CACHE_KEY, JSON.stringify(data));
      } catch (error) {
        console.warn('Failed to update cache timestamp:', error);
      }
    }
    // console.log('Image dialog closing - selection should be preserved');
    setAppState(prev => ({
      ...prev,
      openDialogType: null,
    }));
  }, [setAppState]);

  const handleVideoDialogClose = useCallback(() => {
    // 在关闭前保存AI视频生成的缓存
    const cached = localStorage.getItem(AI_VIDEO_GENERATION_PREVIEW_CACHE_KEY);
    if (cached) {
      try {
        const data = JSON.parse(cached);
        data.timestamp = Date.now();
        localStorage.setItem(AI_VIDEO_GENERATION_PREVIEW_CACHE_KEY, JSON.stringify(data));
      } catch (error) {
        console.warn('Failed to update cache timestamp:', error);
      }
    }
    // console.log('Video dialog closing - selection should be preserved');
    setAppState(prev => ({
      ...prev,
      openDialogType: null,
    }));
  }, [setAppState]);

  return (
    <>
      <Dialog
        open={appState.openDialogType === DialogType.mermaidToDrawnix}
        onOpenChange={(open) => {
          setAppState({
            ...appState,
            openDialogType: open ? DialogType.mermaidToDrawnix : null,
          });
        }}
      >
        <DialogContent className="Dialog ttd-dialog" container={container}>
          <MermaidToDrawnix></MermaidToDrawnix>
        </DialogContent>
      </Dialog>
      <Dialog
        open={appState.openDialogType === DialogType.markdownToDrawnix}
        onOpenChange={(open) => {
          setAppState({
            ...appState,
            openDialogType: open ? DialogType.markdownToDrawnix : null,
          });
        }}
      >
        <DialogContent className="Dialog ttd-dialog" container={container}>
          <MarkdownToDrawnix></MarkdownToDrawnix>
        </DialogContent>
      </Dialog>
      {/* AI 图片生成窗口 - 使用 WinBox */}
      <WinBoxWindow
        visible={appState.openDialogType === DialogType.aiImageGeneration}
        title={imageGenerationMode === 'batch'
          ? (language === 'zh' ? '批量出图' : 'Batch Generation')
          : (language === 'zh' ? 'AI 图片生成' : 'AI Image Generation')
        }
        headerContent={
          <div className="image-generation-mode-tabs">
            <button
              className={`mode-tab ${imageGenerationMode === 'single' ? 'active' : ''}`}
              onClick={() => handleImageModeChange('single')}
            >
              {language === 'zh' ? 'AI 图片生成' : 'AI Image'}
            </button>
            <button
              className={`mode-tab ${imageGenerationMode === 'batch' ? 'active' : ''}`}
              onClick={() => handleImageModeChange('batch')}
            >
              {language === 'zh' ? '批量出图' : 'Batch'}
            </button>
          </div>
        }
        onClose={handleImageDialogClose}
        width="60%"
        height="60%"
        minWidth={800}
        minHeight={500}
        x="center"
        y="center"
        modal={false}
        minimizable={false}
        className="winbox-ai-generation winbox-ai-image-generation"
        container={container}
        autoMaximize={imageDialogAutoMaximize}
      >
        {appState.openDialogType === DialogType.aiImageGeneration && (
          imageGenerationMode === 'batch' ? (
            <Suspense fallback={<div className="loading-fallback">{language === 'zh' ? '加载中...' : 'Loading...'}</div>}>
              <BatchImageGeneration onSwitchToSingle={() => handleImageModeChange('single')} />
            </Suspense>
          ) : (
            <AIImageGeneration
              initialPrompt={aiImageData.initialPrompt}
              initialImages={aiImageData.initialImages}
              selectedElementIds={aiImageData.selectedElementIds}
              initialWidth={appState.dialogInitialData?.initialWidth || appState.dialogInitialData?.width}
              initialHeight={appState.dialogInitialData?.initialHeight || appState.dialogInitialData?.height}
              initialResultUrl={aiImageData.initialResultUrl}
              selectedModel={selectedImageModel}
              onModelChange={handleImageModelChange}
            />
          )
        )}
      </WinBoxWindow>
      {/* AI 视频生成窗口 - 使用 WinBox */}
      <WinBoxWindow
        visible={appState.openDialogType === DialogType.aiVideoGeneration}
        title={language === 'zh' ? 'AI 视频生成' : 'AI Video Generation'}
        onClose={handleVideoDialogClose}
        width="70%"
        height="60%"
        minWidth={800}
        minHeight={600}
        x="center"
        y="center"
        modal={false}
        minimizable={false}
        className="winbox-ai-generation winbox-ai-video-generation"
        container={container}
      >
        {appState.openDialogType === DialogType.aiVideoGeneration && (
          <AIVideoGeneration
            initialPrompt={aiVideoData.initialPrompt}
            initialImage={aiVideoData.initialImage}
            initialImages={aiVideoData.initialImages}
            initialDuration={aiVideoData.initialDuration}
            initialModel={aiVideoData.initialModel}
            initialSize={aiVideoData.initialSize}
            initialResultUrl={aiVideoData.initialResultUrl}
            selectedModel={selectedVideoModel}
            onModelChange={handleVideoModelChange}
          />
        )}
      </WinBoxWindow>
    </>
  );
};

// 使用 React.memo 优化组件，只有当关键属性变化时才重新渲染
export const TTDDialog = memo(TTDDialogComponent, (prevProps, nextProps) => {
  // 只有当 container 变化时才重新渲染
  return prevProps.container === nextProps.container;
});
