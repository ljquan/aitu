/**
 * Media Executor Module
 *
 * 提供统一的媒体生成执行器接口，支持 SW 后台执行和主线程降级执行。
 */

export * from './types';
export { executorFactory } from './factory';
export { SWMediaExecutor, swMediaExecutor } from './sw-executor';
export { FallbackMediaExecutor, fallbackMediaExecutor } from './fallback-executor';
export { taskStorageWriter } from './task-storage-writer';
export {
  waitForTaskCompletion,
  waitForTasksCompletion,
  createTaskObserver,
  isTaskTerminal,
  type PollingOptions,
  type PollingResult,
} from './task-polling';
