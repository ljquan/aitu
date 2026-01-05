/**
 * Video Merge Service
 *
 * 使用 FFmpeg.wasm 在浏览器端合并多个视频片段
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

/** 合并进度回调 */
export interface MergeProgressCallback {
  (progress: number, stage: 'loading' | 'downloading' | 'merging' | 'encoding'): void;
}

/** 合并结果 */
export interface MergeResult {
  /** 合并后的视频 Blob */
  blob: Blob;
  /** 合并后的视频 URL (blob URL) */
  url: string;
  /** 视频时长（秒） */
  duration: number;
}

/**
 * Video Merge Service
 * 单例模式，管理 FFmpeg 实例和视频合并
 */
class VideoMergeService {
  private static instance: VideoMergeService;
  private ffmpeg: FFmpeg | null = null;
  private isLoading = false;
  private isLoaded = false;

  private constructor() {}

  static getInstance(): VideoMergeService {
    if (!VideoMergeService.instance) {
      VideoMergeService.instance = new VideoMergeService();
    }
    return VideoMergeService.instance;
  }

  /**
   * 加载 FFmpeg（懒加载，首次使用时加载）
   */
  private async loadFFmpeg(onProgress?: MergeProgressCallback): Promise<void> {
    if (this.isLoaded) return;
    if (this.isLoading) {
      // 等待加载完成
      while (this.isLoading) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return;
    }

    this.isLoading = true;
    onProgress?.(0, 'loading');

    try {
      this.ffmpeg = new FFmpeg();

      // 设置日志回调（可选，用于调试）
      this.ffmpeg.on('log', ({ message }) => {
        console.log('[FFmpeg]', message);
      });

      // 加载 FFmpeg core（从 CDN）
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      await this.ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      this.isLoaded = true;
      onProgress?.(100, 'loading');
      console.log('[VideoMerge] FFmpeg loaded successfully');
    } catch (error) {
      console.error('[VideoMerge] Failed to load FFmpeg:', error);
      throw new Error('FFmpeg 加载失败，请刷新页面重试');
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * 合并多个视频
   *
   * @param videoUrls 视频 URL 列表（按顺序）
   * @param onProgress 进度回调
   * @returns 合并后的视频
   */
  async mergeVideos(
    videoUrls: string[],
    onProgress?: MergeProgressCallback
  ): Promise<MergeResult> {
    if (videoUrls.length === 0) {
      throw new Error('没有视频可合并');
    }

    if (videoUrls.length === 1) {
      // 只有一个视频，直接返回
      const response = await fetch(videoUrls[0]);
      const blob = await response.blob();
      return {
        blob,
        url: URL.createObjectURL(blob),
        duration: 0, // 无法获取时长
      };
    }

    // 加载 FFmpeg
    await this.loadFFmpeg(onProgress);

    if (!this.ffmpeg) {
      throw new Error('FFmpeg 未初始化');
    }

    const ffmpeg = this.ffmpeg;
    const inputFiles: string[] = [];

    try {
      // 1. 下载所有视频文件
      onProgress?.(0, 'downloading');
      for (let i = 0; i < videoUrls.length; i++) {
        const inputName = `input${i}.mp4`;
        inputFiles.push(inputName);

        console.log(`[VideoMerge] Downloading video ${i + 1}/${videoUrls.length}`);
        const videoData = await fetchFile(videoUrls[i]);
        await ffmpeg.writeFile(inputName, videoData);

        onProgress?.(((i + 1) / videoUrls.length) * 100, 'downloading');
      }

      // 2. 创建合并文件列表
      const concatList = inputFiles.map(f => `file '${f}'`).join('\n');
      await ffmpeg.writeFile('concat.txt', concatList);

      // 3. 执行合并
      onProgress?.(0, 'merging');

      // 设置进度回调
      ffmpeg.on('progress', ({ progress }) => {
        onProgress?.(progress * 100, 'encoding');
      });

      // 使用 concat demuxer 合并视频（无需重新编码，速度快）
      await ffmpeg.exec([
        '-f', 'concat',
        '-safe', '0',
        '-i', 'concat.txt',
        '-c', 'copy', // 直接复制，不重新编码
        'output.mp4'
      ]);

      // 4. 读取输出文件
      const outputData = await ffmpeg.readFile('output.mp4');
      // FFmpeg 返回 Uint8Array，需要转换为普通数组以确保类型兼容
      const blob = new Blob([new Uint8Array(outputData as any)], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);

      // 计算总时长（假设每段8秒）
      const duration = videoUrls.length * 8;

      console.log(`[VideoMerge] Merged ${videoUrls.length} videos successfully`);

      // 5. 清理临时文件
      for (const file of inputFiles) {
        await ffmpeg.deleteFile(file);
      }
      await ffmpeg.deleteFile('concat.txt');
      await ffmpeg.deleteFile('output.mp4');

      return { blob, url, duration };
    } catch (error) {
      console.error('[VideoMerge] Merge failed:', error);
      throw new Error(`视频合并失败: ${error}`);
    }
  }

  /**
   * 检查 FFmpeg 是否已加载
   */
  isReady(): boolean {
    return this.isLoaded;
  }
}

// 导出单例
export const videoMergeService = VideoMergeService.getInstance();

/**
 * 便捷方法：合并视频
 */
export async function mergeVideos(
  videoUrls: string[],
  onProgress?: MergeProgressCallback
): Promise<MergeResult> {
  return videoMergeService.mergeVideos(videoUrls, onProgress);
}
