/**
 * Download Utilities
 *
 * Centralized download logic for images, videos, and other media files
 * Supports single file download and batch download as ZIP
 */

import JSZip from 'jszip';
import { sanitizeFilename, isVolcesDomain, getFileExtension } from '@aitu/utils';

/**
 * Open URL in new tab (fallback for CORS-restricted domains)
 * User can right-click to save the file
 */
export function openInNewTab(url: string): void {
  window.open(url, '_blank');
}

/**
 * Download from an existing Blob directly
 * Useful when we already have the blob cached locally
 *
 * @param blob - The blob to download
 * @param filename - The filename to save as
 */
export function downloadFromBlob(blob: Blob, filename: string): void {
  // 确保 Blob 有正确的 MIME 类型
  const blobUrl = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // 延迟释放 URL，确保下载完成
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

/**
 * Download a file from URL
 * Handles cross-origin URLs by fetching as blob first
 * SW will deduplicate concurrent requests to the same URL
 *
 * @param url - The URL of the file to download
 * @param filename - Optional filename (will be sanitized if provided)
 * @returns Promise that resolves when download is complete
 */
export async function downloadFile(
  url: string,
  filename?: string
): Promise<void> {
  // Fetch the file as blob to handle cross-origin URLs
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const blob = await response.blob();

  // Determine filename
  let finalFilename = filename;
  if (!finalFilename) {
    // Try to extract filename from URL
    const urlPath = new URL(url).pathname;
    finalFilename = urlPath.substring(urlPath.lastIndexOf('/') + 1) || 'download';
  }

  // Use downloadFromBlob to trigger download
  downloadFromBlob(blob, finalFilename);
}

/**
 * Download a media file with auto-generated filename from prompt
 * For Volces (火山引擎) domains that don't support CORS, opens in new tab instead
 *
 * @param url - The URL of the media file
 * @param prompt - The prompt text to use for filename
 * @param format - File extension (e.g., 'png', 'mp4', 'webp')
 * @param fallbackName - Fallback name if prompt is empty
 * @returns Promise that resolves when download is complete, or object with opened flag for new tab
 */
export async function downloadMediaFile(
  url: string,
  prompt: string,
  format: string,
  fallbackName: string = 'media'
): Promise<{ opened: boolean } | void> {
  // For Volces domains (火山引擎), open in new tab due to CORS restrictions
  if (isVolcesDomain(url)) {
    openInNewTab(url);
    return { opened: true };
  }

  const sanitizedPrompt = sanitizeFilename(prompt);
  const filename = `${sanitizedPrompt || fallbackName}.${format}`;
  return downloadFile(url, filename);
}

// getFileExtension is now re-exported from @aitu/utils above

/**
 * 批量下载项接口
 */
export interface BatchDownloadItem {
  /** 文件 URL */
  url: string;
  /** 文件类型 */
  type: 'image' | 'video';
  /** 可选文件名 */
  filename?: string;
}

/**
 * 带并发限制的批量处理
 * @param items 要处理的项目
 * @param handler 处理函数
 * @param concurrency 并发数限制
 */
async function processBatchWithConcurrency<T, R>(
  items: T[],
  handler: (item: T, index: number) => Promise<R>,
  concurrency: number = 3
): Promise<R[]> {
  const results: R[] = [];
  let currentIndex = 0;
  
  const workers = Array(Math.min(concurrency, items.length)).fill(null).map(async () => {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      const result = await handler(items[index], index);
      results[index] = result;
    }
  });
  
  await Promise.all(workers);
  return results;
}

/**
 * 批量下载为 ZIP 文件
 * 使用并发限制避免同时发起过多网络请求
 *
 * @param items - 下载项数组
 * @param zipFilename - 可选的 ZIP 文件名
 * @returns Promise
 */
export async function downloadAsZip(items: BatchDownloadItem[], zipFilename?: string): Promise<void> {
  if (items.length === 0) {
    throw new Error('No files to download');
  }

  const zip = new JSZip();
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  const finalZipName = zipFilename || `aitu_download_${timestamp}.zip`;

  // 添加文件到 ZIP 根目录（限制并发数为 3）
  await processBatchWithConcurrency(
    items,
    async (item, index) => {
      try {
        const response = await fetch(item.url);
        if (!response.ok) {
          console.warn(`Failed to fetch ${item.url}: ${response.status}`);
          return;
        }
        const blob = await response.blob();
        const ext = getFileExtension(item.url, blob.type);

        const prefix = item.type === 'image' ? 'image' : 'video';
        const filename = item.filename || `${prefix}_${index + 1}.${ext}`;

        zip.file(filename, blob);
      } catch (error) {
        console.error(`Failed to add file to zip:`, error);
      }
    },
    3 // 并发限制为 3
  );

  // 生成 ZIP 并下载
  const content = await zip.generateAsync({ type: 'blob' });
  downloadFromBlob(content, finalZipName);
}

/**
 * 智能下载：单个直接下载，多个打包为 ZIP
 *
 * @param items - 下载项数组
 * @param zipFilename - 可选的 ZIP 文件名（仅在多文件时使用）
 * @returns Promise
 */
export async function smartDownload(items: BatchDownloadItem[], zipFilename?: string): Promise<void> {
  if (items.length === 0) {
    throw new Error('No files to download');
  }

  if (items.length === 1) {
    const item = items[0];
    // Use getFileExtension to detect correct extension (handles SVG, PNG, etc.)
    const ext = getFileExtension(item.url) || (item.type === 'image' ? 'png' : 'mp4');
    const filename = item.filename || `${item.type}_download.${ext}`;
    await downloadFile(item.url, filename);
  } else {
    await downloadAsZip(items, zipFilename);
  }
}
