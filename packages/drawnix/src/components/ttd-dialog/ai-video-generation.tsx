import React, { useState, useEffect, useRef } from 'react';
import './ttd-dialog.scss';
import './ai-video-generation.scss';
import { useDrawnix } from '../../hooks/use-drawnix';
import { useI18n } from '../../i18n';
import { useBoard } from '@plait-board/react-board';
import { getSelectedElements, PlaitElement, getRectangleByElements, Point } from '@plait/core';
import { defaultGeminiClient, videoGeminiClient, promptForApiKey } from '../../utils/gemini-api';
import { geminiSettings } from '../../utils/settings-manager';
import { /* compressImageUrl, */ getInsertionPointForSelectedElements } from '../../utils/selection-utils';
import { insertVideoFromUrl } from '../../data/video';
import { 
  GenerationHistory, 
  VideoHistoryItem, 
  ImageHistoryItem,
  saveVideoToHistory, 
  loadVideoHistory, 
  generateHistoryId,
  extractUserPromptsFromHistory 
} from '../generation-history';

// 预览视频缓存key
const PREVIEW_CACHE_KEY = 'ai_video_generation_preview_cache';

// 视频URL接口
interface VideoUrls {
  previewUrl: string;
  downloadUrl: string;
}

// 缓存数据接口
interface PreviewCache {
  prompt: string;
  generatedVideo: VideoUrls | null;
  timestamp: number;
  sourceImage?: string;
}

// 保存预览缓存
const savePreviewCache = (data: PreviewCache) => {
  try {
    localStorage.setItem(PREVIEW_CACHE_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn('Failed to save preview cache:', error);
  }
};

// 加载预览缓存
const loadPreviewCache = (): PreviewCache | null => {
  try {
    const cached = localStorage.getItem(PREVIEW_CACHE_KEY);
    if (cached) {
      const data = JSON.parse(cached) as PreviewCache;
      // 检查缓存是否过期（24小时）
      const now = Date.now();
      const cacheAge = now - data.timestamp;
      if (cacheAge < 24 * 60 * 60 * 1000) {
        return data;
      }
    }
  } catch (error) {
    console.warn('Failed to load preview cache:', error);
  }
  return null;
};

// 从视频生成缩略图（第一帧）
const generateVideoThumbnail = async (videoUrl: string): Promise<string | undefined> => {
  return new Promise((resolve) => {
    try {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playsInline = true;
      
      video.onloadeddata = () => {
        try {
          // 设置为第一帧（0.1秒处，避免完全黑屏）
          video.currentTime = 0.1;
          
          video.onseeked = () => {
            try {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              
              if (!ctx) {
                resolve(undefined);
                return;
              }
              
              // 设置缩略图尺寸（保持比例）
              const maxWidth = 80;
              const maxHeight = 60;
              const aspectRatio = video.videoWidth / video.videoHeight;
              
              let width = maxWidth;
              let height = maxHeight;
              
              if (aspectRatio > maxWidth / maxHeight) {
                height = maxWidth / aspectRatio;
              } else {
                width = maxHeight * aspectRatio;
              }
              
              canvas.width = width;
              canvas.height = height;
              
              // 绘制视频帧
              ctx.drawImage(video, 0, 0, width, height);
              
              // 转换为 base64
              const thumbnail = canvas.toDataURL('image/jpeg', 0.8);
              resolve(thumbnail);
            } catch (error) {
              console.warn('Failed to generate thumbnail from frame:', error);
              resolve(undefined);
            }
          };
        } catch (error) {
          console.warn('Failed to seek video for thumbnail:', error);
          resolve(undefined);
        }
      };
      
      video.onerror = () => {
        console.warn('Failed to load video for thumbnail');
        resolve(undefined);
      };
      
      video.src = videoUrl;
    } catch (error) {
      console.warn('Failed to create video element for thumbnail:', error);
      resolve(undefined);
    }
  });
};

const getPromptExample = (language: 'zh' | 'en') => {
  if (language === 'zh') {
    return `让图片中的小猫缓缓转头看向镜头，眼睛慢慢眨动，尾巴轻轻摆动`;
  }
  return `Make the cat in the image slowly turn its head towards the camera, blink its eyes slowly, and gently sway its tail`;
};

interface AIVideoGenerationProps {
  initialPrompt?: string;
  initialImage?: File | { url: string; name: string };
}

const AIVideoGeneration = ({ initialPrompt = '', initialImage }: AIVideoGenerationProps = {}) => {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // 通知Footer组件生成状态变化
  const notifyGenerationStateChange = (generating: boolean, loading: boolean) => {
    window.dispatchEvent(new CustomEvent('ai-generation-state-change', {
      detail: { isGenerating: generating, videoLoading: loading }
    }));
  };
  
  const [generatedVideo, setGeneratedVideo] = useState<{
    previewUrl: string;
    downloadUrl: string;
  } | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [isInserting, setIsInserting] = useState(false);
  
  // 包装setIsGenerating和setVideoLoading以发送事件
  const updateIsGenerating = (value: boolean) => {
    setIsGenerating(value);
    notifyGenerationStateChange(value, videoLoading);
  };
  
  const updateVideoLoading = (value: boolean) => {
    setVideoLoading(value);
    notifyGenerationStateChange(isGenerating, value);
  };
  
  const [error, setError] = useState<string | null>(null);
  // 只支持单张图片上传
  const [uploadedImage, setUploadedImage] = useState<File | { url: string; name: string } | null>(initialImage || null);
  // 历史相关状态
  const [historyItems, setHistoryItems] = useState<VideoHistoryItem[]>([]);

  const { appState, setAppState } = useDrawnix();
  const { language } = useI18n();
  const board = useBoard();

  // 保存选中元素的ID，用于计算插入位置
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  
  // 视频元素引用，用于控制播放状态
  const videoRef = useRef<HTMLVideoElement>(null);

  // 检查是否为Invalid Token错误
  const isInvalidTokenError = (errorMessage: string): boolean => {
    const message = errorMessage.toLowerCase();
    return message.includes('invalid token') || 
           message.includes('invalid api key') ||
           message.includes('unauthorized') ||
           message.includes('api_error') && message.includes('invalid');
  };

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

  // 组件初始化时加载缓存和保存选中元素
  useEffect(() => {
    const cachedData = loadPreviewCache();
    if (cachedData) {
      setPrompt(cachedData.prompt);
      setGeneratedVideo(cachedData.generatedVideo);
    }

    // 保存当前选中的元素ID，用于后续插入位置计算
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

  // 处理 props 变化，更新内部状态
  useEffect(() => {
    setPrompt(initialPrompt);
    setUploadedImage(initialImage || null);
    // 清除之前的错误状态
    setError(null);
  }, [initialPrompt, initialImage]);

  // 组件挂载时清除错误状态
  useEffect(() => {
    setError(null);
  }, []);

  // 处理图片上传（只支持单张图片）
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files[0]) {
      const file = files[0];
      if (file.type.startsWith('image/') && file.size <= 10 * 1024 * 1024) {
        setUploadedImage(file);
        // 成功上传图片时清除错误状态
        setError(null);
      } else {
        setError(
          language === 'zh' 
            ? '请选择有效的图片文件（小于10MB）' 
            : 'Please select a valid image file (less than 10MB)'
        );
      }
    }
    // 清空input值，允许重复选择同一文件
    event.target.value = '';
  };

  // 删除上传的图片
  const removeUploadedImage = () => {
    setUploadedImage(null);
  };

  // 重置所有状态
  const handleReset = () => {
    // 暂停并清理视频
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = '';
      videoRef.current.load();
    }
    
    setPrompt('');
    setUploadedImage(null);
    setGeneratedVideo(null);
    setError(null);
    // 清除缓存
    try {
      localStorage.removeItem(PREVIEW_CACHE_KEY);
    } catch (error) {
      console.warn('Failed to clear cache:', error);
    }
    // 触发Footer组件更新
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
      savePreviewCache(cacheData);

      // 异步生成视频缩略图（使用预览URL）
      const thumbnailPromise = generateVideoThumbnail(videoUrls.previewUrl);

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
    savePreviewCache(cacheData);
  };

  // 通用历史选择处理器（兼容各种类型）
  const handleSelectFromHistory = (item: VideoHistoryItem | ImageHistoryItem) => {
    if (item.type === 'video') {
      selectFromHistory(item as VideoHistoryItem);
    }
    // 视频生成组件不处理图片类型
  };

  // 获取合并的预设提示词（用户历史 + 默认预设）
  const getMergedPresetPrompts = () => {
    // 默认预设提示词
    const defaultPrompts = language === 'zh' ? [
      '让图片中的人物缓缓转头看向镜头，微微点头',
      '图片中的物体轻轻摇摆，营造微风吹动的效果',
      '让画面中的水面产生涟漪，水波荡漾',
      '使图片中的花朵轻轻摇摆，花瓣偶尔飘落',
      '让人物的头发在风中轻柔摆动',
      '使背景中的树叶缓缓摇动，阳光斑驳',
      '让动物的眼睛慢慢眨动，显得生动活泼',
      '使画面产生轻微的景深变化，聚焦效果'
    ] : [
      'Make the person in the image slowly turn their head towards the camera and nod slightly',
      'Let objects in the image sway gently, creating a breeze effect',
      'Make ripples appear on the water surface in the image',
      'Let flowers in the image sway gently with petals occasionally falling',
      'Make the person\'s hair move softly in the wind',
      'Let leaves in the background move slowly with dappled sunlight',
      'Make the animal\'s eyes blink slowly, appearing lively',
      'Create subtle depth of field changes in the scene'
    ];

    // 使用工具函数提取用户历史提示词
    const userPrompts = extractUserPromptsFromHistory(historyItems).slice(0, 8);

    // 合并：用户历史提示词在前，默认预设在后，总数不超过12个
    const merged = [...userPrompts, ...defaultPrompts]
      .filter((prompt, index, arr) => arr.indexOf(prompt) === index) // 再次去重，避免用户历史与默认重复
      .slice(0, 12); // 限制总数

    return merged;
  };

  // 使用useMemo优化性能，当historyItems或language变化时重新计算
  const presetPrompts = React.useMemo(() => getMergedPresetPrompts(), [historyItems, language]);

  // 保存提示词到历史记录（去重）
  const savePromptToHistory = (promptText: string) => {
    if (!promptText.trim()) return;

    // 获取现有的历史记录
    const existingHistory = loadVideoHistory();
    
    // 检查是否已存在相同的提示词
    const isDuplicate = existingHistory.some(item => item.prompt.trim() === promptText.trim());
    
    if (!isDuplicate) {
      // 创建一个临时的历史项目，只用于保存提示词
      const promptHistoryItem: Omit<VideoHistoryItem, 'type'> = {
        id: generateHistoryId(),
        prompt: promptText.trim(),
        imageUrl: '', // 暂时为空
        timestamp: Date.now(),
        width: 400,   // 默认视频尺寸
        height: 225,  // 默认视频尺寸
        previewUrl: '',
        downloadUrl: ''
      };
      
      console.log('Saving prompt to history:', promptText);
      saveVideoToHistory(promptHistoryItem);
    } else {
      console.log('Prompt already exists in history, skipping:', promptText);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError(language === 'zh' ? '请输入视频描述' : 'Please enter video description');
      return;
    }

    if (!uploadedImage) {
      setError(language === 'zh' ? '请上传一张图片作为视频生成的源素材' : 'Please upload an image as source material for video generation');
      return;
    }

    // 在生成开始时保存提示词（不管是否生成成功）
    savePromptToHistory(prompt);

    updateIsGenerating(true);
    setError(null);

    try {
      console.log('Using new Video Generation API...');

      // 处理上传的图片
      let imageInput;
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
                  setError(
                    language === 'zh' 
                      ? `视频生成API无法生成视频。响应: ${responseContent.substring(0, 200)}...` 
                      : `Video Generation API unable to generate video. Response: ${responseContent.substring(0, 200)}...`
                  );
                }
              } else {
                console.log('No URLs found in response');
                setError(
                  language === 'zh' 
                    ? `视频生成API无法生成视频。响应: ${responseContent.substring(0, 200)}...` 
                    : `Video Generation API unable to generate video. Response: ${responseContent.substring(0, 200)}...`
                );
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('AI video generation error:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      
      // 检查是否为Invalid Token错误
      if (isInvalidTokenError(errorMessage)) {
        // 调用API Key设置弹窗
        try {
          const newApiKey = await promptForApiKey();
          if (newApiKey) {
            // 用户输入了新的API Key，更新全局设置
            geminiSettings.update({ apiKey: newApiKey });
            setError(null); // 清除错误信息
          } else {
            // 用户取消了API Key输入
            setError(
              language === 'zh' 
                ? '需要有效的API Key才能生成视频' 
                : 'Valid API Key is required to generate videos'
            );
          }
        } catch (apiKeyError) {
          console.error('API Key setup error:', apiKeyError);
          setError(
            language === 'zh' 
              ? 'API Key设置失败，请稍后重试' 
              : 'API Key setup failed, please try again later'
          );
        }
      } else {
        setError(
          language === 'zh' 
            ? '视频生成失败，请检查网络连接或稍后重试' 
            : 'Video generation failed, please check network connection or try again later'
        );
      }
    } finally {
      updateIsGenerating(false);
    }
  };

  // 键盘快捷键支持
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        if (!isGenerating && prompt.trim() && uploadedImage) {
          handleGenerate();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isGenerating, prompt, uploadedImage, handleGenerate]);

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
            
            {/* 图片上传 (只支持单张图片) */}
            <div className="form-field">
              <label className="form-label">
                {language === 'zh' ? '源图片 (必需)' : 'Source Image (Required)'}
              </label>
              <div className="unified-image-area">
                {!uploadedImage ? (
                  /* 没有图片时显示完整上传区域 */
                  <div className="upload-area">
                    <input
                      type="file"
                      id="image-upload"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="upload-input"
                      disabled={isGenerating}
                    />
                    <label htmlFor="image-upload" className="upload-label">
                      <div className="upload-icon">🎬</div>
                      <div className="upload-text">
                        {language === 'zh' 
                          ? '点击或拖拽上传图片' 
                          : 'Click or drag to upload image'}
                      </div>
                      <div className="upload-hint">
                        {language === 'zh' 
                          ? '支持 JPG, PNG, WebP, 最大 10MB' 
                          : 'Support JPG, PNG, WebP, Max 10MB'}
                      </div>
                    </label>
                  </div>
                ) : (
                  /* 有图片时显示图片网格样式（单张图片） */
                  <div className="images-grid">
                    <div className="uploaded-image-item" data-tooltip={uploadedImage instanceof File ? URL.createObjectURL(uploadedImage) : uploadedImage.url}>
                      <div 
                        className="uploaded-image-preview-container"
                        onMouseEnter={(e) => {
                          const tooltip = e.currentTarget.querySelector('.image-hover-tooltip') as HTMLElement;
                          if (tooltip) {
                            const rect = e.currentTarget.getBoundingClientRect();
                            tooltip.style.left = rect.left + rect.width / 2 + 'px';
                            tooltip.style.top = rect.top - 10 + 'px';
                            tooltip.style.opacity = '1';
                            tooltip.style.visibility = 'visible';
                          }
                        }}
                        onMouseLeave={(e) => {
                          const tooltip = e.currentTarget.querySelector('.image-hover-tooltip') as HTMLElement;
                          if (tooltip) {
                            tooltip.style.opacity = '0';
                            tooltip.style.visibility = 'hidden';
                          }
                        }}
                      >
                        <img
                          src={uploadedImage instanceof File ? URL.createObjectURL(uploadedImage) : uploadedImage.url}
                          alt="Source"
                          className="uploaded-image-preview"
                        />
                        <div className="image-hover-tooltip">
                          <img src={uploadedImage instanceof File ? URL.createObjectURL(uploadedImage) : uploadedImage.url} alt="Large preview" />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={removeUploadedImage}
                        className="remove-image-btn"
                        disabled={isGenerating}
                      >
                        ×
                      </button>
                      <div className="image-info">
                        <span className="image-name">
                          {uploadedImage instanceof File ? uploadedImage.name : uploadedImage.name}
                        </span>
                      </div>
                    </div>
                    {/* 替换按钮（使用添加更多的样式） */}
                    <div className="add-more-item">
                      <input
                        type="file"
                        id="image-replace"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="upload-input"
                        disabled={isGenerating}
                      />
                      <label htmlFor="image-replace" className="add-more-label">
                        <div className="add-more-icon">↻</div>
                        <div className="add-more-text">
                          {language === 'zh' ? '替换' : 'Replace'}
                        </div>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* 提示词输入 */}
            <div className="form-field">
              <div className="form-label-with-icon">
                <label className="form-label">
                  {language === 'zh' ? '视频描述' : 'Video Description'}
                </label>
                <div className="preset-tooltip-container">
                  <button
                    type="button"
                    className="preset-icon-button"
                    disabled={isGenerating}
                  >
                    💡
                  </button>
                  <div className="preset-tooltip">
                    <div className="preset-header">
                      {language === 'zh' ? '预设提示词' : 'Preset Prompts'}
                    </div>
                    <div className="preset-list">
                      {presetPrompts.map((preset, index) => (
                        <button
                          key={index}
                          type="button"
                          className="preset-item"
                          onClick={() => {
                            setPrompt(preset);
                            // 选择预设提示词时清除错误状态
                            if (error) setError(null);
                          }}
                          disabled={isGenerating}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <textarea
                className="form-textarea"
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  // 用户开始输入新内容时清除错误状态
                  if (error) setError(null);
                }}
                placeholder={getPromptExample(language)}
                rows={4}
                disabled={isGenerating}
              />
            </div>
            
            {/* 错误信息 */}
            {error && (
              <div className="form-error">
                {error}
              </div>
            )}
          </div>
        </div>
        
        {/* 生成和重置按钮区域 */}
        <div className="section-actions">
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim() || !uploadedImage}
            className={`action-button primary ${isGenerating ? 'loading' : ''}`}
          >
            {isGenerating
              ? (language === 'zh' ? '生成中...' : 'Generating...')
              : generatedVideo
              ? (language === 'zh' ? '重新生成' : 'Regenerate')
              : (language === 'zh' ? '生成视频' : 'Generate Video')
            }
          </button>
          
          <button
            onClick={handleReset}
            disabled={isGenerating}
            className="action-button secondary"
          >
            {language === 'zh' ? '重置' : 'Reset'}
          </button>
        </div>
      </div>
      
      {/* 预览区域 */}
      <div className="preview-section">
        <div className="image-preview-container" >
          
          {isGenerating ? (
            <div className="preview-loading">
              <div className="loading-spinner"></div>
              <div className="loading-text">
                {language === 'zh' ? '正在生成视频...' : 'Generating video...'}
              </div>
            </div>
          ) : videoLoading ? (
            <div className="preview-loading">
              <div className="loading-spinner"></div>
              <div className="loading-text">
                {language === 'zh' ? '正在加载视频...' : 'Loading video...'}
              </div>
            </div>
          ) : generatedVideo ? (
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
                  // 保持视频URL，让用户可以右键新窗口打开
                }}
              />
            </div>
          ) : (
            <div className="preview-placeholder">
              <div className="placeholder-icon">🎬</div>
              <div className="placeholder-text">
                {language === 'zh' ? '视频将在这里显示' : 'Video will be displayed here'}
              </div>
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
                    
                    // 计算插入位置
                    const insertionPoint = calculateInsertionPoint();
                    console.log('Calculated insertion point:', insertionPoint);
                    
                    await insertVideoFromUrl(board, generatedVideo.previewUrl, insertionPoint);
                    
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