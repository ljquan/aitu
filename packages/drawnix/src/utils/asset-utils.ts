/**
 * Asset Utility Functions
 * 素材工具函数
 */

import { ASSET_CONSTANTS } from '../constants/ASSET_CONSTANTS';
import type {
  Asset,
  AssetType,
  FilterState,
  FilteredAssetsResult,
  AssetSource,
} from '../types/asset.types';

/**
 * Validate Asset Name
 * 验证素材名称
 */
export function validateAssetName(
  name: string,
): { valid: boolean; error?: string } {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: '素材名称不能为空' };
  }
  if (name.length > ASSET_CONSTANTS.MAX_NAME_LENGTH) {
    return {
      valid: false,
      error: `素材名称不能超过${ASSET_CONSTANTS.MAX_NAME_LENGTH}个字符`,
    };
  }
  return { valid: true };
}

/**
 * Validate MIME Type
 * 验证MIME类型
 */
export function validateMimeType(
  mimeType: string,
): { valid: boolean; error?: string } {
  const allowedTypes = [
    ...ASSET_CONSTANTS.ALLOWED_IMAGE_TYPES,
    ...ASSET_CONSTANTS.ALLOWED_VIDEO_TYPES,
  ];

  if (!allowedTypes.includes(mimeType)) {
    return {
      valid: false,
      error: `不支持的文件类型: ${mimeType}。只支持图片（JPG, PNG, GIF, WebP）和视频（MP4, WebM, OGG）。`,
    };
  }
  return { valid: true };
}

/**
 * Get Asset Type from MIME Type
 * 根据MIME类型获取素材类型
 */
export function getAssetType(mimeType: string): AssetType | null {
  if (mimeType.startsWith('image/')) return 'IMAGE' as AssetType;
  if (mimeType.startsWith('video/')) return 'VIDEO' as AssetType;
  return null;
}

/**
 * Filter Assets
 * 筛选和排序素材
 */
export function filterAssets(
  assets: Asset[],
  filters: FilterState,
): FilteredAssetsResult {
  const filtered = assets
    .filter((asset) => {
      // Type filter
      const matchesType =
        filters.activeType === 'ALL' || asset.type === filters.activeType;

      // Source filter
      const matchesSource =
        filters.activeSource === 'ALL' ||
        (filters.activeSource === 'AI' &&
          asset.source === ('AI_GENERATED' as AssetSource)) ||
        (filters.activeSource === 'LOCAL' &&
          asset.source === ('LOCAL' as AssetSource));

      // Search filter
      const matchesSearch =
        filters.searchQuery === '' ||
        asset.name.toLowerCase().includes(filters.searchQuery.toLowerCase());

      return matchesType && matchesSource && matchesSearch;
    })
    .sort((a, b) => {
      switch (filters.sortBy) {
        case 'DATE_DESC':
          return b.createdAt - a.createdAt;
        case 'DATE_ASC':
          return a.createdAt - b.createdAt;
        case 'NAME_ASC':
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });

  return {
    assets: filtered,
    count: filtered.length,
    isEmpty: filtered.length === 0,
  };
}

/**
 * Download Asset
 * 下载素材到本地
 */
export function downloadAsset(asset: Asset): void {
  const link = document.createElement('a');
  link.href = asset.url;
  link.download = asset.name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Generate Asset Name from Prompt
 * 从提示词生成素材名称
 */
export function generateAssetNameFromPrompt(
  prompt: string | undefined,
  type: AssetType,
): string {
  if (prompt && prompt.length > 0) {
    const truncated = prompt.substring(0, ASSET_CONSTANTS.PROMPT_NAME_MAX_LENGTH);
    return truncated.length < prompt.length ? `${truncated}...` : truncated;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const format =
    type === 'IMAGE'
      ? ASSET_CONSTANTS.DEFAULT_IMAGE_NAME_FORMAT
      : ASSET_CONSTANTS.DEFAULT_VIDEO_NAME_FORMAT;

  return format.replace('{timestamp}', timestamp);
}

/**
 * Format File Size
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Format Date
 * 格式化日期为 YYYY-MM-DD HH:mm:ss 格式
 */
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
