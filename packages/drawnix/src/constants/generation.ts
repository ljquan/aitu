/**
 * Generation Constants
 *
 * Constants for AI image/video generation configuration.
 */

/**
 * Generation count configuration
 */
export const GENERATION_COUNT = {
  /** Minimum generation count */
  MIN: 1,
  /** Maximum generation count */
  MAX: 8,
  /** Default generation count */
  DEFAULT: 1,
  /** Preset options for quick selection */
  PRESETS: [1, 2, 4] as const
};

/**
 * Storage key for user's generation count preference
 */
export const GENERATION_COUNT_STORAGE_KEY = 'aitu_generation_count_preference';
