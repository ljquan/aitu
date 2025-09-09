/**
 * Common size constants used across AI generation components
 */
export const DEFAULT_IMAGE_DIMENSIONS = {
  width: 1024,
  height: 1024
} as const;

export const DEFAULT_VIDEO_DIMENSIONS = {
  width: 400,
  height: 225
} as const;

export const SIZE_CONSTRAINTS = {
  image: {
    min: 256,
    max: 2048
  },
  video: {
    min: 256,
    max: 1920
  }
} as const;

export const INSERTION_OFFSET = 50; // px offset for element insertion

export const HISTORY_LIMIT = 50; // Maximum number of history items to keep

export const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

export const PRESET_PROMPTS_LIMIT = 12; // Maximum number of preset prompts
export const USER_PROMPTS_LIMIT = 8; // Maximum number of user prompts to show

export const SAME_ROW_THRESHOLD = 50; // px threshold for considering elements in the same row