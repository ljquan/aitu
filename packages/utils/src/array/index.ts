/**
 * Array Utilities
 *
 * Pure functions for array manipulation and transformation.
 * All functions are generic and framework-agnostic.
 */

/**
 * Split an array into rows/chunks of specified size
 *
 * Useful for creating grid layouts or paginating data.
 *
 * @param items - Array to split into rows
 * @param cols - Number of items per row
 * @returns Array of arrays, where each sub-array contains at most `cols` items
 *
 * @example
 * ```typescript
 * const items = [1, 2, 3, 4, 5, 6, 7];
 *
 * splitRows(items, 3);
 * // [[1, 2, 3], [4, 5, 6], [7]]
 *
 * splitRows(items, 2);
 * // [[1, 2], [3, 4], [5, 6], [7]]
 * ```
 */
export const splitRows = <T>(items: T[], cols: number): T[][] => {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += cols) {
    result.push(items.slice(i, i + cols));
  }
  return result;
};

/**
 * Chunk an array into groups of specified size (alias for splitRows)
 *
 * @param items - Array to chunk
 * @param size - Size of each chunk
 * @returns Array of chunks
 *
 * @example
 * ```typescript
 * chunk([1, 2, 3, 4, 5], 2);
 * // [[1, 2], [3, 4], [5]]
 * ```
 */
export const chunk = <T>(items: T[], size: number): T[][] => {
  return splitRows(items, size);
};
