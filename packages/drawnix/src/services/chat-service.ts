/**
 * Chat Service
 *
 * Handles AI chat API communication with streaming support using the unified Gemini API client.
 * Supports generic OpenAI-compatible APIs via the client configuration.
 * When Service Worker is available, delegates requests to SW for background processing.
 */

import { defaultGeminiClient } from '../utils/gemini-api';
import type { GeminiMessage } from '../utils/gemini-api/types';
import type { ChatMessage, StreamEvent } from '../types/chat.types';
import { MessageRole } from '../types/chat.types';
import { analytics } from '../utils/posthog-analytics';
import { shouldUseSWTaskQueue } from './task-queue';
import { swChannelClient } from './sw-channel';
import type { ChatStartParams, ChatMessage as SWChatMessage, ChatAttachment } from './sw-channel';
import { geminiSettings, settingsManager } from '../utils/settings-manager';

// Current abort controller for cancellation
let currentAbortController: AbortController | null = null;

// Current chat ID for SW mode cancellation
let currentChatId: string | null = null;

// 媒体 URL 映射，用于在响应中替换回原始 URL
interface MediaUrlMap {
  [placeholder: string]: string;
}

/**
 * 替换消息中的图片/视频 URL 为带索引的占位符，并返回映射表
 * 用于发送给文本模型时减少 token 消耗，响应后可替换回原始 URL
 */
function extractAndReplaceMediaUrls(content: string): { sanitized: string; urlMap: MediaUrlMap } {
  const urlMap: MediaUrlMap = {};
  let imageIndex = 1;
  let videoIndex = 1;
  let mediaIndex = 1;
  
  let result = content;
  
  // 替换 base64 图片
  result = result.replace(
    /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g,
    (match) => {
      const placeholder = `[图片${imageIndex}]`;
      urlMap[placeholder] = match;
      imageIndex++;
      return placeholder;
    }
  );
  
  // 替换 base64 视频
  result = result.replace(
    /data:video\/[^;]+;base64,[A-Za-z0-9+/=]+/g,
    (match) => {
      const placeholder = `[视频${videoIndex}]`;
      urlMap[placeholder] = match;
      videoIndex++;
      return placeholder;
    }
  );
  
  // 替换 blob URL
  result = result.replace(
    /blob:[^\s"'<>]+/g,
    (match) => {
      const placeholder = `[媒体${mediaIndex}]`;
      urlMap[placeholder] = match;
      mediaIndex++;
      return placeholder;
    }
  );
  
  // 替换远程图片 URL (常见图片扩展名)
  result = result.replace(
    /https?:\/\/[^\s"'<>]+\.(png|jpg|jpeg|gif|webp|svg|bmp)(\?[^\s"'<>]*)?/gi,
    (match) => {
      const placeholder = `[图片${imageIndex}]`;
      urlMap[placeholder] = match;
      imageIndex++;
      return placeholder;
    }
  );
  
  // 替换远程视频 URL (常见视频扩展名)
  result = result.replace(
    /https?:\/\/[^\s"'<>]+\.(mp4|webm|mov|avi|mkv)(\?[^\s"'<>]*)?/gi,
    (match) => {
      const placeholder = `[视频${videoIndex}]`;
      urlMap[placeholder] = match;
      videoIndex++;
      return placeholder;
    }
  );
  
  return { sanitized: result, urlMap };
}

/**
 * 将响应中的占位符替换回原始 URL
 */
function restoreMediaUrls(content: string, urlMap: MediaUrlMap): string {
  let result = content;
  for (const [placeholder, url] of Object.entries(urlMap)) {
    // 使用全局替换，因为模型可能多次引用同一个占位符
    result = result.split(placeholder).join(url);
  }
  return result;
}

/** Convert ChatMessage to GeminiMessage format */
function convertToGeminiMessages(messages: ChatMessage[]): { geminiMessages: GeminiMessage[]; urlMap: MediaUrlMap } {
  const combinedUrlMap: MediaUrlMap = {};
  
  const geminiMessages = messages
    .filter((m) => m.status === 'success' || m.status === 'streaming')
    .map((m) => {
      const { sanitized, urlMap } = extractAndReplaceMediaUrls(m.content);
      // 合并 URL 映射
      Object.assign(combinedUrlMap, urlMap);
      return {
        role: m.role === MessageRole.USER ? 'user' : 'assistant',
        content: [{ type: 'text', text: sanitized }],
      };
    });
  
  return { geminiMessages: geminiMessages as GeminiMessage[], urlMap: combinedUrlMap };
}

/** Convert ChatMessage to SW ChatMessage format */
function convertToSWMessages(messages: ChatMessage[]): { swMessages: SWChatMessage[]; urlMap: MediaUrlMap } {
  const combinedUrlMap: MediaUrlMap = {};
  
  const swMessages: SWChatMessage[] = messages
    .filter((m) => m.status === 'success' || m.status === 'streaming')
    .map((m) => {
      const { sanitized, urlMap } = extractAndReplaceMediaUrls(m.content);
      Object.assign(combinedUrlMap, urlMap);
      return {
        role: m.role === MessageRole.USER ? 'user' : 'assistant',
        content: sanitized,
      } as SWChatMessage;
    });
  
  return { swMessages, urlMap: combinedUrlMap };
}

/** Convert File attachments to SW ChatAttachment format */
async function convertAttachmentsToSW(files: File[]): Promise<ChatAttachment[]> {
  // 过滤出图片文件
  const imageFiles = files.filter(file => file.type.startsWith('image/'));
  
  if (imageFiles.length === 0) {
    return [];
  }
  
  // 并行转换所有文件
  const attachments = await Promise.all(
    imageFiles.map(async (file) => {
      const base64 = await fileToBase64(file);
      return {
        type: 'image' as const,
        name: file.name,
        mimeType: file.type,
        data: base64,
      };
    })
  );
  
  return attachments;
}

/** Convert File to base64 string */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix (e.g., "data:image/png;base64,")
      const base64 = result.split(',')[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Send message and get streaming response */
export async function sendChatMessage(
  messages: ChatMessage[],
  newContent: string,
  attachments: File[] = [],
  onStream: (event: StreamEvent) => void,
  temporaryModel?: string, // 临时模型（仅在当前会话中使用，不影响全局设置）
  systemPrompt?: string // 系统提示词（包含 MCP 工具定义等）
): Promise<string> {
  // Check if we should use SW mode
  if (shouldUseSWTaskQueue()) {
    // Ensure SW client is initialized before using
    if (!swChannelClient.isInitialized()) {
      const settings = geminiSettings.get();
      if (settings.apiKey && settings.baseUrl) {
        try {
          await settingsManager.waitForInitialization();
          await swChannelClient.initialize();
          await swChannelClient.init({
            geminiConfig: {
              apiKey: settings.apiKey,
              baseUrl: settings.baseUrl,
              modelName: settings.chatModel,
            },
            videoConfig: {
              baseUrl: settings.baseUrl,
            },
          });
        } catch (error) {
          console.error('[ChatService] SW client initialization failed:', error);
        }
      }
    }
    
    // Use SW mode if initialized successfully
    if (swChannelClient.isInitialized()) {
      return sendChatMessageViaSW(messages, newContent, attachments, onStream, temporaryModel, systemPrompt);
    }
  }
  
  // Fallback to direct mode
  return sendChatMessageDirect(messages, newContent, attachments, onStream, temporaryModel, systemPrompt);
}

/** Send chat message via Service Worker */
async function sendChatMessageViaSW(
  messages: ChatMessage[],
  newContent: string,
  attachments: File[] = [],
  onStream: (event: StreamEvent) => void,
  temporaryModel?: string,
  systemPrompt?: string
): Promise<string> {
  // Cancel any existing SW chat request
  if (currentChatId) {
    swChannelClient.stopChat(currentChatId);
  }
  
  const chatId = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  currentChatId = chatId;
  
  const taskId = Date.now().toString();
  const startTime = Date.now();
  const modelName = temporaryModel || defaultGeminiClient.getConfig().modelName || 'unknown';
  
  // Track chat start
  analytics.trackModelCall({
    taskId,
    taskType: 'chat',
    model: modelName,
    promptLength: newContent.length,
    hasUploadedImage: attachments.length > 0,
    startTime,
  });
  
  // Convert messages to SW format
  const { swMessages, urlMap: historyUrlMap } = convertToSWMessages(messages);
  const { sanitized: sanitizedContent, urlMap: currentUrlMap } = extractAndReplaceMediaUrls(newContent);
  const allUrlMap: MediaUrlMap = { ...historyUrlMap, ...currentUrlMap };
  
  // Convert attachments
  const swAttachments = await convertAttachmentsToSW(attachments);
  
  // Build chat params
  const chatParams: ChatStartParams = {
    chatId,
    messages: swMessages,
    newContent: sanitizedContent,
    attachments: swAttachments,
    temporaryModel,
    systemPrompt,
  };
  
  return new Promise((resolve, reject) => {
    let fullContent = '';
    let isCompleted = false;

    const cleanup = () => {
      if (currentChatId === chatId) {
        currentChatId = null;
      }
    };

    // Set up event handlers
    swChannelClient.setEventHandlers({
      onChatChunk: (event) => {
        if (event.chatId !== chatId || isCompleted) return;
        const restoredChunk = restoreMediaUrls(event.content, allUrlMap);
        fullContent = restoredChunk;
        onStream({ type: 'content', content: restoredChunk });
      },
      onChatDone: (event) => {
        if (event.chatId !== chatId || isCompleted) return;
        isCompleted = true;
        cleanup();
        
        const duration = Date.now() - startTime;
        analytics.trackModelSuccess({
          taskId,
          taskType: 'chat',
          model: modelName,
          duration,
          resultSize: fullContent.length,
        });
        
        onStream({ type: 'done' });
        resolve(fullContent);
      },
      onChatError: (event) => {
        if (event.chatId !== chatId || isCompleted) return;
        isCompleted = true;
        cleanup();
        
        const duration = Date.now() - startTime;
        analytics.trackModelFailure({
          taskId,
          taskType: 'chat',
          model: modelName,
          duration,
          error: event.error,
        });
        
        onStream({ type: 'error', error: event.error });
        reject(new Error(event.error));
      },
    });

    // Start the chat
    swChannelClient.startChat(chatParams).catch((err) => {
      if (!isCompleted) {
        isCompleted = true;
        cleanup();
        reject(err);
      }
    });
  });
}

/** Send chat message directly (legacy mode) */
async function sendChatMessageDirect(
  messages: ChatMessage[],
  newContent: string,
  attachments: File[] = [],
  onStream: (event: StreamEvent) => void,
  temporaryModel?: string,
  systemPrompt?: string
): Promise<string> {
  // Cancel any existing request
  if (currentAbortController) {
    currentAbortController.abort();
  }

  currentAbortController = new AbortController();
  const signal = currentAbortController.signal;
  const taskId = Date.now().toString();
  const startTime = Date.now();
  
  // 确定使用的模型名称（临时模型优先）
  const modelName = temporaryModel || defaultGeminiClient.getConfig().modelName || 'unknown';

  try {
    // Track chat start
    analytics.trackModelCall({
      taskId,
      taskType: 'chat',
      model: modelName,
      promptLength: newContent.length,
      hasUploadedImage: attachments.length > 0,
      startTime,
    });

    // Build history with URL extraction
    const { geminiMessages: history, urlMap: historyUrlMap } = convertToGeminiMessages(messages);

    // Process current message content
    const { sanitized: sanitizedContent, urlMap: currentUrlMap } = extractAndReplaceMediaUrls(newContent);
    
    // 合并所有 URL 映射
    const allUrlMap: MediaUrlMap = { ...historyUrlMap, ...currentUrlMap };
    
    // Prepare current message content (文本模型不需要附件图片)
    const currentMessageContent: GeminiMessage['content'] = [
      { type: 'text', text: sanitizedContent }
    ];

    // 注意：对于文本模型，不发送 attachments 中的图片
    // 如果需要图片理解功能，应该使用多模态模型

    // Combine into full message list
    const geminiMessages: GeminiMessage[] = [];

    // 如果有系统提示词，插入到开头
    if (systemPrompt) {
      geminiMessages.push({
        role: 'system',
        content: [{ type: 'text', text: systemPrompt }]
      });
    }

    // 添加历史消息和当前消息
    geminiMessages.push(
      ...history,
      {
        role: 'user',
        content: currentMessageContent
      }
    );

    let fullContent = '';

    // Call API using unified client, passing temporaryModel
    await defaultGeminiClient.sendChat(
      geminiMessages,
      (accumulatedContent) => {
        if (signal.aborted) return;
        // accumulatedContent 已经是累积的完整内容，直接替换 URL 并使用
        const restoredContent = restoreMediaUrls(accumulatedContent, allUrlMap);
        fullContent = restoredContent;
        onStream({ type: 'content', content: restoredContent });
      },
      signal,
      temporaryModel // 传递临时模型
    );

    if (signal.aborted) {
      throw new Error('Request cancelled');
    }

    // Track success
    const duration = Date.now() - startTime;
    analytics.trackModelSuccess({
      taskId,
      taskType: 'chat',
      model: modelName,
      duration,
      resultSize: fullContent.length,
    });

    onStream({ type: 'done' });
    currentAbortController = null;
    return fullContent;

  } catch (error: any) {
    currentAbortController = null;
    const duration = Date.now() - startTime;

    if (signal.aborted || error.message === 'Request cancelled' || error.name === 'AbortError') {
      analytics.trackTaskCancellation({
        taskId,
        taskType: 'chat',
        duration,
      });
      onStream({ type: 'done' });
      throw new Error('Request cancelled');
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    analytics.trackModelFailure({
      taskId,
      taskType: 'chat',
      model: modelName,
      duration,
      error: errorMessage,
    });

    onStream({ type: 'error', error: errorMessage });
    throw error;
  }
}

/** Stop current generation */
export function stopGeneration(): void {
  // Stop SW chat if active
  if (currentChatId) {
    swChannelClient.stopChat(currentChatId);
    currentChatId = null;
  }
  
  // Stop direct request if active
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
}

/** Check if generation is in progress */
export function isGenerating(): boolean {
  return currentAbortController !== null || currentChatId !== null;
}

// Export as service object
export const chatService = {
  sendChatMessage,
  stopGeneration,
  isGenerating,
};