/**
 * Gemini API 使用示例
 * 展示如何在前端项目中使用 gemini-api.ts 工具
 */

import React from 'react';
import {
  GeminiClient,
  generateImageWithGemini,
  defaultGeminiClient,
  processMixedContent,
  base64ToBlobUrl,
  type GeminiConfig,
  type ImageInput,
} from './gemini-api';

// ====================================
// 基础配置示例
// ====================================

/**
 * 创建 Gemini 客户端配置
 */
const geminiConfig: GeminiConfig = {
  apiKey: 'sk-your-api-key-here', // 替换为你的实际 API Key
  baseUrl: 'https://api.tu-zi.com/v1', // 替换为你的实际 Base URL
  modelName: 'gemini-2.5-flash-image',
  maxRetries: 10,
  retryDelay: 0,
  timeout: 120000, // 120秒
  useStream: true,
};

// ====================================
// 使用示例 1: 基础图像生成
// ====================================

/**
 * 示例：使用单张图片生成新图像
 */
export async function example1_BasicImageGeneration() {
  try {
    // 创建客户端
    const client = new GeminiClient(geminiConfig);

    // 准备图片输入（从文件输入）
    const fileInput = document.getElementById('imageInput') as HTMLInputElement;
    const file = fileInput?.files?.[0];
    
    if (!file) {
      throw new Error('请选择一张图片');
    }

    const images: ImageInput[] = [{ file }];
    const prompt = '请分析这张图片并生成一个类似风格的新图像';

    // 调用 API
    const result = await client.generateImage(prompt, images);

    console.log('生成结果:', result.processedContent);
    
    // 处理返回的图片
    result.processedContent.images.forEach((img, index) => {
      if (img.type === 'base64') {
        const blobUrl = base64ToBlobUrl(img.data);
        console.log(`生成的图片 ${index + 1}:`, blobUrl);
        
        // 显示图片
        const imgElement = document.createElement('img');
        imgElement.src = blobUrl;
        imgElement.style.maxWidth = '500px';
        document.body.appendChild(imgElement);
      }
    });

  } catch (error) {
    console.error('图像生成失败:', error);
  }
}

// ====================================
// 使用示例 2: 多图片合成
// ====================================

/**
 * 示例：使用多张图片进行合成生成
 */
export async function example2_MultiImageComposition() {
  try {
    const client = new GeminiClient(geminiConfig);

    // 准备多张图片
    const images: ImageInput[] = [
      { file: await getFileFromInput('image1') },
      { file: await getFileFromInput('image2') },
    ];

    const prompt = '将第一张图片中的人物与第二张图片的背景进行合成，创造一个和谐的新场景';

    const result = await client.generateImage(prompt, images);
    
    // 处理结果
    handleGenerationResult(result);

  } catch (error) {
    console.error('多图片合成失败:', error);
  }
}

// ====================================
// 使用示例 3: 使用 base64 图片
// ====================================

/**
 * 示例：使用 base64 格式的图片
 */
export async function example3_Base64ImageInput() {
  try {
    const client = new GeminiClient(geminiConfig);

    // 使用 base64 图片
    const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
    
    const images: ImageInput[] = [
      { base64: base64Image }
    ];

    const prompt = '基于这张图片，生成一个更加丰富和详细的版本';

    const result = await client.generateImage(prompt, images);
    handleGenerationResult(result);

  } catch (error) {
    console.error('Base64 图片处理失败:', error);
  }
}

// ====================================
// 使用示例 4: React Hook 集成
// ====================================

/**
 * React Hook 示例：在 React 组件中使用 Gemini API
 */
export function useGeminiImageGeneration() {
  const [isLoading, setIsLoading] = React.useState(false);
  const [result, setResult] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);

  const generateImage = async (prompt: string, images: ImageInput[]) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const client = new GeminiClient(geminiConfig);
      const generationResult = await client.generateImage(prompt, images);
      setResult(generationResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
    } finally {
      setIsLoading(false);
    }
  };

  return {
    generateImage,
    isLoading,
    result,
    error,
  };
}

// ====================================
// 使用示例 5: 函数式调用
// ====================================

/**
 * 示例：直接使用函数式 API
 */
export async function example5_FunctionalAPI() {
  try {
    const images: ImageInput[] = [
      { file: await getFileFromInput('sourceImage') }
    ];

    const prompt = '将这张图片转换为卡通风格';

    // 直接调用函数，不使用客户端类
    const result = await generateImageWithGemini(
      geminiConfig,
      prompt,
      images
    );

    handleGenerationResult(result);

  } catch (error) {
    console.error('函数式调用失败:', error);
  }
}

// ====================================
// 使用示例 6: 默认客户端
// ====================================

/**
 * 示例：使用默认客户端实例
 */
export async function example6_DefaultClient() {
  try {
    // 配置默认客户端
    defaultGeminiClient.updateConfig({
      apiKey: 'your-api-key',
      baseUrl: 'https://api.tu-zi.com/v1',
    });

    const images: ImageInput[] = [
      { file: await getFileFromInput('inputImage') }
    ];

    const prompt = '优化这张图片的色彩和对比度';

    const result = await defaultGeminiClient.generateImage(prompt, images);
    handleGenerationResult(result);

  } catch (error) {
    console.error('默认客户端调用失败:', error);
  }
}

// ====================================
// 工具函数
// ====================================

/**
 * 从输入元素获取文件
 */
async function getFileFromInput(inputId: string): Promise<File> {
  const input = document.getElementById(inputId) as HTMLInputElement;
  const file = input?.files?.[0];
  
  if (!file) {
    throw new Error(`未找到文件输入: ${inputId}`);
  }
  
  return file;
}

/**
 * 处理生成结果的通用函数
 */
function handleGenerationResult(result: any) {
  console.log('文本内容:', result.processedContent.textContent);
  
  // 处理生成的图片
  result.processedContent.images.forEach((img: any, index: number) => {
    if (img.type === 'base64') {
      const blobUrl = base64ToBlobUrl(img.data);
      
      // 创建下载链接
      const downloadLink = document.createElement('a');
      downloadLink.href = blobUrl;
      downloadLink.download = `generated_image_${index + 1}.png`;
      downloadLink.textContent = `下载图片 ${index + 1}`;
      downloadLink.style.display = 'block';
      downloadLink.style.margin = '10px 0';
      
      // 创建预览图片
      const imgElement = document.createElement('img');
      imgElement.src = blobUrl;
      imgElement.style.maxWidth = '400px';
      imgElement.style.margin = '10px';
      imgElement.style.border = '1px solid #ccc';
      
      // 添加到页面
      const container = document.getElementById('results') || document.body;
      container.appendChild(downloadLink);
      container.appendChild(imgElement);
    }
  });
}

// ====================================
// React 组件示例
// ====================================

/**
 * React 组件示例的类型定义和接口
 * 注意：这个组件需要在 .tsx 文件中使用，这里仅提供类型定义
 */
export interface GeminiImageGeneratorProps {
  onResult?: (result: any) => void;
  onError?: (error: string) => void;
}

/**
 * React 组件的逻辑函数（不包含 JSX）
 */
export function createGeminiImageGeneratorLogic() {
  return {
    useGeminiImageGeneration,
    handleFileChange: (event: Event, setSelectedFiles: (files: File[]) => void) => {
      const target = event.target as HTMLInputElement;
      const files = Array.from(target.files || []);
      setSelectedFiles(files);
    },
    handleGenerate: async (
      prompt: string,
      selectedFiles: File[],
      generateImage: (prompt: string, images: ImageInput[]) => Promise<void>
    ) => {
      if (!prompt.trim()) {
        alert('请输入提示词');
        return;
      }
      const images: ImageInput[] = selectedFiles.map(file => ({ file }));
      await generateImage(prompt, images);
    },
  };
}

// ====================================
// 配置说明
// ====================================

/**
 * 配置说明和最佳实践
 */
export const CONFIGURATION_GUIDE = {
  apiKey: {
    description: 'Gemini API 密钥',
    example: 'sk-your-api-key-here',
    required: true,
  },
  baseUrl: {
    description: 'API 基础 URL',
    example: 'https://api.tu-zi.com/v1',
    required: true,
  },
  modelName: {
    description: '使用的模型名称',
    example: 'gemini-2.5-flash-image',
    default: 'gemini-2.5-flash-image',
  },
  maxRetries: {
    description: '最大重试次数',
    example: 10,
    default: 10,
  },
  timeout: {
    description: 'API 调用超时时间（毫秒）',
    example: 120000,
    default: 120000,
    note: '图像生成通常需要较长时间，建议设置为 120 秒或更长',
  },
  useStream: {
    description: '是否使用流式响应',
    example: true,
    default: true,
    note: '流式响应可以更好地处理大型图像数据',
  },
};