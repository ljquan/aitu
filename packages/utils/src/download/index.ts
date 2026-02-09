/**
 * Download Utilities
 *
 * 文件下载工具模块
 * - Blob 下载
 * - URL 下载
 * - 并发下载控制
 */

// ==================== 基础下载 ====================

/**
 * 在新标签页中打开 URL
 *
 * 用于不支持 CORS 的资源，用户可以右键保存。
 *
 * @param url - 要打开的 URL
 */
export function openInNewTab(url: string): void {
  window.open(url, '_blank');
}

/**
 * 从 Blob 下载文件
 *
 * 将 Blob 转换为下载链接并触发下载。
 *
 * @param blob - 要下载的 Blob
 * @param filename - 保存的文件名
 *
 * @example
 * ```typescript
 * const blob = new Blob(['Hello World'], { type: 'text/plain' });
 * downloadFromBlob(blob, 'hello.txt');
 * ```
 */
export function downloadFromBlob(blob: Blob, filename: string): void {
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
 * 从 URL 下载文件
 *
 * 先 fetch 资源为 Blob，然后触发下载。
 * 可以处理跨域 URL（需要服务器支持 CORS）。
 *
 * @param url - 文件 URL
 * @param filename - 保存的文件名（可选，默认从 URL 提取）
 *
 * @example
 * ```typescript
 * await downloadFile('https://example.com/image.png', 'my-image.png');
 * ```
 */
export async function downloadFile(
  url: string,
  filename?: string
): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const blob = await response.blob();

  let finalFilename = filename;
  if (!finalFilename) {
    const urlPath = new URL(url).pathname;
    finalFilename = urlPath.substring(urlPath.lastIndexOf('/') + 1) || 'download';
  }

  downloadFromBlob(blob, finalFilename);
}

/**
 * 下载 Data URL 为文件
 *
 * @param dataUrl - Data URL 字符串
 * @param filename - 保存的文件名
 *
 * @example
 * ```typescript
 * downloadDataUrl('data:text/plain;base64,SGVsbG8gV29ybGQ=', 'hello.txt');
 * ```
 */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ==================== 并发控制 ====================

/**
 * 带并发限制的批量处理
 *
 * 限制同时执行的 Promise 数量，避免同时发起过多请求。
 *
 * @param items - 要处理的项目数组
 * @param handler - 处理函数
 * @param concurrency - 并发数限制（默认 3）
 * @returns 处理结果数组（保持原顺序）
 *
 * @example
 * ```typescript
 * const urls = ['url1', 'url2', 'url3', 'url4', 'url5'];
 * const results = await processBatchWithConcurrency(
 *   urls,
 *   async (url, index) => {
 *     const response = await fetch(url);
 *     return response.blob();
 *   },
 *   3 // 最多同时 3 个请求
 * );
 * ```
 */
export async function processBatchWithConcurrency<T, R>(
  items: T[],
  handler: (item: T, index: number) => Promise<R>,
  concurrency = 3
): Promise<R[]> {
  const results: R[] = [];
  let currentIndex = 0;

  const workers = Array(Math.min(concurrency, items.length))
    .fill(null)
    .map(async () => {
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
 * 带并发限制和错误处理的批量处理
 *
 * 与 processBatchWithConcurrency 类似，但会收集错误而不是抛出。
 *
 * @param items - 要处理的项目数组
 * @param handler - 处理函数
 * @param concurrency - 并发数限制（默认 3）
 * @returns 处理结果（包含成功和失败的项目）
 *
 * @example
 * ```typescript
 * const { results, errors } = await processBatchWithConcurrencySafe(
 *   urls,
 *   async (url) => fetch(url).then(r => r.blob()),
 *   3
 * );
 * console.log(`成功: ${results.length}, 失败: ${errors.length}`);
 * ```
 */
export async function processBatchWithConcurrencySafe<T, R>(
  items: T[],
  handler: (item: T, index: number) => Promise<R>,
  concurrency = 3
): Promise<{
  results: Array<{ index: number; value: R }>;
  errors: Array<{ index: number; error: Error }>;
}> {
  const results: Array<{ index: number; value: R }> = [];
  const errors: Array<{ index: number; error: Error }> = [];
  let currentIndex = 0;

  const workers = Array(Math.min(concurrency, items.length))
    .fill(null)
    .map(async () => {
      while (currentIndex < items.length) {
        const index = currentIndex++;
        try {
          const result = await handler(items[index], index);
          results.push({ index, value: result });
        } catch (error) {
          errors.push({
            index,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      }
    });

  await Promise.all(workers);

  // 按原顺序排序
  results.sort((a, b) => a.index - b.index);
  errors.sort((a, b) => a.index - b.index);

  return { results, errors };
}

// ==================== 类型导出 ====================

/**
 * 批量下载项
 */
export interface BatchDownloadItem {
  /** 文件 URL */
  url: string;
  /** 文件类型 */
  type: 'image' | 'video' | 'file';
  /** 可选文件名 */
  filename?: string;
}
