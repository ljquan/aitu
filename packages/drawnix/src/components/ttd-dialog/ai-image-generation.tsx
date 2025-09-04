import { useState, useEffect } from 'react';
import './ttd-dialog.scss';
import './ai-image-generation.scss';
import { useDrawnix } from '../../hooks/use-drawnix';
import { useI18n } from '../../i18n';
import { useBoard } from '@plait-board/react-board';
// 临时注释掉 Gemini API 导入，稍后修复
import { defaultGeminiClient } from '../../../../../apps/web/src/utils/gemini-api';
import { insertImageFromUrl } from '../../data/image';
import { extractSelectedContent } from '../../utils/selection-utils';

const getPromptExample = (language: 'zh' | 'en') => {
  if (language === 'zh') {
    return `一只可爱的小猫坐在窗台上，阳光透过窗户洒在它的毛发上，背景是温馨的家居环境`;
  }
  return `A cute kitten sitting on a windowsill, with sunlight streaming through the window onto its fur, with a cozy home environment in the background`;
};

const AIImageGeneration = () => {
  const [prompt, setPrompt] = useState('');
  const [width, setWidth] = useState<number | string>(1024);
  const [height, setHeight] = useState<number | string>(1024);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [useImageAPI, setUseImageAPI] = useState(false); // true: images/generations, false: chat/completions
  // 支持文件和URL两种类型的图片
  const [uploadedImages, setUploadedImages] = useState<(File | { url: string; name: string })[]>([]);

  const { appState, setAppState } = useDrawnix();
  const { language } = useI18n();
  const board = useBoard();

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

  // 清空所有上传的图片
  const clearUploadedImages = () => {
    setUploadedImages([]);
  };

  const presetPrompts = language === 'zh' ? [
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

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError(language === 'zh' ? '请输入图像描述' : 'Please enter image description');
      return;
    }

    setIsGenerating(true);
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
          setGeneratedImage(imageUrl);
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

        // 将上传的图片转换为ImageInput格式
        const imageInputs = uploadedImages.map(item => {
          if (item instanceof File) {
            return { file: item };
          } else {
            // 对于URL类型的图片，直接传递URL
            return { url: item.url };
          }
        });
        
        const result = await defaultGeminiClient.chat(imagePrompt, imageInputs);
        
        // 从聊天响应中提取内容
        const responseContent = result.response.choices[0]?.message?.content || '';
        console.log('Chat API response:', responseContent);
        
        // 先检查是否有处理过的内容（可能包含图片）
        if (result.processedContent && result.processedContent.images && result.processedContent.images.length > 0) {
          // 如果响应中包含图片，使用第一张图片
          const firstImage = result.processedContent.images[0];
          if (firstImage.type === 'url') {
            setGeneratedImage(firstImage.data);
          } else if (firstImage.type === 'base64') {
            // 将base64转换为data URL
            const dataUrl = `data:image/png;base64,${firstImage.data}`;
            setGeneratedImage(dataUrl);
          }
        } else {
          // 尝试从文本响应中提取图片URL
          const urlMatch = responseContent.match(/https?:\/\/[^\s<>"'\n]+/);
          if (urlMatch) {
            const imageUrl = urlMatch[0].replace(/[.,;!?]*$/, ''); // 移除末尾的标点符号
            console.log('Extracted URL:', imageUrl);
            setGeneratedImage(imageUrl);
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
      setError(
        language === 'zh' 
          ? '图像生成失败，请检查网络连接或稍后重试' 
          : 'Image generation failed, please check network connection or try again later'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleInsert = async () => {
    if (generatedImage) {
      try {
        console.log('Starting image insertion with URL...', generatedImage);
        
        // 直接使用URL插入图片，不需要转换为File
        await insertImageFromUrl(board, generatedImage);
        
        console.log('Image inserted successfully!');
        
        // 关闭对话框
        setAppState({ ...appState, openDialogType: null });
        
        // 清除错误状态
        setError(null);
        
      } catch (err) {
        console.error('Insert image error:', err);
        setError(
          language === 'zh' 
            ? `插入图片失败: ${err instanceof Error ? err.message : '未知错误'}` 
            : `Failed to insert image: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
      }
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

  // 自动填充选中的内容
  useEffect(() => {
    const populateFromSelection = async () => {
      const selectedContent = extractSelectedContent(board);
      
      // 填充文本描述
      if (selectedContent.text && !prompt) {
        setPrompt(selectedContent.text);
      }
      
      // 填充图片（仅在聊天API模式下）
      if (selectedContent.images.length > 0 && !useImageAPI && uploadedImages.length === 0) {
        const imageItems = selectedContent.images.map(image => ({
          url: image.url,
          name: image.name || `selected-image-${Date.now()}.png`
        }));
        
        setUploadedImages(imageItems);
      }
    };

    populateFromSelection();
  }, []); // 只在组件挂载时运行一次



  return (
    <div className="ai-image-generation-container">
      <div className="main-content">
        {/* AI 图像生成表单 */}
        <div className="ai-image-generation-section">
        <h3 className="section-title">
          {language === 'zh' ? 'AI 图像生成' : 'AI Image Generation'}
        </h3>
        <div className="ai-image-generation-form">
          
          {/* 图片上传 */}
          {!useImageAPI && (
            <div className="form-field">
              <div className="form-label-with-icon">
                <label className="form-label">
                  {language === 'zh' ? '参考图片 (可选)' : 'Reference Images (Optional)'}
                </label>
                {uploadedImages.length > 0 && (
                  <button
                    type="button"
                    onClick={clearUploadedImages}
                    className="clear-images-btn"
                    disabled={isGenerating}
                  >
                    {language === 'zh' ? '清空' : 'Clear All'}
                  </button>
                )}
              </div>
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
                        <div key={index} className="uploaded-image-item">
                          <img
                            src={src}
                            alt={`Upload ${index + 1}`}
                            className="uploaded-image-preview"
                          />
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
                            <span className="image-size">
                              {size}
                            </span>
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
        
        {/* 生成按钮区域 */}
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
          
          <div className="keyboard-shortcut">
            <span>Cmd+Enter</span>
          </div>
        </div>
      </div>
      
      {/* 预览区域 */}
      <div className="preview-section">
        <h3 className="section-title">
          {language === 'zh' ? '预览' : 'Preview'}
        </h3>
        <div className="image-preview-container">
          {isGenerating ? (
            <div className="preview-loading">
              <div className="loading-spinner"></div>
              <div className="loading-text">
                {language === 'zh' ? '正在生成图像...' : 'Generating image...'}
              </div>
            </div>
          ) : generatedImage ? (
            <div className="preview-image-wrapper">
              <img 
                src={generatedImage} 
                alt="Generated" 
                className="preview-image"
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
        </div>
        
        {/* 插入按钮区域 */}
        {generatedImage && (
          <div className="section-actions">
            <button
              onClick={handleInsert}
              disabled={isGenerating}
              className="action-button secondary"
            >
              {language === 'zh' ? '插入' : 'Insert'}
            </button>
          </div>
        )}
      </div>
      </div>
      
    </div>
  );
};

export default AIImageGeneration;