/**
 * RPC Helpers
 *
 * 通用 RPC 调用工具函数，减少重复的初始化检查、错误处理和默认值返回模式。
 */

import type { ServiceWorkerChannel } from 'postmessage-duplex';
import { ReturnCode } from 'postmessage-duplex';
import type { SWMethods, TaskOperationResult } from './types';

/**
 * 通用 RPC 调用，返回数据或默认值
 *
 * @param channel - ServiceWorkerChannel 实例
 * @param method - RPC 方法名
 * @param params - 请求参数
 * @param defaultValue - 失败时返回的默认值
 * @returns 响应数据或默认值
 *
 * @example
 * ```typescript
 * const status = await callWithDefault(channel, 'debug:getStatus', {}, { enabled: false });
 * ```
 */
export async function callWithDefault<T>(
  channel: ServiceWorkerChannel<SWMethods> | null,
  method: string,
  params: unknown,
  defaultValue: T
): Promise<T> {
  if (!channel) return defaultValue;

  try {
    const response = await channel.call(method as keyof SWMethods, params as any);
    if (response.ret !== ReturnCode.Success) {
      return defaultValue;
    }
    return (response.data ?? defaultValue) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * 操作型 RPC 调用，返回 { success, error? } 格式
 *
 * @param channel - ServiceWorkerChannel 实例
 * @param method - RPC 方法名
 * @param params - 请求参数
 * @param errorMessage - 失败时的错误消息
 * @returns 操作结果
 *
 * @example
 * ```typescript
 * const result = await callOperation(channel, 'task:cancel', { taskId }, 'Failed to cancel task');
 * ```
 */
export async function callOperation(
  channel: ServiceWorkerChannel<SWMethods> | null,
  method: string,
  params: unknown,
  errorMessage: string
): Promise<TaskOperationResult> {
  if (!channel) {
    return { success: false, error: 'Channel not initialized' };
  }

  try {
    const response = await channel.call(method as keyof SWMethods, params as any);
    if (response.ret !== ReturnCode.Success) {
      return { success: false, error: response.msg || errorMessage };
    }
    return (response.data as TaskOperationResult) || { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : errorMessage };
  }
}

/**
 * 检查初始化状态并抛出异常
 *
 * @param initialized - 是否已初始化
 * @param channel - channel 实例
 * @throws Error 如果未初始化
 */
export function ensureInitialized(
  initialized: boolean,
  channel: ServiceWorkerChannel<SWMethods> | null
): asserts channel is ServiceWorkerChannel<SWMethods> {
  if (!initialized || !channel) {
    throw new Error('SWChannelClient not initialized. Call initialize() first.');
  }
}

/**
 * 安全执行 RPC 调用，不抛出异常
 *
 * @param channel - ServiceWorkerChannel 实例
 * @param method - RPC 方法名
 * @param params - 请求参数
 * @param defaultValue - 失败时返回的默认值
 * @returns 响应数据或默认值
 */
export async function safeCall<T>(
  channel: ServiceWorkerChannel<SWMethods> | null,
  method: string,
  params: unknown,
  defaultValue: T
): Promise<T> {
  if (!channel) return defaultValue;

  try {
    const response = await channel.call(method as keyof SWMethods, params as any);
    const isSuccess = response.ret === undefined || response.ret === ReturnCode.Success;
    if (!isSuccess) {
      return defaultValue;
    }
    return (response.data ?? defaultValue) as T;
  } catch {
    return defaultValue;
  }
}
