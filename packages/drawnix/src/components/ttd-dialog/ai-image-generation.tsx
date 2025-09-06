import React, { useState, useEffect } from 'react';
import './ttd-dialog.scss';
import './ai-image-generation.scss';
import { useDrawnix } from '../../hooks/use-drawnix';
import { useI18n } from '../../i18n';
import { useBoard } from '@plait-board/react-board';
import { getSelectedElements, PlaitElement, getRectangleByElements, Point } from '@plait/core';
import { defaultGeminiClient, promptForApiKey } from '../../utils/gemini-api';
import { insertImageFromUrl } from '../../data/image';
import { compressImageUrl } from '../../utils/selection-utils';
import { 
  GenerationHistory, 
  ImageHistoryItem, 
  VideoHistoryItem,
  saveImageToHistory, 
  loadImageHistory, 
  generateHistoryId,
  extractUserPromptsFromHistory 
} from '../generation-history';

// 预览图缓存key
const PREVIEW_CACHE_KEY = 'ai_image_generation_preview_cache';

// 缓存数据接口
interface PreviewCache {
  prompt: string;
  generatedImage: string | null;
  timestamp: number;
  width: number | string;
  height: number | string;
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


const getPromptExample = (language: 'zh' | 'en') => {
  if (language === 'zh') {
    return `一只可爱的小猫坐在窗台上，阳光透过窗户洒在它的毛发上，背景是温馨的家居环境`;
  }
  return `A cute kitten sitting on a windowsill, with sunlight streaming through the window onto its fur, with a cozy home environment in the background`;
};

interface AIImageGenerationProps {
  initialPrompt?: string;
  initialImages?: (File | { url: string; name: string })[];
  selectedElementIds?: string[];
}

const AIImageGeneration = ({ initialPrompt = '', initialImages = [], selectedElementIds = [] }: AIImageGenerationProps = {}) => {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [width, setWidth] = useState<number | string>(1024);
  const [height, setHeight] = useState<number | string>(1024);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // 通知Footer组件生成状态变化
  const notifyGenerationStateChange = (generating: boolean, loading: boolean) => {
    window.dispatchEvent(new CustomEvent('ai-generation-state-change', {
      detail: { isGenerating: generating, imageLoading: loading }
    }));
  };
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  
  // 包装setIsGenerating和setImageLoading以发送事件
  const updateIsGenerating = (value: boolean) => {
    setIsGenerating(value);
    notifyGenerationStateChange(value, imageLoading);
  };
  
  const updateImageLoading = (value: boolean) => {
    setImageLoading(value);
    notifyGenerationStateChange(isGenerating, value);
  };
  const [error, setError] = useState<string | null>(null);
  const [useImageAPI] = useState(false); // true: images/generations, false: chat/completions
  // 支持文件和URL两种类型的图片
  const [uploadedImages, setUploadedImages] = useState<(File | { url: string; name: string })[]>(initialImages);
  // 历史相关状态
  const [historyItems, setHistoryItems] = useState<ImageHistoryItem[]>([]);

  const { appState, setAppState } = useDrawnix();
  const { language } = useI18n();
  const board = useBoard();

  // 根据保存的选中元素IDs计算插入位置
  const calculateInsertionPoint = (): Point | undefined => {
    if (!board || selectedElementIds.length === 0) {
      return undefined;
    }

    // 查找对应的元素
    const elements: PlaitElement[] = [];
    for (const id of selectedElementIds) {
      const element = board.children.find((el: PlaitElement) => el.id === id);
      if (element) {
        elements.push(element);
      }
    }

    if (elements.length === 0) {
      console.warn('No elements found for saved selected element IDs:', selectedElementIds);
      return undefined;
    }

    try {
      // 计算边界矩形
      const boundingRect = getRectangleByElements(board, elements, false);
      
      // 计算几何中心X坐标
      const centerX = boundingRect.x + boundingRect.width / 2;
      
      // 计算底部Y坐标 + 50px偏移
      const insertionY = boundingRect.y + boundingRect.height + 50;
      
      console.log('Calculated insertion point from saved selection:', { centerX, insertionY, boundingRect });
      
      return [centerX, insertionY] as Point;
    } catch (error) {
      console.warn('Error calculating insertion point from saved selection:', error);
      return undefined;
    }
  };


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
      setWidth(cachedData.width);
      setHeight(cachedData.height);
      setGeneratedImage(cachedData.generatedImage);
    }
  }, []);

  // 加载历史记录
  useEffect(() => {
    const history = loadImageHistory();
    setHistoryItems(history);
  }, []);

  // 处理 props 变化，更新内部状态
  useEffect(() => {
    setPrompt(initialPrompt);
    setUploadedImages(initialImages);
  }, [initialPrompt, initialImages]);

  // 处理图片上传
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const newImages = Array.from(files).filter(file => 
        file.type.startsWith('image/') && file.size <= 10 * 1024 * 1024 // 限制10MB
      );
      setUploadedImages(prev => [...prev, ...newImages]);
    }
    // 清空input值，允许重复选择同一文件
    event.target.value = '';
  };

  // 删除上传的图片
  const removeUploadedImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
  };

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

  // 预加载图片并优化缓存
  const preloadImage = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      
      // 添加缓存策略
      img.crossOrigin = 'anonymous';
      img.referrerPolicy = 'no-referrer';
      
      img.onload = () => {
        resolve(img);
      };
      
      img.onerror = (error) => {
        console.warn('Image preload failed:', url, error);
        reject(error);
      };
      
      // 设置src触发加载
      img.src = url;
    });
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
      savePreviewCache(cacheData);

      // 保存到历史记录
      const historyItem: Omit<ImageHistoryItem, 'type'> = {
        id: generateHistoryId(),
        prompt,
        imageUrl,
        timestamp: Date.now(),
        width: typeof width === 'string' ? parseInt(width) || 400 : width,
        height: typeof height === 'string' ? parseInt(height) || 400 : height
      };
      saveImageToHistory(historyItem);
      
      // 更新历史列表状态
      const newHistoryItem: ImageHistoryItem = { ...historyItem, type: 'image' };
      setHistoryItems(prev => [newHistoryItem, ...prev.filter(h => h.id !== historyItem.id)].slice(0, 50));
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
      savePreviewCache(cacheData);

      // 保存到历史记录
      const historyItem: Omit<ImageHistoryItem, 'type'> = {
        id: generateHistoryId(),
        prompt,
        imageUrl,
        timestamp: Date.now(),
        width: typeof width === 'string' ? parseInt(width) || 400 : width,
        height: typeof height === 'string' ? parseInt(height) || 400 : height
      };
      saveImageToHistory(historyItem);
      
      // 更新历史列表状态
      const newHistoryItem: ImageHistoryItem = { ...historyItem, type: 'image' };
      setHistoryItems(prev => [newHistoryItem, ...prev.filter(h => h.id !== historyItem.id)].slice(0, 50));
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
    savePreviewCache(cacheData);
  };

  // 通用历史选择处理器（兼容各种类型）
  const handleSelectFromHistory = (item: ImageHistoryItem | VideoHistoryItem) => {
    if (item.type === 'image') {
      selectFromHistory(item as ImageHistoryItem);
    }
    // 图片生成组件不处理视频类型
  };

  // 获取合并的预设提示词（用户历史 + 默认预设）
  const getMergedPresetPrompts = () => {
    // 默认预设提示词
    const defaultPrompts = language === 'zh' ? [
      '一只可爱的小猫坐在窗台上，阳光透过窗户洒在它的毛发上',
      '美丽的山水风景，青山绿水，云雾缭绕',
      '现代简约风格的室内设计，明亮宽敞',
      '夜晚的城市天际线，霓虹灯闪烁',
      '春天的樱花盛开，粉色花瓣飘落',
      '科幻风格的太空站，星空背景',
      '温馨的咖啡厅，暖色调灯光',
      '抽象艺术风格，色彩丰富的几何图形'
    ] : [
      'A cute kitten sitting on a windowsill with sunlight streaming through',
      'Beautiful mountain landscape with green hills and misty clouds',
      'Modern minimalist interior design, bright and spacious',
      'City skyline at night with neon lights glowing',
      'Cherry blossoms in spring with pink petals falling',
      'Sci-fi space station with starry background',
      'Cozy coffee shop with warm ambient lighting',
      'Abstract art with colorful geometric shapes'
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

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError(language === 'zh' ? '请输入图像描述' : 'Please enter image description');
      return;
    }

    updateIsGenerating(true);
    setError(null);

    try {
      const finalWidth = typeof width === 'string' ? (parseInt(width) || 1024) : width;
      const finalHeight = typeof height === 'string' ? (parseInt(height) || 1024) : height;
      
      if (useImageAPI) {
        // 使用专用图像生成API (images/generations)
        console.log('Using Images API for generation...');
        const result = await defaultGeminiClient.generateImage(prompt, {
          n: 1,
          size: `${finalWidth}x${finalHeight}`
        });
        
        // 处理图像生成API的响应格式: { data: [{ url: "..." }], created: timestamp }
        if (result.data && result.data.length > 0) {
          const imageUrl = result.data[0].url;
          console.log('Generated image URL:', imageUrl);
          await setGeneratedImageWithPreload(imageUrl);
        } else {
          setError(
            language === 'zh' 
              ? '图像生成失败，API未返回图像数据' 
              : 'Image generation failed, API returned no image data'
          );
        }
      } else {
        // 使用聊天API (chat/completions)
        console.log('Using Chat API for generation...');
        const imagePrompt = `Generate an image based on this description: "${prompt}"

Requirements:
- Dimensions: ${finalWidth} × ${finalHeight} pixels
- High quality and detailed
- Return only the direct image URL in your response

Description: ${prompt}`;

        // 将上传的图片转换为ImageInput格式，对File类型的图片进行压缩
        const imageInputs = await Promise.all(uploadedImages.map(async (item) => {
          if (item instanceof File) {
            try {
              // 将File转换为data URL
              const fileDataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(item);
              });
              
              // 对base64图片进行压缩处理
              const compressedDataUrl = await compressImageUrl(fileDataUrl);
              
              // 将压缩后的data URL转换回File对象
              const response = await fetch(compressedDataUrl);
              const blob = await response.blob();
              const compressedFile = new File([blob], item.name, { type: blob.type || item.type });
              
              return { file: compressedFile };
            } catch (compressionError) {
              console.warn('Failed to compress uploaded image, using original:', compressionError);
              return { file: item };
            }
          } else {
            // 对于URL类型的图片，直接传递URL
            return { url: item.url };
          }
        }));
        
        const result = await defaultGeminiClient.chat(imagePrompt, imageInputs);
        
        // 从聊天响应中提取内容
        const responseContent = result.response.choices[0]?.message?.content || '';
        console.log('Chat API response:', responseContent);
        
        // 先检查是否有处理过的内容（可能包含图片）
        if (result.processedContent && result.processedContent.images && result.processedContent.images.length > 0) {
          // 如果响应中包含图片，使用第一张图片
          const firstImage = result.processedContent.images[0];
          if (firstImage.type === 'url') {
            await setGeneratedImageWithPreload(firstImage.data);
          } else if (firstImage.type === 'base64') {
            // 将base64转换为data URL
            const dataUrl = `data:image/png;base64,${firstImage.data}`;
            await setGeneratedImageWithPreload(dataUrl);
          }
        } else {
          // 尝试从文本响应中提取图片URL
          const urlMatch = responseContent.match(/https?:\/\/[^\s<>"'\n]+/);
          if (urlMatch) {
            const imageUrl = urlMatch[0].replace(/[.,;!?]*$/, ''); // 移除末尾的标点符号
            console.log('Extracted URL:', imageUrl);
            await setGeneratedImageWithPreload(imageUrl);
          } else {
            setError(
              language === 'zh' 
                ? `聊天API无法生成图像。响应: ${responseContent.substring(0, 100)}...` 
                : `Chat API unable to generate image. Response: ${responseContent.substring(0, 100)}...`
            );
          }
        }
      }
    } catch (err) {
      console.error('AI image generation error:', err);
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
            // 可以选择自动重新生成图片
            // handleGenerate();
          } else {
            // 用户取消了API Key输入
            setError(
              language === 'zh' 
                ? '需要有效的API Key才能生成图像' 
                : 'Valid API Key is required to generate images'
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
            ? '图像生成失败，请检查网络连接或稍后重试' 
            : 'Image generation failed, please check network connection or try again later'
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
        if (!isGenerating && prompt.trim()) {
          handleGenerate();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isGenerating, prompt, handleGenerate]);






  return (
    <div className="ai-image-generation-container">
      <div className="main-content">
        {/* AI 图像生成表单 */}
        <div className="ai-image-generation-section">
        <div className="ai-image-generation-form">
          
          {/* 图片上传 */}
          {!useImageAPI && (
            <div className="form-field">
              <label className="form-label">
                {language === 'zh' ? '参考图片 (可选)' : 'Reference Images (Optional)'}
              </label>
              <div className="unified-image-area">
                {uploadedImages.length === 0 ? (
                  /* 没有图片时显示完整上传区域 */
                  <div className="upload-area">
                    <input
                      type="file"
                      id="image-upload"
                      multiple
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="upload-input"
                      disabled={isGenerating}
                    />
                    <label htmlFor="image-upload" className="upload-label">
                      <div className="upload-icon">📷</div>
                      <div className="upload-text">
                        {language === 'zh' 
                          ? '点击或拖拽上传图片' 
                          : 'Click or drag to upload images'}
                      </div>
                      <div className="upload-hint">
                        {language === 'zh' 
                          ? '支持 JPG, PNG, WebP, 最大 10MB' 
                          : 'Support JPG, PNG, WebP, Max 10MB'}
                      </div>
                    </label>
                  </div>
                ) : (
                  /* 有图片时显示图片网格和小的添加按钮 */
                  <div className="images-grid">
                    {uploadedImages.map((item, index) => {
                      const isFile = item instanceof File;
                      const src = isFile ? URL.createObjectURL(item) : item.url;
                      const name = isFile ? item.name : item.name;
                      const size = isFile ? `${(item.size / 1024 / 1024).toFixed(1)}MB` : 'URL';
                      
                      return (
                        <div key={index} className="uploaded-image-item" data-tooltip={src}>
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
                              src={src}
                              alt={`Upload ${index + 1}`}
                              className="uploaded-image-preview"
                            />
                            <div className="image-hover-tooltip">
                              <img src={src} alt="Large preview" />
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeUploadedImage(index)}
                            className="remove-image-btn"
                            disabled={isGenerating}
                          >
                            ×
                          </button>
                          <div className="image-info">
                            <span className="image-name">{name}</span>
                            {/* <span className="image-size">
                              {size}
                            </span> */}
                          </div>
                        </div>
                      );
                    })}
                    {/* 小的添加按钮 */}
                    <div className="add-more-item">
                      <input
                        type="file"
                        id="image-upload-more"
                        multiple
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="upload-input"
                        disabled={isGenerating}
                      />
                      <label htmlFor="image-upload-more" className="add-more-label">
                        <div className="add-more-icon">+</div>
                        <div className="add-more-text">
                          {language === 'zh' ? '添加' : 'Add'}
                        </div>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* 提示词输入 */}
          <div className="form-field">
            <div className="form-label-with-icon">
              <label className="form-label">
                {language === 'zh' ? '图像描述' : 'Image Description'}
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
          
          {/* 错误信息 */}
          {error && (
            <div className="form-error">
              {error}
            </div>
          )}
        </div>
        
        {/* 生成和重置按钮区域 */}
        <div className="section-actions">
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim()}
            className={`action-button primary ${isGenerating ? 'loading' : ''}`}
          >
            {isGenerating
              ? (language === 'zh' ? '生成中...' : 'Generating...')
              : generatedImage
              ? (language === 'zh' ? '重新生成' : 'Regenerate')
              : (language === 'zh' ? '生成' : 'Generate')
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
                {language === 'zh' ? '正在生成图像...' : 'Generating image...'}
              </div>
            </div>
          ) : imageLoading ? (
            <div className="preview-loading">
              <div className="loading-spinner"></div>
              <div className="loading-text">
                {language === 'zh' ? '正在加载图像...' : 'Loading image...'}
              </div>
            </div>
          ) : generatedImage ? (
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
                  // 保持图片URL，让用户可以右键新窗口打开
                }}
              />
            </div>
          ) : (
            <div className="preview-placeholder">
              <div className="placeholder-icon">🖼️</div>
              <div className="placeholder-text">
                {language === 'zh' ? '图像将在这里显示' : 'Image will be displayed here'}
              </div>
            </div>
          )}
              {/* 统一历史记录组件 */}
              <GenerationHistory
                historyItems={historyItems}
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
                    
                    // 计算插入位置
                    const insertionPoint = calculateInsertionPoint();
                    console.log('Calculated insertion point:', insertionPoint);
                    
                    await insertImageFromUrl(board, generatedImage, insertionPoint);
                    
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