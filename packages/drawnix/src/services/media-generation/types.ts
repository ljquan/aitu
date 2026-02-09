/**
 * Media Generation Service Types
 *
 * 媒体生成服务层的类型定义。
 * 这是独立于工作流的底层大模型调用服务接口。
 */

// Re-export core types
export {
  TaskStatus,
  TaskType,
} from '../../types/shared/core.types';
export type {
  Task,
  TaskResult,
  TaskError,
} from '../../types/shared/core.types';

/**
 * 图片生成选项
 */
export interface ImageGenerationOptions {
  model?: string;
  size?: string;
  quality?: '1k' | '2k' | '4k';
  referenceImages?: string[];
  uploadedImages?: Array<{ url?: string; base64?: string }>;
  count?: number;
  signal?: AbortSignal;
  /** 强制使用主线程（跳过 SW） */
  forceMainThread?: boolean;
}

/**
 * 视频生成选项
 */
export interface VideoGenerationOptions {
  model?: string;
  duration?: number | string;
  size?: string;
  inputReference?: string;
  inputReferences?: Array<{ type: 'image' | 'video'; url: string }>;
  referenceImages?: string[];
  signal?: AbortSignal;
  forceMainThread?: boolean;
}

/**
 * 图片生成结果
 */
export interface ImageGenerationResult {
  task: import('../../types/shared/core.types').Task;
  url?: string;
}

/**
 * 视频生成结果
 */
export interface VideoGenerationResult {
  task: import('../../types/shared/core.types').Task;
  url?: string;
}
