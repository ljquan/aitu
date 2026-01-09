/**
 * Asset Cleanup Utilities
 * 
 * 处理虚拟URL资源的清理和元素删除
 */

import { PlaitBoard, PlaitElement, CoreTransforms } from '@plait/core';
import { PlaitDrawElement } from '@plait/draw';

/** 素材库 URL 前缀 */
const ASSET_URL_PREFIX = '/asset-library/';

/**
 * 检查是否为虚拟URL（素材库本地URL）
 */
export function isVirtualUrl(url: string): boolean {
  return url.startsWith('/asset-library/') || url.startsWith('/__aitu_cache__/');
}

/**
 * 从虚拟URL中提取素材ID
 * 例如: /asset-library/87501b99-6c6d-4053-8b38-37bfaabce9a3.png -> 87501b99-6c6d-4053-8b38-37bfaabce9a3
 */
export function extractAssetIdFromUrl(url: string): string | null {
  if (!url.startsWith(ASSET_URL_PREFIX)) {
    return null;
  }
  
  // 移除前缀和扩展名
  const pathPart = url.slice(ASSET_URL_PREFIX.length);
  const dotIndex = pathPart.lastIndexOf('.');
  if (dotIndex > 0) {
    return pathPart.slice(0, dotIndex);
  }
  return pathPart;
}

/**
 * 根据素材ID生成虚拟URL的匹配模式
 */
export function getAssetUrlPattern(assetId: string): string {
  return `${ASSET_URL_PREFIX}${assetId}`;
}

/**
 * 检查元素的URL是否匹配指定的素材ID
 */
export function isElementUsingAsset(element: PlaitElement, assetId: string): boolean {
  const url = (element as any).url;
  if (!url || typeof url !== 'string') {
    return false;
  }
  
  // 检查URL是否包含素材ID
  const pattern = getAssetUrlPattern(assetId);
  return url.startsWith(pattern);
}

/**
 * 从画布中删除指定的元素
 */
export function removeElementFromBoard(board: PlaitBoard, element: PlaitElement): boolean {
  try {
    const elementToRemove = board.children.find((child: any) => child.id === element.id);
    if (elementToRemove) {
      CoreTransforms.removeElements(board, [elementToRemove]);
      console.log(`[AssetCleanup] Successfully removed element: ${element.id}`);
      return true;
    } else {
      console.warn(`[AssetCleanup] Element not found in board: ${element.id}`);
      return false;
    }
  } catch (error) {
    console.error('[AssetCleanup] Failed to remove element:', error);
    return false;
  }
}

/**
 * 处理虚拟URL图片加载失败，自动删除对应元素
 */
export function handleVirtualUrlImageError(
  board: PlaitBoard,
  element: PlaitElement,
  imageUrl: string
): void {
  if (!isVirtualUrl(imageUrl)) {
    return; // 只处理虚拟URL
  }

  console.warn(`[AssetCleanup] Virtual URL asset not found, removing element: ${imageUrl}`);
  removeElementFromBoard(board, element);
}

/**
 * 根据素材ID删除画布上使用该素材的所有元素
 * @param board - 画布实例
 * @param assetId - 素材ID
 * @returns 删除的元素数量
 */
export function removeElementsByAssetId(board: PlaitBoard, assetId: string): number {
  if (!board.children || board.children.length === 0) {
    return 0;
  }

  const elementsToRemove: PlaitElement[] = [];

  for (const element of board.children) {
    // 检查是否为图片元素
    if (PlaitDrawElement.isDrawElement(element) && PlaitDrawElement.isImage(element)) {
      if (isElementUsingAsset(element, assetId)) {
        elementsToRemove.push(element);
      }
    }
    // 检查是否为视频元素（视频也可能使用虚拟URL）
    else if ((element as any).type === 'video' || (element as any).isVideo) {
      if (isElementUsingAsset(element, assetId)) {
        elementsToRemove.push(element);
      }
    }
  }

  if (elementsToRemove.length > 0) {
    try {
      CoreTransforms.removeElements(board, elementsToRemove);
      console.log(`[AssetCleanup] Removed ${elementsToRemove.length} elements using asset: ${assetId}`);
    } catch (error) {
      console.error('[AssetCleanup] Failed to remove elements:', error);
      return 0;
    }
  }

  return elementsToRemove.length;
}

/**
 * 根据多个素材ID批量删除画布上使用这些素材的所有元素
 * @param board - 画布实例
 * @param assetIds - 素材ID数组
 * @returns 删除的元素数量
 */
export function removeElementsByAssetIds(board: PlaitBoard, assetIds: string[]): number {
  if (!board.children || board.children.length === 0 || assetIds.length === 0) {
    return 0;
  }

  const assetIdSet = new Set(assetIds);
  const elementsToRemove: PlaitElement[] = [];

  for (const element of board.children) {
    const url = (element as any).url;
    if (!url || typeof url !== 'string') {
      continue;
    }

    // 提取URL中的素材ID
    const elementAssetId = extractAssetIdFromUrl(url);
    if (elementAssetId && assetIdSet.has(elementAssetId)) {
      // 检查是否为图片或视频元素
      const isImage = PlaitDrawElement.isDrawElement(element) && PlaitDrawElement.isImage(element);
      const isVideo = (element as any).type === 'video' || (element as any).isVideo;
      
      if (isImage || isVideo) {
        elementsToRemove.push(element);
      }
    }
  }

  if (elementsToRemove.length > 0) {
    try {
      CoreTransforms.removeElements(board, elementsToRemove);
      console.log(`[AssetCleanup] Batch removed ${elementsToRemove.length} elements using ${assetIds.length} assets`);
    } catch (error) {
      console.error('[AssetCleanup] Failed to batch remove elements:', error);
      return 0;
    }
  }

  return elementsToRemove.length;
}

/**
 * 扫描画布上所有图片元素，检查虚拟URL资源是否可用
 * 如果资源不可用，自动删除对应元素
 */
export async function cleanupMissingAssets(board: PlaitBoard): Promise<number> {
  if (!board.children || board.children.length === 0) {
    return 0;
  }

  const elementsToRemove: PlaitElement[] = [];
  
  for (const element of board.children) {
    // 检查是否为图片元素
    if (PlaitDrawElement.isDrawElement(element) && PlaitDrawElement.isImage(element)) {
      const imageUrl = (element as any).url;
      
      if (imageUrl && isVirtualUrl(imageUrl)) {
        try {
          // 尝试获取资源
          const response = await fetch(imageUrl, { method: 'HEAD' });
          if (!response.ok) {
            console.warn(`[AssetCleanup] Asset not available: ${imageUrl}, marking for removal`);
            elementsToRemove.push(element);
          }
        } catch (error) {
          console.warn(`[AssetCleanup] Failed to check asset: ${imageUrl}, marking for removal`);
          elementsToRemove.push(element);
        }
      }
    }
  }

  // 批量删除无效元素
  if (elementsToRemove.length > 0) {
    try {
      CoreTransforms.removeElements(board, elementsToRemove);
      console.log(`[AssetCleanup] Removed ${elementsToRemove.length} elements with missing assets`);
    } catch (error) {
      console.error('[AssetCleanup] Failed to remove elements:', error);
    }
  }

  return elementsToRemove.length;
}