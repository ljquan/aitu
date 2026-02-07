/**
 * Media Generation Services
 *
 * 独立的大模型调用服务层，不依赖工作流概念。
 * AI 弹窗组件和工作流引擎都可以直接使用这些服务。
 */

export { generateImage } from './image-generation-service';
export { generateVideo } from './video-generation-service';

export { TaskStatus, TaskType } from './types';
export type {
  Task,
  TaskResult,
  TaskError,
  ImageGenerationOptions,
  ImageGenerationResult,
  VideoGenerationOptions,
  VideoGenerationResult,
} from './types';
