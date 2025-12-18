/**
 * localStorage 键名常量
 * 集中管理所有本地存储键名，避免硬编码和重复定义
 */

// ====================================
// 应用核心数据
// ====================================

/** 应用设置存储键 */
export const DRAWNIX_SETTINGS_KEY = 'drawnix_settings';

/** 设备唯一标识符存储键 */
export const DRAWNIX_DEVICE_ID_KEY = 'drawnix_device_id';

/** 旧版本本地数据键（用于数据迁移） */
export const OLD_DRAWNIX_LOCAL_DATA_KEY = 'drawnix-local-data';

/** 本地数据库存储名 */
export const DRAWNIX_STORE_NAME = 'drawnix_store';

// ====================================
// AI 生成功能
// ====================================

/** AI 图像生成预览缓存键 */
export const AI_IMAGE_GENERATION_PREVIEW_CACHE_KEY = 'ai_image_generation_preview_cache';

/** AI 视频生成预览缓存键 */
export const AI_VIDEO_GENERATION_PREVIEW_CACHE_KEY = 'ai_video_generation_preview_cache';

/** AI 图像生成历史记录键 */
export const AI_IMAGE_GENERATION_HISTORY_KEY = 'ai_image_generation_history';

/** AI 视频生成历史记录键 */
export const AI_VIDEO_GENERATION_HISTORY_KEY = 'ai_video_generation_history';

/** AI 图像生成模式记忆键（单图/批量） */
export const AI_IMAGE_MODE_CACHE_KEY = 'ai-image-generation-mode';

// ====================================
// 导出所有键名（用于批量操作或调试）
// ====================================

/** 所有 localStorage 键名 */
export const ALL_STORAGE_KEYS = [
  DRAWNIX_SETTINGS_KEY,
  DRAWNIX_DEVICE_ID_KEY,
  OLD_DRAWNIX_LOCAL_DATA_KEY,
  AI_IMAGE_GENERATION_PREVIEW_CACHE_KEY,
  AI_VIDEO_GENERATION_PREVIEW_CACHE_KEY,
  AI_IMAGE_GENERATION_HISTORY_KEY,
  AI_VIDEO_GENERATION_HISTORY_KEY,
  AI_IMAGE_MODE_CACHE_KEY,
] as const;

/** 敏感数据存储键（这些键对应的值可能包含加密数据） */
export const SENSITIVE_STORAGE_KEYS = [
  DRAWNIX_SETTINGS_KEY,
  DRAWNIX_DEVICE_ID_KEY,
] as const;