/**
 * Umami Analytics Utility
 *
 * Provides type-safe event tracking for Umami analytics.
 * Tracks model calls, user interactions, and feature usage.
 */

declare global {
  interface Window {
    umami?: {
      track: (eventName: string, eventData?: Record<string, any>) => void;
    };
  }
}

/**
 * Event categories for analytics
 */
export enum AnalyticsCategory {
  AI_GENERATION = 'ai_generation',
  USER_INTERACTION = 'user_interaction',
  FEATURE_USAGE = 'feature_usage',
  SYSTEM = 'system',
}

/**
 * Event names for AI generation
 */
export enum AIGenerationEvent {
  IMAGE_GENERATION_START = 'image_generation_start',
  IMAGE_GENERATION_SUCCESS = 'image_generation_success',
  IMAGE_GENERATION_FAILED = 'image_generation_failed',
  VIDEO_GENERATION_START = 'video_generation_start',
  VIDEO_GENERATION_SUCCESS = 'video_generation_success',
  VIDEO_GENERATION_FAILED = 'video_generation_failed',
  TASK_CANCELLED = 'task_cancelled',
}

/**
 * Event names for API calls
 */
export enum APICallEvent {
  API_CALL_START = 'api_call_start',
  API_CALL_SUCCESS = 'api_call_success',
  API_CALL_FAILED = 'api_call_failed',
  API_CALL_RETRY = 'api_call_retry',
}

/**
 * Event names for user interactions
 */
export enum UserInteractionEvent {
  BUTTON_CLICK = 'button_click',
  DIALOG_OPEN = 'dialog_open',
  DIALOG_CLOSE = 'dialog_close',
  TOOLBAR_ACTION = 'toolbar_action',
}

/**
 * Event names for feature usage
 */
export enum FeatureUsageEvent {
  TTD_DIALOG_OPEN = 'ttd_dialog_open',
  MIND_MAP_CREATE = 'mind_map_create',
  FREEHAND_DRAW = 'freehand_draw',
  IMAGE_UPLOAD = 'image_upload',
  VIDEO_UPLOAD = 'video_upload',
}

/**
 * Analytics utility class
 */
class UmamiAnalytics {

  constructor() {
  }

  /**
   * Track a custom event
   *
   * @param eventName - Name of the event
   * @param eventData - Additional data to track
   */
  track(eventName: string, eventData?: Record<string, any>): void {
    if (!window.umami) {
      console.debug('[Analytics] Tracking disabled or Umami not loaded:', eventName, eventData);
      return;
    }

    try {
      window.umami.track(eventName, eventData);
      console.debug('[Analytics] Event tracked:', eventName, eventData);
    } catch (error) {
      console.error('[Analytics] Failed to track event:', error);
    }
  }

  /**
   * Track AI generation event
   *
   * @param event - AI generation event type
   * @param data - Event data (model, duration, error, etc.)
   */
  trackAIGeneration(
    event: AIGenerationEvent,
    data: {
      taskId?: string;
      taskType?: 'image' | 'video';
      model?: string;
      duration?: number;
      error?: string;
      promptLength?: number;
      hasUploadedImage?: boolean;
    }
  ): void {
    this.track(event, {
      category: AnalyticsCategory.AI_GENERATION,
      ...data,
      timestamp: Date.now(),
    });
  }

  /**
   * Track user interaction event
   *
   * @param event - User interaction event type
   * @param data - Event data
   */
  trackUserInteraction(
    event: UserInteractionEvent,
    data: {
      component?: string;
      action?: string;
      label?: string;
    }
  ): void {
    this.track(event, {
      category: AnalyticsCategory.USER_INTERACTION,
      ...data,
      timestamp: Date.now(),
    });
  }

  /**
   * Track feature usage event
   *
   * @param event - Feature usage event type
   * @param data - Event data
   */
  trackFeatureUsage(
    event: FeatureUsageEvent,
    data?: {
      feature?: string;
      value?: string | number;
    }
  ): void {
    this.track(event, {
      category: AnalyticsCategory.FEATURE_USAGE,
      ...data,
      timestamp: Date.now(),
    });
  }

  /**
   * Track model call with detailed metrics
   *
   * @param params - Model call parameters
   */
  trackModelCall(params: {
    taskId: string;
    taskType: 'image' | 'video';
    model: string;
    promptLength: number;
    hasUploadedImage: boolean;
    startTime: number;
  }): void {
    const event = params.taskType === 'image'
      ? AIGenerationEvent.IMAGE_GENERATION_START
      : AIGenerationEvent.VIDEO_GENERATION_START;

    this.trackAIGeneration(event, params);
  }

  /**
   * Track successful model call
   *
   * @param params - Success parameters
   */
  trackModelSuccess(params: {
    taskId: string;
    taskType: 'image' | 'video';
    model: string;
    duration: number;
    resultSize?: number;
  }): void {
    const event = params.taskType === 'image'
      ? AIGenerationEvent.IMAGE_GENERATION_SUCCESS
      : AIGenerationEvent.VIDEO_GENERATION_SUCCESS;

    this.trackAIGeneration(event, params);
  }

  /**
   * Track failed model call
   *
   * @param params - Failure parameters
   */
  trackModelFailure(params: {
    taskId: string;
    taskType: 'image' | 'video';
    model: string;
    duration: number;
    error: string;
  }): void {
    const event = params.taskType === 'image'
      ? AIGenerationEvent.IMAGE_GENERATION_FAILED
      : AIGenerationEvent.VIDEO_GENERATION_FAILED;

    this.trackAIGeneration(event, params);
  }

  /**
   * Track task cancellation
   *
   * @param params - Cancellation parameters
   */
  trackTaskCancellation(params: {
    taskId: string;
    taskType: 'image' | 'video';
    duration: number;
  }): void {
    this.trackAIGeneration(AIGenerationEvent.TASK_CANCELLED, params);
  }

  /**
   * Track API call start
   *
   * @param params - API call parameters
   */
  trackAPICallStart(params: {
    endpoint: string;
    model: string;
    messageCount: number;
    stream: boolean;
  }): void {
    this.track(APICallEvent.API_CALL_START, {
      category: AnalyticsCategory.SYSTEM,
      ...params,
      timestamp: Date.now(),
    });
  }

  /**
   * Track API call success
   *
   * @param params - Success parameters
   */
  trackAPICallSuccess(params: {
    endpoint: string;
    model: string;
    duration: number;
    responseLength?: number;
    stream: boolean;
  }): void {
    this.track(APICallEvent.API_CALL_SUCCESS, {
      category: AnalyticsCategory.SYSTEM,
      ...params,
      timestamp: Date.now(),
    });
  }

  /**
   * Track API call failure
   *
   * @param params - Failure parameters
   */
  trackAPICallFailure(params: {
    endpoint: string;
    model: string;
    duration: number;
    error: string;
    httpStatus?: number;
    stream: boolean;
  }): void {
    this.track(APICallEvent.API_CALL_FAILED, {
      category: AnalyticsCategory.SYSTEM,
      ...params,
      timestamp: Date.now(),
    });
  }

  /**
   * Track API call retry
   *
   * @param params - Retry parameters
   */
  trackAPICallRetry(params: {
    endpoint: string;
    model: string;
    attempt: number;
    reason: string;
  }): void {
    this.track(APICallEvent.API_CALL_RETRY, {
      category: AnalyticsCategory.SYSTEM,
      ...params,
      timestamp: Date.now(),
    });
  }

  /**
   * Check if analytics is enabled
   */
  isAnalyticsEnabled(): boolean {
    return this.isEnabled;
  }
}

// Export singleton instance
export const analytics = new UmamiAnalytics();
