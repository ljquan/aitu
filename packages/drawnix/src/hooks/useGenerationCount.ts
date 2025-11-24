/**
 * useGenerationCount Hook
 *
 * Manages generation count state for batch generation feature.
 * Provides preset selection, custom input, validation, and persistence.
 */

import { useState, useCallback, useEffect } from 'react';
import { GENERATION_COUNT, GENERATION_COUNT_STORAGE_KEY } from '../constants/generation';

/**
 * Return type for useGenerationCount hook
 */
export interface UseGenerationCountReturn {
  /** Current generation count */
  count: number;
  /** Set generation count */
  setCount: (count: number) => void;
  /** Whether current value is a preset option */
  isPreset: boolean;
  /** Whether current count is valid */
  isValid: boolean;
  /** Reset to default value */
  reset: () => void;
}

/**
 * Hook for managing generation count state
 *
 * @example
 * const { count, setCount, isPreset, isValid } = useGenerationCount();
 *
 * // Use in generation
 * const handleGenerate = () => {
 *   if (isValid) {
 *     createBatchTasks(params, type, count);
 *   }
 * };
 */
export function useGenerationCount(): UseGenerationCountReturn {
  const [count, setCountState] = useState<number>(() => {
    // Load from localStorage on initial mount
    try {
      const saved = localStorage.getItem(GENERATION_COUNT_STORAGE_KEY);
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= GENERATION_COUNT.MIN && parsed <= GENERATION_COUNT.MAX) {
          return parsed;
        }
      }
    } catch (error) {
      console.warn('Failed to load generation count preference:', error);
    }
    return GENERATION_COUNT.DEFAULT;
  });

  // Check if current value is a preset
  const isPreset = (GENERATION_COUNT.PRESETS as readonly number[]).includes(count);

  // Validate count is within range
  const isValid = count >= GENERATION_COUNT.MIN && count <= GENERATION_COUNT.MAX && Number.isInteger(count);

  // Set count with validation
  const setCount = useCallback((newCount: number) => {
    // Clamp to valid range
    const validCount = Math.max(
      GENERATION_COUNT.MIN,
      Math.min(GENERATION_COUNT.MAX, Math.round(newCount))
    );
    setCountState(validCount);
  }, []);

  // Reset to default
  const reset = useCallback(() => {
    setCountState(GENERATION_COUNT.DEFAULT);
  }, []);

  // Save to localStorage when count changes
  useEffect(() => {
    try {
      localStorage.setItem(GENERATION_COUNT_STORAGE_KEY, count.toString());
    } catch (error) {
      console.warn('Failed to save generation count preference:', error);
    }
  }, [count]);

  return {
    count,
    setCount,
    isPreset,
    isValid,
    reset
  };
}
