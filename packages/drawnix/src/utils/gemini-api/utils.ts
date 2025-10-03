/**
 * Gemini API 工具函数
 */

import { ImageInput, ProcessedContent } from './types';

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
export function isQuotaExceededError(errorMessage: string): boolean {
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
export function isTimeoutError(errorMessage: string): boolean {
  const errorStr = errorMessage.toLowerCase();
  return errorStr.includes('timeout') || errorStr.includes('timed out');
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

/**
 * 处理混合内容（文字、base64图片、URL图片、视频链接）
 */
export function processMixedContent(content: string): ProcessedContent {
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