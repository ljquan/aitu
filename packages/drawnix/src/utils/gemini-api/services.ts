/**
 * Gemini API 服务函数
 */

import { GeminiConfig, ImageInput, GeminiMessage, VideoGenerationOptions, ProcessedContent, GeminiResponse } from './types';
import { DEFAULT_CONFIG, VIDEO_DEFAULT_CONFIG } from './config';
import { prepareImageData, processMixedContent } from './utils';
import { callApiWithRetry, callApiStreamRaw, callVideoApiStreamRaw } from './apiCalls';
import { geminiSettings, settingsManager } from '../settings-manager';
import { validateAndEnsureConfig } from './auth';

/**
 * 调用 Gemini API 进行图像生成
 */
export async function generateImageWithGemini(
  prompt: string,
  options: {
    n?: number;
    size?: string;
  } = {}
): Promise<any> {
  // 等待设置管理器初始化完成
  await settingsManager.waitForInitialization();
  
  // 直接从设置中获取配置
  const globalSettings = geminiSettings.get();
  const config = {
    ...DEFAULT_CONFIG,
    ...globalSettings,
    modelName: globalSettings.imageModelName || DEFAULT_CONFIG.modelName,
  };
  const validatedConfig = await validateAndEnsureConfig(config);
  const headers = {
    'Authorization': `Bearer ${validatedConfig.apiKey}`,
    'Content-Type': 'application/json',
  };

  const data = {
    model: validatedConfig.modelName || 'gemini-2.5-flash-image',
    prompt,
    n: options.n || 1,
    size: options.size || '1024x1024',
  };

  const url = `${validatedConfig.baseUrl}/images/generations`;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(validatedConfig.timeout || DEFAULT_CONFIG.timeout!),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * 调用 Gemini API 进行视频生成
 */
export async function generateVideoWithGemini(
  prompt: string,
  image: ImageInput | null,
  options: VideoGenerationOptions = {}
): Promise<{
  response: GeminiResponse;
  processedContent: ProcessedContent;
}> {
  // 等待设置管理器初始化完成
  await settingsManager.waitForInitialization();
  
  // 直接从设置中获取配置
  const globalSettings = geminiSettings.get();
  const config = {
    ...VIDEO_DEFAULT_CONFIG,
    ...globalSettings,
    modelName: globalSettings.videoModelName || VIDEO_DEFAULT_CONFIG.modelName,
  };
  const validatedConfig = await validateAndEnsureConfig(config);

  // 准备图片数据（现在是可选的）
  let imageContent;
  if (image) {
    try {
      console.log('处理视频生成源图片...');
      const imageData = await prepareImageData(image);
      imageContent = {
        type: 'image_url' as const,
        image_url: {
          url: imageData,
        },
      };
      console.log('视频生成源图片处理完成');
    } catch (error) {
      console.error('处理源图片时出错:', error);
      throw error;
    }
  } else {
    console.log('无源图片，使用纯文本生成视频');
  }

  // 构建视频生成专用的提示词（根据是否有图片使用不同提示词）
  const videoPrompt = image 
    ? `Generate a video based on this image and description: "${prompt}"`
    : `Generate a video based on this description: "${prompt}"`;

  // 构建消息内容（只有在有图片时才包含图片）
  const contentList = image && imageContent
    ? [
        { type: 'text' as const, text: videoPrompt },
        imageContent,
      ]
    : [
        { type: 'text' as const, text: videoPrompt },
      ];

  const messages: GeminiMessage[] = [
    {
      role: 'user',
      content: contentList,
    },
  ];

  console.log('开始调用视频生成API...');

  // 使用专用的视频生成流式调用
  const response = await callVideoApiStreamRaw(validatedConfig, messages, options);

  // 处理响应内容
  const responseContent = response.choices[0]?.message?.content || '';
  const processedContent = processMixedContent(responseContent);

  return {
    response,
    processedContent,
  };
}

/**
 * 调用 Gemini API 进行聊天对话（支持图片输入）
 */
export async function chatWithGemini(
  prompt: string,
  images: ImageInput[] = []
): Promise<{
  response: GeminiResponse;
  processedContent: ProcessedContent;
}> {
  // 等待设置管理器初始化完成
  await settingsManager.waitForInitialization();
  
  // 直接从设置中获取配置
  const globalSettings = geminiSettings.get();
  const config = {
    ...DEFAULT_CONFIG,
    ...globalSettings,
    modelName: globalSettings.imageModelName || DEFAULT_CONFIG.modelName,
  };
  const validatedConfig = await validateAndEnsureConfig(config);

  // 准备图片数据
  const imageContents = [];
  for (let i = 0; i < images.length; i++) {
    try {
      console.log(`处理第 ${i + 1} 张图片...`);
      const imageData = await prepareImageData(images[i]);
      imageContents.push({
        type: 'image_url' as const,
        image_url: {
          url: imageData,
        },
      });
    } catch (error) {
      console.error(`处理第 ${i + 1} 张图片时出错:`, error);
      throw error;
    }
  }

  // 构建消息内容
  const contentList = [
    { type: 'text' as const, text: prompt },
    ...imageContents,
  ];

  const messages: GeminiMessage[] = [
    {
      role: 'user',
      content: contentList,
    },
  ];

  console.log(`共发送 ${imageContents.length} 张图片到 Gemini API`);

  // 图文混合必须使用流式调用
  let response: GeminiResponse;
  if (images.length > 0) {
    console.log('检测到图片输入，使用流式调用');
    response = await callApiStreamRaw(validatedConfig, messages);
  } else {
    // 纯文本可以使用非流式调用
    response = await callApiWithRetry(validatedConfig, messages);
  }

  // 处理响应内容
  const responseContent = response.choices[0]?.message?.content || '';
  const processedContent = processMixedContent(responseContent);

  return {
    response,
    processedContent,
  };
}