/**
 * Unit tests for Tracking Utilities
 * Feature: 005-declarative-tracking
 */

import {
  TrackingDebouncer,
  shouldAutoTrack,
  isExcluded,
  generateAutoEventName,
  sanitizeEventName,
  getElementSelector,
  parseTrackParams,
  generateEventId,
  getSessionId,
  getViewport,
} from '../tracking-utils';

describe('TrackingDebouncer', () => {
  let debouncer: TrackingDebouncer;
  let element: HTMLElement;

  beforeEach(() => {
    debouncer = new TrackingDebouncer(500);
    element = document.createElement('button');
  });

  it('should allow first event', () => {
    expect(debouncer.shouldTrack(element, 'test_event')).toBe(true);
  });

  it('should debounce within debounce window', () => {
    jest.useFakeTimers();
    const now = Date.now();
    jest.setSystemTime(now);

    expect(debouncer.shouldTrack(element, 'test_event')).toBe(true);

    // Within 500ms, should be debounced
    jest.setSystemTime(now + 300);
    expect(debouncer.shouldTrack(element, 'test_event')).toBe(false);

    jest.useRealTimers();
  });

  it('should allow event after debounce window', () => {
    jest.useFakeTimers();
    const now = Date.now();
    jest.setSystemTime(now);

    expect(debouncer.shouldTrack(element, 'test_event')).toBe(true);

    // After 600ms, should allow
    jest.setSystemTime(now + 600);
    expect(debouncer.shouldTrack(element, 'test_event')).toBe(true);

    jest.useRealTimers();
  });

  it('should track different events independently', () => {
    expect(debouncer.shouldTrack(element, 'event1')).toBe(true);
    expect(debouncer.shouldTrack(element, 'event2')).toBe(true);
  });

  it('should clear debounce state', () => {
    jest.useFakeTimers();
    const now = Date.now();
    jest.setSystemTime(now);

    debouncer.shouldTrack(element, 'test_event');
    debouncer.clear(element);

    // Advance time past global debounce window (200ms)
    jest.setSystemTime(now + 300);

    // Should allow after clear and past global debounce
    expect(debouncer.shouldTrack(element, 'test_event')).toBe(true);

    jest.useRealTimers();
  });
});

describe('shouldAutoTrack', () => {
  it('should auto-track button element', () => {
    const button = document.createElement('button');
    expect(shouldAutoTrack(button, [])).toBe(true);
  });

  it('should auto-track link element', () => {
    const link = document.createElement('a');
    link.href = '#';
    expect(shouldAutoTrack(link, [])).toBe(true);
  });

  it('should auto-track element with role="button"', () => {
    const div = document.createElement('div');
    div.setAttribute('role', 'button');
    expect(shouldAutoTrack(div, [])).toBe(true);
  });

  it('should not auto-track excluded elements', () => {
    const button = document.createElement('button');
    button.setAttribute('data-track-ignore', '');
    expect(shouldAutoTrack(button, ['[data-track-ignore]'])).toBe(false);
  });

  it('should not auto-track element in nav', () => {
    const nav = document.createElement('nav');
    const button = document.createElement('button');
    nav.appendChild(button);
    document.body.appendChild(nav);

    expect(shouldAutoTrack(button, ['nav'])).toBe(false);

    document.body.removeChild(nav);
  });

  it('should not auto-track non-interactive elements', () => {
    const div = document.createElement('div');
    expect(shouldAutoTrack(div, [])).toBe(false);
  });
});

describe('isExcluded', () => {
  it('should exclude element matching selector', () => {
    const button = document.createElement('button');
    button.className = 'toolbar-btn';
    expect(isExcluded(button, ['.toolbar-btn'])).toBe(true);
  });

  it('should exclude element in excluded parent', () => {
    const nav = document.createElement('nav');
    const button = document.createElement('button');
    nav.appendChild(button);
    document.body.appendChild(nav);

    expect(isExcluded(button, ['nav'])).toBe(true);

    document.body.removeChild(nav);
  });

  it('should not exclude non-matching element', () => {
    const button = document.createElement('button');
    expect(isExcluded(button, ['nav', 'header'])).toBe(false);
  });
});

describe('generateAutoEventName', () => {
  it('should use element ID', () => {
    const button = document.createElement('button');
    button.id = 'save-btn';
    expect(generateAutoEventName(button)).toBe('auto_click_save-btn');
  });

  it('should use aria-label if no ID', () => {
    const button = document.createElement('button');
    button.setAttribute('aria-label', 'Save Document');
    expect(generateAutoEventName(button)).toBe('auto_click_save_document');
  });

  it('should use text content if no ID or aria-label', () => {
    const button = document.createElement('button');
    button.textContent = 'Click Me';
    expect(generateAutoEventName(button)).toBe('auto_click_click_me');
  });

  it('should use tag name if no other identifier', () => {
    const button = document.createElement('button');
    expect(generateAutoEventName(button)).toContain('auto_click_button');
  });

  it('should use custom event type', () => {
    const button = document.createElement('button');
    button.id = 'hover-btn';
    expect(generateAutoEventName(button, 'hover')).toBe('auto_hover_hover-btn');
  });

  it('should truncate long text content', () => {
    const button = document.createElement('button');
    button.textContent = 'This is a very long button text that should be truncated';
    const eventName = generateAutoEventName(button);
    expect(typeof eventName).toBe('string');
    expect(eventName.length).toBeGreaterThan(0);
    expect(eventName.length).toBeLessThan(60);
  });
});

describe('sanitizeEventName', () => {
  it('should convert to lowercase', () => {
    expect(sanitizeEventName('Button Click')).toBe('button_click');
  });

  it('should replace spaces with underscores', () => {
    expect(sanitizeEventName('save document')).toBe('save_document');
  });

  it('should remove special characters', () => {
    expect(sanitizeEventName('save@#$%document!')).toBe('savedocument');
  });

  it('should truncate to 50 characters', () => {
    const longName = 'a'.repeat(100);
    expect(sanitizeEventName(longName)).toHaveLength(50);
  });
});

describe('getElementSelector', () => {
  it('should use ID if available', () => {
    const button = document.createElement('button');
    button.id = 'save-btn';
    expect(getElementSelector(button)).toBe('#save-btn');
  });

  it('should use tag and class', () => {
    const button = document.createElement('button');
    button.className = 'primary-btn';
    const selector = getElementSelector(button);
    expect(selector).toContain('button.primary-btn');
  });

  it('should build path from parent', () => {
    const div = document.createElement('div');
    div.className = 'container';
    const button = document.createElement('button');
    button.className = 'btn';
    div.appendChild(button);
    document.body.appendChild(div);

    const selector = getElementSelector(button);
    expect(selector).toContain('button.btn');

    document.body.removeChild(div);
  });
});

describe('parseTrackParams', () => {
  it('should parse valid JSON', () => {
    const button = document.createElement('button');
    button.setAttribute('track-params', '{"key": "value", "count": 123}');

    const params = parseTrackParams(button);
    expect(params).toEqual({ key: 'value', count: 123 });
  });

  it('should return null for invalid JSON', () => {
    const button = document.createElement('button');
    button.setAttribute('track-params', 'invalid json');

    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation();
    const params = parseTrackParams(button);

    expect(params).toBeNull();
    expect(consoleWarn).toHaveBeenCalled();

    consoleWarn.mockRestore();
  });

  it('should return null if attribute missing', () => {
    const button = document.createElement('button');
    const params = parseTrackParams(button);
    expect(params).toBeNull();
  });
});

describe('generateEventId', () => {
  it('should generate unique IDs', () => {
    const id1 = generateEventId();
    const id2 = generateEventId();
    expect(id1).not.toBe(id2);
  });

  it('should include timestamp', () => {
    const id = generateEventId();
    expect(id).toMatch(/^\d+-/);
  });
});

describe('getSessionId', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('should generate session ID if not exists', () => {
    const sessionId = getSessionId();
    expect(sessionId).toBeTruthy();
    expect(sessionStorage.getItem('tracking_session_id')).toBe(sessionId);
  });

  it('should reuse existing session ID', () => {
    const sessionId1 = getSessionId();
    const sessionId2 = getSessionId();
    expect(sessionId1).toBe(sessionId2);
  });
});

describe('getViewport', () => {
  it('should return viewport dimensions', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1920,
    });
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 1080,
    });

    const viewport = getViewport();
    expect(viewport).toEqual({ width: 1920, height: 1080 });
  });
});
