/**
 * Default configuration for tracking system
 * Feature: 005-declarative-tracking
 */

import type { TrackConfig } from '../../types/tracking.types';

/**
 * Default tracking configuration
 * Can be overridden when initializing the tracking system
 */
export const DEFAULT_TRACK_CONFIG: TrackConfig = {
  /** Auto-tracking disabled by default */
  autoTrack: false,

  /** Umami default endpoint */
  apiEndpoint: '/api/send',

  /** Website ID must be configured by user */
  websiteId: '',

  /** Debounce time: 500ms */
  debounceTime: 500,

  /** Retry policy */
  retryPolicy: {
    maxRetries: 3,
    retryInterval: 2000, // 2 seconds
    exponentialBackoff: true,
  },

  /** Cache configuration */
  cacheConfig: {
    maxCacheSize: 100, // Maximum 100 events
    cacheTTL: 60 * 60 * 1000, // 1 hour
    storageKey: 'tracking_cache',
  },

  /** Log level: error only in production */
  logLevel: 'error',

  /** Batch upload configuration */
  batchConfig: {
    batchSize: 10, // 10 events
    batchTimeout: 5000, // 5 seconds
    enabled: true,
  },

  /** Excluded selectors for auto-tracking */
  excludedSelectors: [
    'nav',
    'header',
    'footer',
    '[data-track-ignore]',
  ],

  /** Development mode disabled by default */
  devMode: false,
};

/**
 * Get version from environment variable or fallback
 */
export function getVersion(): string {
  return typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
}

/**
 * Merge user config with defaults
 */
export function mergeConfig(userConfig: Partial<TrackConfig>): TrackConfig {
  return {
    ...DEFAULT_TRACK_CONFIG,
    ...userConfig,
    retryPolicy: {
      ...DEFAULT_TRACK_CONFIG.retryPolicy,
      ...(userConfig.retryPolicy || {}),
    },
    cacheConfig: {
      ...DEFAULT_TRACK_CONFIG.cacheConfig,
      ...(userConfig.cacheConfig || {}),
    },
    batchConfig: {
      ...DEFAULT_TRACK_CONFIG.batchConfig,
      ...(userConfig.batchConfig || {}),
    },
  };
}
