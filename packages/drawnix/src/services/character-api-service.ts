/**
 * Character API Service
 *
 * Handles Sora-2 character creation and query API calls.
 * Characters are extracted from completed Sora-2 video tasks.
 */

import { geminiSettings } from '../utils/settings-manager';
import {
  getCharacterModel,
  type CreateCharacterParams,
  type CharacterCreateResponse,
  type CharacterQueryResponse,
  type CharacterPollingOptions,
  type CharacterStatus,
} from '../types/character.types';

/**
 * Character API Service
 * Manages character creation with async polling
 */
class CharacterAPIService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = 'https://api.tu-zi.com';
  }

  /**
   * Create a character from a Sora-2 video task
   * @param params - Character creation parameters
   * @returns Character creation response with ID
   */
  async createCharacter(params: CreateCharacterParams): Promise<CharacterCreateResponse> {
    const settings = geminiSettings.get();
    const apiKey = settings.apiKey;

    if (!apiKey) {
      throw new Error('API Key 未配置，请先配置 API Key');
    }

    // Get character model based on source video model
    const characterModel = getCharacterModel(params.sourceModel);

    console.log('[CharacterAPI] Creating character from video:', params.videoTaskId);
    console.log('[CharacterAPI] Source model:', params.sourceModel, '-> Character model:', characterModel);
    console.log('[CharacterAPI] Timestamps:', params.characterTimestamps || 'default');

    const formData = new FormData();
    formData.append('character_from_task', params.videoTaskId);
    formData.append('model', characterModel);

    if (params.characterTimestamps) {
      // Note: API parameter is character_timestamps (not chacter_timestamps)
      formData.append('character_timestamps', params.characterTimestamps);
    }

    const response = await fetch(`${this.baseUrl}/v1/videos`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[CharacterAPI] Create failed:', response.status, errorText);
      const error = new Error(`角色创建失败: ${response.status} - ${errorText}`);
      (error as any).apiErrorBody = errorText;
      (error as any).httpStatus = response.status;
      throw error;
    }

    const result = await response.json();
    console.log('[CharacterAPI] Character created:', result);
    return result;
  }

  /**
   * Query character status and information
   * @param characterId - Character ID (format: sora-2-character:ch_xxx)
   * @returns Character information
   */
  async queryCharacter(characterId: string): Promise<CharacterQueryResponse> {
    const settings = geminiSettings.get();
    const apiKey = settings.apiKey;

    if (!apiKey) {
      throw new Error('API Key 未配置');
    }

    const maxRetries = 3;
    const retryDelay = 2000;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}/v1/videos/${characterId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[CharacterAPI] Query failed:', response.status, errorText);

          // Check if it's a "not ready" error (character still being processed)
          if (response.status === 404 || response.status === 202) {
            throw new Error('CHARACTER_PROCESSING');
          }

          const error = new Error(`角色查询失败: ${response.status} - ${errorText}`);
          (error as any).apiErrorBody = errorText;
          (error as any).httpStatus = response.status;
          throw error;
        }

        const result = await response.json();
        console.log('[CharacterAPI] Character query result:', result);
        return result;
      } catch (error) {
        lastError = error as Error;
        const isNetworkError = error instanceof TypeError &&
          (error.message.includes('Failed to fetch') || error.message.includes('network'));

        if (isNetworkError && attempt < maxRetries) {
          console.warn(`[CharacterAPI] Network error on attempt ${attempt}/${maxRetries}, retrying...`);
          await this.sleep(retryDelay);
          continue;
        }

        throw error;
      }
    }

    throw lastError || new Error('角色查询失败');
  }

  /**
   * Create character and poll until completion
   * @param params - Character creation parameters
   * @param options - Polling options
   * @returns Completed character information
   */
  async createCharacterWithPolling(
    params: CreateCharacterParams,
    options: CharacterPollingOptions = {}
  ): Promise<CharacterQueryResponse & { characterId: string }> {
    const {
      interval = 3000,
      maxAttempts = 60, // 3 minutes at 3s interval
      onStatusChange,
    } = options;

    // Create character
    console.log('[CharacterAPI] Submitting character creation...');
    const createResponse = await this.createCharacter(params);
    const characterId = createResponse.id;
    console.log('[CharacterAPI] Character creation submitted:', characterId);

    // Notify status change
    if (onStatusChange) {
      onStatusChange('processing' as CharacterStatus);
    }

    // Poll for completion
    let attempts = 0;
    while (attempts < maxAttempts) {
      await this.sleep(interval);
      attempts++;

      try {
        console.log(`[CharacterAPI] Polling attempt ${attempts}/${maxAttempts}...`);
        const result = await this.queryCharacter(characterId);

        // Character is ready when we get username and profile_picture_url
        if (result.username && result.profile_picture_url) {
          console.log('[CharacterAPI] Character ready:', result.username);
          if (onStatusChange) {
            onStatusChange('completed' as CharacterStatus);
          }
          return { ...result, characterId };
        }
      } catch (error) {
        // If it's a processing error, continue polling
        if ((error as Error).message === 'CHARACTER_PROCESSING') {
          console.log('[CharacterAPI] Character still processing...');
          continue;
        }

        // For other errors, check if we should continue
        console.warn('[CharacterAPI] Query error:', (error as Error).message);

        // If it's the last attempt, throw the error
        if (attempts >= maxAttempts) {
          if (onStatusChange) {
            onStatusChange('failed' as CharacterStatus);
          }
          throw error;
        }
      }
    }

    // Timeout
    if (onStatusChange) {
      onStatusChange('failed' as CharacterStatus);
    }
    throw new Error('角色创建超时，请稍后重试');
  }

  /**
   * Resume polling for an existing character
   * Used to recover from page refresh
   * @param characterId - Character ID to poll
   * @param options - Polling options
   * @returns Character information
   */
  async resumePolling(
    characterId: string,
    options: CharacterPollingOptions = {}
  ): Promise<CharacterQueryResponse> {
    const { onStatusChange } = options;

    console.log('[CharacterAPI] Resuming poll for character:', characterId);

    // Check immediate status
    try {
      const result = await this.queryCharacter(characterId);

      if (result.username && result.profile_picture_url) {
        console.log('[CharacterAPI] Character already ready:', result.username);
        if (onStatusChange) {
          onStatusChange('completed' as CharacterStatus);
        }
        return result;
      }
    } catch (error) {
      if ((error as Error).message !== 'CHARACTER_PROCESSING') {
        throw error;
      }
    }

    // Continue polling
    return this.pollUntilComplete(characterId, options);
  }

  /**
   * Poll for character completion
   * @private
   */
  private async pollUntilComplete(
    characterId: string,
    options: CharacterPollingOptions = {}
  ): Promise<CharacterQueryResponse> {
    const {
      interval = 3000,
      maxAttempts = 60,
      onStatusChange,
    } = options;

    let attempts = 0;

    while (attempts < maxAttempts) {
      await this.sleep(interval);
      attempts++;

      try {
        console.log(`[CharacterAPI] Poll attempt ${attempts}/${maxAttempts}...`);
        const result = await this.queryCharacter(characterId);

        if (result.username && result.profile_picture_url) {
          console.log('[CharacterAPI] Character ready:', result.username);
          if (onStatusChange) {
            onStatusChange('completed' as CharacterStatus);
          }
          return result;
        }
      } catch (error) {
        if ((error as Error).message === 'CHARACTER_PROCESSING') {
          continue;
        }

        if (attempts >= maxAttempts) {
          if (onStatusChange) {
            onStatusChange('failed' as CharacterStatus);
          }
          throw error;
        }
      }
    }

    if (onStatusChange) {
      onStatusChange('failed' as CharacterStatus);
    }
    throw new Error('角色创建超时，请稍后重试');
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const characterAPIService = new CharacterAPIService();
