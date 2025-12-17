/**
 * Gemini API 服务函数
 */

import { GeminiConfig, ImageInput, GeminiMessage, VideoGenerationOptions, ProcessedContent, GeminiResponse } from './types';
import { DEFAULT_CONFIG, VIDEO_DEFAULT_CONFIG, shouldUseNonStreamMode } from './config';
import { prepareImageData, processMixedContent } from './utils';
import { callApiWithRetry, callApiStreamRaw, callVideoApiStreamRaw } from './apiCalls';
import { geminiSettings, settingsManager } from '../settings-manager';
import { validateAndEnsureConfig } from './auth';

/**
 * 调用 Gemini API 进行图像生成
 * 使用专用的 /v1/images/generations 接口
 */
export async function generateImageWithGemini(
  prompt: string,
  options: {
    n?: number;
    size?: string;
    image?: string | string[]; // 支持单图或多图
    response_format?: 'url' | 'b64_json';
    quality?: '1k' | '2k' | '4k';
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

  // 构建请求体
  const data: any = {
    model: validatedConfig.modelName || 'gemini-2.5-flash-image-vip',
    prompt,
    response_format: options.response_format || 'url', // 默认返回 url
  };

  // n 参数可选，不传则由 API 决定
  if (options.n !== undefined) {
    data.n = options.n;
  }

  // size 参数可选，不传则由 API 自动决定（对应 auto）
  if (options.size && options.size !== 'auto') {
    data.size = options.size;
  }

  // image 参数可选（单图或多图）
  if (options.image) {
    data.image = options.image;
  }

  // quality 参数可选，仅对 gemini-3-pro-image-preview 有效
  if (options.quality && data.model === 'gemini-3-pro-image-preview') {
    data.quality = options.quality;
  }

  const url = `${validatedConfig.baseUrl}/images/generations`;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(validatedConfig.timeout || DEFAULT_CONFIG.timeout!),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[ImageAPI] Request failed:', response.status, errorText);
    const error = new Error(`图片生成请求失败: ${response.status} - ${errorText}`);
    (error as any).apiErrorBody = errorText;
    (error as any).httpStatus = response.status;
    throw error;
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
  images: ImageInput[] = [],
  onChunk?: (content: string) => void
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

  // 根据模型选择流式或非流式调用
  let response: GeminiResponse;
  const modelName = validatedConfig.modelName || '';

  if (shouldUseNonStreamMode(modelName)) {
    // 某些模型（如 seedream）在流式模式下可能返回不完整响应，使用非流式调用
    console.log(`模型 ${modelName} 使用非流式调用确保响应完整`);
    response = await callApiWithRetry(validatedConfig, messages);
    // Non-stream mode simulates one chunk at the end if callback is provided
    if (onChunk && response.choices[0]?.message?.content) {
      onChunk(response.choices[0].message.content);
    }
  } else if (images.length > 0 || onChunk) {
    // 其他模型：图文混合或明确要求流式（提供了 onChunk）使用流式调用
    console.log('使用流式调用');
    response = await callApiStreamRaw(validatedConfig, messages, onChunk);
  } else {
    // 纯文本且无流式回调，可以使用非流式调用
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

/**
 * 发送多轮对话消息
 */
export async function sendChatWithGemini(
  messages: GeminiMessage[],
  onChunk?: (content: string) => void,
  signal?: AbortSignal
): Promise<GeminiResponse> {
  // 等待设置管理器初始化完成
  await settingsManager.waitForInitialization();
  
  // 直接从设置中获取配置
  const globalSettings = geminiSettings.get();
  const config = {
    ...DEFAULT_CONFIG,
    ...globalSettings,
    modelName: globalSettings.chatModel || 'gpt-4o-mini', // Use chatModel preference
  };
  const validatedConfig = await validateAndEnsureConfig(config);

  // Use stream if callback provided
  if (onChunk) {
    return await callApiStreamRaw(validatedConfig, messages, onChunk, signal);
  } else {
    // Note: callApiWithRetry doesn't support signal yet, but for now ChatService uses onChunk
    return await callApiWithRetry(validatedConfig, messages);
  }
}