import { useState, useEffect, useCallback } from 'react';
import { promptForApiKey } from '../../../utils/gemini-api';
import { geminiSettings } from '../../../utils/settings-manager';

export const isInvalidTokenError = (errorMessage: string): boolean => {
  const message = errorMessage.toLowerCase();
  return message.includes('invalid token') || 
         message.includes('invalid api key') ||
         message.includes('unauthorized') ||
         message.includes('api_error') && message.includes('invalid');
};

export const notifyGenerationStateChange = (
  generating: boolean, 
  loading: boolean, 
  type: 'image' | 'video'
) => {
  const eventDetail = type === 'image' 
    ? { isGenerating: generating, imageLoading: loading }
    : { isGenerating: generating, videoLoading: loading };
    
  window.dispatchEvent(new CustomEvent('ai-generation-state-change', {
    detail: eventDetail
  }));
};

export const handleApiKeyError = async (errorMessage: string, language: 'zh' | 'en') => {
  if (!isInvalidTokenError(errorMessage)) {
    return null;
  }

  try {
    const newApiKey = await promptForApiKey();
    if (newApiKey) {
      geminiSettings.update({ apiKey: newApiKey });
      return null; // Success, no error
    } else {
      return language === 'zh' 
        ? '需要有效的API Key才能生成内容' 
        : 'Valid API Key is required to generate content';
    }
  } catch (apiKeyError) {
    console.error('API Key setup error:', apiKeyError);
    return language === 'zh' 
      ? 'API Key设置失败，请稍后重试' 
      : 'API Key setup failed, please try again later';
  }
};

export interface PreviewCacheBase {
  prompt: string;
  timestamp: number;
}

export const createCacheManager = <T extends PreviewCacheBase>(cacheKey: string) => ({
  save: (data: T) => {
    try {
      localStorage.setItem(cacheKey, JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to save preview cache:', error);
    }
  },
  
  load: (): T | null => {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const data = JSON.parse(cached) as T;
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
  },
  
  clear: () => {
    try {
      localStorage.removeItem(cacheKey);
    } catch (error) {
      console.warn('Failed to clear cache:', error);
    }
  }
});

export const useKeyboardShortcuts = (
  isGenerating: boolean,
  prompt: string,
  onGenerate: () => void
) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        if (!isGenerating && prompt.trim()) {
          onGenerate();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isGenerating, prompt, onGenerate]);
};

export const useGenerationState = (type: 'image' | 'video') => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const updateIsGenerating = useCallback((value: boolean) => {
    setIsGenerating(value);
    notifyGenerationStateChange(value, isLoading, type);
  }, [isLoading, type]);
  
  const updateIsLoading = useCallback((value: boolean) => {
    setIsLoading(value);
    notifyGenerationStateChange(isGenerating, value, type);
  }, [isGenerating, type]);
  
  return {
    isGenerating,
    isLoading,
    updateIsGenerating,
    updateIsLoading
  };
};

export const getPromptExample = (language: 'zh' | 'en', type: 'image' | 'video') => {
  if (type === 'image') {
    return language === 'zh'
      ? '一只可爱的小猫坐在窗台上，阳光透过窗户洒在它的毛发上，背景是温馨的家居环境'
      : 'A cute kitten sitting on a windowsill, with sunlight streaming through the window onto its fur, with a cozy home environment in the background';
  } else {
    return language === 'zh'
      ? '生成一个美丽的日出场景，阳光从山峰后缓缓升起，云朵轻柔地飘动'
      : 'Generate a beautiful sunrise scene where the sun slowly rises from behind mountains with clouds gently floating';
  }
};