/**
 * Gemini API 类型定义
 */

export interface GeminiConfig {
  apiKey: string;
  baseUrl: string;
  modelName?: string;
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
}

export interface ImageInput {
  file?: File;
  base64?: string;
  url?: string;
}

export interface GeminiMessage {
  role: 'user' | 'assistant' | 'system';
  content: Array<{
    type: 'text' | 'image_url';
    text?: string;
    image_url?: {
      url: string;
    };
  }>;
}

export interface VideoGenerationOptions {
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
}

export interface GeminiResponse {
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
  }>;
}

export interface ProcessedContent {
  textContent: string;
  images: Array<{
    type: 'base64' | 'url';
    data: string;
    index: number;
  }>;
  videos?: Array<{
    type: 'url';
    data: string;
    index: number;
  }>;
  originalContent: string;
}