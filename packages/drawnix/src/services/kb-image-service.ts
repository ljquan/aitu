/**
 * Knowledge Base Image Service
 *
 * 知识库图片独立存储与处理服务
 * - 从 Markdown/HTML 内容中提取 base64 图片
 * - 基于 hash 去重存储到 noteImagesStore
 * - 正文中 base64 替换为 kb-image://URL，加载时还原
 * - 删除笔记时清理仅被该笔记引用的图片
 * - 清理所有未被引用的图片
 */

import type { KBNoteImage, KBNoteContent } from '../types/knowledge-base.types';
import { _getStoreInstances } from './knowledge-base-service';

// ==================== Hash 计算 ====================

/**
 * DJB2 hash 算法 —— 简单高效，适合图片去重场景
 */
function computeDJB2Hash(data: string): string {
  // 提取 base64 数据部分（去掉 data:image/xxx;base64, 前缀）
  const base64Data = data.includes(',') ? data.split(',')[1] : data;

  let hash = 5381;
  for (let i = 0; i < base64Data.length; i++) {
    hash = ((hash << 5) + hash) ^ base64Data.charCodeAt(i);
    hash = hash >>> 0; // 转为无符号 32 位整数
  }

  return hash.toString(16).padStart(8, '0');
}

// ==================== Base64 工具 ====================

/**
 * 从 base64 数据中解析 MIME 类型
 */
function parseMimeType(base64: string): string {
  const match = base64.match(/^data:([^;]+);base64,/);
  return match ? match[1] : 'image/png';
}

/**
 * 计算 base64 数据的字节大小
 */
function estimateBase64Size(base64: string): number {
  const data = base64.includes(',') ? base64.split(',')[1] : base64;
  return Math.ceil(data.length * 0.75);
}

// ==================== 图片提取与替换 ====================

/** 匹配 Markdown 中的 base64 图片 */
const BASE64_IMAGE_REGEX =
  /!\[([^\]]*)\]\((data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]+)(\s+"[^"]*")?\)/g;

/** 匹配正文中的 kb-image:// URL */
const KB_IMAGE_URL_REGEX = /kb-image:\/\/([a-f0-9-]+)/g;

/**
 * 从 Markdown 内容中提取所有 base64 图片
 * @returns 提取的图片信息数组
 */
export function extractBase64ImagesFromContent(content: string): Array<{
  fullMatch: string;
  altText: string;
  base64: string;
  title: string;
  hash: string;
  mimeType: string;
  size: number;
}> {
  const results: Array<{
    fullMatch: string;
    altText: string;
    base64: string;
    title: string;
    hash: string;
    mimeType: string;
    size: number;
  }> = [];

  let match;
  const regex = new RegExp(BASE64_IMAGE_REGEX.source, 'g');
  while ((match = regex.exec(content)) !== null) {
    const base64 = match[2];
    results.push({
      fullMatch: match[0],
      altText: match[1],
      base64,
      title: match[3] || '',
      hash: computeDJB2Hash(base64),
      mimeType: parseMimeType(base64),
      size: estimateBase64Size(base64),
    });
  }

  return results;
}

/**
 * 保存图片到 noteImagesStore，基于 hash 去重
 * @returns 保存的图片 ID
 */
export async function saveImage(
  noteId: string,
  base64Data: string,
  mimeType: string
): Promise<string> {
  const { noteImagesStore } = _getStoreInstances();
  const hash = computeDJB2Hash(base64Data);

  // 检查是否已存在相同 hash 的图片
  let existingImage: KBNoteImage | null = null;
  await noteImagesStore.iterate<KBNoteImage, void>((value) => {
    if (value.hash === hash) {
      existingImage = value;
    }
  });

  if (existingImage) {
    return (existingImage as KBNoteImage).id;
  }

  // 不存在，创建新图片记录
  const id = crypto.randomUUID();
  const image: KBNoteImage = {
    id,
    noteId,
    hash,
    data: base64Data,
    mimeType,
    size: estimateBase64Size(base64Data),
    createdAt: Date.now(),
  };

  await noteImagesStore.setItem(id, image);
  return id;
}

/**
 * 保存正文中的 base64 图片并替换为 kb-image:// URL
 * @returns 处理后的正文内容
 */
export async function replaceBase64WithUrls(
  content: string,
  noteId: string
): Promise<string> {
  const images = extractBase64ImagesFromContent(content);
  if (images.length === 0) return content;

  let processedContent = content;

  for (const img of images) {
    const imageId = await saveImage(noteId, img.base64, img.mimeType);
    const url = `kb-image://${imageId}`;
    processedContent = processedContent.replace(
      img.fullMatch,
      `![${img.altText}](${url}${img.title})`
    );
  }

  return processedContent;
}

/**
 * 将正文中的 kb-image:// URL 还原为 base64
 * @returns 还原后的正文内容
 */
export async function replaceUrlsWithBase64(content: string): Promise<string> {
  const { noteImagesStore } = _getStoreInstances();

  // 收集所有需要替换的 image ID
  const imageIds = new Set<string>();
  let match;
  const regex = new RegExp(KB_IMAGE_URL_REGEX.source, 'g');
  while ((match = regex.exec(content)) !== null) {
    imageIds.add(match[1]);
  }

  if (imageIds.size === 0) return content;

  // 加载图片数据
  const imageMap = new Map<string, string>();
  for (const id of imageIds) {
    const image = await noteImagesStore.getItem<KBNoteImage>(id);
    if (image) {
      imageMap.set(id, image.data);
    }
  }

  // 替换 URL 为 base64
  let result = content;
  for (const [id, base64] of imageMap) {
    result = result.replace(new RegExp(`kb-image://${id}`, 'g'), base64);
  }

  return result;
}

/**
 * 删除指定笔记的图片（仅删除未被其他笔记引用的）
 */
export async function deleteImagesByNoteId(noteId: string): Promise<number> {
  const { noteImagesStore, noteContentsStore } = _getStoreInstances();

  // 获取该笔记引用的所有图片 ID
  const noteImageIds = new Set<string>();
  await noteImagesStore.iterate<KBNoteImage, void>((value) => {
    if (value.noteId === noteId) {
      noteImageIds.add(value.id);
    }
  });

  if (noteImageIds.size === 0) return 0;

  // 检查这些图片是否被其他笔记的正文引用
  const referencedIds = new Set<string>();
  await noteContentsStore.iterate<KBNoteContent, void>((value) => {
    if (value.noteId === noteId) return; // 跳过当前笔记
    for (const imageId of noteImageIds) {
      if (value.content.includes(`kb-image://${imageId}`)) {
        referencedIds.add(imageId);
      }
    }
  });

  // 删除未被引用的图片
  let deletedCount = 0;
  for (const imageId of noteImageIds) {
    if (!referencedIds.has(imageId)) {
      await noteImagesStore.removeItem(imageId);
      deletedCount++;
    }
  }

  return deletedCount;
}

/**
 * 清理所有未被引用的图片
 * @returns 删除的图片数量
 */
export async function cleanupUnusedImages(): Promise<number> {
  const { noteImagesStore, noteContentsStore } = _getStoreInstances();

  // 收集所有正文中引用的图片 ID
  const referencedIds = new Set<string>();
  await noteContentsStore.iterate<KBNoteContent, void>((value) => {
    let match;
    const regex = new RegExp(KB_IMAGE_URL_REGEX.source, 'g');
    while ((match = regex.exec(value.content)) !== null) {
      referencedIds.add(match[1]);
    }
  });

  // 删除未被引用的图片
  const toDelete: string[] = [];
  await noteImagesStore.iterate<KBNoteImage, void>((value) => {
    if (!referencedIds.has(value.id)) {
      toDelete.push(value.id);
    }
  });

  for (const id of toDelete) {
    await noteImagesStore.removeItem(id);
  }

  return toDelete.length;
}

/**
 * 获取所有图片的存储统计信息
 */
export async function getImageStorageStats(): Promise<{
  totalCount: number;
  totalSize: number;
  uniqueHashes: number;
}> {
  const { noteImagesStore } = _getStoreInstances();

  let totalCount = 0;
  let totalSize = 0;
  const hashes = new Set<string>();

  await noteImagesStore.iterate<KBNoteImage, void>((value) => {
    totalCount++;
    totalSize += value.size;
    hashes.add(value.hash);
  });

  return {
    totalCount,
    totalSize,
    uniqueHashes: hashes.size,
  };
}

// 导出 hash 函数供其他模块使用
export { computeDJB2Hash };

export const kbImageService = {
  extractBase64ImagesFromContent,
  saveImage,
  replaceBase64WithUrls,
  replaceUrlsWithBase64,
  deleteImagesByNoteId,
  cleanupUnusedImages,
  getImageStorageStats,
  computeDJB2Hash,
};
