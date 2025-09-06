/**
 * Gemini API 前端调用工具
 * 基于原始 Python 版本改写为 TypeScript
 * 支持图片上传、AI 图像生成和混合内容处理
 */

// ====================================
// 类型定义
// ====================================

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
  role: 'user' | 'assistant';
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
  originalContent: string;
}

// ====================================
// 默认配置
// ====================================

const DEFAULT_CONFIG: Partial<GeminiConfig> = {
  modelName: 'gemini-2.5-flash-image', // 图片生成和聊天的默认模型
  maxRetries: 10,
  retryDelay: 0,
  timeout: 120000, // 120秒
};

// 视频生成专用配置
const VIDEO_DEFAULT_CONFIG: Partial<GeminiConfig> = {
  modelName: 'veo3', // 视频生成模型
  maxRetries: 10,
  retryDelay: 0,
  timeout: 300000, // 5分钟，视频生成需要更长时间
};

// ====================================
// 工具函数
// ====================================

/**
 * 将文件转换为 base64 格式
 */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result);
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

/**
 * 准备图片数据，转换为 API 所需格式
 */
export async function prepareImageData(image: ImageInput): Promise<string> {
  if (image.file) {
    return await fileToBase64(image.file);
  } else if (image.base64) {
    // 确保 base64 数据包含正确的前缀
    if (image.base64.startsWith('data:')) {
      return image.base64;
    } else {
      return `data:image/png;base64,${image.base64}`;
    }
  } else if (image.url) {
    // 对于 URL，直接返回（API 可能支持 URL 格式）
    return image.url;
  } else {
    throw new Error('无效的图片输入：必须提供 file、base64 或 url');
  }
}

/**
 * 检查是否为配额超出错误
 */
function isQuotaExceededError(errorMessage: string): boolean {
  const quotaKeywords = [
    'exceeded your current quota',
    'quota exceeded',
    'billing details',
    'plan and billing'
  ];
  const errorStr = errorMessage.toLowerCase();
  return quotaKeywords.some(keyword => errorStr.includes(keyword));
}

/**
 * 检查是否为超时错误
 */
function isTimeoutError(errorMessage: string): boolean {
  const errorStr = errorMessage.toLowerCase();
  return errorStr.includes('timeout') || errorStr.includes('timed out');
}

/**
 * 使用原始 fetch 调用聊天 API
 */
async function callApiRaw(
  config: GeminiConfig,
  messages: GeminiMessage[],
): Promise<GeminiResponse> {
  const headers = {
    'Authorization': `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
  };

  const data = {
    model: config.modelName || 'gemini-2.5-flash-image',
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

// 新增流式API调用函数
async function callApiStreamRaw(
  config: GeminiConfig,
  messages: GeminiMessage[],
): Promise<GeminiResponse> {
  const headers = {
    'Authorization': `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
  };
  const data = {
    model: config.modelName || 'gemini-2.5-flash-image',
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

// 视频生成专用的流式API调用函数
async function callVideoApiStreamRaw(
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
async function callApiWithRetry(
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

/**
 * 处理混合内容（文字、base64图片、URL图片、视频链接）
 */
export function processMixedContent(content: string): ProcessedContent & {
  videos?: Array<{
    type: 'url';
    data: string;
    index: number;
  }>;
} {
  // 查找 base64 图片
  const base64Pattern = /data:image\/[^;]+;base64,([A-Za-z0-9+/=]+)/g;
  const base64Matches = Array.from(content.matchAll(base64Pattern));

  // 查找图片 URL 链接
  const imageUrlPattern = /https?:\/\/[^\s<>"'\]]+\.(png|jpg|jpeg|gif|webp)/gi;
  const imageUrlMatches = Array.from(content.matchAll(imageUrlPattern));

  // 查找视频 URL 链接（包括markdown格式）
  const videoUrlPatterns = [
    // 匹配markdown链接中的视频URL：[▶️ 在线观看](url) 或 [⏬ 下载视频](url)
    /\[(?:▶️\s*在线观看|⏬\s*下载视频|.*?观看.*?|.*?下载.*?)\]\(([^)]+\.(?:mp4|avi|mov|wmv|flv|webm|mkv)(?:\?[^)]*)?)\)/gi,
    // 直接的视频URL
    /https?:\/\/[^\s<>"'\]]+\.(?:mp4|avi|mov|wmv|flv|webm|mkv)(?:\?[^\s<>"'\]]*)?/gi,
    // 特定域名的视频链接（如filesystem.site）
    /https?:\/\/filesystem\.site\/[^\s<>"'\]]+/gi
  ];

  let textContent = content;
  const images: ProcessedContent['images'] = [];
  const videos: Array<{ type: 'url'; data: string; index: number }> = [];
  let imageIndex = 1;
  let videoIndex = 1;

  // 处理 base64 图片
  for (const match of base64Matches) {
    const fullMatch = match[0];
    const base64Data = match[1];

    images.push({
      type: 'base64',
      data: base64Data,
      index: imageIndex,
    });

    textContent = textContent.replace(fullMatch, `[图片 ${imageIndex}]`);
    imageIndex++;
  }

  // 处理图片 URL
  for (const match of imageUrlMatches) {
    const url = match[0];

    images.push({
      type: 'url',
      data: url,
      index: imageIndex,
    });

    textContent = textContent.replace(url, `[图片 ${imageIndex}]`);
    imageIndex++;
  }

  // 处理视频 URL（按优先级顺序）
  for (const pattern of videoUrlPatterns) {
    const matches = Array.from(content.matchAll(pattern));
    for (const match of matches) {
      let videoUrl: string;
      
      if (match.length > 1 && match[1]) {
        // markdown链接格式，提取括号内的URL
        videoUrl = match[1];
      } else {
        // 直接的URL
        videoUrl = match[0];
      }

      // 清理URL末尾可能的标点符号
      videoUrl = videoUrl.replace(/[.,;!?]*$/, '');
      
      // 检查是否已经添加过这个视频URL
      const alreadyExists = videos.some(v => v.data === videoUrl);
      if (!alreadyExists) {
        videos.push({
          type: 'url',
          data: videoUrl,
          index: videoIndex,
        });

        // 替换原文中的内容
        textContent = textContent.replace(match[0], `[视频 ${videoIndex}]`);
        videoIndex++;
      }
    }
  }

  return {
    textContent,
    images,
    videos: videos.length > 0 ? videos : undefined,
    originalContent: content,
  };
}

/**
 * 将 base64 数据转换为 Blob URL
 */
export function base64ToBlobUrl(base64Data: string, mimeType: string = 'image/png'): string {
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: mimeType });
  return URL.createObjectURL(blob);
}

// ====================================
// 主要 API 函数
// ====================================

/**
 * 调用 Gemini API 进行图像生成
 * @param config API 配置
 * @param prompt 提示词
 * @param options 生成选项
 * @returns API 响应结果
 */
export async function generateImageWithGemini(
  config: GeminiConfig,
  prompt: string,
  options: {
    n?: number;
    size?: string;
  } = {}
): Promise<any> {
  // 验证并确保配置有效
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
 * @param config API 配置
 * @param prompt 提示词
 * @param image 输入图片
 * @param options 生成选项
 * @returns API 响应结果
 */
export async function generateVideoWithGemini(
  config: GeminiConfig,
  prompt: string,
  image: ImageInput,
  options: VideoGenerationOptions = {}
): Promise<{
  response: GeminiResponse;
  processedContent: ProcessedContent;
}> {
  debugger
  // 验证并确保配置有效，使用视频生成专用配置
  const validatedConfig = await validateAndEnsureConfig({
    ...VIDEO_DEFAULT_CONFIG,
    ...config
  });

  // 准备图片数据
  let imageContent;
  try {
    console.log('处理视频生成源图片...');
    const imageData = await prepareImageData(image);
    imageContent = {
      type: 'image_url' as const,
      image_url: {
        url: imageData,
      },
    };
  } catch (error) {
    console.error('处理源图片时出错:', error);
    throw error;
  }

  // 构建视频生成专用的提示词
  const videoPrompt = `Generate a video based on this image and description: "${prompt}"

Requirements:
- Create a short video (3-5 seconds) based on the provided image
- Follow the description to animate the image naturally
- Maintain the original image quality and style
- Return only the direct video URL in your response

Description: ${prompt}`;

  // 构建消息内容
  const contentList = [
    { type: 'text' as const, text: videoPrompt },
    imageContent,
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
 * @param config API 配置
 * @param prompt 提示词
 * @param images 输入图片数组
 * @returns API 响应结果
 */
export async function chatWithGemini(
  config: GeminiConfig,
  prompt: string,
  images: ImageInput[] = []
): Promise<{
  response: GeminiResponse;
  processedContent: ProcessedContent;
}> {
  // 验证并确保配置有效
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

/**
 * 创建 Gemini API 客户端
 */
export class GeminiClient {
  private config: GeminiConfig;

  constructor(config: GeminiConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<GeminiConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * 生成图像
   */
  async generateImage(prompt: string, options: { n?: number; size?: string; } = {}) {
    return generateImageWithGemini(this.config, prompt, options);
  }

  /**
   * 生成视频
   */
  async generateVideo(prompt: string, image: ImageInput, options: VideoGenerationOptions = {}) {
    return generateVideoWithGemini(this.config, prompt, image, options);
  }

  /**
   * 聊天对话（支持图片输入）
   */
  async chat(prompt: string, images: ImageInput[] = []) {
    return chatWithGemini(this.config, prompt, images);
  }

  /**
   * 获取当前配置
   */
  getConfig(): GeminiConfig {
    return { ...this.config };
  }
}

// ====================================
// 导出默认实例（可选）
// ====================================

/**
 * 从URL参数中获取apiKey
 */
function getApiKeyFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('apiKey');
}

/**
 * 从本地存储获取apiKey
 */
function getApiKeyFromStorage(): string | null {
  if (typeof window === 'undefined') return null;
  
  return localStorage.getItem('gemini_api_key');
}

/**
 * 从本地存储获取baseUrl
 */
function getBaseUrlFromStorage(): string | null {
  if (typeof window === 'undefined') return null;
  
  return localStorage.getItem('gemini_base_url');
}

/**
 * 保存apiKey到本地存储
 */
function saveApiKeyToStorage(apiKey: string): void {
  if (typeof window === 'undefined') return;
  
  localStorage.setItem('gemini_api_key', apiKey);
}

/**
 * 保存baseUrl到本地存储
 */
function saveBaseUrlToStorage(baseUrl: string): void {
  if (typeof window === 'undefined') return;
  
  localStorage.setItem('gemini_base_url', baseUrl);
}

/**
 * 从URL参数中获取settings配置
 */
function getSettingsFromUrl(): { apiKey?: string; baseUrl?: string } | null {
  if (typeof window === 'undefined') return null;
  
  const urlParams = new URLSearchParams(window.location.search);
  const settingsParam = urlParams.get('settings');
  
  if (!settingsParam) return null;
  
  try {
    const decoded = decodeURIComponent(settingsParam);
    const settings = JSON.parse(decoded);
    return {
      apiKey: settings.key,
      baseUrl: settings.url
    };
  } catch (error) {
    console.warn('Failed to parse settings parameter:', error);
    return null;
  }
}

/**
 * DOM弹窗获取API Key
 */
export function promptForApiKey(): Promise<string | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  
  return new Promise((resolve) => {
    // 创建弹窗遮罩
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    // 创建弹窗内容
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: white;
      padding: 24px;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      width: 400px;
      max-width: 90vw;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    dialog.innerHTML = `
      <h3 style="margin: 0 0 16px 0; color: #333; font-size: 18px;">配置 Gemini API Key</h3>
      <p style="margin: 0 0 16px 0; color: #666; line-height: 1.5;">
        请输入您的 Gemini API Key，输入后将自动保存到本地存储中。
      </p>
      <p style="margin: 0 0 16px 0; color: #666; line-height: 1.5;">
        您可以从以下地址获取 API Key:
        <a href="https://api.tu-zi.com/token" target="_blank" rel="noopener noreferrer" 
           style="color: #0052d9; text-decoration: none;">
          https://api.tu-zi.com/token
        </a>
      </p>
      <input type="text" id="apiKeyInput" placeholder="请输入 API Key" 
             style="width: 100%; padding: 8px 12px; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 14px; box-sizing: border-box; margin-bottom: 16px;" />
      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        <button id="cancelBtn" 
                style="padding: 8px 16px; border: 1px solid #d9d9d9; border-radius: 4px; background: white; color: #333; cursor: pointer; font-size: 14px;">
          取消
        </button>
        <button id="confirmBtn" 
                style="padding: 8px 16px; border: 1px solid #0052d9; border-radius: 4px; background: #0052d9; color: white; cursor: pointer; font-size: 14px;">
          确认
        </button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // 获取元素
    const input = dialog.querySelector('#apiKeyInput') as HTMLInputElement;
    const cancelBtn = dialog.querySelector('#cancelBtn') as HTMLButtonElement;
    const confirmBtn = dialog.querySelector('#confirmBtn') as HTMLButtonElement;

    // 自动聚焦到输入框
    setTimeout(() => input.focus(), 100);

    // 清理函数
    const cleanup = () => {
      document.body.removeChild(overlay);
    };

    // 确认按钮点击
    confirmBtn.addEventListener('click', () => {
      const apiKey = input.value.trim();
      if (apiKey) {
        saveApiKeyToStorage(apiKey);
        cleanup();
        resolve(apiKey);
      } else {
        input.style.borderColor = '#ff4d4f';
        input.focus();
      }
    });

    // 取消按钮点击
    cancelBtn.addEventListener('click', () => {
      cleanup();
      resolve(null);
    });

    // 回车键确认
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        confirmBtn.click();
      }
    });

    // 点击遮罩关闭
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        cleanup();
        resolve(null);
      }
    });
  });
}

/**
 * 验证并确保配置有效，如果缺少 API Key 则弹窗获取
 */
async function validateAndEnsureConfig(config: GeminiConfig): Promise<GeminiConfig> {
  // 检查 baseUrl
  if (!config.baseUrl) {
    throw new Error('Base URL 是必需的');
  }
  
  // 检查 apiKey，优先从localStorage获取
  if (!config.apiKey) {
    // 首先尝试从localStorage获取
    const storedApiKey = getApiKeyFromStorage();
    if (storedApiKey) {
      // 更新原始config对象
      config.apiKey = storedApiKey;
      return config;
    }
    
    // 如果localStorage中也没有，则弹窗获取
    const newApiKey = await promptForApiKey();
    if (!newApiKey) {
      throw new Error('API Key 是必需的，操作已取消');
    }
    
    // 更新原始config对象
    config.apiKey = newApiKey;
    return config;
  }
  
  return config;
}

/**
 * 从URL中移除apiKey参数
 */
function removeApiKeyFromUrl(): void {
  if (typeof window === 'undefined') return;
  
  const url = new URL(window.location.href);
  let hasChanges = false;
  
  if (url.searchParams.has('apiKey')) {
    url.searchParams.delete('apiKey');
    hasChanges = true;
  }
  
  if (url.searchParams.has('settings')) {
    url.searchParams.delete('settings');
    hasChanges = true;
  }
  
  if (hasChanges) {
    window.history.replaceState({}, document.title, url.toString());
  }
}

/**
 * 初始化配置：从URL获取并缓存，然后清除URL参数
 */
function initializeConfig(): { apiKey: string; baseUrl: string } {
  let apiKey = '';
  let baseUrl = 'https://api.tu-zi.com/v1';
  
  // 首先尝试从URL的settings参数获取
  const settingsFromUrl = getSettingsFromUrl();
  if (settingsFromUrl) {
    if (settingsFromUrl.apiKey) {
      apiKey = settingsFromUrl.apiKey;
      saveApiKeyToStorage(apiKey);
    }
    if (settingsFromUrl.baseUrl) {
      baseUrl = settingsFromUrl.baseUrl;
      saveBaseUrlToStorage(baseUrl);
    }
  }
  
  // 然后尝试从URL的apiKey参数获取（优先级更高）
  const urlApiKey = getApiKeyFromUrl();
  if (urlApiKey) {
    apiKey = urlApiKey;
    saveApiKeyToStorage(apiKey);
  }
  
  // 如果URL中有参数，清除它们
  if (settingsFromUrl || urlApiKey) {
    removeApiKeyFromUrl();
  }
  
  // 如果URL中没有，从本地存储获取
  if (!apiKey) {
    apiKey = getApiKeyFromStorage() || '';
  }
  if (!settingsFromUrl?.baseUrl) {
    baseUrl = getBaseUrlFromStorage() || 'https://api.tu-zi.com/v1';
  }
  
  return { apiKey, baseUrl };
}

/**
 * 初始化apiKey：保持向后兼容
 */
function initializeApiKey(): string {
  return initializeConfig().apiKey;
}

/**
 * 初始化设置：从URL获取settings参数并处理
 */
export function initializeSettings(): void {
  const settings = getSettingsFromUrl();
  if (settings?.apiKey) {
    saveApiKeyToStorage(settings.apiKey);
  }
  if (settings?.baseUrl) {
    saveBaseUrlToStorage(settings.baseUrl);
  }
  if (settings?.apiKey || settings?.baseUrl) {
    // Remove settings from URL after processing
    const url = new URL(window.location.href);
    url.searchParams.delete('settings');
    window.history.replaceState({}, '', url.toString());
  }
}

// Initialize settings from URL if present
if (typeof window !== 'undefined') {
  const settings = getSettingsFromUrl();
  if (settings?.apiKey) {
    saveApiKeyToStorage(settings.apiKey);
  }
  if (settings?.baseUrl) {
    saveBaseUrlToStorage(settings.baseUrl);
  }
  if (settings?.apiKey || settings?.baseUrl) {
    removeApiKeyFromUrl();
  }
}

/**
 * 创建默认的 Gemini 客户端实例（用于图片生成和聊天）
 * 自动从URL参数或本地存储获取API Key
 */
export const defaultGeminiClient = new GeminiClient({
  ...DEFAULT_CONFIG,
  apiKey: initializeApiKey(),
  baseUrl: getBaseUrlFromStorage() || 'https://api.tu-zi.com/v1',
});

/**
 * 创建视频生成专用的 Gemini 客户端实例
 * 使用veo3模型和更长的超时时间
 */
export const videoGeminiClient = new GeminiClient({
  ...VIDEO_DEFAULT_CONFIG,
  apiKey: initializeApiKey(),
  baseUrl: getBaseUrlFromStorage() || 'https://api.tu-zi.com/v1',
});