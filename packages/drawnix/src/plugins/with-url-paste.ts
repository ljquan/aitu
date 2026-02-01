/**
 * URL Paste Plugin
 *
 * URL 粘贴自动识别插件
 * 自动识别 YouTube、音频文件 URL 并创建对应元素
 * 同时支持音频文件粘贴
 */

import {
  ClipboardData,
  PlaitBoard,
  PlaitPlugin,
  Point,
  WritableClipboardOperationType,
  toViewBoxPoint,
  toHostPoint,
} from '@plait/core';
import { isYouTubeUrl, parseYouTubeUrl } from '../types/youtube.types';
import { isAudioUrl, ALLOWED_AUDIO_TYPES } from '../types/audio.types';
import { YouTubeTransforms } from './youtube/with-youtube';
import { AudioTransforms } from './audio/with-audio';

/**
 * URL 类型枚举
 */
enum UrlType {
  YOUTUBE = 'youtube',
  AUDIO = 'audio',
  UNKNOWN = 'unknown',
}

/**
 * 检测 URL 类型
 */
function detectUrlType(url: string): UrlType {
  if (!url || typeof url !== 'string') {
    return UrlType.UNKNOWN;
  }

  const trimmedUrl = url.trim();

  // 检查是否为有效 URL
  if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
    return UrlType.UNKNOWN;
  }

  // 检测 YouTube
  if (isYouTubeUrl(trimmedUrl)) {
    return UrlType.YOUTUBE;
  }

  // 检测音频文件
  if (isAudioUrl(trimmedUrl)) {
    return UrlType.AUDIO;
  }

  return UrlType.UNKNOWN;
}

/**
 * 检查文件是否为支持的音频类型
 */
function isSupportedAudioFileType(mimeType: string): boolean {
  return ALLOWED_AUDIO_TYPES.includes(mimeType);
}

/**
 * 检查剪贴板数据是否包含纯 URL 文本
 */
function extractUrlFromClipboard(clipboardData: ClipboardData | null): string | null {
  if (!clipboardData) {
    return null;
  }

  // 检查是否有 Plait 元素（避免干扰正常的复制粘贴）
  const data = clipboardData as any;
  if (data.elements || data.data?.elements) {
    return null;
  }

  // 尝试获取文本
  let text: string | null = null;

  if (data.text) {
    text = data.text;
  } else if (data.data?.text) {
    text = data.data.text;
  } else if (typeof data.getData === 'function') {
    text = data.getData('text/plain');
  }

  if (!text) {
    return null;
  }

  // 清理文本
  const trimmedText = text.trim();

  // 检查是否是单行 URL（不包含换行）
  if (trimmedText.includes('\n')) {
    return null;
  }

  // 检查是否以 http 开头
  if (!trimmedText.startsWith('http://') && !trimmedText.startsWith('https://')) {
    return null;
  }

  return trimmedText;
}

/**
 * 从音频文件创建 Object URL 并插入
 */
async function insertAudioFromFile(
  board: PlaitBoard,
  file: File,
  targetPoint: Point
): Promise<void> {
  try {
    // 创建 Object URL
    const objectUrl = URL.createObjectURL(file);
    
    // 提取文件名作为标题
    const title = file.name.replace(/\.[^/.]+$/, '');
    
    // 插入音频元素
    AudioTransforms.insertAudio(board, {
      position: targetPoint,
      url: objectUrl,
      title,
    });
  } catch (error) {
    console.error('[withUrlPaste] Failed to insert audio from file:', error);
  }
}

/**
 * URL 粘贴识别插件
 */
export const withUrlPaste: PlaitPlugin = (board: PlaitBoard) => {
  const { insertFragment, drop } = board;

  // 处理拖放音频文件
  board.drop = (event: DragEvent) => {
    if (event.dataTransfer?.files?.length) {
      const file = event.dataTransfer.files[0];
      if (isSupportedAudioFileType(file.type)) {
        const point = toViewBoxPoint(
          board,
          toHostPoint(board, event.x, event.y)
        );
        insertAudioFromFile(board, file, point);
        return true;
      }
    }
    return drop(event);
  };

  board.insertFragment = (
    clipboardData: ClipboardData | null,
    targetPoint: Point,
    operationType?: WritableClipboardOperationType
  ) => {
    // 首先检查是否有音频文件
    const data = clipboardData as any;
    if (data?.files?.length) {
      const file = data.files[0] as File;
      if (isSupportedAudioFileType(file.type)) {
        // 处理音频文件粘贴
        insertAudioFromFile(board, file, targetPoint);
        return;
      }
    }

    // 尝试提取 URL
    const url = extractUrlFromClipboard(clipboardData);

    if (url) {
      const urlType = detectUrlType(url);

      switch (urlType) {
        case UrlType.YOUTUBE: {
          const parseResult = parseYouTubeUrl(url);
          if (parseResult.valid && parseResult.videoId) {
            YouTubeTransforms.insertYouTube(board, {
              position: targetPoint,
              videoIdOrUrl: url,
            });
            // 阻止默认的文本粘贴
            return;
          }
          break;
        }

        case UrlType.AUDIO: {
          AudioTransforms.insertAudio(board, {
            position: targetPoint,
            url,
          });
          // 阻止默认的文本粘贴
          return;
        }

        default:
          // 未识别的 URL，继续使用默认处理
          break;
      }
    }

    // 使用默认处理
    insertFragment(clipboardData, targetPoint, operationType);
  };

  return board;
};

export default withUrlPaste;
