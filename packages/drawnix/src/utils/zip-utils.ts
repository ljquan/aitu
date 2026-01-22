/**
 * ZIP File Utilities
 * ZIP 文件处理工具函数
 */

import JSZip from 'jszip';
import { ASSET_CONSTANTS } from '../constants/ASSET_CONSTANTS';

/** 解压后的媒体文件信息 */
export interface ExtractedMediaFile {
  name: string;
  blob: Blob;
  type: 'image' | 'video';
  mimeType: string;
}

/** 解压结果 */
export interface ZipExtractionResult {
  files: ExtractedMediaFile[];
  skippedCount: number;
  errors: string[];
}

/** 根据文件名获取 MIME 类型 */
function getMimeTypeFromFileName(fileName: string): string | null {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (!ext) return null;

  const mimeMap: Record<string, string> = {
    // 图片
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    // 视频
    mp4: 'video/mp4',
    webm: 'video/webm',
    ogg: 'video/ogg',
  };

  return mimeMap[ext] || null;
}

/** 检查 MIME 类型是否为支持的媒体类型 */
function isSupportedMediaType(mimeType: string): boolean {
  return (
    ASSET_CONSTANTS.ALLOWED_IMAGE_TYPES.includes(mimeType) ||
    ASSET_CONSTANTS.ALLOWED_VIDEO_TYPES.includes(mimeType)
  );
}

/** 获取文件名（不含路径） */
function getBaseName(path: string): string {
  return path.split('/').pop() || path;
}

/** 检查是否为隐藏文件或系统文件 */
function isHiddenOrSystemFile(path: string): boolean {
  const name = getBaseName(path);
  return (
    name.startsWith('.') ||
    name.startsWith('__MACOSX') ||
    name === 'Thumbs.db' ||
    name === '.DS_Store'
  );
}

/**
 * 从 ZIP 文件中提取媒体文件
 * @param zipFile ZIP 文件
 * @param maxFileSize 单个文件最大大小（字节），默认 100MB
 * @returns 提取结果
 */
export async function extractMediaFromZip(
  zipFile: File,
  maxFileSize: number = 100 * 1024 * 1024,
): Promise<ZipExtractionResult> {
  const result: ZipExtractionResult = {
    files: [],
    skippedCount: 0,
    errors: [],
  };

  try {
    const zip = await JSZip.loadAsync(zipFile);
    const entries = Object.entries(zip.files);

    for (const [path, zipEntry] of entries) {
      // 跳过目录
      if (zipEntry.dir) continue;

      // 跳过隐藏/系统文件
      if (isHiddenOrSystemFile(path)) {
        result.skippedCount++;
        continue;
      }

      // 获取 MIME 类型
      const mimeType = getMimeTypeFromFileName(path);
      if (!mimeType || !isSupportedMediaType(mimeType)) {
        result.skippedCount++;
        continue;
      }

      try {
        // 解压文件
        const arrayBuffer = await zipEntry.async('arraybuffer');

        // 检查文件大小
        if (arrayBuffer.byteLength > maxFileSize) {
          result.errors.push(`文件 "${getBaseName(path)}" 超过 100MB 限制，已跳过`);
          result.skippedCount++;
          continue;
        }

        const blob = new Blob([arrayBuffer], { type: mimeType });
        const isImage = mimeType.startsWith('image/');

        result.files.push({
          name: getBaseName(path),
          blob,
          type: isImage ? 'image' : 'video',
          mimeType,
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        result.errors.push(`解压 "${getBaseName(path)}" 失败: ${errMsg}`);
        result.skippedCount++;
      }
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    result.errors.push(`读取 ZIP 文件失败: ${errMsg}`);
  }

  return result;
}

/**
 * 检查文件是否为 ZIP 文件
 */
export function isZipFile(file: File): boolean {
  return ASSET_CONSTANTS.ALLOWED_ZIP_TYPES.includes(file.type) ||
    file.name.toLowerCase().endsWith('.zip');
}
