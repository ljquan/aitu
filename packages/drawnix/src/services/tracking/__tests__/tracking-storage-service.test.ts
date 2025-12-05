/**
 * Unit tests for Storage/Cache Service
 * Feature: 005-declarative-tracking
 */

import { TrackingStorageService } from '../tracking-storage-service';
import type { TrackEvent, CacheConfig } from '../../../types/tracking.types';
import localforage from 'localforage';

jest.mock('localforage');

describe('TrackingStorageService', () => {
  let service: TrackingStorageService;
  let mockConfig: CacheConfig;
  let mockEvent: TrackEvent;
  let mockCache: any;

  beforeEach(() => {
    mockConfig = {
      maxCacheSize: 100,
      cacheTTL: 60 * 60 * 1000, // 1 hour
      storageKey: 'tracking_cache',
    };

    mockEvent = {
      eventName: 'test_event',
      params: {},
      metadata: {
        timestamp: Date.now(),
        url: 'https://example.com',
        version: '1.0.0',
        sessionId: 'session-123',
        eventType: 'click',
      },
      id: 'event-123',
      createdAt: Date.now(),
    };

    mockCache = {
      getItem: jest.fn().mockResolvedValue(null),
      setItem: jest.fn().mockResolvedValue(undefined),
      removeItem: jest.fn().mockResolvedValue(undefined),
    };

    (localforage.createInstance as jest.Mock).mockReturnValue(mockCache);

    service = new TrackingStorageService(mockConfig);
  });

  describe('cacheEvent', () => {
    it('should cache failed event', async () => {
      await service.cacheEvent(mockEvent, 'Network error');

      expect(mockCache.setItem).toHaveBeenCalledWith(
        mockConfig.storageKey,
        expect.arrayContaining([
          expect.objectContaining({
            event: mockEvent,
            retryCount: 0,
            failureReason: 'Network error',
          }),
        ])
      );
    });

    it('should remove oldest event when cache is full', async () => {
      const existingCache = Array(100).fill(null).map((_, i) => ({
        event: { ...mockEvent, id: `event-${i}` },
        cachedAt: Date.now() - i * 1000,
        retryCount: 0,
      }));

      mockCache.getItem.mockResolvedValue(existingCache);

      await service.cacheEvent(mockEvent, 'Network error');

      const savedCache = mockCache.setItem.mock.calls[0][1];
      expect(savedCache).toHaveLength(100);
      expect(savedCache[0].event.id).not.toBe('event-0'); // Oldest removed
    });
  });

  describe('getCache', () => {
    it('should return cached events', async () => {
      const cachedEvents = [
        {
          event: mockEvent,
          cachedAt: Date.now(),
          retryCount: 0,
        },
      ];

      mockCache.getItem.mockResolvedValue(cachedEvents);

      const result = await service.getCache();

      expect(result).toEqual(cachedEvents);
    });

    it('should filter out expired events', async () => {
      const now = Date.now();
      const cachedEvents = [
        {
          event: { ...mockEvent, id: 'event-1' },
          cachedAt: now - 2 * 60 * 60 * 1000, // 2 hours ago (expired)
          retryCount: 0,
        },
        {
          event: { ...mockEvent, id: 'event-2' },
          cachedAt: now - 30 * 60 * 1000, // 30 minutes ago (valid)
          retryCount: 0,
        },
      ];

      mockCache.getItem.mockResolvedValue(cachedEvents);

      const result = await service.getCache();

      expect(result).toHaveLength(1);
      expect(result[0].event.id).toBe('event-2');
    });

    it('should return empty array when cache is empty', async () => {
      mockCache.getItem.mockResolvedValue(null);

      const result = await service.getCache();

      expect(result).toEqual([]);
    });
  });

  describe('getRetryableEvents', () => {
    it('should return events below max retry count', async () => {
      const cachedEvents = [
        {
          event: { ...mockEvent, id: 'event-1' },
          cachedAt: Date.now(),
          retryCount: 1,
        },
        {
          event: { ...mockEvent, id: 'event-2' },
          cachedAt: Date.now(),
          retryCount: 3,
        },
      ];

      mockCache.getItem.mockResolvedValue(cachedEvents);

      const result = await service.getRetryableEvents(3);

      expect(result).toHaveLength(1);
      expect(result[0].event.id).toBe('event-1');
    });
  });

  describe('updateRetryStatus', () => {
    it('should remove event on successful retry', async () => {
      const cachedEvents = [
        {
          event: mockEvent,
          cachedAt: Date.now(),
          retryCount: 1,
        },
      ];

      mockCache.getItem.mockResolvedValue(cachedEvents);

      await service.updateRetryStatus('event-123', true);

      const savedCache = mockCache.setItem.mock.calls[0][1];
      expect(savedCache).toHaveLength(0);
    });

    it('should increment retry count on failed retry', async () => {
      const cachedEvents = [
        {
          event: mockEvent,
          cachedAt: Date.now(),
          retryCount: 1,
        },
      ];

      mockCache.getItem.mockResolvedValue(cachedEvents);

      await service.updateRetryStatus('event-123', false);

      const savedCache = mockCache.setItem.mock.calls[0][1];
      expect(savedCache[0].retryCount).toBe(2);
      expect(savedCache[0].lastRetryAt).toBeDefined();
    });
  });

  describe('removeEvent', () => {
    it('should remove specific event from cache', async () => {
      const cachedEvents = [
        {
          event: { ...mockEvent, id: 'event-1' },
          cachedAt: Date.now(),
          retryCount: 0,
        },
        {
          event: { ...mockEvent, id: 'event-2' },
          cachedAt: Date.now(),
          retryCount: 0,
        },
      ];

      mockCache.getItem.mockResolvedValue(cachedEvents);

      await service.removeEvent('event-1');

      const savedCache = mockCache.setItem.mock.calls[0][1];
      expect(savedCache).toHaveLength(1);
      expect(savedCache[0].event.id).toBe('event-2');
    });
  });

  describe('clearCache', () => {
    it('should clear all cached events', async () => {
      await service.clearCache();

      expect(mockCache.removeItem).toHaveBeenCalledWith(mockConfig.storageKey);
    });
  });

  describe('getCacheStats', () => {
    it('should return cache statistics', async () => {
      const now = Date.now();
      const cachedEvents = [
        {
          event: { ...mockEvent, id: 'event-1' },
          cachedAt: now - 30 * 60 * 1000, // Valid
          retryCount: 1,
        },
        {
          event: { ...mockEvent, id: 'event-2' },
          cachedAt: now - 2 * 60 * 60 * 1000, // Expired
          retryCount: 0,
        },
        {
          event: { ...mockEvent, id: 'event-3' },
          cachedAt: now - 10 * 60 * 1000, // Valid
          retryCount: 0,
        },
      ];

      mockCache.getItem.mockResolvedValue(cachedEvents);

      const stats = await service.getCacheStats();

      expect(stats.total).toBe(2); // Only valid events
      expect(stats.retryable).toBe(2);
      expect(stats.expired).toBe(1);
    });
  });

  describe('cleanup', () => {
    it('should remove max-retried events', async () => {
      const cachedEvents = [
        {
          event: { ...mockEvent, id: 'event-1' },
          cachedAt: Date.now(),
          retryCount: 1,
        },
        {
          event: { ...mockEvent, id: 'event-2' },
          cachedAt: Date.now(),
          retryCount: 3,
        },
      ];

      mockCache.getItem.mockResolvedValue(cachedEvents);

      await service.cleanup(3);

      const savedCache = mockCache.setItem.mock.calls[0][1];
      expect(savedCache).toHaveLength(1);
      expect(savedCache[0].event.id).toBe('event-1');
    });
  });
});
