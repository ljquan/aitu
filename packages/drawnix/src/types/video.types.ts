/**
 * Video Model Types and Configuration
 *
 * Defines types for video generation models and their parameters.
 */

// Video generation models
export type VideoModel =
  | 'sora-2'
  | 'sora-2-pro'
  | 'veo3'
  | 'veo3-pro'
  | 'veo3.1'
  | 'veo3.1-pro'
  | 'veo3.1-components';

// Video model provider
export type VideoProvider = 'sora' | 'veo';

// Image upload mode
export type ImageUploadMode = 'reference' | 'frames' | 'components';

// Duration option
export interface DurationOption {
  label: string;
  value: string;
}

// Size option with aspect ratio
export interface SizeOption {
  label: string;
  value: string;
  aspectRatio: string;
}

// Image upload configuration
export interface ImageUploadConfig {
  maxCount: number;           // Maximum number of images
  mode: ImageUploadMode;      // Upload mode: reference, frames, or components
  labels?: string[];          // Labels for each upload slot (e.g., ['首帧', '尾帧'])
  required?: boolean;         // Whether image upload is required
}

// Video model configuration
export interface VideoModelConfig {
  id: VideoModel;
  label: string;
  provider: VideoProvider;
  description?: string;
  // Duration options
  durationOptions: DurationOption[];
  defaultDuration: string;
  // Size options
  sizeOptions: SizeOption[];
  defaultSize: string;
  // Image upload configuration
  imageUpload: ImageUploadConfig;
}

// Uploaded image with slot info
export interface UploadedVideoImage {
  slot: number;               // Slot index (0, 1, 2)
  slotLabel?: string;         // Slot label (e.g., '首帧', '尾帧')
  url: string;                // Base64 or URL
  name: string;               // File name
  file?: File;                // Original file object
}

// Video generation parameters (extended)
export interface VideoGenerationParams {
  model: VideoModel;
  prompt: string;
  seconds?: string;
  size?: string;
  // Support multiple images for different models
  inputReferences?: UploadedVideoImage[];
  // Legacy single image support
  inputReference?: string;
}
