/**
 * Type definitions for declarative tracking system
 * Feature: 005-declarative-tracking
 * Purpose: Define interfaces for tracking events, configuration, and state
 */

/**
 * Supported event types for tracking
 */
export type TrackEventType = 'click' | 'hover' | 'focus' | 'blur' | 'input' | 'submit';

/**
 * Metadata automatically injected into each tracking event
 */
export interface TrackEventMetadata {
  /** Event trigger timestamp */
  timestamp: number;

  /** Current page full URL */
  url: string;

  /** Project version number */
  version: string;

  /** User session ID */
  sessionId: string;

  /** Browser User-Agent (optional) */
  userAgent?: string;

  /** Viewport dimensions (optional) */
  viewport?: {
    width: number;
    height: number;
  };

  /** Event type (click, hover, focus, etc.) */
  eventType: TrackEventType;
}

/**
 * Core tracking event object
 */
export interface TrackEvent {
  /** Event name (manually specified or auto-generated) */
  eventName: string;

  /** Event parameters (from track-params attribute, optional) */
  params?: Record<string, any>;

  /** Metadata (auto-injected) */
  metadata: TrackEventMetadata;

  /** Event ID (for deduplication and cache management) */
  id: string;

  /** Event creation timestamp */
  createdAt: number;
}

/**
 * Retry policy configuration
 */
export interface RetryPolicy {
  /** Maximum retry attempts */
  maxRetries: number;

  /** Retry interval in milliseconds */
  retryInterval: number;

  /** Enable exponential backoff (retry interval * 2^attempt) */
  exponentialBackoff: boolean;
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  /** Cache limit (number of events) */
  maxCacheSize: number;

  /** Cache retention time in milliseconds */
  cacheTTL: number;

  /** Storage key name */
  storageKey: string;
}

/**
 * Batch upload configuration
 */
export interface BatchConfig {
  /** Batch size (number of events) */
  batchSize: number;

  /** Batch timeout in milliseconds */
  batchTimeout: number;

  /** Enable batch upload */
  enabled: boolean;
}

/**
 * Global tracking configuration
 */
export interface TrackConfig {
  /** Enable auto-tracking */
  autoTrack: boolean;

  /** Umami API endpoint for reporting */
  apiEndpoint: string;

  /** Umami website ID */
  websiteId: string;

  /** Debounce time in milliseconds */
  debounceTime: number;

  /** Retry policy */
  retryPolicy: RetryPolicy;

  /** Cache configuration */
  cacheConfig: CacheConfig;

  /** Log level */
  logLevel: 'error' | 'debug' | 'silent';

  /** Batch upload configuration */
  batchConfig: BatchConfig;

  /** Auto-tracking exclusion zones (CSS selectors) */
  excludedSelectors: string[];

  /** Project version number (auto-injected or manually configured) */
  version?: string;

  /** Enable development mode (verbose logging) */
  devMode: boolean;
}

/**
 * Tracked element information
 */
export interface TrackedElement {
  /** Element reference (WeakRef to avoid memory leaks) */
  elementRef: WeakRef<Element>;

  /** Event name */
  eventName: string;

  /** Event parameters (optional) */
  params?: Record<string, any>;

  /** Listened event types */
  eventTypes: TrackEventType[];

  /** Is auto-tracked */
  isAutoTracked: boolean;

  /** Last triggered timestamp (for debouncing) */
  lastTriggeredAt: number;

  /** Element selector (for debugging) */
  selector: string;
}

/**
 * Cached event (failed upload, stored in IndexedDB)
 */
export interface CachedEvent {
  /** Event data */
  event: TrackEvent;

  /** Cache timestamp */
  cachedAt: number;

  /** Retry count */
  retryCount: number;

  /** Last retry timestamp */
  lastRetryAt?: number;

  /** Failure reason (for debugging) */
  failureReason?: string;
}

/**
 * Tracking statistics
 */
export interface TrackingStats {
  /** Total events since startup */
  totalEvents: number;

  /** Successful uploads */
  successfulUploads: number;

  /** Failed uploads */
  failedUploads: number;

  /** Batch upload count */
  batchUploadCount: number;

  /** Debounced events count */
  debouncedEvents: number;
}

/**
 * Tracking system runtime state
 */
export interface TrackingState {
  /** Initialized */
  initialized: boolean;

  /** Current configuration */
  config: TrackConfig;

  /** Pending events queue */
  pendingEvents: TrackEvent[];

  /** Uploading (prevent concurrent uploads) */
  uploading: boolean;

  /** Cached event count */
  cachedEventCount: number;

  /** Statistics */
  stats: TrackingStats;
}
