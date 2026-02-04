export type ModelKind = 'image' | 'video' | 'chat';

export interface AdapterContext {
  baseUrl: string;
  apiKey?: string;
  fetcher?: typeof fetch;
}

export interface AdapterMetadata {
  id: string;
  label: string;
  kind: ModelKind;
  docsUrl?: string;
  supportedModels?: string[];
  defaultModel?: string;
}

export interface ImageGenerationRequest {
  prompt: string;
  model?: string;
  size?: string;
  referenceImages?: string[];
  params?: Record<string, unknown>;
}

export interface ImageGenerationResult {
  url: string;
  format?: string;
  width?: number;
  height?: number;
  raw?: unknown;
}

export interface VideoGenerationRequest {
  prompt: string;
  model?: string;
  size?: string;
  duration?: number;
  referenceImages?: string[];
  params?: Record<string, unknown>;
}

export interface VideoGenerationResult {
  url: string;
  format?: string;
  width?: number;
  height?: number;
  duration?: number;
  raw?: unknown;
}

export interface ImageModelAdapter extends AdapterMetadata {
  kind: 'image';
  generateImage(
    context: AdapterContext,
    request: ImageGenerationRequest
  ): Promise<ImageGenerationResult>;
}

export interface VideoModelAdapter extends AdapterMetadata {
  kind: 'video';
  generateVideo(
    context: AdapterContext,
    request: VideoGenerationRequest
  ): Promise<VideoGenerationResult>;
}

export type ModelAdapter = ImageModelAdapter | VideoModelAdapter;
