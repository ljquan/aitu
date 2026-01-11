/**
 * Gemini API 调用函数
 * 
 * 支持通过 Service Worker 发送请求，以便在后台处理长时间运行的 API 调用。
 */

import { GeminiConfig, GeminiMessage, GeminiResponse, VideoGenerationOptions } from './types';
import { DEFAULT_CONFIG, VIDEO_DEFAULT_CONFIG } from './config';
import { isQuotaExceededError, isTimeoutError } from './utils';
import { analytics } from '../posthog-analytics';
import { shouldUseSWTaskQueue } from '../../services/task-queue';
import { swTaskQueueClient } from '../../services/sw-client';
import { geminiSettings } from '../settings-manager';
import type { ChatParams, ChatMessage as SWChatMessage } from '../../services/sw-client/types';

/**
 * 确保 SW 客户端已初始化
 */
async function ensureSWInitialized(): Promise<boolean> {
  if (!shouldUseSWTaskQueue()) {
    return false;
  }
  
  if (swTaskQueueClient.isInitialized()) {
    return true;
  }
  
  const settings = geminiSettings.get();
  if (!settings.apiKey || !settings.baseUrl) {
    // console.log('[ApiCalls] Missing apiKey or baseUrl, cannot initialize SW');
    return false;
  }
  
  try {
    const success = await swTaskQueueClient.initialize(
      {
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl,
        modelName: settings.chatModel,
      },
      {
        baseUrl: settings.baseUrl,
      }
    );
    // console.log('[ApiCalls] SW client initialization result:', success);
    return success;
  } catch (error) {
    console.error('[ApiCalls] SW client initialization failed:', error);
    return false;
  }
}

/**
 * 将 GeminiMessage 转换为 SW ChatMessage 格式
 * 返回消息列表和可能的 system prompt
 */
function convertToSWMessages(messages: GeminiMessage[]): { 
  swMessages: SWChatMessage[]; 
  systemPrompt?: string;
} {
  let systemPrompt: string | undefined;
  const swMessages: SWChatMessage[] = [];
  
  for (const msg of messages) {
    // 提取文本内容
    let textContent = '';
    if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === 'text' && part.text) {
          textContent += part.text;
        }
      }
    } else if (typeof msg.content === 'string') {
      textContent = msg.content;
    }
    
    // 处理 system 消息
    if (msg.role === 'system') {
      systemPrompt = textContent;
      continue;
    }
    
    swMessages.push({
      role: msg.role as 'user' | 'assistant',
      content: textContent,
    });
  }
  
  return { swMessages, systemPrompt };
}

/**
 * 使用原始 fetch 调用聊天 API
 */
export async function callApiRaw(
  config: GeminiConfig,
  messages: GeminiMessage[],
): Promise<GeminiResponse> {
  const startTime = Date.now();
  const model = config.modelName || 'gemini-3-pro-image-preview-vip';
  const endpoint = '/chat/completions';

  // Track API call start
  analytics.trackAPICallStart({
    endpoint,
    model,
    messageCount: messages.length,
    stream: false,
  });

  const headers = {
    'Authorization': `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
  };

  const data = {
    model,
    messages,
    stream: false,
  };

  const url = `${config.baseUrl}${endpoint}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(config.timeout || DEFAULT_CONFIG.timeout!),
    });

    if (!response.ok) {
      const duration = Date.now() - startTime;
      // 尝试读取响应体中的错误信息
      let errorBody = '';
      let errorMessage = response.statusText;
      try {
        const errorJson = await response.json();
        if (errorJson.error) {
          errorMessage = errorJson.error.message || errorJson.error.code || response.statusText;
          errorBody = JSON.stringify(errorJson.error);
        }
      } catch (e) {
        // 如果无法解析 JSON，尝试读取文本
        try {
          errorBody = await response.text();
        } catch (e2) {
          // 忽略读取错误
        }
      }
      analytics.trackAPICallFailure({
        endpoint,
        model,
        duration,
        error: errorMessage,
        httpStatus: response.status,
        stream: false,
      });
      const error = new Error(`HTTP ${response.status}: ${errorMessage}`);
      (error as any).apiErrorBody = errorBody;
      (error as any).httpStatus = response.status;
      throw error;
    }

    // 处理非流式响应
    const result = await response.json();
    const duration = Date.now() - startTime;

    analytics.trackAPICallSuccess({
      endpoint,
      model,
      duration,
      responseLength: result.choices?.[0]?.message?.content?.length,
      stream: false,
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    analytics.trackAPICallFailure({
      endpoint,
      model,
      duration,
      error: errorMessage,
      stream: false,
    });

    throw error;
  }
}

/**
 * 流式API调用函数
 * 优先使用 Service Worker 发送请求，降级时使用直接 fetch
 */
export async function callApiStreamRaw(
  config: GeminiConfig,
  messages: GeminiMessage[],
  onChunk?: (content: string) => void,
  signal?: AbortSignal
): Promise<GeminiResponse> {
  // 尝试使用 SW 模式
  const useSW = await ensureSWInitialized();
  
  if (useSW) {
    // console.log('[ApiCalls] Using SW mode for streaming API call');
    return callApiStreamViaSW(config, messages, onChunk, signal);
  }
  
  // console.log('[ApiCalls] Using direct fetch for streaming API call');
  return callApiStreamDirect(config, messages, onChunk, signal);
}

/**
 * 通过 Service Worker 发送流式 API 请求
 */
async function callApiStreamViaSW(
  config: GeminiConfig,
  messages: GeminiMessage[],
  onChunk?: (content: string) => void,
  signal?: AbortSignal
): Promise<GeminiResponse> {
  const startTime = Date.now();
  const model = config.modelName || 'gemini-3-pro-image-preview-vip';
  const endpoint = '/chat/completions';

  // Track API call start
  analytics.trackAPICallStart({
    endpoint,
    model,
    messageCount: messages.length,
    stream: true,
  });

  const chatId = `api_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  
  // 转换消息格式，提取 system prompt
  const { swMessages, systemPrompt } = convertToSWMessages(messages);
  
  // 构建 ChatParams
  const chatParams: ChatParams = {
    messages: swMessages.slice(0, -1), // 历史消息
    newContent: swMessages[swMessages.length - 1]?.content || '', // 最新消息
    attachments: [],
    temporaryModel: model,
    systemPrompt, // 传递 system prompt
  };

  return new Promise((resolve, reject) => {
    let fullContent = '';
    let isCompleted = false;
    
    // 处理取消信号
    if (signal) {
      if (signal.aborted) {
        reject(new Error('Request cancelled'));
        return;
      }
      signal.addEventListener('abort', () => {
        if (!isCompleted) {
          swTaskQueueClient.stopChat(chatId);
          reject(new Error('Request cancelled'));
        }
      });
    }
    
    swTaskQueueClient.startChat(chatId, chatParams, {
      onChunk: (_id, content) => {
        if (isCompleted) return;
        // content 已经是累积的完整内容，直接使用，不要再累加
        fullContent = content;
        onChunk?.(fullContent);
      },
      onDone: (_id, _fullContent) => {
        if (isCompleted) return;
        isCompleted = true;
        
        const duration = Date.now() - startTime;
        // console.log('[ApiCalls/SW] Stream completed, full content length:', fullContent.length);
        
        analytics.trackAPICallSuccess({
          endpoint,
          model,
          duration,
          responseLength: fullContent.length,
          stream: true,
        });
        
        resolve({
          choices: [{
            message: {
              role: 'assistant',
              content: fullContent
            }
          }]
        });
      },
      onError: (_id, error) => {
        if (isCompleted) return;
        isCompleted = true;
        
        const duration = Date.now() - startTime;
        console.error('[ApiCalls/SW] Stream error:', error);
        
        analytics.trackAPICallFailure({
          endpoint,
          model,
          duration,
          error,
          stream: true,
        });
        
        reject(new Error(error));
      },
    });
  });
}

/**
 * 直接使用 fetch 发送流式 API 请求（降级模式）
 */
async function callApiStreamDirect(
  config: GeminiConfig,
  messages: GeminiMessage[],
  onChunk?: (content: string) => void,
  signal?: AbortSignal
): Promise<GeminiResponse> {
  const startTime = Date.now();
  const model = config.modelName || 'gemini-3-pro-image-preview-vip';
  const endpoint = '/chat/completions';

  // Track API call start
  analytics.trackAPICallStart({
    endpoint,
    model,
    messageCount: messages.length,
    stream: true,
  });

  const headers = {
    'Authorization': `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
  };
  const data = {
    model,
    messages,
    presence_penalty: 0,
    temperature: 0.5,
    top_p: 1,
    stream: true,
  };

  const url = `${config.baseUrl}${endpoint}`;

  // Handle signal merging (timeout + user cancel)
  const controller = new AbortController();
  const timeoutMs = config.timeout || DEFAULT_CONFIG.timeout!;
  const timeoutId = setTimeout(() => controller.abort(new Error('Timeout')), timeoutMs);
  
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeoutId);
      controller.abort(signal.reason);
    } else {
      signal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        controller.abort(signal.reason);
      });
    }
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const duration = Date.now() - startTime;
      // 尝试读取响应体中的错误信息
      let errorBody = '';
      let errorMessage = response.statusText;
      try {
        const errorJson = await response.json();
        if (errorJson.error) {
          errorMessage = errorJson.error.message || errorJson.error.code || response.statusText;
          errorBody = JSON.stringify(errorJson.error);
        }
      } catch (e) {
        // 如果无法解析 JSON，尝试读取文本
        try {
          errorBody = await response.text();
        } catch (e2) {
          // 忽略读取错误
        }
      }
      analytics.trackAPICallFailure({
        endpoint,
        model,
        duration,
        error: errorMessage,
        httpStatus: response.status,
        stream: true,
      });
      const error = new Error(`HTTP ${response.status}: ${errorMessage}`);
      (error as any).apiErrorBody = errorBody;
      (error as any).httpStatus = response.status;
      throw error;
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
        if (done) {
          // console.log('[StreamAPI] Stream ended (done=true)');
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              // console.log('[StreamAPI] Received [DONE] signal');
              break;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullContent += content;
                if (onChunk) {
                  // 返回累积的所有数据，而不是只返回新增的 chunk
                  onChunk(fullContent);
                }
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

    const duration = Date.now() - startTime;

    // Log full content for debugging incomplete responses
    // console.log('[StreamAPI] Stream completed, full content length:', fullContent.length);
    // console.log('[StreamAPI] Full response content:', fullContent);

    // Check for incomplete response patterns
    const hasGeneratingText = fullContent.includes('正在生成') || fullContent.includes('generating');
    const hasImageUrl = fullContent.includes('![') && fullContent.includes('](http');

    if (hasGeneratingText && !hasImageUrl) {
      console.warn('[StreamAPI] Warning: Response contains "generating" text but no image URL - response may be incomplete');
    }

    analytics.trackAPICallSuccess({
      endpoint,
      model,
      duration,
      responseLength: fullContent.length,
      stream: true,
    });

    // 返回标准格式的响应
    return {
      choices: [{
        message: {
          role: 'assistant',
          content: fullContent
        }
      }]
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    analytics.trackAPICallFailure({
      endpoint,
      model,
      duration,
      error: errorMessage,
      stream: true,
    });

    throw error;
  }
}

/**
 * 视频生成专用的流式API调用函数
 */
export async function callVideoApiStreamRaw(
  config: GeminiConfig,
  messages: GeminiMessage[],
  options: VideoGenerationOptions = {}
): Promise<GeminiResponse> {
  const startTime = Date.now();
  const model = config.modelName || VIDEO_DEFAULT_CONFIG.modelName || 'veo3';
  const endpoint = '/chat/completions';

  // Track API call start
  analytics.trackAPICallStart({
    endpoint,
    model,
    messageCount: messages.length + 1, // +1 for system message
    stream: true,
  });

  const headers = {
    'Authorization': `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
  };

  // 添加系统消息，参考你提供的接口参数
  const systemMessage: GeminiMessage = {
    role: 'user',
    content: [{
      type: 'text',
      text: `You are Video Creator.\nCurrent model: ${model}\nCurrent time: ${new Date().toLocaleString()}\nLatex inline: $x^2$\nLatex block: $e=mc^2$`
    }]
  };

  const data = {
    max_tokens: options.max_tokens || 1024,
    model,
    temperature: options.temperature || 0.5,
    top_p: options.top_p || 1,
    presence_penalty: options.presence_penalty || 0,
    frequency_penalty: options.frequency_penalty || 0,
    messages: [systemMessage, ...messages],
    stream: true,
  };

  const url = `${config.baseUrl}${endpoint}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(config.timeout || VIDEO_DEFAULT_CONFIG.timeout!),
    });

    if (!response.ok) {
      const duration = Date.now() - startTime;
      // 尝试读取响应体中的错误信息
      let errorBody = '';
      let errorMessage = response.statusText;
      try {
        const errorJson = await response.json();
        if (errorJson.error) {
          errorMessage = errorJson.error.message || errorJson.error.code || response.statusText;
          errorBody = JSON.stringify(errorJson.error);
        }
      } catch (e) {
        // 如果无法解析 JSON，尝试读取文本
        try {
          errorBody = await response.text();
        } catch (e2) {
          // 忽略读取错误
        }
      }
      analytics.trackAPICallFailure({
        endpoint,
        model,
        duration,
        error: errorMessage,
        httpStatus: response.status,
        stream: true,
      });
      const error = new Error(`HTTP ${response.status}: ${errorMessage}`);
      (error as any).apiErrorBody = errorBody;
      (error as any).httpStatus = response.status;
      throw error;
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

    const duration = Date.now() - startTime;
    analytics.trackAPICallSuccess({
      endpoint,
      model,
      duration,
      responseLength: fullContent.length,
      stream: true,
    });

    // 返回标准格式的响应
    return {
      choices: [{
        message: {
          role: 'assistant',
          content: fullContent
        }
      }]
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    analytics.trackAPICallFailure({
      endpoint,
      model,
      duration,
      error: errorMessage,
      stream: true,
    });

    throw error;
  }
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
  const model = config.modelName || 'gemini-3-pro-image-preview-vip';
  const endpoint = '/chat/completions';

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // console.log(`第 ${attempt + 1} 次尝试调用 Gemini API...`);
      const response = await callApiRaw(config, messages);
      // console.log('API 调用成功！');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`API 调用失败: ${errorMessage}`);

      // 检查是否为配额超出错误或超时错误
      if (isQuotaExceededError(errorMessage) || isTimeoutError(errorMessage)) {
        if (attempt < maxRetries - 1) {
          // Track retry
          analytics.trackAPICallRetry({
            endpoint,
            model,
            attempt: attempt + 1,
            reason: isQuotaExceededError(errorMessage) ? 'QUOTA_EXCEEDED' : 'TIMEOUT',
          });

          if (retryDelay > 0) {
            // console.log(`将在 ${retryDelay}ms 后进行第 ${attempt + 2} 次重试...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          } else {
            // console.log(`立即进行第 ${attempt + 2} 次重试...`);
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