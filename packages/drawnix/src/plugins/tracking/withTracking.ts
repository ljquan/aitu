/**
 * Tracking Plugin
 * Feature: 005-declarative-tracking
 * Purpose: Plugin wrapper to integrate tracking service with Drawnix
 */

import type { TrackConfig } from '../../types/tracking.types';
import { TrackingService } from '../../services/tracking/tracking-service';

/**
 * Tracking plugin context
 * Stores the tracking service instance
 */
export interface TrackingPluginContext {
  trackingService: TrackingService;
}

/**
 * Extend Drawnix editor with tracking plugin context
 */
declare module '@plait/core' {
  interface PlaitBoard {
    trackingService?: TrackingService;
  }
}

/**
 * Singleton tracking service instance
 * Ensures only one tracking service is active across the application
 */
let globalTrackingService: TrackingService | null = null;

/**
 * Reset global tracking service (for hot reload in development)
 * @internal
 */
export function resetGlobalTrackingService(): void {
  if (globalTrackingService) {
    globalTrackingService.destroy();
    globalTrackingService = null;
  }
}

/**
 * With Tracking Plugin
 * Adds declarative tracking capabilities to Drawnix
 *
 * @param editor - Drawnix editor instance
 * @param config - Tracking configuration (optional)
 * @returns Enhanced editor with tracking service
 *
 * @example
 * ```typescript
 * const editor = withTracking(
 *   withMind(withDraw(createEditor())),
 *   { autoTrack: true, devMode: true }
 * );
 * ```
 */
export function withTracking<T extends any>(
  editor: T,
  config?: Partial<TrackConfig>
): T {
  // Use singleton pattern to ensure only one tracking service exists
  if (!globalTrackingService) {
    globalTrackingService = new TrackingService(config);

    // Initialize tracking service
    if (typeof window !== 'undefined') {
      // Defer initialization to allow DOM to be ready
      setTimeout(() => {
        globalTrackingService?.initialize();
      }, 0);
    }

    // Development: Reset on hot reload
    if (typeof module !== 'undefined' && (module as any).hot) {
      (module as any).hot.dispose(() => {
        resetGlobalTrackingService();
      });
    }
  }

  // Attach to editor for access in components
  (editor as any).trackingService = globalTrackingService;

  return editor;
}
