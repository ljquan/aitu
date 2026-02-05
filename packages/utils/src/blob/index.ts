/**
 * Blob 工具模块
 *
 * 提供 Blob 和 Base64 之间的转换工具函数
 */

/**
 * 将 Blob 转换为 Base64 字符串
 *
 * @param blob 要转换的 Blob
 * @returns Promise<string> 纯 Base64 字符串（不含 data URL 前缀）
 *
 * @example
 * ```typescript
 * const blob = new Blob(['Hello'], { type: 'text/plain' });
 * const base64 = await blobToBase64(blob);
 * console.log(base64); // "SGVsbG8="
 * ```
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onloadend = () => {
      const result = reader.result as string;
      // 移除 data URL 前缀 (e.g., "data:image/png;base64,")
      const base64Data = result.split(',')[1];
      resolve(base64Data);
    };

    reader.onerror = () => {
      reject(new Error('Failed to read blob as base64'));
    };

    reader.readAsDataURL(blob);
  });
}

/**
 * 将纯 Base64 字符串转换为 Blob
 *
 * 注意：此函数接受纯 base64 字符串（不含 data URL 前缀）。
 * 如果你有 data URL 格式的字符串，请使用 `@aitu/utils` 的 `base64ToBlob`（来自 encoding 模块）。
 *
 * @param base64 纯 Base64 字符串（不含 data URL 前缀）
 * @param mimeType MIME 类型
 * @returns Blob
 *
 * @example
 * ```typescript
 * const blob = pureBase64ToBlob('SGVsbG8=', 'text/plain');
 * console.log(blob.size); // 5
 * console.log(blob.type); // "text/plain"
 * ```
 */
export function pureBase64ToBlob(base64: string, mimeType: string): Blob {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);

  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return new Blob([bytes], { type: mimeType });
}

/**
 * 将 Data URL 转换为 Blob
 *
 * @param dataUrl Data URL 字符串 (e.g., "data:image/png;base64,...")
 * @returns Blob
 *
 * @example
 * ```typescript
 * const blob = dataUrlToBlob('data:text/plain;base64,SGVsbG8=');
 * console.log(blob.type); // "text/plain"
 * ```
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mimeType = header.match(/:(.*?);/)?.[1] || 'application/octet-stream';
  return pureBase64ToBlob(base64, mimeType);
}

/**
 * 将 Blob 转换为 Data URL
 *
 * @param blob 要转换的 Blob
 * @returns Promise<string> Data URL 字符串
 *
 * @example
 * ```typescript
 * const blob = new Blob(['Hello'], { type: 'text/plain' });
 * const dataUrl = await blobToDataUrl(blob);
 * console.log(dataUrl); // "data:text/plain;base64,SGVsbG8="
 * ```
 */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onloadend = () => {
      resolve(reader.result as string);
    };

    reader.onerror = () => {
      reject(new Error('Failed to read blob as data URL'));
    };

    reader.readAsDataURL(blob);
  });
}

/**
 * 计算 Blob 的 MD5 校验和（使用 SubtleCrypto）
 *
 * 注意：浏览器 SubtleCrypto 不支持 MD5，这里使用 SHA-256 代替
 *
 * @param blob 要计算校验和的 Blob
 * @returns Promise<string> 十六进制格式的校验和
 *
 * @example
 * ```typescript
 * const blob = new Blob(['Hello'], { type: 'text/plain' });
 * const checksum = await calculateBlobChecksum(blob);
 * ```
 */
export async function calculateBlobChecksum(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
