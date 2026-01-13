/**
 * TypeScript Utility Types
 *
 * Helper types for improving TypeScript type inference and generic patterns
 */

/**
 * Extract the resolved type from a Promise-returning function
 *
 * @example
 * ```typescript
 * async function fetchUser() {
 *   return { id: 1, name: 'Alice' };
 * }
 *
 * type User = ResolutionType<typeof fetchUser>; // { id: number; name: string }
 * ```
 */
export type ResolutionType<T extends (...args: any) => any> = T extends (
  ...args: any
) => Promise<infer R>
  ? R
  : any;

/**
 * Extract the value type from an object type
 *
 * @example
 * ```typescript
 * const colors = {
 *   red: '#FF0000',
 *   blue: '#0000FF',
 * } as const;
 *
 * type ColorValue = ValueOf<typeof colors>; // '#FF0000' | '#0000FF'
 * ```
 */
export type ValueOf<T> = T[keyof T];
