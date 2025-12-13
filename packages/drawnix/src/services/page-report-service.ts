/**
 * Page Report Monitoring Service
 *
 * Monitors page view events and performance metrics:
 * - Page views (URL changes, SPA navigation)
 * - Page load time and performance
 * - User session data
 * - Device and browser information
 */

import { analytics } from '../utils/posthog-analytics';

/**
 * Page report event category
 */
const PAGE_REPORT_CATEGORY = 'page_report';

/**
 * Page view data interface
 */
interface PageViewData {
  page_url: string;
  page_path: string;
  page_title: string;
  referrer: string;
  viewport_width: number;
  viewport_height: number;
  screen_width: number;
  screen_height: number;
  device_type: 'mobile' | 'tablet' | 'desktop';
  user_agent: string;
  language: string;
  timestamp: number;
}

/**
 * Page performance data interface
 */
interface PagePerformanceData {
  page_url: string;
  page_path: string;
  // Navigation Timing API metrics
  dns_time?: number;           // DNS lookup time
  tcp_time?: number;           // TCP connection time
  request_time?: number;       // Request time
  response_time?: number;      // Response time
  dom_processing_time?: number;// DOM processing time
  dom_interactive_time?: number;// DOM interactive time
  dom_complete_time?: number;  // DOM complete time
  load_time?: number;          // Total page load time
  // Resource Timing
  total_resources?: number;
  total_size?: number;         // Total resource size in bytes
  timestamp: number;
}

/**
 * Get device type based on screen width
 */
function getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
  const width = window.innerWidth;
  if (width < 768) {
    return 'mobile';
  } else if (width < 1024) {
    return 'tablet';
  } else {
    return 'desktop';
  }
}

/**
 * Collect page view data
 */
function collectPageViewData(): PageViewData {
  return {
    page_url: window.location.href,
    page_path: window.location.pathname,
    page_title: document.title,
    referrer: document.referrer,
    viewport_width: window.innerWidth,
    viewport_height: window.innerHeight,
    screen_width: window.screen.width,
    screen_height: window.screen.height,
    device_type: getDeviceType(),
    user_agent: navigator.userAgent,
    language: navigator.language,
    timestamp: Date.now(),
  };
}

/**
 * Collect page performance data using Navigation Timing API Level 2
 */
function collectPagePerformanceData(): PagePerformanceData | null {
  // Check if Performance API is available
  if (!window.performance) {
    return null;
  }

  const data: PagePerformanceData = {
    page_url: window.location.href,
    page_path: window.location.pathname,
    timestamp: Date.now(),
  };

  // Use modern Performance Navigation Timing API (Level 2) if available
  if (window.performance.getEntriesByType) {
    const navEntries = window.performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];

    if (navEntries && navEntries.length > 0) {
      const navEntry = navEntries[0];

      // DNS lookup time
      if (navEntry.domainLookupEnd && navEntry.domainLookupStart) {
        data.dns_time = navEntry.domainLookupEnd - navEntry.domainLookupStart;
      }

      // TCP connection time
      if (navEntry.connectEnd && navEntry.connectStart) {
        data.tcp_time = navEntry.connectEnd - navEntry.connectStart;
      }

      // Request time
      if (navEntry.responseStart && navEntry.requestStart) {
        data.request_time = navEntry.responseStart - navEntry.requestStart;
      }

      // Response time
      if (navEntry.responseEnd && navEntry.responseStart) {
        data.response_time = navEntry.responseEnd - navEntry.responseStart;
      }

      // DOM processing time
      if (navEntry.domComplete && navEntry.domInteractive) {
        data.dom_processing_time = navEntry.domComplete - navEntry.domInteractive;
      }

      // DOM interactive time
      if (navEntry.domInteractive && navEntry.fetchStart) {
        data.dom_interactive_time = navEntry.domInteractive - navEntry.fetchStart;
      }

      // DOM complete time
      if (navEntry.domComplete && navEntry.fetchStart) {
        data.dom_complete_time = navEntry.domComplete - navEntry.fetchStart;
      }

      // Total page load time
      if (navEntry.loadEventEnd && navEntry.fetchStart) {
        data.load_time = navEntry.loadEventEnd - navEntry.fetchStart;
      }
    }
  }

  // Resource timing (if available)
  if (window.performance.getEntriesByType) {
    const resources = window.performance.getEntriesByType('resource');
    data.total_resources = resources.length;

    // Calculate total resource size
    data.total_size = resources.reduce((total, resource: any) => {
      return total + (resource.transferSize || 0);
    }, 0);
  }

  return data;
}

/**
 * Track page view event
 */
export function trackPageView(): void {
  if (!analytics.isAnalyticsEnabled()) {
    console.debug('[Page Report] PostHog not available, skipping page view');
    return;
  }

  const pageViewData = collectPageViewData();

  analytics.track('page_view', {
    category: PAGE_REPORT_CATEGORY,
    ...pageViewData,
  });

  console.log('[Page Report] Page view tracked:', {
    path: pageViewData.page_path,
    title: pageViewData.page_title,
    device: pageViewData.device_type,
  });
}

/**
 * Track page performance event
 * Should be called after page load is complete
 */
export function trackPagePerformance(): void {
  if (!analytics.isAnalyticsEnabled()) {
    console.debug('[Page Report] PostHog not available, skipping performance');
    return;
  }

  const performanceData = collectPagePerformanceData();
  if (!performanceData) {
    console.warn('[Page Report] Performance data not available');
    return;
  }

  analytics.track('page_performance', {
    category: PAGE_REPORT_CATEGORY,
    ...performanceData,
  });

  console.log('[Page Report] Page performance tracked:', {
    load_time: performanceData.load_time,
    dom_complete_time: performanceData.dom_complete_time,
    total_resources: performanceData.total_resources,
  });
}

/**
 * Track page unload event (when user leaves the page)
 */
export function trackPageUnload(): void {
  if (!analytics.isAnalyticsEnabled()) {
    return;
  }

  // Calculate time on page using performance.now() for better accuracy
  const timeOnPage = Math.round(performance.now());

  analytics.track('page_unload', {
    category: PAGE_REPORT_CATEGORY,
    page_url: window.location.href,
    page_path: window.location.pathname,
    time_on_page: timeOnPage,
    timestamp: Date.now(),
  });
}

/**
 * Initialize Page Report monitoring
 */
export function initPageReport(): void {
  try {
    // Track initial page view
    trackPageView();

    // Track page performance after load
    if (document.readyState === 'complete') {
      // Page already loaded
      trackPagePerformance();
    } else {
      // Wait for page to load
      window.addEventListener('load', () => {
        // Delay to ensure all timing data is available
        setTimeout(() => {
          trackPagePerformance();
        }, 0);
      });
    }

    // Track page unload (use beforeunload for better reliability)
    window.addEventListener('beforeunload', () => {
      trackPageUnload();
    });

    // Track page visibility changes (tab switching)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        analytics.track('page_hidden', {
          category: PAGE_REPORT_CATEGORY,
          page_url: window.location.href,
          page_path: window.location.pathname,
          timestamp: Date.now(),
        });
      } else if (document.visibilityState === 'visible') {
        analytics.track('page_visible', {
          category: PAGE_REPORT_CATEGORY,
          page_url: window.location.href,
          page_path: window.location.pathname,
          timestamp: Date.now(),
        });
      }
    });

    // Track SPA navigation (for single-page applications)
    // Listen to popstate for browser back/forward
    window.addEventListener('popstate', () => {
      setTimeout(() => {
        trackPageView();
      }, 100); // Small delay to ensure URL has changed
    });

    // Intercept pushState and replaceState for SPA navigation
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      originalPushState.apply(this, args);
      setTimeout(() => {
        trackPageView();
      }, 100);
    };

    history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      setTimeout(() => {
        trackPageView();
      }, 100);
    };

    console.log('[Page Report] Monitoring initialized successfully');
  } catch (error) {
    console.error('[Page Report] Failed to initialize monitoring:', error);
  }
}

/**
 * Stop Page Report monitoring (for cleanup if needed)
 */
export function stopPageReport(): void {
  console.log('[Page Report] Monitoring stopped');
  // Note: Event listeners will be removed when page unloads
  // If you need explicit cleanup, you would need to store listener references
}
