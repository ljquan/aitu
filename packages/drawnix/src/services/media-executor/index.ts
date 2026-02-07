/**
 * Media Executor Module
 *
 * 提供统一的媒体生成执行器接口。
 * 所有任务在主线程执行，SW 仅通过 Fetch Relay 保护 API 请求。
 */

export * from './types';
export { executorFactory } from './factory';
export { FallbackMediaExecutor, fallbackMediaExecutor } from './fallback-executor';
// 向后兼容：SWMediaExecutor 已废弃，重新导出 FallbackMediaExecutor 作为替代
export { FallbackMediaExecutor as SWMediaExecutor, fallbackMediaExecutor as swMediaExecutor } from './fallback-executor';
export { taskStorageWriter } from './task-storage-writer';
export {
  waitForTaskCompletion,
  waitForTasksCompletion,
  createTaskObserver,
  isTaskTerminal,
  type PollingOptions,
  type PollingResult,
} from './task-polling';
