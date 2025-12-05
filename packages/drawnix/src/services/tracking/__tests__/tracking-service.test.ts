/**
 * Unit tests for Core Tracking Service
 * Feature: 005-declarative-tracking
 */

import { TrackingService, resetTrackingService } from '../tracking-service';
import type { TrackConfig } from '../../../types/tracking.types';

// Mock dependencies
jest.mock('../umami-adapter');
jest.mock('localforage');

describe('TrackingService', () => {
  let service: TrackingService;
  let mockConfig: Partial<TrackConfig>;

  beforeEach(() => {
    // Setup DOM
    document.body.innerHTML = '';

    mockConfig = {
      devMode: true,
      logLevel: 'debug',
      debounceTime: 500,
      excludedSelectors: ['nav', '[data-track-ignore]'],
    };

    service = new TrackingService(mockConfig);
    service.initialize();
  });

  afterEach(() => {
    service.destroy();
    resetTrackingService();
    document.body.innerHTML = '';
  });

  describe('initialization', () => {
    it('should initialize tracking service', () => {
      const state = service.getState();
      state.subscribe((s) => {
        expect(s.initialized).toBe(true);
      });
    });

    it('should not re-initialize if already initialized', () => {
      const consoleLog = jest.spyOn(console, 'log').mockImplementation();

      service.initialize();

      expect(consoleLog).toHaveBeenCalledWith(
        '[Tracking]',
        expect.stringContaining('already initialized')
      );

      consoleLog.mockRestore();
    });
  });

  describe('track attribute parsing', () => {
    it('should track click on element with track attribute', () => {
      const button = document.createElement('button');
      button.setAttribute('track', 'button_click_test');
      document.body.appendChild(button);

      const trackSpy = jest.spyOn(service as any, 'track');

      button.click();

      expect(trackSpy).toHaveBeenCalled();
      const event = trackSpy.mock.calls[0][0];
      expect(event.eventName).toBe('button_click_test');
    });

    it('should not track click on element without track attribute', () => {
      const button = document.createElement('button');
      document.body.appendChild(button);

      const trackSpy = jest.spyOn(service as any, 'track');

      button.click();

      expect(trackSpy).not.toHaveBeenCalled();
    });

    it('should track on closest element with track attribute', () => {
      const button = document.createElement('button');
      button.setAttribute('track', 'button_click');
      const span = document.createElement('span');
      span.textContent = 'Click me';
      button.appendChild(span);
      document.body.appendChild(button);

      const trackSpy = jest.spyOn(service as any, 'track');

      span.click();

      expect(trackSpy).toHaveBeenCalled();
      const event = trackSpy.mock.calls[0][0];
      expect(event.eventName).toBe('button_click');
    });
  });

  describe('metadata injection', () => {
    it('should inject version metadata', () => {
      const button = document.createElement('button');
      button.setAttribute('track', 'test_event');
      document.body.appendChild(button);

      const trackSpy = jest.spyOn(service as any, 'track');

      button.click();

      const event = trackSpy.mock.calls[0][0];
      expect(event.metadata.version).toBeDefined();
      expect(typeof event.metadata.version).toBe('string');
    });

    it('should inject url metadata', () => {
      const button = document.createElement('button');
      button.setAttribute('track', 'test_event');
      document.body.appendChild(button);

      const trackSpy = jest.spyOn(service as any, 'track');

      button.click();

      const event = trackSpy.mock.calls[0][0];
      expect(event.metadata.url).toBeDefined();
      expect(event.metadata.url).toContain('localhost');
    });

    it('should inject timestamp metadata', () => {
      const button = document.createElement('button');
      button.setAttribute('track', 'test_event');
      document.body.appendChild(button);

      const trackSpy = jest.spyOn(service as any, 'track');
      const before = Date.now();

      button.click();

      const after = Date.now();
      const event = trackSpy.mock.calls[0][0];
      expect(event.metadata.timestamp).toBeGreaterThanOrEqual(before);
      expect(event.metadata.timestamp).toBeLessThanOrEqual(after);
    });

    it('should inject sessionId metadata', () => {
      const button = document.createElement('button');
      button.setAttribute('track', 'test_event');
      document.body.appendChild(button);

      const trackSpy = jest.spyOn(service as any, 'track');

      button.click();

      const event = trackSpy.mock.calls[0][0];
      expect(event.metadata.sessionId).toBeDefined();
      expect(typeof event.metadata.sessionId).toBe('string');
    });

    it('should inject viewport metadata', () => {
      const button = document.createElement('button');
      button.setAttribute('track', 'test_event');
      document.body.appendChild(button);

      const trackSpy = jest.spyOn(service as any, 'track');

      button.click();

      const event = trackSpy.mock.calls[0][0];
      expect(event.metadata.viewport).toBeDefined();
      expect(event.metadata.viewport).toHaveProperty('width');
      expect(event.metadata.viewport).toHaveProperty('height');
    });

    it('should set eventType to click', () => {
      const button = document.createElement('button');
      button.setAttribute('track', 'test_event');
      document.body.appendChild(button);

      const trackSpy = jest.spyOn(service as any, 'track');

      button.click();

      const event = trackSpy.mock.calls[0][0];
      expect(event.metadata.eventType).toBe('click');
    });
  });

  describe('event bubbling prevention', () => {
    it('should only track innermost element with track attribute', () => {
      const outer = document.createElement('div');
      outer.setAttribute('track', 'outer_click');
      const inner = document.createElement('button');
      inner.setAttribute('track', 'inner_click');
      outer.appendChild(inner);
      document.body.appendChild(outer);

      const trackSpy = jest.spyOn(service as any, 'track');

      inner.click();

      // Should only track inner element
      expect(trackSpy).toHaveBeenCalledTimes(1);
      const event = trackSpy.mock.calls[0][0];
      expect(event.eventName).toBe('inner_click');
    });
  });

  describe('debounce integration', () => {
    it('should debounce rapid clicks on same element', () => {
      jest.useFakeTimers();

      const button = document.createElement('button');
      button.setAttribute('track', 'test_event');
      document.body.appendChild(button);

      const trackSpy = jest.spyOn(service as any, 'track');

      // Click 3 times rapidly
      button.click();
      button.click();
      button.click();

      // Should only track first click (others debounced)
      expect(trackSpy).toHaveBeenCalledTimes(1);

      // Fast forward time
      jest.advanceTimersByTime(600);

      // Click again after debounce window
      button.click();

      expect(trackSpy).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });

    it('should update debounced events stat', () => {
      jest.useFakeTimers();

      const button = document.createElement('button');
      button.setAttribute('track', 'test_event');
      document.body.appendChild(button);

      button.click();
      button.click();

      const stats = service.getStats();
      expect(stats.debouncedEvents).toBe(1);

      jest.useRealTimers();
    });
  });

  describe('track-params parsing', () => {
    it('should parse valid track-params', () => {
      const button = document.createElement('button');
      button.setAttribute('track', 'test_event');
      button.setAttribute('track-params', '{"key": "value", "count": 123}');
      document.body.appendChild(button);

      const trackSpy = jest.spyOn(service as any, 'track');

      button.click();

      const event = trackSpy.mock.calls[0][0];
      expect(event.params).toEqual({ key: 'value', count: 123 });
    });

    it('should handle invalid track-params JSON', () => {
      const button = document.createElement('button');
      button.setAttribute('track', 'test_event');
      button.setAttribute('track-params', 'invalid json');
      document.body.appendChild(button);

      const consoleWarn = jest.spyOn(console, 'warn').mockImplementation();
      const trackSpy = jest.spyOn(service as any, 'track');

      button.click();

      const event = trackSpy.mock.calls[0][0];
      expect(event.params).toBeUndefined();
      expect(consoleWarn).toHaveBeenCalled();

      consoleWarn.mockRestore();
    });
  });

  describe('element exclusion', () => {
    it('should not track element with data-track-ignore', () => {
      const button = document.createElement('button');
      button.setAttribute('track', 'test_event');
      button.setAttribute('data-track-ignore', '');
      document.body.appendChild(button);

      const trackSpy = jest.spyOn(service as any, 'track');

      button.click();

      expect(trackSpy).not.toHaveBeenCalled();
    });

    it('should not track element in nav', () => {
      const nav = document.createElement('nav');
      const button = document.createElement('button');
      button.setAttribute('track', 'test_event');
      nav.appendChild(button);
      document.body.appendChild(nav);

      const trackSpy = jest.spyOn(service as any, 'track');

      button.click();

      expect(trackSpy).not.toHaveBeenCalled();
    });
  });

  describe('stats tracking', () => {
    it('should increment totalEvents stat', () => {
      const button = document.createElement('button');
      button.setAttribute('track', 'test_event');
      document.body.appendChild(button);

      button.click();

      const stats = service.getStats();
      expect(stats.totalEvents).toBe(1);
    });
  });

  describe('destroy', () => {
    it('should remove event listeners on destroy', () => {
      const button = document.createElement('button');
      button.setAttribute('track', 'test_event');
      document.body.appendChild(button);

      service.destroy();

      const trackSpy = jest.spyOn(service as any, 'track');
      button.click();

      expect(trackSpy).not.toHaveBeenCalled();
    });
  });
});
