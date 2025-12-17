/**
 * Storyboard Mode Utilities
 *
 * Utility functions for managing storyboard scenes in video generation.
 * Supports duration calculation, validation, and prompt formatting.
 */

import type { StoryboardScene } from '../types/video.types';

/**
 * Generate a unique scene ID
 */
export function generateSceneId(): string {
  return `scene-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a new empty scene
 */
export function createEmptyScene(order: number, duration: number): StoryboardScene {
  return {
    id: generateSceneId(),
    order,
    duration,
    prompt: '',
  };
}

/**
 * Calculate default scene durations using halving strategy
 *
 * Strategy: Each subsequent scene gets half of the remaining time.
 * Example for 15s with 3 scenes: [7.5, 3.75, 3.75]
 *
 * @param totalDuration Total video duration in seconds
 * @param sceneCount Number of scenes
 * @returns Array of durations for each scene
 */
export function calculateDefaultSceneDurations(
  totalDuration: number,
  sceneCount: number
): number[] {
  if (sceneCount <= 0) return [];
  if (sceneCount === 1) return [totalDuration];

  const durations: number[] = [];
  let remaining = totalDuration;

  for (let i = 0; i < sceneCount; i++) {
    if (i === sceneCount - 1) {
      // Last scene gets all remaining time
      durations.push(Math.round(remaining * 10) / 10);
    } else {
      // Each scene gets half of remaining time
      const duration = remaining / 2;
      durations.push(Math.round(duration * 10) / 10);
      remaining -= duration;
    }
  }

  return durations;
}

/**
 * Calculate equal scene durations
 *
 * Alternative strategy: Distribute time equally among all scenes.
 *
 * @param totalDuration Total video duration in seconds
 * @param sceneCount Number of scenes
 * @returns Array of equal durations
 */
export function calculateEqualSceneDurations(
  totalDuration: number,
  sceneCount: number
): number[] {
  if (sceneCount <= 0) return [];
  const duration = Math.round((totalDuration / sceneCount) * 10) / 10;
  return Array(sceneCount).fill(duration);
}

/**
 * Validate scene durations
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateSceneDurations(
  scenes: StoryboardScene[],
  totalDuration: number,
  minDuration: number = 1
): ValidationResult {
  if (scenes.length === 0) {
    return { valid: false, error: '至少需要一个场景' };
  }

  // Check each scene's duration is within valid range
  for (const scene of scenes) {
    if (scene.duration < minDuration) {
      return {
        valid: false,
        error: `场景 ${scene.order} 时长不能少于 ${minDuration} 秒`,
      };
    }
    if (scene.duration > totalDuration) {
      return {
        valid: false,
        error: `场景 ${scene.order} 时长不能超过 ${totalDuration} 秒`,
      };
    }
  }

  // Check for empty prompts
  const emptyPromptScene = scenes.find(s => !s.prompt.trim());
  if (emptyPromptScene) {
    return {
      valid: false,
      error: `场景 ${emptyPromptScene.order} 需要填写提示词`,
    };
  }

  return { valid: true };
}

/**
 * Calculate remaining duration available for new scenes
 */
export function calculateRemainingDuration(
  scenes: StoryboardScene[],
  totalDuration: number
): number {
  const used = scenes.reduce((acc, s) => acc + s.duration, 0);
  return Math.round((totalDuration - used) * 10) / 10;
}

/**
 * Format storyboard scenes into API prompt format
 *
 * Output format:
 * Shot 1:
 * duration: 7.5sec
 * Scene: 飞机起飞
 *
 * Shot 2:
 * duration: 7.5sec
 * Scene: 飞机降落
 */
export function formatStoryboardPrompt(scenes: StoryboardScene[]): string {
  return scenes
    .sort((a, b) => a.order - b.order)
    .map(
      (scene, index) =>
        `Shot ${index + 1}:\nduration: ${scene.duration}sec\nScene: ${scene.prompt.trim()}`
    )
    .join('\n\n');
}

/**
 * Parse storyboard prompt back into scenes (for edit recovery)
 *
 * @param prompt Formatted storyboard prompt
 * @returns Array of scenes or null if not a valid storyboard prompt
 */
export function parseStoryboardPrompt(prompt: string): StoryboardScene[] | null {
  const shotRegex =
    /Shot\s+(\d+):\s*\n\s*duration:\s*([\d.]+)\s*sec\s*\n\s*Scene:\s*([^\n]+(?:\n(?!Shot\s+\d+:)[^\n]*)*)/gi;

  const scenes: StoryboardScene[] = [];
  let match;

  while ((match = shotRegex.exec(prompt)) !== null) {
    const order = parseInt(match[1], 10);
    const duration = parseFloat(match[2]);
    const scenePrompt = match[3].trim();

    scenes.push({
      id: generateSceneId(),
      order,
      duration,
      prompt: scenePrompt,
    });
  }

  if (scenes.length === 0) {
    return null;
  }

  // Sort by order
  return scenes.sort((a, b) => a.order - b.order);
}

/**
 * Check if a prompt is in storyboard format
 */
export function isStoryboardPrompt(prompt: string): boolean {
  return /Shot\s+\d+:\s*\n\s*duration:\s*[\d.]+\s*sec/i.test(prompt);
}

/**
 * Redistribute durations when a scene is added or removed
 *
 * @param scenes Current scenes
 * @param totalDuration Total video duration
 * @param addedSceneIndex Index where new scene will be added (-1 for append)
 * @returns Updated scenes with redistributed durations
 */
export function redistributeDurationsOnAdd(
  scenes: StoryboardScene[],
  totalDuration: number,
  addedSceneIndex: number = -1
): StoryboardScene[] {
  const newSceneCount = scenes.length + 1;
  const newDurations = calculateDefaultSceneDurations(totalDuration, newSceneCount);

  // Create new scene
  const newScene = createEmptyScene(
    addedSceneIndex >= 0 ? addedSceneIndex + 1 : newSceneCount,
    newDurations[newDurations.length - 1]
  );

  // Insert new scene and update orders
  const updatedScenes = [...scenes];
  if (addedSceneIndex >= 0 && addedSceneIndex < scenes.length) {
    updatedScenes.splice(addedSceneIndex, 0, newScene);
  } else {
    updatedScenes.push(newScene);
  }

  // Update durations and orders
  return updatedScenes.map((scene, index) => ({
    ...scene,
    order: index + 1,
    duration: newDurations[index],
  }));
}

/**
 * Update scene order numbers after deletion
 */
export function reorderScenes(scenes: StoryboardScene[]): StoryboardScene[] {
  return scenes
    .sort((a, b) => a.order - b.order)
    .map((scene, index) => ({
      ...scene,
      order: index + 1,
    }));
}

/**
 * Get duration usage percentage for display
 */
export function getDurationUsagePercent(
  scenes: StoryboardScene[],
  totalDuration: number
): number {
  const used = scenes.reduce((acc, s) => acc + s.duration, 0);
  return Math.round((used / totalDuration) * 100);
}
