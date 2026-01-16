/**
 * useTaskExecutor Hook
 * 
 * Automatically monitors and executes pending tasks in the background.
 * Handles task lifecycle: execution, timeout detection, retry logic.
 * 
 * In SW mode: Tasks are executed by Service Worker handlers.
 * In legacy mode: Tasks are executed directly in main thread.
 */

import { useEffect, useRef } from 'react';
import { taskQueueService as legacyTaskQueueService } from '../services/task-queue-service';
import { swTaskQueueService } from '../services/sw-task-queue-service';
import { shouldUseSWTaskQueue } from '../services/task-queue';
import { generationAPIService } from '../services/generation-api-service';
import { characterAPIService } from '../services/character-api-service';
import { characterStorageService } from '../services/character-storage-service';
import { unifiedCacheService } from '../services/unified-cache-service';
import { Task, TaskStatus, TaskType } from '../types/task.types';
import { CharacterStatus } from '../types/character.types';
import { isTaskTimeout } from '../utils/task-utils';

// Get the appropriate task queue service
const taskQueueService = shouldUseSWTaskQueue() ? swTaskQueueService : legacyTaskQueueService;

/**
 * 从 API 错误体中提取原始错误消息
 */
function extractApiErrorMessage(apiErrorBody: string): string | null {
  if (!apiErrorBody) return null;

  try {
    const parsed = JSON.parse(apiErrorBody);
    // 尝试常见的错误消息字段
    if (parsed.error?.message) return parsed.error.message;
    if (parsed.message) return parsed.message;
    if (parsed.error && typeof parsed.error === 'string') return parsed.error;
    if (parsed.detail) return parsed.detail;
    if (parsed.msg) return parsed.msg;
  } catch {
    // 如果不是 JSON，直接返回原始内容
    return apiErrorBody;
  }
  return null;
}

/**
 * Converts error to user-friendly message
 * 优先保留原始 API 错误信息，便于用户理解和反馈
 */
function getFriendlyErrorMessage(error: any): string {
  const message = error?.message || String(error);
  const apiErrorBody = error?.apiErrorBody || '';
  const httpStatus = error?.httpStatus;

  // 首先尝试从 API 错误体中提取原始错误消息
  const apiErrorMessage = extractApiErrorMessage(apiErrorBody);

  // 检查 API 错误体中的特定错误类型
  const combinedText = `${message} ${apiErrorBody}`;
  if (combinedText.includes('insufficient_user_quota') || combinedText.includes('预扣费额度失败')) {
    return '账户额度不足，请充值后重试';
  }

  // 检查 Google Gemini 内容政策违规
  if (message.includes('PROHIBITED_CONTENT') || message.includes('has been blocked by Google Gemini')) {
    return message; // 直接返回原始错误信息，保留详细说明
  }

  // 检查 AI 模型拒绝生成的情况（返回文本而非图片）
  if (message.includes('cannot') || message.includes('I cannot') || message.includes("I can't")) {
    return 'AI 拒绝生成此内容';
  }
  if (message.includes('unable to') || message.includes('not able to')) {
    return 'AI 无法处理此请求';
  }

  // HTTP 请求超时（AbortSignal.timeout）
  if (message.includes('signal') && message.includes('timed out')) {
    return '请求超时，服务器响应过慢，正在自动重试';
  }

  // 任务超时
  if (message.includes('TIMEOUT') || message.includes('超时')) {
    return '生成超时，请稍后重试';
  }

  // 网络错误
  if (message.includes('network') || message.includes('Network') || message.includes('fetch') || message.includes('Failed to fetch')) {
    return '网络连接失败，请检查网络后重试';
  }

  // 限流
  if (message.includes('rate limit') || message.includes('429') || httpStatus === 429) {
    return '请求过于频繁，请稍后重试';
  }

  // 认证错误
  if (message.includes('401') || httpStatus === 401) {
    return 'API 认证失败，请检查 API Key 配置';
  }

  // 权限错误（非额度问题）
  if ((message.includes('403') || httpStatus === 403) && !apiErrorBody.includes('quota')) {
    return 'API 访问被拒绝，请检查配置';
  }

  // 服务器错误 - 如果有原始 API 错误消息，附加显示
  if (message.includes('500') || httpStatus === 500) {
    return apiErrorMessage ? `AI 服务器内部错误: ${apiErrorMessage}` : 'AI 服务器内部错误，正在自动重试';
  }
  if (message.includes('502') || httpStatus === 502) {
    return apiErrorMessage ? `AI 服务暂时不可用: ${apiErrorMessage}` : 'AI 服务暂时不可用（502），正在自动重试';
  }
  if (message.includes('503') || httpStatus === 503) {
    return apiErrorMessage ? `AI 服务繁忙: ${apiErrorMessage}` : 'AI 服务繁忙（503），正在自动重试';
  }
  if (message.includes('504') || httpStatus === 504) {
    return apiErrorMessage ? `AI 服务响应超时: ${apiErrorMessage}` : 'AI 服务响应超时（504），正在自动重试';
  }

  // 如果有原始 API 错误消息，优先返回
  if (apiErrorMessage) {
    return apiErrorMessage;
  }

  // 返回原始错误消息（不再截断）
  return message;
}

/**
 * Hook for automatic task execution
 * 
 * Responsibilities:
 * - Monitor pending tasks and start execution
 * - Handle task timeout detection
 * - Implement retry logic with exponential backoff
 * - Update task status based on results
 * 
 * In SW mode:
 * - Tasks are executed by Service Worker handlers
 * - This hook only handles post-completion tasks (metadata registration)
 * - Timeout detection is handled by SW
 * 
 * @example
 * function App() {
 *   useTaskExecutor(); // Tasks will execute automatically
 *   return <YourComponents />;
 * }
 */
export function useTaskExecutor(): void {
  const executingTasksRef = useRef<Set<string>>(new Set());
  const timeoutCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const usingSW = shouldUseSWTaskQueue();

  useEffect(() => {
    let isActive = true;

    // In SW mode, we only need to handle post-completion tasks
    if (usingSW) {
      // console.log('[TaskExecutor] Running in SW mode - tasks executed by Service Worker');

      // Subscribe to task updates for post-completion handling
      const subscription = taskQueueService.observeTaskUpdates().subscribe(async (event) => {
        if (!isActive) return;

        // Handle completed tasks - register metadata
        if (event.type === 'taskUpdated' && event.task.status === TaskStatus.COMPLETED) {
          const task = event.task;
          if (task.result?.url) {
            try {
              await unifiedCacheService.registerImageMetadata(task.result.url, {
                taskId: task.id,
                model: task.params.model,
                prompt: task.params.prompt,
                params: task.params,
              });
              // console.log(`[TaskExecutor] Registered metadata for task ${task.id}`);
            } catch (error) {
              console.error(`[TaskExecutor] Failed to register metadata for task ${task.id}:`, error);
            }
          }

          // Handle character task completion - save to storage
          if (task.type === TaskType.CHARACTER && task.result) {
            try {
              await characterStorageService.saveCharacter({
                id: task.remoteId || task.id,
                username: task.result.characterUsername || '',
                profilePictureUrl: task.result.characterProfileUrl || task.result.url,
                permalink: task.result.characterPermalink || '',
                sourceTaskId: task.params.sourceLocalTaskId || '',
                sourceVideoId: task.params.sourceVideoTaskId || '',
                sourcePrompt: task.params.prompt,
                characterTimestamps: task.params.characterTimestamps,
                status: 'completed' as CharacterStatus,
                createdAt: task.createdAt,
                completedAt: Date.now(),
              });
              // console.log(`[TaskExecutor] Saved character for task ${task.id}`);
            } catch (error) {
              console.error(`[TaskExecutor] Failed to save character for task ${task.id}:`, error);
            }
          }
        }
      });

      return () => {
        isActive = false;
        subscription.unsubscribe();
      };
    }

    // Legacy mode: Execute tasks in main thread
    // console.log('[TaskExecutor] Running in legacy mode - tasks executed in main thread');
    // Use legacyTaskQueueService directly to avoid union type issues with updateTaskStatus

    // Function to resume a video task that has a remoteId
    const resumeVideoTask = async (task: Task) => {
      const taskId = task.id;
      const remoteId = task.remoteId!;

      // Prevent duplicate execution
      if (executingTasksRef.current.has(taskId)) {
        // console.log(`[TaskExecutor] Task ${taskId} is already executing`);
        return;
      }

      executingTasksRef.current.add(taskId);
      // console.log(`[TaskExecutor] Resuming video task ${taskId} with remoteId ${remoteId}`);

      try {
        // Resume video polling
        const result = await generationAPIService.resumeVideoGeneration(taskId, remoteId);

        if (!isActive) return;

        // Mark as completed with result
        legacyTaskQueueService.updateTaskStatus(taskId, TaskStatus.COMPLETED, {
          result,
        });

        // console.log(`[TaskExecutor] Resumed task ${taskId} completed successfully`);

        // Register image/video metadata in unified cache
        if (result.url) {
          try {
            await unifiedCacheService.registerImageMetadata(result.url, {
              taskId: task.id,
              model: task.params.model,
              prompt: task.params.prompt,
              params: task.params,
            });
            // console.log(`[TaskExecutor] Registered metadata for resumed task ${taskId}`);
          } catch (error) {
            console.error(`[TaskExecutor] Failed to register metadata for resumed task ${taskId}:`, error);
          }
        }
      } catch (error: any) {
        if (!isActive) return;

        console.error(`[TaskExecutor] Resumed task ${taskId} failed:`, error);

        const updatedTask = legacyTaskQueueService.getTask(taskId);
        if (!updatedTask) return;

        // Extract error details
        const errorCode = error.httpStatus ? `HTTP_${error.httpStatus}` : (error.name || 'ERROR');
        const errorMessage = getFriendlyErrorMessage(error);
        // 如果有完整响应，使用它；否则使用 API 错误体或错误消息
        const originalErrorInfo = error.fullResponse || error.apiErrorBody || error.message || String(error);
        const errorDetails = {
          originalError: originalErrorInfo,
          timestamp: Date.now(),
        };

        // Check if we should retry - disabled, mark as failed directly
        legacyTaskQueueService.updateTaskStatus(taskId, TaskStatus.FAILED, {
          error: {
            code: errorCode,
            message: errorMessage,
            details: errorDetails,
          },
        });

        // console.log(`[TaskExecutor] Resumed task ${taskId} failed`);
      } finally {
        executingTasksRef.current.delete(taskId);
      }
    };

    // Function to execute a character task
    const executeCharacterTask = async (task: Task) => {
      const taskId = task.id;

      // Prevent duplicate execution
      if (executingTasksRef.current.has(taskId)) {
        // console.log(`[TaskExecutor] Character task ${taskId} is already executing`);
        return;
      }

      executingTasksRef.current.add(taskId);
      // console.log(`[TaskExecutor] Starting character task ${taskId}`);

      try {
        // Update status to processing
        legacyTaskQueueService.updateTaskStatus(taskId, TaskStatus.PROCESSING);

        const { sourceVideoTaskId, characterTimestamps, model, prompt } = task.params;

        if (!sourceVideoTaskId) {
          throw new Error('缺少源视频任务ID');
        }

        // Create character via API with polling
        const result = await characterAPIService.createCharacterWithPolling(
          {
            videoTaskId: sourceVideoTaskId,
            characterTimestamps,
            localTaskId: task.params.sourceLocalTaskId,
            sourcePrompt: prompt,
            sourceModel: model,
          },
          {
            onStatusChange: (status: CharacterStatus) => {
              // console.log(`[TaskExecutor] Character ${taskId} status: ${status}`);
            },
          }
        );

        if (!isActive) return;

        // Save character to storage
        await characterStorageService.saveCharacter({
          id: result.characterId,
          username: result.username,
          profilePictureUrl: result.profile_picture_url,
          permalink: result.permalink,
          sourceTaskId: task.params.sourceLocalTaskId || '',
          sourceVideoId: sourceVideoTaskId,
          sourcePrompt: prompt,
          characterTimestamps,
          status: 'completed' as CharacterStatus,
          createdAt: task.createdAt,
          completedAt: Date.now(),
        });

        // Mark task as completed with character info
        legacyTaskQueueService.updateTaskStatus(taskId, TaskStatus.COMPLETED, {
          result: {
            url: result.profile_picture_url,
            format: 'character',
            size: 0,
            characterUsername: result.username,
            characterProfileUrl: result.profile_picture_url,
            characterPermalink: result.permalink,
          },
          remoteId: result.characterId,
        });

        // console.log(`[TaskExecutor] Character task ${taskId} completed: @${result.username}`);
      } catch (error: any) {
        if (!isActive) return;

        console.error(`[TaskExecutor] Character task ${taskId} failed:`, error);

        const updatedTask = legacyTaskQueueService.getTask(taskId);
        if (!updatedTask) return;

        const errorCode = error.httpStatus ? `HTTP_${error.httpStatus}` : (error.name || 'ERROR');
        const errorMessage = getFriendlyErrorMessage(error);
        const originalErrorInfo = error.fullResponse || error.apiErrorBody || error.message || String(error);
        const errorDetails = {
          originalError: originalErrorInfo,
          timestamp: Date.now(),
        };

        // Check if we should retry - disabled, mark as failed directly
        legacyTaskQueueService.updateTaskStatus(taskId, TaskStatus.FAILED, {
          error: {
            code: errorCode,
            message: errorMessage,
            details: errorDetails,
          },
        });

        // console.log(`[TaskExecutor] Character task ${taskId} failed`);
      } finally {
        executingTasksRef.current.delete(taskId);
      }
    };

    // Function to execute a single task
    const executeTask = async (task: Task) => {
      const taskId = task.id;

      // Check if this is a character task
      if (task.type === TaskType.CHARACTER) {
        return executeCharacterTask(task);
      }

      // Check if this is a resumable video task
      if (task.type === TaskType.VIDEO && task.remoteId && task.status === TaskStatus.PROCESSING) {
        return resumeVideoTask(task);
      }

      // Prevent duplicate execution
      if (executingTasksRef.current.has(taskId)) {
        // console.log(`[TaskExecutor] Task ${taskId} is already executing`);
        return;
      }

      executingTasksRef.current.add(taskId);
      // console.log(`[TaskExecutor] Starting execution of task ${taskId}`);

      try {
        // Update status to processing
        legacyTaskQueueService.updateTaskStatus(taskId, TaskStatus.PROCESSING);

        // Execute the generation
        const result = await generationAPIService.generate(
          taskId,
          task.params,
          task.type
        );

        if (!isActive) return;

        // Mark as completed with result
        legacyTaskQueueService.updateTaskStatus(taskId, TaskStatus.COMPLETED, {
          result,
        });

        // console.log(`[TaskExecutor] Task ${taskId} completed successfully`);

        // Register image/video metadata in unified cache
        if (result.url) {
          try {
            await unifiedCacheService.registerImageMetadata(result.url, {
              taskId: task.id,
              model: task.params.model,
              prompt: task.params.prompt,
              params: task.params,
            });
            // console.log(`[TaskExecutor] Registered metadata for task ${taskId}`);
          } catch (error) {
            console.error(`[TaskExecutor] Failed to register metadata for task ${taskId}:`, error);
          }
        }
      } catch (error: any) {
        if (!isActive) return;

        console.error(`[TaskExecutor] Task ${taskId} failed:`, error);

        const updatedTask = legacyTaskQueueService.getTask(taskId);
        if (!updatedTask) return;

        // Extract error details - 优先使用 API 返回的详细错误信息
        const errorCode = error.httpStatus ? `HTTP_${error.httpStatus}` : (error.name || 'ERROR');
        const errorMessage = getFriendlyErrorMessage(error);
        // 如果有完整响应，使用它；否则使用 API 错误体或错误消息
        const originalErrorInfo = error.fullResponse || error.apiErrorBody || error.message || String(error);
        const errorDetails = {
          originalError: originalErrorInfo,
          timestamp: Date.now(),
        };

        // Check if we should retry - disabled, mark as failed directly
        legacyTaskQueueService.updateTaskStatus(taskId, TaskStatus.FAILED, {
          error: {
            code: errorCode,
            message: errorMessage,
            details: errorDetails,
          },
        });

        // console.log(`[TaskExecutor] Task ${taskId} failed`);
      } finally {
        executingTasksRef.current.delete(taskId);
      }
    };

    // Function to check for pending tasks and resumable video tasks
    const processPendingTasks = () => {
      if (!isActive) return;

      const tasks = legacyTaskQueueService.getAllTasks();

      // Process pending tasks
      const pendingTasks = tasks.filter(task => task.status === TaskStatus.PENDING);
      pendingTasks.forEach(task => {
        executeTask(task);
      });

      // Process resumable video tasks (processing with remoteId)
      const resumableTasks = tasks.filter(
        task => task.type === TaskType.VIDEO &&
                task.status === TaskStatus.PROCESSING &&
                task.remoteId
      );
      resumableTasks.forEach(task => {
        // console.log(`[TaskExecutor] Found resumable video task ${task.id}`);
        executeTask(task);
      });
    };

    // Function to check for timed out tasks
    const checkTimeouts = () => {
      if (!isActive) return;

      const tasks = legacyTaskQueueService.getAllTasks();
      const processingTasks = tasks.filter(task => task.status === TaskStatus.PROCESSING);

      processingTasks.forEach(task => {
        if (isTaskTimeout(task)) {
          console.warn(`[TaskExecutor] Task ${task.id} timed out`);
          
          // Cancel the API request
          generationAPIService.cancelRequest(task.id);
          
          const timeoutDetails = {
            originalError: `Task ${task.id} timed out after processing`,
            timestamp: Date.now(),
          };

          // Check if we should retry - disabled, mark as failed directly
          legacyTaskQueueService.updateTaskStatus(task.id, TaskStatus.FAILED, {
            error: {
              code: 'TIMEOUT',
              message: '任务执行超时',
              details: timeoutDetails,
            },
          });
        }
      });
    };

    // Subscribe to task updates to catch new pending tasks and resumable video tasks
    const subscription = legacyTaskQueueService.observeTaskUpdates().subscribe(event => {
      if (!isActive) return;

      if (event.type === 'taskCreated' || event.type === 'taskUpdated') {
        const task = event.task;

        // Execute pending tasks
        if (task.status === TaskStatus.PENDING) {
          executeTask(task);
        }
        // Resume video tasks that have remoteId and are in processing state
        // This handles tasks restored from storage after page refresh
        else if (
          task.type === TaskType.VIDEO &&
          task.status === TaskStatus.PROCESSING &&
          task.remoteId &&
          !executingTasksRef.current.has(task.id)
        ) {
          // console.log(`[TaskExecutor] Detected resumable video task from event: ${task.id}`);
          executeTask(task);
        }
      }
    });

    // Process existing pending tasks on mount
    // Note: This runs synchronously, but tasks may be restored asynchronously by useTaskStorage
    // The subscription above will catch tasks restored after this point
    processPendingTasks();

    // Set up timeout checker (every 10 seconds)
    timeoutCheckIntervalRef.current = setInterval(checkTimeouts, 10000);

    // Cleanup
    return () => {
      isActive = false;
      subscription.unsubscribe();
      
      if (timeoutCheckIntervalRef.current) {
        clearInterval(timeoutCheckIntervalRef.current);
      }

      // Cancel all ongoing requests
      executingTasksRef.current.forEach(taskId => {
        generationAPIService.cancelRequest(taskId);
      });
      executingTasksRef.current.clear();
    };
  }, []);
}
