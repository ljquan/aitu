/**
 * Audio Element Type Definitions
 *
 * 定义音频元素的类型和接口
 */

import { PlaitElement, Point } from '@plait/core';

/**
 * 音频默认尺寸
 */
export const DEFAULT_AUDIO_SIZE = {
  width: 320,
  height: 100,
};

/**
 * 支持的音频 MIME 类型
 */
export const ALLOWED_AUDIO_TYPES = [
  'audio/mpeg',     // .mp3
  'audio/mp3',      // .mp3 (alternative)
  'audio/wav',      // .wav
  'audio/wave',     // .wav (alternative)
  'audio/ogg',      // .ogg
  'audio/aac',      // .aac
  'audio/m4a',      // .m4a
  'audio/x-m4a',    // .m4a (alternative)
  'audio/flac',     // .flac
  'audio/webm',     // .webm
];

/**
 * 音频文件扩展名
 */
export const AUDIO_FILE_EXTENSIONS = [
  '.mp3',
  '.wav',
  '.ogg',
  '.aac',
  '.m4a',
  '.flac',
  '.webm',
];

/**
 * 音频元素 - 画布上的音频播放器实例
 */
export interface PlaitAudio extends PlaitElement {
  /** 元素类型标识 */
  type: 'audio';

  /** 位置和尺寸（画布坐标）[左上角, 右下角] */
  points: [Point, Point];

  /** 旋转角度（度数） */
  angle: number;

  /** 音频 URL */
  url: string;

  /** 音频标题 */
  title: string;

  /** 音频时长（秒） */
  duration?: number;

  /** 当前播放位置（秒） */
  currentTime?: number;

  /** 音量（0-1） */
  volume?: number;

  /** 是否正在播放 */
  isPlaying?: boolean;

  /** 创建时间 */
  createdAt?: number;
}

/**
 * 创建音频元素的选项
 */
export interface AudioCreateOptions {
  /** 插入位置 */
  position: Point;

  /** 尺寸（可选） */
  size?: { width: number; height: number };

  /** 音频 URL */
  url: string;

  /** 音频标题（可选，默认从 URL 提取） */
  title?: string;

  /** 音频时长（可选） */
  duration?: number;
}

/**
 * 从 URL 提取文件名作为标题
 */
export function extractAudioTitle(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const filename = pathname.split('/').pop() || 'Audio';
    // 移除扩展名
    const title = filename.replace(/\.[^/.]+$/, '');
    // URL 解码
    return decodeURIComponent(title);
  } catch {
    // 如果 URL 解析失败，尝试直接提取
    const parts = url.split('/');
    const filename = parts.pop() || 'Audio';
    return filename.replace(/\.[^/.]+$/, '');
  }
}

/**
 * 格式化时间为 mm:ss 格式
 */
export function formatAudioTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * 检查 URL 是否为音频文件
 */
export function isAudioUrl(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  return AUDIO_FILE_EXTENSIONS.some(ext => lowerUrl.endsWith(ext));
}
