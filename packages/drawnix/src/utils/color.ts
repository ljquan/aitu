import { DEFAULT_COLOR } from '@plait/core';

/**
 * Check if color is the default stroke color (Plait-specific)
 *
 * @param color - Color to check
 * @returns True if color is empty or matches Plait's DEFAULT_COLOR
 */
export function isDefaultStroke(color?: string) {
  return !color || color === DEFAULT_COLOR;
}
