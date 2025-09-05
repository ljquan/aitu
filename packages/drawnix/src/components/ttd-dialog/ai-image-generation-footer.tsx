import { useState, useEffect } from 'react';
import { Button } from 'tdesign-react';
import { useDrawnix } from '../../hooks/use-drawnix';
import { useI18n } from '../../i18n';
import { useBoard } from '@plait-board/react-board';
import { insertImageFromUrl } from '../../data/image';

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

// 清除预览缓存
const clearPreviewCache = () => {
  try {
    localStorage.removeItem(PREVIEW_CACHE_KEY);
  } catch (error) {
    console.warn('Failed to clear preview cache:', error);
  }
};

export const AIImageGenerationFooter = () => {
  const { appState, setAppState } = useDrawnix();
  const { language } = useI18n();
  const board = useBoard();
  
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [prompt, setPrompt] = useState('');
  
  // 定期检查缓存状态以获取最新的生成结果
  useEffect(() => {
    const checkCache = () => {
      const cached = loadPreviewCache();
      setGeneratedImage(cached?.generatedImage || null);
      if (cached) {
        setPrompt(cached.prompt);
      }
    };
    
    // 立即检查一次
    checkCache();
    
    // 每500ms检查一次缓存更新
    const interval = setInterval(checkCache, 500);
    
    return () => clearInterval(interval);
  }, []);
  
  // 监听生成状态的变化（通过自定义事件）
  useEffect(() => {
    const handleGenerationStateChange = (event: CustomEvent) => {
      setIsGenerating(event.detail.isGenerating);
      setImageLoading(event.detail.imageLoading);
    };
    
    window.addEventListener('ai-generation-state-change', handleGenerationStateChange as EventListener);
    
    return () => {
      window.removeEventListener('ai-generation-state-change', handleGenerationStateChange as EventListener);
    };
  }, []);
  
  const handleInsert = async () => {
    if (generatedImage) {
      try {
        console.log('Starting image insertion with URL...', generatedImage);
        
        await insertImageFromUrl(board, generatedImage);
        
        console.log('Image inserted successfully!');
        
        // 清除缓存
        clearPreviewCache();
        setGeneratedImage(null);
        
        // 关闭对话框
        setAppState({ ...appState, openDialogType: null });
        
      } catch (err) {
        console.error('Insert image error:', err);
      }
    }
  };
  
  const handleGenerate = () => {
    // 触发主组件生成
    window.dispatchEvent(new CustomEvent('ai-image-generate'));
  };
  
  const handleReset = () => {
    // 触发主组件重置
    window.dispatchEvent(new CustomEvent('ai-image-reset'));
  };
  
  const handleClear = () => {
    clearPreviewCache();
    setGeneratedImage(null);
    // 触发主组件更新
    window.dispatchEvent(new CustomEvent('ai-image-clear'));
  };
  
  return (
    <div style={{ 
      display: 'flex', 
      gap: '8px', 
      justifyContent: 'space-between',
      alignItems: 'center',
      margin: '0',
      minHeight: '40px' // 确保footer有最小高度
    }}>
      {/* 左侧：生成和重置按钮 */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <Button
          onClick={handleGenerate}
          disabled={isGenerating || !prompt.trim()}
          theme="primary"
          size="medium"
          loading={isGenerating}
          style={{ 
            minWidth: '80px',
            height: '32px'
          }}
        >
          {isGenerating
            ? (language === 'zh' ? '生成中' : 'Generating')
            : generatedImage
            ? (language === 'zh' ? '重新生成' : 'Regenerate')
            : (language === 'zh' ? '生成' : 'Generate')
          }
        </Button>
        
        <Button
          onClick={handleReset}
          disabled={isGenerating}
          variant="outline"
          size="medium"
          style={{ 
            minWidth: '72px',
            height: '32px'
          }}
        >
          {language === 'zh' ? '重置' : 'Reset'}
        </Button>
      </div>
      
      {/* 右侧：插入和清除按钮（仅在有生成图片时显示） */}
      {generatedImage && (
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button
            onClick={handleClear}
            disabled={isGenerating || imageLoading}
            variant="outline"
            size="medium"
            style={{ 
              minWidth: '72px',
              height: '32px'
            }}
          >
            {language === 'zh' ? '清除' : 'Clear'}
          </Button>
          <Button
            onClick={handleInsert}
            disabled={isGenerating || imageLoading}
            theme="primary"
            size="medium"
            loading={imageLoading}
            style={{ 
              minWidth: '72px',
              height: '32px'
            }}
          >
            {imageLoading 
              ? (language === 'zh' ? '加载中' : 'Loading')
              : (language === 'zh' ? '插入' : 'Insert')
            }
          </Button>
        </div>
      )}
    </div>
  );
};

export default AIImageGenerationFooter;