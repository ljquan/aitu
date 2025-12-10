/**
 * Core Tracking Service
 * Feature: 005-declarative-tracking
 * Purpose: Main service orchestrating event tracking, batching, and caching
 */

import { BehaviorSubject, Observable } from 'rxjs';
import type {
  TrackEvent,
  TrackConfig,
  TrackEventMetadata,
  TrackingState,
  TrackingStats,
  TrackEventType,
} from '../../types/tracking.types';
import { DEFAULT_TRACK_CONFIG, getVersion, mergeConfig } from './tracking-config';
import { TrackingBatchService } from './tracking-batch-service';
import {
  TrackingDebouncer,
  generateEventId,
  getSessionId,
  getViewport,
  getElementSelector,
  parseTrackParams,
  shouldAutoTrack,
  generateAutoEventName,
} from './tracking-utils';

/**
 * Tracking Service
 * Orchestrates the complete tracking flow:
 * 1. Capture events via event delegation
 * 2. Inject metadata (version, url, session)
 * 3. Debounce duplicate events
 * 4. Enqueue to batch service
 */
export class TrackingService {
  private config: TrackConfig;
  private batchService: TrackingBatchService;
  private debouncer: TrackingDebouncer;

  private state$ = new BehaviorSubject<TrackingState>({
    initialized: false,
    config: DEFAULT_TRACK_CONFIG,
    pendingEvents: [],
    uploading: false,
    cachedEventCount: 0,
    stats: {
      totalEvents: 0,
      successfulUploads: 0,
      failedUploads: 0,
      batchUploadCount: 0,
      debouncedEvents: 0,
    },
  });

  private clickListener: ((event: MouseEvent) => void) | null = null;
  private mutationObserver: MutationObserver | null = null;
  private attachedListeners: WeakMap<Element, Set<string>> = new WeakMap();

  constructor(userConfig: Partial<TrackConfig> = {}) {
    this.config = mergeConfig(userConfig);

    // Initialize services
    this.batchService = new TrackingBatchService(this.config.batchConfig);
    this.debouncer = new TrackingDebouncer(this.config.debounceTime);

    // Update state
    this.updateState({ config: this.config, initialized: false });
  }

  /**
   * Initialize tracking service
   * Sets up event delegation for click events
   */
  initialize(): void {
    if (this.state$.value.initialized) {
      this.log('debug', 'Tracking service already initialized');
      return;
    }

    // Setup click event delegation
    this.setupClickDelegation();

    // Setup multi-event type listeners (hover, focus, etc.)
    this.setupMultiEventListeners();

    // Setup MutationObserver for dynamic elements
    this.setupMutationObserver();

    // Setup beforeunload handler
    this.setupBeforeUnload();

    this.updateState({ initialized: true });
    this.log('debug', 'Tracking service initialized');
  }

  /**
   * Setup click event delegation
   * Listens for clicks on document body and captures data-track attribute
   */
  private setupClickDelegation(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    this.clickListener = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target) return;

      // Priority 1: Manual data-track attribute (highest priority)
      const trackElement = target.closest('[data-track]');
      if (trackElement) {
        const eventName = trackElement.getAttribute('data-track');
        if (eventName) {
          // Check if element should be excluded
          if (this.isElementExcluded(trackElement)) {
            return;
          }

          // Track the event (debouncer will prevent duplicate tracking)
          // Note: We don't call stopPropagation() to allow onClick handlers to work
          this.trackClick(trackElement, eventName);
          return;
        }
      }

      // Priority 2: Auto-tracking (if enabled)
      if (this.config.autoTrack) {
        // Check if target should be auto-tracked
        if (shouldAutoTrack(target, this.config.excludedSelectors)) {
          // Check if element should be excluded
          if (this.isElementExcluded(target)) {
            return;
          }

          // Generate auto event name
          const autoEventName = generateAutoEventName(target, 'click');

          // Track the event
          this.trackClick(target, autoEventName);
        }
      }
    };

    document.body.addEventListener('click', this.clickListener, true);
  }

  /**
   * Setup multi-event type listeners (hover, focus)
   * Scans document for elements with track-hover, track-focus attributes
   */
  private setupMultiEventListeners(): void {
    if (typeof document === 'undefined') {
      return;
    }

    // Scan for track-hover elements
    const hoverElements = document.querySelectorAll('[track-hover]');
    hoverElements.forEach((element) => {
      this.attachHoverListener(element);
    });

    // Scan for track-focus elements
    const focusElements = document.querySelectorAll('[track-focus]');
    focusElements.forEach((element) => {
      this.attachFocusListener(element);
    });
  }

  /**
   * Attach hover listener to element
   */
  private attachHoverListener(element: Element): void {
    const eventName = element.getAttribute('track-hover');
    if (!eventName) return;

    // Check if listener already attached
    if (this.hasAttachedListener(element, 'hover')) {
      return;
    }

    const listener = () => {
      // Debounce check
      if (!this.debouncer.shouldTrack(element, eventName, this.config.devMode)) {
        this.incrementStat('debouncedEvents');
        return;
      }

      const params = parseTrackParams(element);
      const trackEvent = this.createTrackEvent(eventName, params, 'hover', element);
      this.track(trackEvent);
    };

    element.addEventListener('mouseenter', listener);
    this.markListenerAttached(element, 'hover');
  }

  /**
   * Attach focus listener to element
   */
  private attachFocusListener(element: Element): void {
    const eventName = element.getAttribute('track-focus');
    if (!eventName) return;

    // Check if listener already attached
    if (this.hasAttachedListener(element, 'focus')) {
      return;
    }

    const listener = () => {
      // Debounce check
      if (!this.debouncer.shouldTrack(element, eventName, this.config.devMode)) {
        this.incrementStat('debouncedEvents');
        return;
      }

      const params = parseTrackParams(element);
      const trackEvent = this.createTrackEvent(eventName, params, 'focus', element);
      this.track(trackEvent);
    };

    element.addEventListener('focus', listener, true);
    this.markListenerAttached(element, 'focus');
  }

  /**
   * Check if listener is already attached to element
   */
  private hasAttachedListener(element: Element, eventType: string): boolean {
    const listeners = this.attachedListeners.get(element);
    return listeners ? listeners.has(eventType) : false;
  }

  /**
   * Mark listener as attached to element
   */
  private markListenerAttached(element: Element, eventType: string): void {
    let listeners = this.attachedListeners.get(element);
    if (!listeners) {
      listeners = new Set();
      this.attachedListeners.set(element, listeners);
    }
    listeners.add(eventType);
  }

  /**
   * Setup MutationObserver to detect dynamic elements
   * Watches for new elements with track-hover, track-focus attributes
   */
  private setupMutationObserver(): void {
    if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') {
      return;
    }

    this.mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;

            // Check for track-hover
            if (element.hasAttribute('track-hover')) {
              this.attachHoverListener(element);
            }

            // Check for track-focus
            if (element.hasAttribute('track-focus')) {
              this.attachFocusListener(element);
            }

            // Check descendants
            const hoverDescendants = element.querySelectorAll('[track-hover]');
            hoverDescendants.forEach((el) => this.attachHoverListener(el));

            const focusDescendants = element.querySelectorAll('[track-focus]');
            focusDescendants.forEach((el) => this.attachFocusListener(el));
          }
        });
      });
    });

    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  /**
   * Track click event on element
   * @param element - Element that was clicked
   * @param eventName - Event name from track attribute
   */
  private trackClick(element: Element, eventName: string): void {
    // Debounce check
    if (!this.debouncer.shouldTrack(element, eventName, this.config.devMode)) {
      this.incrementStat('debouncedEvents');
      this.log('debug', `Event debounced: ${eventName}`);
      return;
    }

    // Parse track-params if present
    const params = parseTrackParams(element);

    // Create tracking event
    const trackEvent = this.createTrackEvent(eventName, params, 'click', element);

    // Track the event
    this.track(trackEvent);
  }

  /**
   * Create tracking event with metadata
   * @param eventName - Event name
   * @param params - Event parameters (optional)
   * @param eventType - Event type (click, hover, etc.)
   * @param element - Element (optional, for debugging)
   */
  private createTrackEvent(
    eventName: string,
    params: Record<string, any> | null,
    eventType: TrackEventType,
    element?: Element
  ): TrackEvent {
    const metadata: TrackEventMetadata = {
      timestamp: Date.now(),
      url: typeof window !== 'undefined' ? window.location.href : '',
      version: getVersion(),
      sessionId: getSessionId(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      viewport: getViewport(),
      eventType,
    };

    const event: TrackEvent = {
      eventName,
      params: params || undefined,
      metadata,
      id: generateEventId(),
      createdAt: Date.now(),
    };

    // Log event details in dev mode
    if (this.config.devMode) {
      this.log('debug', `Event created: ${eventName}`, {
        params,
        element: element ? getElementSelector(element) : undefined,
      });
    }

    return event;
  }

  /**
   * Track event (main entry point)
   * @param event - Tracking event to upload
   */
  track(event: TrackEvent): void {
    this.incrementStat('totalEvents');

    // Enqueue to batch service
    this.batchService.enqueue(event);

    this.log('debug', `Event tracked: ${event.eventName}`);
  }

  /**
   * Check if element should be excluded from tracking
   */
  private isElementExcluded(element: Element): boolean {
    // Check for data-track-ignore attribute
    if (element.hasAttribute('data-track-ignore')) {
      return true;
    }

    // Check if element is in excluded zone
    for (const selector of this.config.excludedSelectors) {
      if (element.matches(selector) || element.closest(selector)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Setup beforeunload handler
   * Ensures remaining events are sent before page closes
   */
  private setupBeforeUnload(): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.addEventListener('beforeunload', () => {
      this.batchService.flushOnUnload();
    });
  }

  /**
   * Get observable state
   */
  getState(): Observable<TrackingState> {
    return this.state$.asObservable();
  }

  /**
   * Get current stats
   */
  getStats(): TrackingStats {
    return this.state$.value.stats;
  }

  /**
   * Update configuration
   * @param updates - Partial config updates
   */
  updateConfig(updates: Partial<TrackConfig>): void {
    this.config = mergeConfig({ ...this.config, ...updates });

    // Update services
    if (updates.batchConfig) {
      this.batchService.updateConfig(updates.batchConfig);
    }

    if (updates.debounceTime) {
      this.debouncer.setDebounceTime(updates.debounceTime);
    }

    this.updateState({ config: this.config });
    this.log('debug', 'Configuration updated', updates);
  }

  /**
   * Destroy service
   * Cleanup event listeners and flush remaining events
   */
  destroy(): void {
    // Remove event listeners
    if (this.clickListener && typeof document !== 'undefined') {
      document.body.removeEventListener('click', this.clickListener, true);
      this.clickListener = null;
    }

    // Disconnect MutationObserver
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }

    // Clear attached listeners map
    this.attachedListeners = new WeakMap();

    // Flush remaining events
    this.batchService.flush();

    this.updateState({ initialized: false });
    this.log('debug', 'Tracking service destroyed');
  }

  /**
   * Update state
   */
  private updateState(partial: Partial<TrackingState>): void {
    this.state$.next({ ...this.state$.value, ...partial });
  }

  /**
   * Increment stat counter
   */
  private incrementStat(stat: keyof TrackingStats): void {
    const stats = { ...this.state$.value.stats };
    stats[stat]++;
    this.updateState({ stats });
  }

  /**
   * Log message based on log level
   */
  private log(level: 'error' | 'debug', message: string, data?: any): void {
    if (this.config.logLevel === 'silent') {
      return;
    }

    if (level === 'error' || (level === 'debug' && this.config.devMode)) {
      const prefix = '[Tracking]';
      if (data) {
        console.log(prefix, message, data);
      } else {
        console.log(prefix, message);
      }
    }
  }
}

/**
 * Singleton instance
 * Can be used for default tracking service
 */
let defaultInstance: TrackingService | null = null;

/**
 * Get or create default tracking service instance
 */
export function getTrackingService(config?: Partial<TrackConfig>): TrackingService {
  if (!defaultInstance) {
    defaultInstance = new TrackingService(config);
  }
  return defaultInstance;
}

/**
 * Reset default instance (for testing)
 */
export function resetTrackingService(): void {
  if (defaultInstance) {
    defaultInstance.destroy();
    defaultInstance = null;
  }
}
