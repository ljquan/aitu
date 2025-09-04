import { useState, useEffect } from 'react';
import './ttd-dialog.scss';
import './ai-image-generation.scss';
import { useDrawnix } from '../../hooks/use-drawnix';
import { useI18n } from '../../i18n';
import { useBoard } from '@plait-board/react-board';
// 临时注释掉 Gemini API 导入，稍后修复
import { defaultGeminiClient } from '../../../../../apps/web/src/utils/gemini-api';
import { insertImageFromUrl } from '../../data/image';

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

  const { appState, setAppState } = useDrawnix();
  const { language } = useI18n();
  const board = useBoard();

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
      // 使用 Gemini API 生成图片
      const finalWidth = typeof width === 'string' ? (parseInt(width) || 1024) : width;
      const finalHeight = typeof height === 'string' ? (parseInt(height) || 1024) : height;
      const result = await defaultGeminiClient.generateImage(prompt, {
        n: 1,
        size: `${finalWidth}x${finalHeight}`
      });
      
      // 处理新的API返回格式: { data: [{ url: "..." }], created: timestamp }
      if (result.data && result.data.length > 0) {
        const imageUrl = result.data[0].url;
        setGeneratedImage(imageUrl);
      } else {
        setError(
          language === 'zh' 
            ? '图像生成失败，请检查网络连接或稍后重试' 
            : 'Image generation failed, please check network connection or try again later'
        );
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



  return (
    <div className="ai-image-generation-container">
      <div className="main-content">
        {/* AI 图像生成表单 */}
        <div className="ai-image-generation-section">
        <h3 className="section-title">
          {language === 'zh' ? 'AI 图像生成' : 'AI Image Generation'}
        </h3>
        <div className="ai-image-generation-form">
          
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
          <div className="form-field">
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
          </div>
          
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