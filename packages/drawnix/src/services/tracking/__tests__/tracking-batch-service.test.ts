/**
 * Unit tests for Batch Upload Service
 * Feature: 005-declarative-tracking
 */

import { TrackingBatchService } from '../tracking-batch-service';
import { posthogAdapter } from '../posthog-adapter';
import type { TrackEvent, BatchConfig } from '../../../types/tracking.types';

jest.mock('../posthog-adapter');

describe('TrackingBatchService', () => {
  let service: TrackingBatchService;
  let mockConfig: BatchConfig;
  let mockEvent: TrackEvent;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();

    mockConfig = {
      enabled: true,
      batchSize: 10,
      batchTimeout: 5000,
    };

    service = new TrackingBatchService(mockConfig);

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

    (posthogAdapter.trackBatch as jest.Mock).mockResolvedValue([{ success: true }]);
  });

  afterEach(() => {
    jest.useRealTimers();
    service.clear();
  });

  describe('enqueue', () => {
    it('should enqueue event and start timeout timer', () => {
      service.enqueue(mockEvent);

      expect(service.getQueueSize()).toBe(1);
    });

    it('should flush when queue reaches batchSize', async () => {
      for (let i = 0; i < 10; i++) {
        service.enqueue({ ...mockEvent, id: `event-${i}` });
      }

      // Wait for async flush
      await jest.runAllTimersAsync();

      expect(service.getQueueSize()).toBe(0);
      expect(posthogAdapter.trackBatch).toHaveBeenCalledTimes(1);
    });

    it('should flush on timeout', async () => {
      service.enqueue(mockEvent);

      expect(service.getQueueSize()).toBe(1);

      // Advance timer by 5 seconds
      jest.advanceTimersByTime(5000);
      await jest.runAllTimersAsync();

      expect(service.getQueueSize()).toBe(0);
      expect(posthogAdapter.trackBatch).toHaveBeenCalled();
    });

    it('should upload immediately when batch is disabled', async () => {
      const disabledConfig = { ...mockConfig, enabled: false };
      const disabledService = new TrackingBatchService(disabledConfig);

      (posthogAdapter.track as jest.Mock) = jest.fn().mockResolvedValue(undefined);

      disabledService.enqueue(mockEvent);
      await jest.runAllTimersAsync();

      expect(disabledService.getQueueSize()).toBe(0);
    });
  });

  describe('flush', () => {
    it('should upload all queued events', async () => {
      const events = [
        { ...mockEvent, id: 'event-1' },
        { ...mockEvent, id: 'event-2' },
        { ...mockEvent, id: 'event-3' },
      ];

      events.forEach((e) => service.enqueue(e));

      expect(service.getQueueSize()).toBe(3);

      await service.flush();
      await jest.runAllTimersAsync();

      expect(service.getQueueSize()).toBe(0);
      expect(posthogAdapter.trackBatch).toHaveBeenCalledWith(events);
    });

    it('should handle empty queue', async () => {
      await service.flush();

      expect(posthogAdapter.trackBatch).not.toHaveBeenCalled();
    });

    it('should prevent concurrent flushes', async () => {
      service.enqueue(mockEvent);

      const flush1 = service.flush();
      const flush2 = service.flush();

      await Promise.all([flush1, flush2]);
      await jest.runAllTimersAsync();

      expect(posthogAdapter.trackBatch).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateConfig', () => {
    it('should update batch configuration', () => {
      service.updateConfig({ batchSize: 20 });

      // Queue should not flush until 20 events
      for (let i = 0; i < 15; i++) {
        service.enqueue({ ...mockEvent, id: `event-${i}` });
      }

      expect(service.getQueueSize()).toBe(15);
    });

    it('should flush immediately when batch is disabled', async () => {
      service.enqueue(mockEvent);
      expect(service.getQueueSize()).toBe(1);

      service.updateConfig({ enabled: false });
      await jest.runAllTimersAsync();

      expect(service.getQueueSize()).toBe(0);
    });
  });

  describe('clear', () => {
    it('should clear queue and cancel timer', () => {
      service.enqueue(mockEvent);
      expect(service.getQueueSize()).toBe(1);

      service.clear();

      expect(service.getQueueSize()).toBe(0);
      expect(service.isUploading()).toBe(false);
    });
  });
});
