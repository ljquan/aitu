/**
 * Sora Character Types
 *
 * Type definitions for Sora-2 character creation and management.
 * Characters can be extracted from completed Sora-2 video tasks
 * and reused in future video generations via @username mentions.
 */

/**
 * Character creation status
 */
export enum CharacterStatus {
  /** Character creation request submitted, waiting for processing */
  PENDING = 'pending',
  /** Character is being processed by the API */
  PROCESSING = 'processing',
  /** Character creation completed successfully */
  COMPLETED = 'completed',
  /** Character creation failed */
  FAILED = 'failed',
}

/**
 * Sora character interface
 * Represents a character extracted from a Sora-2 video
 */
export interface SoraCharacter {
  /** Character ID from API (format: sora-2-character:ch_xxx) */
  id: string;
  /** Username for @mention in prompts */
  username: string;
  /** Character profile picture URL */
  profilePictureUrl: string;
  /** Permalink to character profile (optional) */
  permalink?: string;

  // Source information
  /** Local task ID that the character was extracted from */
  sourceTaskId: string;
  /** Remote video ID (format: sora-2:task_xxx) */
  sourceVideoId: string;
  /** Source video prompt (for reference) */
  sourcePrompt?: string;

  // Creation parameters
  /** Time range used for extraction (format: "start,end") */
  characterTimestamps?: string;

  // Status tracking
  /** Current character status */
  status: CharacterStatus;
  /** Creation timestamp (Unix milliseconds) */
  createdAt: number;
  /** Completion timestamp (Unix milliseconds) */
  completedAt?: number;
  /** Error message if creation failed */
  error?: string;
}

/**
 * Parameters for creating a character
 */
export interface CreateCharacterParams {
  /** Source video task ID (format: sora-2:task_xxx) */
  videoTaskId: string;
  /** Time range for character extraction (format: "start,end", e.g., "0,3") */
  characterTimestamps?: string;
  /** Local task ID for reference */
  localTaskId?: string;
  /** Source prompt for reference */
  sourcePrompt?: string;
  /** Source video model (sora-2 or sora-2-pro) - used to determine character model */
  sourceModel?: string;
}

/**
 * Response from character creation API
 */
export interface CharacterCreateResponse {
  /** Character ID (format: sora-2-character:ch_xxx) */
  id: string;
}

/**
 * Response from character query API
 */
export interface CharacterQueryResponse {
  /** Character ID */
  id: string;
  /** Username for @mention */
  username: string;
  /** Profile page URL */
  permalink: string;
  /** Profile picture URL */
  profile_picture_url: string;
}

/**
 * Character polling options
 */
export interface CharacterPollingOptions {
  /** Polling interval in milliseconds (default: 3000) */
  interval?: number;
  /** Maximum polling attempts (default: 60 = 3 minutes at 3s interval) */
  maxAttempts?: number;
  /** Callback when status changes */
  onStatusChange?: (status: CharacterStatus) => void;
}

/**
 * Character event types
 */
export type CharacterEventType =
  | 'characterCreated'
  | 'characterUpdated'
  | 'characterDeleted'
  | 'characterCompleted'
  | 'characterFailed';

/**
 * Character event
 */
export interface CharacterEvent {
  /** Event type */
  type: CharacterEventType;
  /** The character that triggered the event */
  character: SoraCharacter;
  /** Timestamp when the event occurred */
  timestamp: number;
}

/**
 * Validates time range for character extraction
 * @param start - Start time in seconds
 * @param end - End time in seconds
 * @param videoDuration - Total video duration in seconds
 * @returns Validation result with error message if invalid
 */
export function validateCharacterTimestamps(
  start: number,
  end: number,
  videoDuration?: number
): { valid: boolean; error?: string } {
  const duration = end - start;

  if (start < 0) {
    return { valid: false, error: '开始时间不能为负数' };
  }

  if (end <= start) {
    return { valid: false, error: '结束时间必须大于开始时间' };
  }

  if (duration < 1) {
    return { valid: false, error: '时间范围至少需要 1 秒' };
  }

  if (duration > 3) {
    return { valid: false, error: '时间范围不能超过 3 秒' };
  }

  if (videoDuration !== undefined && end > videoDuration) {
    return { valid: false, error: `结束时间不能超过视频时长 ${videoDuration} 秒` };
  }

  return { valid: true };
}

/**
 * Formats time range for API request
 * @param start - Start time in seconds
 * @param end - End time in seconds
 * @returns Formatted string "start,end"
 */
export function formatCharacterTimestamps(start: number, end: number): string {
  return `${start},${end}`;
}

/**
 * Parses time range string
 * @param timestamps - Time range string "start,end"
 * @returns Parsed start and end times, or null if invalid
 */
export function parseCharacterTimestamps(
  timestamps: string
): { start: number; end: number } | null {
  const parts = timestamps.split(',');
  if (parts.length !== 2) {
    return null;
  }

  const start = parseFloat(parts[0]);
  const end = parseFloat(parts[1]);

  if (isNaN(start) || isNaN(end)) {
    return null;
  }

  return { start, end };
}

/**
 * Checks if a video model supports character extraction
 * @param model - Video model name
 * @returns true if the model supports character extraction
 */
export function supportsCharacterExtraction(model?: string): boolean {
  if (!model) return false;
  return model === 'sora-2' || model === 'sora-2-pro';
}

/**
 * Checks if a remote video ID is from Sora-2 (including sora-2-pro)
 * @param remoteId - Remote video ID
 * @returns true if the ID is from Sora-2 or Sora-2-Pro
 */
export function isSora2VideoId(remoteId?: string): boolean {
  if (!remoteId) return false;
  return remoteId.startsWith('sora-2:') || remoteId.startsWith('sora-2-pro:');
}

/**
 * Gets the character model for a source video model
 * @param sourceModel - Source video model (sora-2 or sora-2-pro)
 * @returns Character model name
 */
export function getCharacterModel(sourceModel?: string): string {
  if (sourceModel === 'sora-2-pro') {
    return 'sora-2-pro-character';
  }
  // Default to sora-2-character
  return 'sora-2-character';
}
