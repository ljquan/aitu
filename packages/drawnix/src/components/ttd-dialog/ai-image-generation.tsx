import { useState } from 'react';
import './ttd-dialog.scss';
import { TTDDialogPanels } from './ttd-dialog-panels';
import { TTDDialogPanel } from './ttd-dialog-panel';
import { TTDDialogInput } from './ttd-dialog-input';
import { TTDDialogOutput } from './ttd-dialog-output';
import { TTDDialogSubmitShortcut } from './ttd-dialog-submit-shortcut';
import { useDrawnix } from '../../hooks/use-drawnix';
import { useI18n } from '../../i18n';
import { useBoard } from '@plait-board/react-board';
import { getViewportOrigination } from '@plait/core';
// 临时注释掉 Gemini API 导入，稍后修复
import { defaultGeminiClient } from '../../../../../apps/web/src/utils/gemini-api';
import { insertImage } from '../../data/image';

const getPromptExample = (language: 'zh' | 'en') => {
  if (language === 'zh') {
    return `一只可爱的小猫坐在窗台上，阳光透过窗户洒在它的毛发上，背景是温馨的家居环境`;
  }
  return `A cute kitten sitting on a windowsill, with sunlight streaming through the window onto its fur, with a cozy home environment in the background`;
};

const AIImageGeneration = () => {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { appState, setAppState } = useDrawnix();
  const { t, language } = useI18n();
  const board = useBoard();

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError(language === 'zh' ? '请输入图像描述' : 'Please enter image description');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setGeneratedImage(null);

    try {
      // 使用 Gemini API 生成图片
      const result = await defaultGeminiClient.generateImage(prompt, {
        n: 1,
        size: '1024x1024'
      });
      
      // 处理新的API返回格式: { data: [{ url: "..." }], created: timestamp }
      if (result.data && result.data.length > 0) {
        const imageUrl = result.data[0].url;
        
        setGeneratedImage(imageUrl);
        
        // 插入生成的图片到画板
        const viewportOrigination = getViewportOrigination(board);
        const imageBlob = await fetch(imageUrl).then(r => r.blob());
        const imageFile = new File([imageBlob], 'generated-image.png', { type: 'image/png' });
        insertImage(board, imageFile);
        
        // 关闭对话框
        setAppState({ ...appState, openDialogType: null });
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

  const handleSubmit = () => {
    handleGenerate();
  };

  return (
    <TTDDialogPanels>
      <TTDDialogPanel label={language === 'zh' ? 'AI 图像生成' : 'AI Image Generation'}>
        <div className="ttd-dialog-description">
          {language === 'zh'
            ? '输入图像描述，AI 将为您生成相应的图片'
            : 'Enter image description, AI will generate corresponding image for you'}
        </div>
        <TTDDialogInput
          input={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={getPromptExample(language)}
          onKeyboardSubmit={handleSubmit}
        />
        {error && (
          <div className="ttd-dialog-error" style={{ color: '#ef4444', marginTop: '8px' }}>
            {error}
          </div>
        )}
      </TTDDialogPanel>
      
      <TTDDialogPanel label={language === 'zh' ? '预览' : 'Preview'}>
        <div className="ttd-dialog-preview">
          {isGenerating ? (
            <div className="ttd-dialog-loading">
              {language === 'zh' ? '正在生成图像...' : 'Generating image...'}
            </div>
          ) : generatedImage ? (
            <img src={generatedImage} alt="Generated" style={{ maxWidth: '100%', height: 'auto' }} />
          ) : (
            <div className="ttd-dialog-placeholder">
              {language === 'zh' ? '图像将在这里显示' : 'Image will be displayed here'}
            </div>
          )}
        </div>
      </TTDDialogPanel>
      
      <div className="ttd-dialog-submit">
        <button
          onClick={handleSubmit}
          disabled={isGenerating || !prompt.trim()}
          className="ttd-dialog-submit-button"
        >
          {isGenerating
            ? (language === 'zh' ? '生成中...' : 'Generating...')
            : (language === 'zh' ? '生成' : 'Generate')
          }
        </button>
        <span className="ttd-dialog-shortcut">Cmd+Enter</span>
      </div>
    </TTDDialogPanels>
  );
};

export default AIImageGeneration;