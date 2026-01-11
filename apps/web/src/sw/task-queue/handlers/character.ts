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
      const createResponse = await this.createCharacter(
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
        abortController.signal
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

    try {
      config.onProgress(task.id, task.progress || 0, TaskExecutionPhase.POLLING);

      const result = await this.pollUntilComplete(
        task.remoteId,
        task.id,
        config,
        abortController.signal
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
   */
  private async createCharacter(
    task: SWTask,
    config: HandlerConfig,
    signal: AbortSignal
  ): Promise<CharacterCreateResponse> {
    const { videoConfig } = config;
    const { params } = task;

    // Determine character model based on source video model
    const characterModel = this.getCharacterModel(params.model);

    // Build request body
    const requestBody: Record<string, string> = {
      model: characterModel,
      video_id: params.sourceVideoTaskId || '',
    };

    if (params.characterTimestamps) {
      requestBody.character_timestamps = params.characterTimestamps;
    }

    const response = await fetch(`${videoConfig.baseUrl}/characters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(videoConfig.apiKey
          ? { Authorization: `Bearer ${videoConfig.apiKey}` }
          : {}),
      },
      body: JSON.stringify(requestBody),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Character creation failed: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Poll character status until completion
   */
  private async pollUntilComplete(
    characterId: string,
    taskId: string,
    config: HandlerConfig,
    signal: AbortSignal
  ): Promise<TaskResult> {
    const { videoConfig } = config;
    const pollInterval = 3000; // 3 seconds
    const maxAttempts = 60; // 3 minutes

    let attempts = 0;

    return new Promise((resolve, reject) => {
      const poll = async () => {
        if (signal.aborted) {
          reject(new Error('Task cancelled'));
          return;
        }

        attempts++;
        if (attempts > maxAttempts) {
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
            reject(error);
          }
        }
      };

      poll();
    });
  }

  /**
   * Query character status
   */
  private async queryCharacter(
    characterId: string,
    videoConfig: { baseUrl: string; apiKey?: string },
    signal: AbortSignal
  ): Promise<CharacterQueryResponse> {
    const response = await fetch(`${videoConfig.baseUrl}/characters/${characterId}`, {
      method: 'GET',
      headers: videoConfig.apiKey
        ? { Authorization: `Bearer ${videoConfig.apiKey}` }
        : undefined,
      signal,
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
