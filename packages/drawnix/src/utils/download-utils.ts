/**
 * Download Utilities
 *
 * Centralized download logic for images, videos, and other media files
 * Supports single file download and batch download as ZIP
 */

import JSZip from 'jszip';

/**
 * Check if a URL is from Volces (火山引擎) domains
 * These domains don't support CORS, so we need special handling
 */
export function isVolcesDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return hostname.endsWith('.volces.com') || hostname.endsWith('.volccdn.com');
  } catch {
    return false;
  }
}

/**
 * Open URL in new tab (fallback for CORS-restricted domains)
 * User can right-click to save the file
 */
export function openInNewTab(url: string): void {
  window.open(url, '_blank');
}

/**
 * Sanitize a string to be used as a filename
 * - Removes special characters except Chinese, English, numbers, spaces, and dashes
 * - Replaces spaces with dashes
 * - Truncates to specified max length
 */
export function sanitizeFilename(text: string, maxLength: number = 50): string {
  return text
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5\s-]/g, '') // Remove special chars, keep Chinese
    .replace(/\s+/g, '-') // Replace spaces with dashes
    .substring(0, maxLength); // Limit length
}

/**
 * Download from an existing Blob directly
 * Useful when we already have the blob cached locally
 *
 * @param blob - The blob to download
 * @param filename - The filename to save as
 */
export function downloadFromBlob(blob: Blob, filename: string): void {
  const blobUrl = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up blob URL
  URL.revokeObjectURL(blobUrl);
}

/**
 * Download a file from URL with retry support
 * Handles cross-origin URLs by fetching as blob first
 * SW will deduplicate concurrent requests to the same URL
 *
 * @param url - The URL of the file to download
 * @param filename - Optional filename (will be sanitized if provided)
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @returns Promise that resolves when download is complete
 */
export async function downloadFile(
  url: string,
  filename?: string,
  maxRetries: number = 3
): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`[Download] Attempt ${attempt + 1}/${maxRetries} for:`, url);

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
      console.log('[Download] Success');
      return;
    } catch (error) {
      console.warn(`[Download] Attempt ${attempt + 1} failed:`, error);
      lastError = error as Error;

      // Wait before retrying (exponential backoff: 2s, 4s, 6s)
      if (attempt < maxRetries - 1) {
        const delay = 2000 * (attempt + 1);
        console.log(`[Download] Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  console.error('[Download] All attempts failed');
  throw lastError || new Error('Download failed after all retries');
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

/**
 * Get file extension from URL or MIME type
 */
export function getFileExtension(url: string, mimeType?: string): string {
  // Try to get extension from URL
  try {
    const urlPath = new URL(url).pathname;
    const urlExtension = urlPath.substring(urlPath.lastIndexOf('.') + 1).toLowerCase();

    if (urlExtension && urlExtension.length <= 5) {
      return urlExtension;
    }
  } catch {
    // URL parsing failed
  }

  // Handle base64 data URLs
  if (url.startsWith('data:')) {
    const match = url.match(/data:(\w+)\/(\w+)/);
    if (match) {
      return match[2] === 'jpeg' ? 'jpg' : match[2];
    }
  }

  // Fallback to MIME type
  if (mimeType) {
    const mimeToExt: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'video/mp4': 'mp4',
      'video/webm': 'webm',
    };
    return mimeToExt[mimeType] || 'bin';
  }

  return 'bin';
}

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
 * 批量下载为 ZIP 文件
 *
 * @param items - 下载项数组
 * @returns Promise
 */
export async function downloadAsZip(items: BatchDownloadItem[]): Promise<void> {
  if (items.length === 0) {
    throw new Error('No files to download');
  }

  const zip = new JSZip();
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');

  // 添加文件到 ZIP 根目录
  await Promise.all(
    items.map(async (item, index) => {
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
    })
  );

  // 生成 ZIP 并下载
  const content = await zip.generateAsync({ type: 'blob' });
  downloadFromBlob(content, `aitu_download_${timestamp}.zip`);
}

/**
 * 智能下载：单个直接下载，多个打包为 ZIP
 *
 * @param items - 下载项数组
 * @returns Promise
 */
export async function smartDownload(items: BatchDownloadItem[]): Promise<void> {
  if (items.length === 0) {
    throw new Error('No files to download');
  }

  if (items.length === 1) {
    const item = items[0];
    const ext = item.type === 'image' ? 'png' : 'mp4';
    const filename = item.filename || `${item.type}_download.${ext}`;
    await downloadFile(item.url, filename);
  } else {
    await downloadAsZip(items);
  }
}
