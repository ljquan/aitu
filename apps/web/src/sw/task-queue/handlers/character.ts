/**
 * Character Extraction Handler for Service Worker
 *
 * Handles character extraction from Sora-2 videos.
 */

import type {
  SWTask,
  TaskResult,
  HandlerConfig,
  TaskHandler,
} from '../types';
import { TaskExecutionPhase } from '../types';

/**
 * Character API response types
 */
interface CharacterCreateResponse {
  id: string;
}

interface CharacterQueryResponse {
  id: string;
  username: string;
  permalink: string;
  profile_picture_url: string;
}

/**
 * Submit result with log ID for tracking
 */
interface SubmitResult {
  response: CharacterCreateResponse;
  logId: string;
}

/**
 * Character extraction handler
 */
export class CharacterHandler implements TaskHandler {
  private abortControllers: Map<string, AbortController> = new Map();
  private pollingIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();

  /**
   * Execute character extraction task
   */
  async execute(task: SWTask, config: HandlerConfig): Promise<TaskResult> {
    const abortController = new AbortController();
    this.abortControllers.set(task.id, abortController);

    try {
      config.onProgress(task.id, 0, TaskExecutionPhase.SUBMITTING);

      // Create character
      const { response: createResponse, logId } = await this.createCharacter(
        task,
        config,
        abortController.signal
      );

      // Notify remote ID
      config.onRemoteId(task.id, createResponse.id);
      config.onProgress(task.id, 10, TaskExecutionPhase.POLLING);

      // Poll until completion
      const result = await this.pollUntilComplete(
        createResponse.id,
        task.id,
        config,
        abortController.signal,
        logId
      );

      return result;
    } finally {
      this.cleanup(task.id);
    }
  }

  /**
   * Resume character extraction polling
   */
  async resume(task: SWTask, config: HandlerConfig): Promise<TaskResult> {
    if (!task.remoteId) {
      throw new Error('No remote ID for resume');
    }

    const abortController = new AbortController();
    this.abortControllers.set(task.id, abortController);

    // 为恢复的任务创建新的日志条目
    const { startLLMApiLog } = await import('../llm-api-logger');
    const logId = startLLMApiLog({
      endpoint: `/characters/${task.remoteId} (resumed)`,
      model: 'character-extractor',
      taskType: 'character',
      prompt: (task.params?.videoUrl as string) || '',
      taskId: task.id,
    });

    try {
      config.onProgress(task.id, task.progress || 0, TaskExecutionPhase.POLLING);

      const result = await this.pollUntilComplete(
        task.remoteId,
        task.id,
        config,
        abortController.signal,
        logId
      );

      return result;
    } finally {
      this.cleanup(task.id);
    }
  }

  /**
   * Cancel character extraction
   */
  cancel(taskId: string): void {
    this.cleanup(taskId);
  }

  /**
   * Create character via API
   * Uses /v1/videos endpoint with FormData (character_from_task parameter)
   */
  private async createCharacter(
    task: SWTask,
    config: HandlerConfig,
    signal: AbortSignal
  ): Promise<SubmitResult> {
    const { videoConfig } = config;
    const { params } = task;

    // Determine character model based on source video model
    const characterModel = this.getCharacterModel(params.model);

    // Build FormData request body (API requires multipart/form-data)
    const formData = new FormData();
    formData.append('character_from_task', params.sourceVideoTaskId || '');
    formData.append('model', characterModel);

    if (params.characterTimestamps) {
      formData.append('character_timestamps', params.characterTimestamps);
    }

    // Import loggers
    const { debugFetch } = await import('../debug-fetch');
    const { startLLMApiLog, completeLLMApiLog, failLLMApiLog } = await import('../llm-api-logger');
    
    const startTime = Date.now();
    const logId = startLLMApiLog({
      endpoint: '/videos',
      model: characterModel,
      taskType: 'character',
      prompt: `角色提取: ${params.sourceVideoTaskId}`,
      taskId: task.id,
    });

    const response = await debugFetch(`${videoConfig.baseUrl}/videos`, {
      method: 'POST',
      headers: {
        ...(videoConfig.apiKey
          ? { Authorization: `Bearer ${videoConfig.apiKey}` }
          : {}),
      },
      body: formData,
      signal,
    }, {
      label: `👤 创建角色视频 (${characterModel})`,
      logResponseBody: true,
    });

    if (!response.ok) {
      const errorText = await response.text();
      failLLMApiLog(logId, {
        httpStatus: response.status,
        duration: Date.now() - startTime,
        errorMessage: errorText,
        responseBody: errorText,
      });
      throw new Error(`Character creation failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // 记录 remoteId 到日志，以便在 SW 重启时恢复
    if (data.id) {
      const { updateLLMApiLogMetadata } = await import('../llm-api-logger');
      updateLLMApiLogMetadata(logId, {
        remoteId: data.id,
        responseBody: JSON.stringify(data),
        httpStatus: response.status,
      });
    }

    // 注意：这里不调用 completeLLMApiLog，因为角色还在异步处理中
    // 最终结果会在 pollUntilComplete 完成后更新

    return { response: data, logId };
  }

  /**
   * Poll character status until completion
   */
  private async pollUntilComplete(
    characterId: string,
    taskId: string,
    config: HandlerConfig,
    signal: AbortSignal,
    logId?: string
  ): Promise<TaskResult> {
    const { videoConfig } = config;
    const pollInterval = 3000; // 3 seconds
    const maxAttempts = 60; // 3 minutes
    const startTime = Date.now();

    let attempts = 0;

    return new Promise((resolve, reject) => {
      const poll = async () => {
        if (signal.aborted) {
          // 更新日志为失败
          if (logId) {
            const { failLLMApiLog } = await import('../llm-api-logger');
            failLLMApiLog(logId, {
              duration: Date.now() - startTime,
              errorMessage: 'Task cancelled',
            });
          }
          reject(new Error('Task cancelled'));
          return;
        }

        attempts++;
        if (attempts > maxAttempts) {
          // 更新日志为失败
          if (logId) {
            const { failLLMApiLog } = await import('../llm-api-logger');
            failLLMApiLog(logId, {
              duration: Date.now() - startTime,
              errorMessage: 'Character creation timeout',
            });
          }
          reject(new Error('Character creation timeout'));
          return;
        }

        try {
          const character = await this.queryCharacter(characterId, videoConfig, signal);

          // Update progress
          const progress = Math.min(10 + (attempts / maxAttempts) * 90, 99);
          config.onProgress(taskId, progress, TaskExecutionPhase.POLLING);

          // Character is ready when we get username
          if (character.username) {
            config.onProgress(taskId, 100);

            // 更新日志为成功
            if (logId) {
              const { completeLLMApiLog } = await import('../llm-api-logger');
              completeLLMApiLog(logId, {
                httpStatus: 200,
                duration: Date.now() - startTime,
                resultType: 'character',
                resultCount: 1,
                resultUrl: character.profile_picture_url,
                responseBody: JSON.stringify(character),
              });
            }

            resolve({
              url: character.profile_picture_url,
              format: 'png',
              size: 0,
              characterUsername: character.username,
              characterProfileUrl: character.profile_picture_url,
              characterPermalink: character.permalink,
            });
            return;
          }

          // Continue polling
          const intervalId = setTimeout(poll, pollInterval);
          this.pollingIntervals.set(taskId, intervalId);
        } catch (error) {
          // 404 means still processing
          if (error instanceof Error && error.message.includes('404')) {
            const intervalId = setTimeout(poll, pollInterval);
            this.pollingIntervals.set(taskId, intervalId);
          } else if (attempts < maxAttempts) {
            // Network errors - retry
            const intervalId = setTimeout(poll, pollInterval);
            this.pollingIntervals.set(taskId, intervalId);
          } else {
            // 更新日志为失败
            if (logId) {
              const { failLLMApiLog } = await import('../llm-api-logger');
              failLLMApiLog(logId, {
                duration: Date.now() - startTime,
                errorMessage: error instanceof Error ? error.message : String(error),
              });
            }
            reject(error);
          }
        }
      };

      poll();
    });
  }

  /**
   * Query character status
   * Uses /v1/videos endpoint (same as video query)
   */
  private async queryCharacter(
    characterId: string,
    videoConfig: { baseUrl: string; apiKey?: string },
    signal: AbortSignal
  ): Promise<CharacterQueryResponse> {
    // Use debugFetch for logging
    const { debugFetch } = await import('../debug-fetch');
    const response = await debugFetch(`${videoConfig.baseUrl}/videos/${characterId}`, {
      method: 'GET',
      headers: videoConfig.apiKey
        ? { Authorization: `Bearer ${videoConfig.apiKey}` }
        : undefined,
      signal,
    }, {
      label: `👤 查询角色状态`,
      logResponseBody: true,
    });

    if (!response.ok) {
      throw new Error(`Character query failed: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get character model based on source video model
   */
  private getCharacterModel(sourceModel?: string): string {
    if (sourceModel === 'sora-2-pro') {
      return 'sora-2-pro-character';
    }
    return 'sora-2-character';
  }

  /**
   * Cleanup resources
   */
  private cleanup(taskId: string): void {
    const controller = this.abortControllers.get(taskId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(taskId);
    }

    const interval = this.pollingIntervals.get(taskId);
    if (interval) {
      clearTimeout(interval);
      this.pollingIntervals.delete(taskId);
    }
  }
}
