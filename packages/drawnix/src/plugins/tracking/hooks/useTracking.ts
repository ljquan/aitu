/**
 * useTracking Hook
 * Feature: 005-declarative-tracking
 * Purpose: React hook to access tracking service from components
 */

import { useEffect, useState } from 'react';
import type { TrackingService } from '../../../services/tracking/tracking-service';
import type { TrackingStats, TrackConfig } from '../../../types/tracking.types';

/**
 * Use Tracking Hook
 * Provides access to tracking service from React components
 *
 * @param trackingService - Tracking service instance (from editor context)
 * @returns Tracking service utilities
 *
 * @example
 * ```typescript
 * function MyComponent() {
 *   const tracking = useTracking(editor.trackingService);
 *
 *   const handleClick = () => {
 *     tracking.track({
 *       eventName: 'custom_event',
 *       params: { source: 'component' }
 *     });
 *   };
 *
 *   return <div>Tracked: {tracking.stats.totalEvents}</div>;
 * }
 * ```
 */
export function useTracking(trackingService?: TrackingService) {
  const [stats, setStats] = useState<TrackingStats>({
    totalEvents: 0,
    successfulUploads: 0,
    failedUploads: 0,
    batchUploadCount: 0,
    debouncedEvents: 0,
  });

  useEffect(() => {
    if (!trackingService) {
      return;
    }

    // Subscribe to stats updates
    const subscription = trackingService.getState().subscribe((state) => {
      setStats(state.stats);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [trackingService]);

  return {
    /**
     * Current tracking statistics
     */
    stats,

    /**
     * Check if tracking service is available
     */
    isAvailable: !!trackingService,

    /**
     * Update tracking configuration
     */
    updateConfig: (config: Partial<TrackConfig>) => {
      trackingService?.updateConfig(config);
    },

    /**
     * Get current tracking service (for advanced usage)
     */
    service: trackingService,
  };
}
