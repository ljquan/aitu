import React, { useState, useEffect } from 'react';
import './ttd-dialog.scss';
import './ai-image-generation.scss';
import { useDrawnix } from '../../hooks/use-drawnix';
import { useI18n } from '../../i18n';
import { useBoard } from '@plait-board/react-board';
import { getImagePrompts, type Language } from '../../constants/prompts';
import { getSelectedElements, PlaitElement, getRectangleByElements, Point } from '@plait/core';
import { defaultGeminiClient } from '../../utils/gemini-api';
import { insertImageFromUrl } from '../../data/image';
import { 
  GenerationHistory, 
  ImageHistoryItem, 
  VideoHistoryItem,
  saveImageToHistory, 
  loadImageHistory, 
  generateHistoryId,
  extractUserPromptsFromHistory 
} from '../generation-history';
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
  type ImageFile
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
  const [width, setWidth] = useState<number | string>(1024);
  const [height, setHeight] = useState<number | string>(1024);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [useImageAPI] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<ImageFile[]>(initialImages);
  const [historyItems, setHistoryItems] = useState<ImageHistoryItem[]>([]);
  
  const { isGenerating, isLoading: imageLoading, updateIsGenerating, updateIsLoading: updateImageLoading } = useGenerationState('image');

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



  useEffect(() => {
    const cachedData = cacheManager.load();
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
      cacheManager.save(cacheData);

      // 更新已有的提示词记录，添加生成的图片信息
      const existingHistory = loadImageHistory();
      const existingIndex = existingHistory.findIndex(item => item.prompt.trim() === prompt.trim());
      
      if (existingIndex >= 0) {
        // 如果找到了相同提示词的记录，更新它的图片信息
        const updatedItem = {
          ...existingHistory[existingIndex],
          imageUrl,
          timestamp: Date.now(), // 更新时间戳
          width: typeof width === 'string' ? parseInt(width) || 400 : width,
          height: typeof height === 'string' ? parseInt(height) || 400 : height
        };
        
        // 更新历史记录
        saveImageToHistory(updatedItem);
        
        // 更新历史列表状态
        const updatedHistoryItem: ImageHistoryItem = { ...updatedItem, type: 'image' };
        setHistoryItems(prev => [updatedHistoryItem, ...prev.filter(h => h.id !== updatedItem.id)].slice(0, 50));
      } else {
        // 如果没有找到，创建新记录（理论上不应该到这里，因为已在handleGenerate中保存了）
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
      }
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

      // 更新已有的提示词记录，添加生成的图片信息
      const existingHistory = loadImageHistory();
      const existingIndex = existingHistory.findIndex(item => item.prompt.trim() === prompt.trim());
      
      if (existingIndex >= 0) {
        // 如果找到了相同提示词的记录，更新它的图片信息
        const updatedItem = {
          ...existingHistory[existingIndex],
          imageUrl,
          timestamp: Date.now(), // 更新时间戳
          width: typeof width === 'string' ? parseInt(width) || 400 : width,
          height: typeof height === 'string' ? parseInt(height) || 400 : height
        };
        
        // 更新历史记录
        saveImageToHistory(updatedItem);
        
        // 更新历史列表状态
        const updatedHistoryItem: ImageHistoryItem = { ...updatedItem, type: 'image' };
        setHistoryItems(prev => [updatedHistoryItem, ...prev.filter(h => h.id !== updatedItem.id)].slice(0, 50));
      } else {
        // 如果没有找到，创建新记录（理论上不应该到这里，因为已在handleGenerate中保存了）
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
      }
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

  // 获取合并的预设提示词（用户历史 + 默认预设）
  const getMergedPresetPrompts = () => {
    // 获取默认预设提示词
    const defaultPrompts = getImagePrompts(language as Language);

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
    const existingHistory = loadImageHistory();
    
    // 检查是否已存在相同的提示词
    const isDuplicate = existingHistory.some(item => item.prompt.trim() === promptText.trim());
    
    if (!isDuplicate) {
      // 创建一个临时的历史项目，只用于保存提示词
      const promptHistoryItem: Omit<ImageHistoryItem, 'type'> = {
        id: generateHistoryId(),
        prompt: promptText.trim(),
        imageUrl: '', // 暂时为空
        timestamp: Date.now(),
        width: typeof width === 'string' ? parseInt(width) || 1024 : width,
        height: typeof height === 'string' ? parseInt(height) || 1024 : height
      };
      
      console.log('Saving prompt to history:', promptText);
      saveImageToHistory(promptHistoryItem);
    } else {
      console.log('Prompt already exists in history, skipping:', promptText);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError(language === 'zh' ? '请输入图像描述' : 'Please enter image description');
      return;
    }

    // 清除旧的图像和错误信息
    setGeneratedImage(null);
    setError(null);
    
    // 在生成开始时保存提示词（不管是否生成成功）
    savePromptToHistory(prompt);

    updateIsGenerating(true);

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
        const imagePrompt = `Generate an image based on this description: "${prompt}"`;

        // 将上传的图片转换为ImageInput格式，对File类型的图片进行压缩
        const imageInputs = await Promise.all(uploadedImages.map(async (item) => {
          if (item instanceof File) {
            // 注释掉图片压缩逻辑，直接使用原图
            // try {
            //   // 将File转换为data URL
            //   const fileDataUrl = await new Promise<string>((resolve, reject) => {
            //     const reader = new FileReader();
            //     reader.onload = () => resolve(reader.result as string);
            //     reader.onerror = reject;
            //     reader.readAsDataURL(item);
            //   });
            //   
            //   // 对base64图片进行压缩处理
            //   const compressedDataUrl = await compressImageUrl(fileDataUrl);
            //   
            //   // 将压缩后的data URL转换回File对象
            //   const response = await fetch(compressedDataUrl);
            //   const blob = await response.blob();
            //   const compressedFile = new File([blob], item.name, { type: blob.type || item.type });
            //   
            //   return { file: compressedFile };
            // } catch (compressionError) {
            //   console.warn('Failed to compress uploaded image, using original:', compressionError);
            //   return { file: item };
            // }
            
            // 直接使用原图，不进行压缩
            return { file: item };
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
      
      if (isInvalidTokenError(errorMessage)) {
        const apiKeyError = await handleApiKeyError(errorMessage, language);
        if (apiKeyError) {
          setError(apiKeyError);
        }
        // If apiKeyError is null, it means API key was successfully updated, don't clear the error here
        // The user can try generating again
      } else {
        // Show the actual error message for non-API key errors
        setError(
          language === 'zh' 
            ? `图像生成失败: ${errorMessage}` 
            : `Image generation failed: ${errorMessage}`
        );
      }
    } finally {
      updateIsGenerating(false);
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