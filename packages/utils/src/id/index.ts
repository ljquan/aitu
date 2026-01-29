/**
 * ID Generation Utilities
 *
 * Functions for generating unique identifiers.
 */

/**
 * Generate a UUID v4 using the browser's native crypto API
 *
 * @returns A UUID v4 string (e.g., "550e8400-e29b-41d4-a716-446655440000")
 *
 * @example
 * generateUUID() // "550e8400-e29b-41d4-a716-446655440000"
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Generate a unique ID with optional prefix
 *
 * Format: `${prefix}_${timestamp}_${random}` or `${timestamp}_${random}`
 *
 * @param prefix - Optional prefix (e.g., 'task', 'prompt', 'scene')
 * @returns A unique identifier string
 *
 * @example
 * generateId() // "1704067200000_abc123"
 * generateId('task') // "task_1704067200000_abc123"
 * generateId('prompt') // "prompt_1704067200000_xyz789"
 */
export function generateId(prefix?: string): string {
  const id = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  return prefix ? `${prefix}_${id}` : id;
}
