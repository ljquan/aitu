/**
 * Unit tests for Umami Adapter
 * Feature: 005-declarative-tracking
 */

import { UmamiTrackingAdapter } from '../umami-adapter';
import { analytics } from '../../../utils/umami-analytics';
import type { TrackEvent } from '../../../types/tracking.types';

// Mock analytics utility
jest.mock('../../../utils/umami-analytics', () => ({
  analytics: {
    track: jest.fn(),
    isAnalyticsEnabled: jest.fn(),
  },
}));

describe('UmamiTrackingAdapter', () => {
  let adapter: UmamiTrackingAdapter;

  beforeEach(() => {
    adapter = new UmamiTrackingAdapter();
    jest.clearAllMocks();

    // Mock analytics as enabled by default
    (analytics.isAnalyticsEnabled as jest.Mock).mockReturnValue(true);
  });

  describe('isAvailable', () => {
    it('should return true when analytics is enabled', () => {
      expect(adapter.isAvailable()).toBe(true);
    });

    it('should return false when analytics is not enabled', () => {
      (analytics.isAnalyticsEnabled as jest.Mock).mockReturnValue(false);
      expect(adapter.isAvailable()).toBe(false);
    });
  });

  describe('track', () => {
    const mockEvent: TrackEvent = {
      eventName: 'test_event',
      params: { key: 'value' },
      metadata: {
        timestamp: Date.now(),
        url: 'https://example.com',
        version: '1.0.0',
        sessionId: 'session-123',
        eventType: 'click',
        viewport: { width: 1920, height: 1080 },
      },
      id: 'event-123',
      createdAt: Date.now(),
    };

    it('should track event with enriched metadata', async () => {
      await adapter.track(mockEvent);

      expect(analytics.track).toHaveBeenCalledWith('test_event', {
        key: 'value',
        version: '1.0.0',
        url: 'https://example.com',
        timestamp: mockEvent.metadata.timestamp,
        sessionId: 'session-123',
        eventType: 'click',
        viewport: '1920x1080',
      });
    });

    it('should track event without params', async () => {
      const eventWithoutParams = { ...mockEvent, params: undefined };
      await adapter.track(eventWithoutParams);

      expect(analytics.track).toHaveBeenCalledWith('test_event', expect.objectContaining({
        version: '1.0.0',
        url: 'https://example.com',
      }));
    });

    it('should track event without viewport', async () => {
      const eventWithoutViewport = {
        ...mockEvent,
        metadata: { ...mockEvent.metadata, viewport: undefined },
      };
      await adapter.track(eventWithoutViewport);

      const callArgs = (analytics.track as jest.Mock).mock.calls[0][1];
      expect(callArgs.viewport).toBeUndefined();
    });

    it('should throw error when analytics is not available', async () => {
      (analytics.isAnalyticsEnabled as jest.Mock).mockReturnValue(false);
      await expect(adapter.track(mockEvent)).rejects.toThrow('Umami SDK not loaded');
    });

    it('should rethrow error from analytics', async () => {
      const error = new Error('Network error');
      (analytics.track as jest.Mock).mockImplementation(() => {
        throw error;
      });

      await expect(adapter.track(mockEvent)).rejects.toThrow('Network error');
    });
  });

  describe('trackBatch', () => {
    const mockEvents: TrackEvent[] = [
      {
        eventName: 'event_1',
        params: {},
        metadata: {
          timestamp: Date.now(),
          url: 'https://example.com',
          version: '1.0.0',
          sessionId: 'session-123',
          eventType: 'click',
        },
        id: 'event-1',
        createdAt: Date.now(),
      },
      {
        eventName: 'event_2',
        params: {},
        metadata: {
          timestamp: Date.now(),
          url: 'https://example.com',
          version: '1.0.0',
          sessionId: 'session-123',
          eventType: 'click',
        },
        id: 'event-2',
        createdAt: Date.now(),
      },
    ];

    it('should track all events successfully', async () => {
      const results = await adapter.trackBatch(mockEvents);

      expect(results).toEqual([
        { success: true },
        { success: true },
      ]);
      expect(analytics.track).toHaveBeenCalledTimes(2);
    });

    it('should continue on individual event failure', async () => {
      let callCount = 0;
      (analytics.track as jest.Mock).mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Failed');
        }
      });

      const results = await adapter.trackBatch(mockEvents);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toBeInstanceOf(Error);
    });
  });

  describe('getSDKInfo', () => {
    it('should return SDK info when analytics is enabled', () => {
      const info = adapter.getSDKInfo();
      expect(info.available).toBe(true);
      expect(info.version).toBe('Umami v2.x');
    });

    it('should return unavailable when analytics is disabled', () => {
      (analytics.isAnalyticsEnabled as jest.Mock).mockReturnValue(false);
      const info = adapter.getSDKInfo();
      expect(info.available).toBe(false);
      expect(info.version).toBeUndefined();
    });
  });
});
