/**
 * Storage/Cache Service
 * Feature: 005-declarative-tracking
 * Purpose: Cache failed events to IndexedDB using localforage
 */

import localforage from 'localforage';
import type { CachedEvent, TrackEvent, CacheConfig } from '../../types/tracking.types';

/**
 * Tracking Storage Service
 * Manages failed event cache in IndexedDB
 * - Maximum 100 events
 * - 1 hour TTL
 */
export class TrackingStorageService {
  private config: CacheConfig;
  private cache: LocalForage;

  constructor(config: CacheConfig) {
    this.config = config;

    // Initialize localforage instance
    this.cache = localforage.createInstance({
      name: 'aitu-tracking',
      storeName: config.storageKey,
    });
  }

  /**
   * Cache failed event
   * @param event - Event that failed to upload
   * @param failureReason - Reason for failure
   */
  async cacheEvent(event: TrackEvent, failureReason: string): Promise<void> {
    try {
      // Get existing cache
      const cached = await this.getCache();

      // Check cache size limit
      if (cached.length >= this.config.maxCacheSize) {
        // Remove oldest event
        cached.shift();
      }

      // Add new cached event
      const cachedEvent: CachedEvent = {
        event,
        cachedAt: Date.now(),
        retryCount: 0,
        failureReason,
      };

      cached.push(cachedEvent);

      // Save to IndexedDB
      await this.cache.setItem<CachedEvent[]>(this.config.storageKey, cached);
    } catch (error) {
      console.error('Failed to cache event:', error);
    }
  }

  /**
   * Get all cached events
   * Filters out expired events (TTL exceeded)
   */
  async getCache(): Promise<CachedEvent[]> {
    try {
      const cached = await this.cache.getItem<CachedEvent[]>(this.config.storageKey);
      if (!cached) {
        return [];
      }

      // Filter out expired events
      const now = Date.now();
      const validEvents = cached.filter(
        (c) => now - c.cachedAt < this.config.cacheTTL
      );

      // Save filtered cache if any events were removed
      if (validEvents.length < cached.length) {
        await this.cache.setItem<CachedEvent[]>(this.config.storageKey, validEvents);
      }

      return validEvents;
    } catch (error) {
      console.error('Failed to get cache:', error);
      return [];
    }
  }

  /**
   * Get retryable events (retry count < maxRetries)
   * @param maxRetries - Maximum retry attempts
   */
  async getRetryableEvents(maxRetries: number): Promise<CachedEvent[]> {
    const cached = await this.getCache();
    return cached.filter((c) => c.retryCount < maxRetries);
  }

  /**
   * Update cached event after retry attempt
   * @param eventId - Event ID
   * @param success - Whether retry succeeded
   */
  async updateRetryStatus(eventId: string, success: boolean): Promise<void> {
    try {
      const cached = await this.getCache();
      const index = cached.findIndex((c) => c.event.id === eventId);

      if (index === -1) {
        return;
      }

      if (success) {
        // Remove from cache if retry succeeded
        cached.splice(index, 1);
      } else {
        // Increment retry count
        cached[index].retryCount++;
        cached[index].lastRetryAt = Date.now();
      }

      await this.cache.setItem<CachedEvent[]>(this.config.storageKey, cached);
    } catch (error) {
      console.error('Failed to update retry status:', error);
    }
  }

  /**
   * Remove event from cache
   * @param eventId - Event ID to remove
   */
  async removeEvent(eventId: string): Promise<void> {
    try {
      const cached = await this.getCache();
      const filtered = cached.filter((c) => c.event.id !== eventId);
      await this.cache.setItem<CachedEvent[]>(this.config.storageKey, filtered);
    } catch (error) {
      console.error('Failed to remove event:', error);
    }
  }

  /**
   * Clear all cached events
   */
  async clearCache(): Promise<void> {
    try {
      await this.cache.removeItem(this.config.storageKey);
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    total: number;
    retryable: number;
    expired: number;
  }> {
    try {
      const allCached = await this.cache.getItem<CachedEvent[]>(this.config.storageKey) || [];
      const validCached = await this.getCache();

      return {
        total: validCached.length,
        retryable: validCached.filter((c) => c.retryCount < 3).length,
        expired: allCached.length - validCached.length,
      };
    } catch (error) {
      console.error('Failed to get cache stats:', error);
      return { total: 0, retryable: 0, expired: 0 };
    }
  }

  /**
   * Clean up expired and max-retried events
   */
  async cleanup(maxRetries: number): Promise<void> {
    try {
      const cached = await this.getCache();
      const cleaned = cached.filter((c) => c.retryCount < maxRetries);
      await this.cache.setItem<CachedEvent[]>(this.config.storageKey, cleaned);
    } catch (error) {
      console.error('Failed to cleanup cache:', error);
    }
  }
}
