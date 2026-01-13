/**
 * Tracking Utilities
 * Feature: 005-declarative-tracking
 * Purpose: Utility functions for debouncing, element selection, and auto event naming
 */

import type { TrackEventType } from '../../types/tracking.types';

/**
 * Debounce Manager using WeakMap
 * Prevents duplicate event tracking within debounce time
 * Uses WeakMap to avoid memory leaks (auto cleanup when element is removed)
 */
export class TrackingDebouncer {
  private debounceMap = new WeakMap<Element, Map<string, number>>();
  private globalDebounceMap = new Map<string, number>(); // Global event name debounce
  private readonly debounceTime: number;
  private readonly globalDebounceTime: number = 200; // 200ms window to prevent duplicate events

  constructor(debounceTime: number = 500) {
    this.debounceTime = debounceTime;
  }

  /**
   * Check if event should be tracked (not within debounce window)
   * @param element - DOM element
   * @param eventName - Event name
   * @param devMode - Enable debug logging
   * @returns true if should track, false if debounced
   */
  shouldTrack(element: Element, eventName: string, devMode: boolean = false): boolean {
    const now = Date.now();

    // First check: Global event name debounce (prevents duplicate events within 200ms)
    const lastGlobalTimestamp = this.globalDebounceMap.get(eventName);
    if (lastGlobalTimestamp && now - lastGlobalTimestamp < this.globalDebounceTime) {
      // Same event name triggered within 200ms, likely a duplicate
      if (devMode) {
        console.warn(`[Tracking] 🚫 Global debounce: ${eventName} (${now - lastGlobalTimestamp}ms ago)`);
      }
      return false;
    }

    // Second check: Element-specific debounce (prevents rapid clicks on same element)
    const eventMap = this.debounceMap.get(element);

    if (!eventMap) {
      // First time tracking this element
      const newMap = new Map<string, number>();
      newMap.set(eventName, now);
      this.debounceMap.set(element, newMap);
      this.globalDebounceMap.set(eventName, now);
      // if (devMode) {
      //   console.log(`[Tracking] ✅ New element: ${eventName}`);
      // }
      return true;
    }

    const lastTimestamp = eventMap.get(eventName);
    if (!lastTimestamp || now - lastTimestamp > this.debounceTime) {
      // Outside debounce window, track it
      eventMap.set(eventName, now);
      this.globalDebounceMap.set(eventName, now);
      // if (devMode) {
      //   console.log(`[Tracking] ✅ Track: ${eventName}`);
      // }
      return true;
    }

    // Within debounce window, skip
    if (devMode) {
      console.warn(`[Tracking] 🚫 Element debounce: ${eventName} (${now - lastTimestamp}ms ago)`);
    }
    return false;
  }

  /**
   * Clear debounce state for an element
   */
  clear(element: Element): void {
    this.debounceMap.delete(element);
  }

  /**
   * Update debounce time
   */
  setDebounceTime(time: number): void {
    (this as any).debounceTime = time;
  }
}

/**
 * Auto-tracking selector for clickable elements
 * Matches: button, a, input[type="button"], [role="button"], [onClick]
 */
export const AUTO_TRACK_SELECTOR = [
  'button:not([data-track-ignore])',
  'a:not([data-track-ignore])',
  'input[type="button"]:not([data-track-ignore])',
  'input[type="submit"]:not([data-track-ignore])',
  '[role="button"]:not([data-track-ignore])',
  '[role="link"]:not([data-track-ignore])',
].join(', ');

/**
 * Check if element should be auto-tracked
 * @param element - DOM element to check
 * @param excludedSelectors - Array of CSS selectors to exclude
 * @returns true if element should be auto-tracked
 */
export function shouldAutoTrack(
  element: Element,
  excludedSelectors: string[]
): boolean {
  // Check if element matches auto-track selector
  if (!element.matches(AUTO_TRACK_SELECTOR)) {
    return false;
  }

  // Check if element or ancestor is in exclusion zone
  for (const selector of excludedSelectors) {
    if (element.matches(selector) || element.closest(selector)) {
      return false;
    }
  }

  // Check for explicit opt-out attribute
  if (element.hasAttribute('data-track-ignore')) {
    return false;
  }

  // Check if element has onClick handler (React synthetic event)
  const hasOnClick = (element as any).onclick !== null;
  if (hasOnClick) {
    return true;
  }

  return true;
}

/**
 * Check if element is in an excluded zone
 * @param element - DOM element
 * @param excludedSelectors - Array of CSS selectors to exclude
 * @returns true if element is excluded
 */
export function isExcluded(element: Element, excludedSelectors: string[]): boolean {
  for (const selector of excludedSelectors) {
    if (element.matches(selector) || element.closest(selector)) {
      return true;
    }
  }
  return false;
}

/**
 * Generate auto event name based on element characteristics
 * Priority: text content > id > aria-label > tag name
 * @param element - DOM element
 * @param eventType - Event type (click, hover, etc.)
 * @returns Generated event name
 */
export function generateAutoEventName(
  element: Element,
  eventType: TrackEventType = 'click'
): string {
  const prefix = `auto_${eventType}_`;

  // Priority 1: Element ID
  if (element.id) {
    return `${prefix}${element.id}`;
  }

  // Priority 2: aria-label
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) {
    return `${prefix}${sanitizeEventName(ariaLabel)}`;
  }

  // Priority 3: Text content (first 20 chars)
  const textContent = element.textContent?.trim();
  if (textContent && textContent.length > 0) {
    const sanitized = sanitizeEventName(textContent.substring(0, 20));
    return `${prefix}${sanitized}`;
  }

  // Priority 4: Tag name + class
  const tagName = element.tagName.toLowerCase();
  const className = element.className
    ? `.${element.className.split(' ')[0]}`
    : '';
  return `${prefix}${tagName}${className}`;
}

/**
 * Sanitize event name for analytics
 * - Convert to lowercase
 * - Replace spaces with underscores
 * - Remove special characters
 * @param name - Raw event name
 * @returns Sanitized event name
 */
export function sanitizeEventName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .substring(0, 50); // Max 50 chars
}

/**
 * Get element selector for debugging
 * @param element - DOM element
 * @returns CSS selector string
 */
export function getElementSelector(element: Element): string {
  if (element.id) {
    return `#${element.id}`;
  }

  const path: string[] = [];
  let current: Element | null = element;

  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();

    if (current.className) {
      const classes = current.className.split(' ').filter(Boolean);
      if (classes.length > 0) {
        selector += `.${classes[0]}`;
      }
    }

    path.unshift(selector);
    current = current.parentElement;
  }

  return path.join(' > ');
}

/**
 * Parse track-params attribute
 * @param element - DOM element
 * @returns Parsed params object or null if invalid JSON
 */
export function parseTrackParams(element: Element): Record<string, any> | null {
  const paramsAttr = element.getAttribute('track-params');
  if (!paramsAttr) {
    return null;
  }

  try {
    return JSON.parse(paramsAttr);
  } catch (error) {
    console.warn(`Invalid track-params JSON on element:`, element, error);
    return null;
  }
}

/**
 * Generate unique event ID (UUID v4 style)
 */
export function generateEventId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Generate session ID (if not already exists in sessionStorage)
 */
export function getSessionId(): string {
  if (typeof window === 'undefined') {
    return 'server-side';
  }

  const key = 'tracking_session_id';
  let sessionId = sessionStorage.getItem(key);

  if (!sessionId) {
    sessionId = generateEventId();
    sessionStorage.setItem(key, sessionId);
  }

  return sessionId;
}

/**
 * Get viewport dimensions
 */
export function getViewport(): { width: number; height: number } {
  if (typeof window === 'undefined') {
    return { width: 0, height: 0 };
  }

  return {
    width: window.innerWidth || 0,
    height: window.innerHeight || 0,
  };
}
