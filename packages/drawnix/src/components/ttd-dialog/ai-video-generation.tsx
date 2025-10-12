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
import { 
  GenerationHistory, 
  VideoHistoryItem, 
  ImageHistoryItem,
  loadVideoHistory,
  saveVideoToHistory,
  generateHistoryId
} from '../generation-history';
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
  generateVideoThumbnail as generateThumbnail,
  updateHistoryWithGeneratedContent,
  DEFAULT_VIDEO_DIMENSIONS,
  getReferenceDimensionsFromIds
} from './shared';
import { AI_VIDEO_GENERATION_PREVIEW_CACHE_KEY as PREVIEW_CACHE_KEY } from '../../constants/storage';

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
}

const AIVideoGeneration = ({ initialPrompt = '', initialImage }: AIVideoGenerationProps = {}) => {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [generatedVideo, setGeneratedVideo] = useState<{
    previewUrl: string;
    downloadUrl: string;
  } | null>(null);
  const [isInserting, setIsInserting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedImage, setUploadedImage] = useState<ImageFile | null>(initialImage || null);
  const [historyItems, setHistoryItems] = useState<VideoHistoryItem[]>([]);
  
  const { isGenerating, isLoading: videoLoading, updateIsGenerating, updateIsLoading: updateVideoLoading } = useGenerationState('video');

  const { appState, setAppState } = useDrawnix();
  const { language } = useI18n();
  const board = useBoard();

  // 保存选中元素的ID，用于计算插入位置
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  
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
    }

    if (board) {
      const currentSelectedElements = getSelectedElements(board);
      const elementIds = currentSelectedElements.map(el => (el as any).id || '').filter(Boolean);
      setSelectedElementIds(elementIds);
      console.log('Saved selected element IDs for video insertion:', elementIds);
    }
  }, [board]);

  // 加载历史记录
  useEffect(() => {
    const history = loadVideoHistory();
    setHistoryItems(history);
  }, []);

  useEffect(() => {
    setPrompt(initialPrompt);
    setUploadedImage(initialImage || null);
    setError(null);
  }, [initialPrompt, initialImage]);

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

      // 异步生成视频缩略图（使用预览URL）
      const thumbnailPromise = generateThumbnail(videoUrls.previewUrl);

      // 更新已有的提示词记录，添加生成的视频信息
      const existingHistory = loadVideoHistory();
      const existingIndex = existingHistory.findIndex(item => item.prompt.trim() === prompt.trim());
      
      if (existingIndex >= 0) {
        // 如果找到了相同提示词的记录，更新它的视频信息
        const updatedItem = {
          ...existingHistory[existingIndex],
          previewUrl: videoUrls.previewUrl,
          downloadUrl: videoUrls.downloadUrl,
          timestamp: Date.now(), // 更新时间戳
        };
        
        // 等待缩略图生成完成，然后更新imageUrl
        try {
          const thumbnail = await thumbnailPromise;
          if (thumbnail) {
            updatedItem.imageUrl = thumbnail; // 使用缩略图作为 imageUrl
          } else {
            // 如果缩略图生成失败，使用预览URL
            updatedItem.imageUrl = videoUrls.previewUrl;
          }
        } catch (error) {
          console.warn('Failed to generate video thumbnail:', error);
          // 如果缩略图生成失败，使用预览URL
          updatedItem.imageUrl = videoUrls.previewUrl;
        }
        
        // 更新历史记录
        saveVideoToHistory(updatedItem);
        
        // 更新历史列表状态
        const updatedHistoryItem: VideoHistoryItem = { ...updatedItem, type: 'video' };
        setHistoryItems(prev => [updatedHistoryItem, ...prev.filter(h => h.id !== updatedItem.id)].slice(0, 50));
      } else {
        // 如果没有找到，创建新记录（理论上不应该到这里，因为已在handleGenerate中保存了）
        const historyItem: Omit<VideoHistoryItem, 'type'> = {
          id: generateHistoryId(),
          prompt,
          imageUrl: '', // 先置空，等待缩略图生成
          width: 400,   // 默认尺寸
          height: 225,  // 默认尺寸
          previewUrl: videoUrls.previewUrl,
          downloadUrl: videoUrls.downloadUrl,
          timestamp: Date.now()
        };

        // 等待缩略图生成完成，然后更新历史记录
        try {
          const thumbnail = await thumbnailPromise;
          if (thumbnail) {
            historyItem.imageUrl = thumbnail; // 使用缩略图作为 imageUrl
          } else {
            // 如果缩略图生成失败，使用预览URL
            historyItem.imageUrl = videoUrls.previewUrl;
          }
        } catch (error) {
          console.warn('Failed to generate video thumbnail:', error);
          // 如果缩略图生成失败，使用预览URL
          historyItem.imageUrl = videoUrls.previewUrl;
        }

        saveVideoToHistory(historyItem);
        
        // 更新历史列表状态
        const newHistoryItem: VideoHistoryItem = { ...historyItem, type: 'video' };
        setHistoryItems(prev => [newHistoryItem, ...prev.filter(h => h.id !== historyItem.id)].slice(0, 50));
      }
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

  // 使用useMemo优化性能，当historyItems或language变化时重新计算
  const presetPrompts = React.useMemo(() => 
    getMergedPresetPrompts('video', language as Language, historyItems), 
    [historyItems, language]
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

    // 清除旧的视频和错误信息
    setGeneratedVideo(null);
    setError(null);
    
    // 在生成开始时保存提示词（不管是否生成成功）
    savePromptToHistory(prompt);

    updateIsGenerating(true);
    setError(null);

    try {
      console.log('Using new Video Generation API...');

      // 处理上传的图片（现在是可选的）
      let imageInput;
      if (uploadedImage) {
        if (uploadedImage instanceof File) {
          // 注释掉图片压缩逻辑，直接使用原图
          // try {
          //   // 将File转换为data URL
          //   const fileDataUrl = await new Promise<string>((resolve, reject) => {
          //     const reader = new FileReader();
          //     reader.onload = () => resolve(reader.result as string);
          //     reader.onerror = reject;
          //     reader.readAsDataURL(uploadedImage);
          //   });
          //   
          //   // 对base64图片进行压缩处理
          //   const compressedDataUrl = await compressImageUrl(fileDataUrl);
          //   
          //   // 将压缩后的data URL转换回File对象
          //   const response = await fetch(compressedDataUrl);
          //   const blob = await response.blob();
          //   const compressedFile = new File([blob], uploadedImage.name, { type: blob.type || uploadedImage.type });
          //   
          //   imageInput = { file: compressedFile };
          // } catch (compressionError) {
          //   console.warn('Failed to compress uploaded image, using original:', compressionError);
          //   imageInput = { file: uploadedImage };
          // }
          
          // 直接使用原图，不进行压缩
          imageInput = { file: uploadedImage };
        } else {
          // 对于URL类型的图片，直接传递URL
          imageInput = { url: uploadedImage.url };
        }
      } else {
        // 没有图片时传递 null
        imageInput = null;
      }
      
      // 调用新的视频生成API（使用专用的视频客户端）
      const result = await videoGeminiClient.generateVideo(prompt, imageInput);
      
      // 从响应中提取内容
      const responseContent = result.response.choices[0]?.message?.content || '';
      console.log('Video Generation API response:', responseContent);
      
      // 优先检查处理过的内容中是否包含视频
      if (result.processedContent && (result.processedContent as any).videos && (result.processedContent as any).videos.length > 0) {
        // 如果响应中包含多个视频链接，尝试区分预览和下载链接
        const videos = (result.processedContent as any).videos;
        if (videos.length >= 2) {
          // 假设第一个是预览链接，第二个是下载链接
          const previewUrl = videos[0].data;
          const downloadUrl = videos[1].data;
          console.log('Found multiple videos in processed content:', { previewUrl, downloadUrl });
          await setGeneratedVideoWithPreload({ previewUrl, downloadUrl });
        } else {
          // 只有一个视频链接，同时用作预览和下载
          const videoUrl = videos[0].data;
          console.log('Found single video in processed content:', videoUrl);
          await setGeneratedVideoWithPreload({ previewUrl: videoUrl, downloadUrl: videoUrl });
        }
      } else {
        // 如果处理过的内容中没有视频，尝试其他方法提取
        console.log('No videos found in processed content, trying alternative extraction...');
        
        // 方法1: 尝试提取markdown格式的两个视频链接
        const previewMatch = responseContent.match(/\[(?:▶️\s*在线观看|.*?观看.*?)\]\(([^)]+)\)/i);
        const downloadMatch = responseContent.match(/\[(?:⏬\s*下载视频|.*?下载.*?)\]\(([^)]+)\)/i);
        
        if (previewMatch && downloadMatch) {
          const previewUrl = previewMatch[1].replace(/[.,;!?]*$/, '');
          const downloadUrl = downloadMatch[1].replace(/[.,;!?]*$/, '');
          console.log('Extracted preview URL:', previewUrl, 'download URL:', downloadUrl);
          await setGeneratedVideoWithPreload({ previewUrl, downloadUrl });
        } else {
          // 方法2: 尝试提取任何视频格式的URL（兜底方案，同时用作预览和下载）
          const videoUrlMatch = responseContent.match(/https?:\/\/[^\s<>"'\n]+\.(?:mp4|avi|mov|wmv|flv|webm|mkv)(?:\?[^\s<>"'\n]*)?/i);
          if (videoUrlMatch) {
            const videoUrl = videoUrlMatch[0].replace(/[.,;!?]*$/, '');
            console.log('Extracted single video URL:', videoUrl);
            await setGeneratedVideoWithPreload({ previewUrl: videoUrl, downloadUrl: videoUrl });
          } else {
            // 方法3: 尝试提取filesystem.site的链接
            const filesystemMatch = responseContent.match(/https?:\/\/filesystem\.site\/[^\s<>"'\n)]+/i);
            if (filesystemMatch) {
              const videoUrl = filesystemMatch[0].replace(/[.,;!?]*$/, '');
              console.log('Extracted filesystem.site URL:', videoUrl);
              await setGeneratedVideoWithPreload({ previewUrl: videoUrl, downloadUrl: videoUrl });
            } else {
              // 方法4: 通用URL提取（作为最后的尝试）
              const generalUrlMatch = responseContent.match(/https?:\/\/[^\s<>"'\n)]+/);
              if (generalUrlMatch) {
                const potentialUrl = generalUrlMatch[0].replace(/[.,;!?]*$/, '');
                // 检查URL是否可能是视频链接
                if (potentialUrl.includes('filesystem.site') || potentialUrl.includes('cdn') || potentialUrl.match(/\.(mp4|avi|mov|wmv|flv|webm|mkv)/i)) {
                  console.log('Extracted potential video URL:', potentialUrl);
                  await setGeneratedVideoWithPreload({ previewUrl: potentialUrl, downloadUrl: potentialUrl });
                } else {
                  console.log('No suitable video URL found in response');
                  console.log('Full response content:', responseContent);
                  
                  // 检查响应是否包含"正在生成"等中间状态信息
                  if (responseContent.includes('正在生成') || responseContent.includes('拿到') || responseContent.includes('链接') || responseContent.includes('处理中')) {
                    setError(
                      language === 'zh' 
                        ? '视频仍在后台生成中，请稍等片刻后重新生成。' 
                        : 'Video is still being processed in the background, please wait a moment and try generating again.'
                    );
                  } else {
                    setError(
                      language === 'zh' 
                        ? '视频生成失败：未找到有效的视频链接，请重试或检查网络连接。' 
                        : 'Video generation failed: No valid video link found, please retry or check your network connection.'
                    );
                  }
                }
              } else {
                console.log('No URLs found in response');
                console.log('Full response content:', responseContent);
                
                // 检查响应是否包含"正在生成"等中间状态信息
                if (responseContent.includes('正在生成') || responseContent.includes('拿到') || responseContent.includes('链接') || responseContent.includes('处理中')) {
                  setError(
                    language === 'zh' 
                      ? '视频仍在后台生成中，请稍等片刻后重新生成。' 
                      : 'Video is still being processed in the background, please wait a moment and try generating again.'
                  );
                } else {
                  setError(
                    language === 'zh' 
                      ? '视频生成失败：未找到有效的视频链接，请重试或检查网络连接。' 
                      : 'Video generation failed: No valid video link found, please retry or check your network connection.'
                  );
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('AI video generation error:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      
      if (isInvalidTokenError(errorMessage)) {
        const apiKeyError = await handleApiKeyError(errorMessage, language);
        if (apiKeyError) {
          setError(apiKeyError);
        }
        // If apiKeyError is null, it means API key was successfully updated
      } else {
        // Show the actual error message for non-API key errors
        setError(
          language === 'zh' 
            ? `视频生成失败: ${errorMessage}` 
          : `Video generation failed: ${errorMessage}`
        );
      }
    } finally {
      updateIsGenerating(false);
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
            
            <ErrorDisplay error={error} />
          </div>
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
      
      {/* 预览区域 */}
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
        
          {/* 统一历史记录组件 */}
          <GenerationHistory
            historyItems={historyItems}
            onSelectFromHistory={handleSelectFromHistory}
            position={{ bottom: '60px', right: '8px' }}
          />
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
              onClick={() => {
                if (generatedVideo) {
                  // 在新页面打开下载链接
                  window.open(generatedVideo.downloadUrl, '_blank');
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
      </div>
    </div>
  );
};

export default AIVideoGeneration;