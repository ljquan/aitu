import React, { useState, useEffect } from 'react';
import './ttd-dialog.scss';
import './ai-video-generation.scss';
import { useDrawnix } from '../../hooks/use-drawnix';
import { useI18n } from '../../i18n';
import { useBoard } from '@plait-board/react-board';
import { defaultGeminiClient, promptForApiKey } from '../../utils/gemini-api';
import { compressImageUrl } from '../../utils/selection-utils';
import { HistoryIcon } from 'tdesign-icons-react';

// 预览视频缓存key
const PREVIEW_CACHE_KEY = 'ai_video_generation_preview_cache';
// 历史视频缓存key
const HISTORY_CACHE_KEY = 'ai_video_generation_history';

// 缓存数据接口
interface PreviewCache {
  prompt: string;
  generatedVideo: string | null;
  timestamp: number;
  sourceImage?: string;
}

// 历史视频接口
interface HistoryItem {
  id: string;
  prompt: string;
  videoUrl: string;
  thumbnail?: string;
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

// 保存历史记录
const saveToHistory = (item: HistoryItem) => {
  try {
    const existing = loadHistory();
    // 添加新项目到开头，并限制最多保存20个
    const updated = [item, ...existing.filter(h => h.id !== item.id)].slice(0, 20);
    localStorage.setItem(HISTORY_CACHE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.warn('Failed to save history:', error);
  }
};

// 加载历史记录
const loadHistory = (): HistoryItem[] => {
  try {
    const cached = localStorage.getItem(HISTORY_CACHE_KEY);
    if (cached) {
      const data = JSON.parse(cached) as HistoryItem[];
      // 过滤掉超过7天的记录
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      return data.filter(item => item.timestamp > weekAgo);
    }
  } catch (error) {
    console.warn('Failed to load history:', error);
  }
  return [];
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
  
  const [generatedVideo, setGeneratedVideo] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  
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
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [showHistoryPopover, setShowHistoryPopover] = useState(false);

  const { appState, setAppState } = useDrawnix();
  const { language } = useI18n();

  // 检查是否为Invalid Token错误
  const isInvalidTokenError = (errorMessage: string): boolean => {
    const message = errorMessage.toLowerCase();
    return message.includes('invalid token') || 
           message.includes('invalid api key') ||
           message.includes('unauthorized') ||
           message.includes('api_error') && message.includes('invalid');
  };

  // 组件初始化时加载缓存
  useEffect(() => {
    const cachedData = loadPreviewCache();
    if (cachedData) {
      setPrompt(cachedData.prompt);
      setGeneratedVideo(cachedData.generatedVideo);
    }
  }, []);

  // 加载历史记录
  useEffect(() => {
    const history = loadHistory();
    setHistoryItems(history);
  }, []);

  // 处理 props 变化，更新内部状态
  useEffect(() => {
    setPrompt(initialPrompt);
    setUploadedImage(initialImage || null);
  }, [initialPrompt, initialImage]);

  // 处理图片上传（只支持单张图片）
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files[0]) {
      const file = files[0];
      if (file.type.startsWith('image/') && file.size <= 10 * 1024 * 1024) {
        setUploadedImage(file);
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
  const setGeneratedVideoWithPreload = async (videoUrl: string) => {
    updateVideoLoading(true);
    try {
      setGeneratedVideo(videoUrl);
      
      // 保存到缓存
      const cacheData: PreviewCache = {
        prompt,
        generatedVideo: videoUrl,
        timestamp: Date.now(),
        sourceImage: uploadedImage instanceof File ? URL.createObjectURL(uploadedImage) : uploadedImage?.url
      };
      savePreviewCache(cacheData);

      // 保存到历史记录
      const historyItem: HistoryItem = {
        id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        prompt,
        videoUrl,
        timestamp: Date.now(),
        sourceImage: uploadedImage instanceof File ? URL.createObjectURL(uploadedImage) : uploadedImage?.url
      };
      saveToHistory(historyItem);
      
      // 更新历史列表状态
      setHistoryItems(prev => [historyItem, ...prev.filter(h => h.id !== historyItem.id)].slice(0, 20));
    } catch (error) {
      console.warn('Failed to set generated video:', error);
      setGeneratedVideo(videoUrl);
    } finally {
      updateVideoLoading(false);
    }
  };

  // 从历史记录选择视频
  const selectFromHistory = (historyItem: HistoryItem) => {
    setPrompt(historyItem.prompt);
    setGeneratedVideo(historyItem.videoUrl);
    if (historyItem.sourceImage) {
      setUploadedImage({ url: historyItem.sourceImage, name: 'History Image' });
    }
    setShowHistoryPopover(false);
    
    // 更新预览缓存
    const cacheData: PreviewCache = {
      prompt: historyItem.prompt,
      generatedVideo: historyItem.videoUrl,
      timestamp: Date.now(),
      sourceImage: historyItem.sourceImage
    };
    savePreviewCache(cacheData);
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

    // 从历史记录中提取用户使用过的提示词（去重，最新的在前）
    const userPrompts = historyItems
      .map(item => item.prompt.trim())
      .filter(prompt => prompt.length > 0)
      .filter((prompt, index, arr) => arr.indexOf(prompt) === index) // 去重
      .slice(0, 8); // 最多取8个用户历史提示词

    // 合并：用户历史提示词在前，默认预设在后，总数不超过12个
    const merged = [...userPrompts, ...defaultPrompts]
      .filter((prompt, index, arr) => arr.indexOf(prompt) === index) // 再次去重，避免用户历史与默认重复
      .slice(0, 12); // 限制总数

    return merged;
  };

  // 使用useMemo优化性能，当historyItems或language变化时重新计算
  const presetPrompts = React.useMemo(() => getMergedPresetPrompts(), [historyItems, language]);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError(language === 'zh' ? '请输入视频描述' : 'Please enter video description');
      return;
    }

    if (!uploadedImage) {
      setError(language === 'zh' ? '请上传一张图片作为视频生成的源素材' : 'Please upload an image as source material for video generation');
      return;
    }

    updateIsGenerating(true);
    setError(null);

    try {
      console.log('Using Chat API for video generation...');
      const videoPrompt = `Generate a video based on this image and description: "${prompt}"

Requirements:
- Create a short video (3-5 seconds) based on the provided image
- Follow the description to animate the image naturally
- Maintain the original image quality and style
- Return only the direct video URL in your response

Description: ${prompt}`;

      // 处理上传的图片
      let imageInput;
      if (uploadedImage instanceof File) {
        try {
          // 将File转换为data URL
          const fileDataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(uploadedImage);
          });
          
          // 对base64图片进行压缩处理
          const compressedDataUrl = await compressImageUrl(fileDataUrl);
          
          // 将压缩后的data URL转换回File对象
          const response = await fetch(compressedDataUrl);
          const blob = await response.blob();
          const compressedFile = new File([blob], uploadedImage.name, { type: blob.type || uploadedImage.type });
          
          imageInput = { file: compressedFile };
        } catch (compressionError) {
          console.warn('Failed to compress uploaded image, using original:', compressionError);
          imageInput = { file: uploadedImage };
        }
      } else {
        // 对于URL类型的图片，直接传递URL
        imageInput = { url: uploadedImage.url };
      }
      
      const result = await defaultGeminiClient.chat(videoPrompt, [imageInput]);
      
      // 从聊天响应中提取内容
      const responseContent = result.response.choices[0]?.message?.content || '';
      console.log('Chat API response:', responseContent);
      
      // 先检查是否有处理过的内容（可能包含视频）
      if (result.processedContent && (result.processedContent as any).videos && (result.processedContent as any).videos.length > 0) {
        // 如果响应中包含视频，使用第一个视频
        const firstVideo = (result.processedContent as any).videos[0];
        if (firstVideo.type === 'url') {
          await setGeneratedVideoWithPreload(firstVideo.data);
        }
      } else {
        // 尝试从文本响应中提取视频URL
        const urlMatch = responseContent.match(/https?:\/\/[^\s<>"'\n]+/);
        if (urlMatch) {
          const videoUrl = urlMatch[0].replace(/[.,;!?]*$/, ''); // 移除末尾的标点符号
          console.log('Extracted video URL:', videoUrl);
          await setGeneratedVideoWithPreload(videoUrl);
        } else {
          setError(
            language === 'zh' 
              ? `聊天API无法生成视频。响应: ${responseContent.substring(0, 100)}...` 
              : `Chat API unable to generate video. Response: ${responseContent.substring(0, 100)}...`
          );
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
            // 用户输入了新的API Key，更新客户端配置
            defaultGeminiClient.updateConfig({ apiKey: newApiKey });
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
                          onClick={() => setPrompt(preset)}
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
                onChange={(e) => setPrompt(e.target.value)}
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
        <div className="image-preview-container">
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
                src={generatedVideo} 
                controls
                loop
                muted
                className="preview-image"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                onLoadedData={() => console.log('Preview video loaded successfully')}
                onError={() => {
                  console.warn('Preview video failed to load:', generatedVideo);
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
              {/* 历史记录图标 - 右下角 */}
              {historyItems.length > 0 && (
                <div className="history-icon-container">
                  <button
                    className="history-icon-button"
                    onClick={() => setShowHistoryPopover(!showHistoryPopover)}
                    onMouseEnter={() => setShowHistoryPopover(true)}
                    title={language === 'zh' ? '查看生成历史' : 'View generation history'}
                  >
                    <HistoryIcon />
                  </button>
                  {showHistoryPopover && (
                    <div
                      className="history-popover"
                      onMouseLeave={() => setShowHistoryPopover(false)}
                    >
                      <div className="history-popover-header">
                        <span className="history-title">
                          {language === 'zh' ? '生成历史' : 'Generation History'}
                        </span>
                        <button
                          className="history-close-button"
                          onClick={() => setShowHistoryPopover(false)}
                        >
                          ×
                        </button>
                      </div>
                      <div className="history-list">
                        {historyItems.slice(0, 10).map((item) => (
                          <div
                            key={item.id}
                            className="history-item"
                            onClick={() => selectFromHistory(item)}
                          >
                            {item.thumbnail ? (
                              <img
                                src={item.thumbnail}
                                alt="Video thumbnail"
                                className="history-item-image"
                                loading="lazy"
                              />
                            ) : (
                              <div className="history-item-image" style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                width: '40px',
                                height: '40px',
                                background: 'var(--td-bg-color-component)',
                                borderRadius: '4px',
                                fontSize: '18px'
                              }}>🎬</div>
                            )}
                            <div className="history-item-info">
                              <div className="history-item-prompt" title={item.prompt}>
                                {item.prompt.length > 30 
                                  ? `${item.prompt.slice(0, 30)}...` 
                                  : item.prompt}
                              </div>
                              <div className="history-item-time">
                                {new Date(item.timestamp).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      {historyItems.length > 10 && (
                        <div className="history-more-info">
                          {language === 'zh' 
                            ? `还有 ${historyItems.length - 10} 个视频...`
                            : `${historyItems.length - 10} more videos...`
                          }
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* 插入和清除按钮区域 */}
        {generatedVideo && (
          <div className="section-actions">
            <button
              onClick={() => {
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
              onClick={() => {
                if (generatedVideo) {
                  // 创建一个临时链接来下载视频
                  const link = document.createElement('a');
                  link.href = generatedVideo;
                  link.download = `generated-video-${Date.now()}.mp4`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  
                  // 关闭对话框
                  setAppState({ ...appState, openDialogType: null });
                }
              }}
              disabled={isGenerating || videoLoading}
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