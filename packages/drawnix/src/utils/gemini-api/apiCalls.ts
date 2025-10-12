/**
 * Gemini API 调用函数
 */

import { GeminiConfig, GeminiMessage, GeminiResponse, VideoGenerationOptions } from './types';
import { DEFAULT_CONFIG, VIDEO_DEFAULT_CONFIG } from './config';
import { isQuotaExceededError, isTimeoutError } from './utils';

/**
 * 使用原始 fetch 调用聊天 API
 */
export async function callApiRaw(
  config: GeminiConfig,
  messages: GeminiMessage[],
): Promise<GeminiResponse> {
  const headers = {
    'Authorization': `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
  };

  const data = {
    model: config.modelName || 'gemini-2.5-flash-image-vip',
    messages,
    stream: false,
  };

  const url = `${config.baseUrl}/chat/completions`;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(config.timeout || DEFAULT_CONFIG.timeout!),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  // 处理非流式响应
  return await response.json();
}

/**
 * 流式API调用函数
 */
export async function callApiStreamRaw(
  config: GeminiConfig,
  messages: GeminiMessage[],
): Promise<GeminiResponse> {
  const headers = {
    'Authorization': `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
  };
  const data = {
    model: config.modelName || 'gemini-2.5-flash-image-vip',
    messages,
    presence_penalty: 0,
    temperature: 0.5,
    top_p: 1,
    stream: true,
  };

  const url = `${config.baseUrl}/chat/completions`;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(config.timeout || DEFAULT_CONFIG.timeout!),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  // 处理流式响应
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('无法获取响应流');
  }

  const decoder = new TextDecoder();
  let fullContent = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            break;
          }

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullContent += content;
            }
          } catch (e) {
            // 忽略解析错误的数据块
            console.warn('解析流式数据块失败:', e);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // 返回标准格式的响应
  return {
    choices: [{
      message: {
        role: 'assistant',
        content: fullContent
      }
    }]
  };
}

/**
 * 视频生成专用的流式API调用函数
 */
export async function callVideoApiStreamRaw(
  config: GeminiConfig,
  messages: GeminiMessage[],
  options: VideoGenerationOptions = {}
): Promise<GeminiResponse> {
  const headers = {
    'Authorization': `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
  };

  // 添加系统消息，参考你提供的接口参数
  const systemMessage: GeminiMessage = {
    role: 'user',
    content: [{
      type: 'text',
      text: `You are Video Creator.\nCurrent model: ${config.modelName || VIDEO_DEFAULT_CONFIG.modelName}\nCurrent time: ${new Date().toLocaleString()}\nLatex inline: $x^2$\nLatex block: $e=mc^2$`
    }]
  };

  const data = {
    max_tokens: options.max_tokens || 1024,
    model: config.modelName || VIDEO_DEFAULT_CONFIG.modelName,
    temperature: options.temperature || 0.5,
    top_p: options.top_p || 1,
    presence_penalty: options.presence_penalty || 0,
    frequency_penalty: options.frequency_penalty || 0,
    messages: [systemMessage, ...messages],
    stream: true,
  };

  const url = `${config.baseUrl}/chat/completions`;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(config.timeout || VIDEO_DEFAULT_CONFIG.timeout!),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  // 处理流式响应
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('无法获取响应流');
  }

  const decoder = new TextDecoder();
  let fullContent = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            break;
          }

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullContent += content;
            }
          } catch (e) {
            // 忽略解析错误的数据块
            console.warn('解析流式数据块失败:', e);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // 返回标准格式的响应
  return {
    choices: [{
      message: {
        role: 'assistant',
        content: fullContent
      }
    }]
  };
}

/**
 * 带重试功能的 API 调用
 */
export async function callApiWithRetry(
  config: GeminiConfig,
  messages: GeminiMessage[],
): Promise<GeminiResponse> {
  const maxRetries = config.maxRetries || DEFAULT_CONFIG.maxRetries!;
  const retryDelay = config.retryDelay || DEFAULT_CONFIG.retryDelay!;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`第 ${attempt + 1} 次尝试调用 Gemini API...`);
      const response = await callApiRaw(config, messages);
      console.log('API 调用成功！');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`API 调用失败: ${errorMessage}`);

      // 检查是否为配额超出错误或超时错误
      if (isQuotaExceededError(errorMessage) || isTimeoutError(errorMessage)) {
        if (attempt < maxRetries - 1) {
          if (retryDelay > 0) {
            console.log(`将在 ${retryDelay}ms 后进行第 ${attempt + 2} 次重试...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          } else {
            console.log(`立即进行第 ${attempt + 2} 次重试...`);
          }
          continue;
        } else {
          throw new Error(`经过 ${maxRetries} 次重试后仍然失败: ${errorMessage}`);
        }
      } else {
        // 非配额/超时错误，直接抛出
        throw error;
      }
    }
  }

  throw new Error(`经过 ${maxRetries} 次重试后仍然失败`);
}