/**
 * Gemini API 调用函数
 * 
 * 支持通过 Service Worker 发送请求，以便在后台处理长时间运行的 API 调用。
 */

import { GeminiConfig, GeminiMessage, GeminiResponse, VideoGenerationOptions } from './types';
import { DEFAULT_CONFIG, VIDEO_DEFAULT_CONFIG } from './config';
import { analytics } from '../posthog-analytics';
import { swChannelClient } from '../../services/sw-channel';
import type { ChatStartParams, ChatMessage as SWChatMessage } from '../../services/sw-channel';
import { isAuthError, dispatchApiAuthError } from '../api-auth-error-event';

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
 *
 * 重要：不再调用 initializeChannel()（其内部 doInitialize 会重试 3×10s = 30s+），
 * 改为只检查 isInitialized() + ping 快速验证 channel 可用性。
 * 当 SW 不可用时立即 fallback 到 direct fetch，避免长时间阻塞。
 */
export async function callApiStreamRaw(
  config: GeminiConfig,
  messages: GeminiMessage[],
  onChunk?: (content: string) => void,
  signal?: AbortSignal
): Promise<GeminiResponse> {
  // 快速检查：只用已初始化好的 SW channel，不触发重新初始化
  if (swChannelClient.isInitialized()) {
    // 验证 channel 真正可用（ping 超时说明 channel 已断，避免 startChat 卡住）
    const pingOk = await Promise.race([
      swChannelClient.ping(),
      new Promise<boolean>((r) => setTimeout(() => r(false), 800)),
    ]);
    if (pingOk) {
      console.log('[callApiStreamRaw] 使用 SW 模式');
      return callApiStreamViaSW(config, messages, onChunk, signal);
    }
    console.log('[callApiStreamRaw] SW channel 已初始化但 ping 失败，降级到 direct fetch');
  } else {
    console.log('[callApiStreamRaw] SW channel 未初始化，使用 direct fetch');
  }

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
  
  // 构建 Chat 参数
  const chatParams: ChatStartParams = {
    chatId,
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
          swChannelClient.stopChat(chatId);
          reject(new Error('Request cancelled'));
        }
      });
    }
    
    // 设置事件处理器
    swChannelClient.setEventHandlers({
      onChatChunk: (event) => {
        if (event.chatId !== chatId || isCompleted) return;
        fullContent = event.content;
        onChunk?.(fullContent);
      },
      onChatDone: (event) => {
        if (event.chatId !== chatId || isCompleted) return;
        isCompleted = true;
        
        const duration = Date.now() - startTime;
        
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
      onChatError: (event) => {
        if (event.chatId !== chatId || isCompleted) return;
        isCompleted = true;
        
        const duration = Date.now() - startTime;
        console.error('[ApiCalls/SW] Stream error:', event.error);
        
        // 检测 401 认证错误，触发打开设置对话框
        if (isAuthError(event.error)) {
          dispatchApiAuthError({ message: event.error, source: 'chat' });
        }
        
        analytics.trackAPICallFailure({
          endpoint,
          model,
          duration,
          error: event.error,
          stream: true,
        });
        
        reject(new Error(event.error));
      },
    });
    
    // 启动 chat
    swChannelClient.startChat(chatParams).catch((err) => {
      if (!isCompleted) {
        isCompleted = true;
        reject(err);
      }
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

  console.log('[callApiStreamDirect] 发起 direct fetch 请求:', {
    model,
    baseUrl: config.baseUrl,
    hasApiKey: !!config.apiKey,
    messageCount: messages.length,
  });

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
    let streamDone = false;

    try {
      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) {
          // console.log('[StreamAPI] Stream ended (done=true)');
          streamDone = true;
          continue;
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
 * API 调用（不再重试）
 */
export async function callApiWithRetry(
  config: GeminiConfig,
  messages: GeminiMessage[],
): Promise<GeminiResponse> {
  // 直接调用，不再重试
  return callApiRaw(config, messages);
}