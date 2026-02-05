/**
 * Async Utilities
 *
 * Utilities for working with Promises and asynchronous event handling.
 * All functions are pure and framework-agnostic.
 */

import type { ResolutionType } from '../types';

/**
 * Type guard to check if a value is Promise-like (has then/catch/finally methods)
 *
 * @param value - Value to check
 * @returns True if value implements Promise interface
 *
 * @example
 * ```typescript
 * const promise = Promise.resolve(42);
 * const notPromise = { value: 42 };
 *
 * if (isPromiseLike(promise)) {
 *   promise.then(console.log); // TypeScript knows it's a Promise
 * }
 *
 * isPromiseLike(notPromise); // false
 * ```
 */
export const isPromiseLike = (
  value: any
): value is Promise<ResolutionType<typeof value>> => {
  return (
    !!value &&
    typeof value === 'object' &&
    'then' in value &&
    'catch' in value &&
    'finally' in value
  );
};

/**
 * Compose multiple event handlers into a single handler
 *
 * Useful for merging user-provided event handlers with library handlers.
 * Taken from Radix UI primitives.
 *
 * @param originalEventHandler - User's event handler (optional)
 * @param ourEventHandler - Library's event handler (optional)
 * @param options - Configuration options
 * @param options.checkForDefaultPrevented - If true, skip ourEventHandler when defaultPrevented
 * @returns Composed event handler function
 *
 * @example
 * ```typescript
 * const userOnClick = (e) => console.log('User clicked');
 * const libraryOnClick = (e) => console.log('Library action');
 *
 * const composedHandler = composeEventHandlers(
 *   userOnClick,
 *   libraryOnClick,
 *   { checkForDefaultPrevented: true }
 * );
 *
 * button.addEventListener('click', composedHandler);
 * // Calls both handlers unless defaultPrevented
 * ```
 *
 * @see https://github.com/radix-ui/primitives/blob/main/packages/core/primitive/src/primitive.tsx
 */
export const composeEventHandlers = <E>(
  originalEventHandler?: (event: E) => void,
  ourEventHandler?: (event: E) => void,
  { checkForDefaultPrevented = true } = {}
) => {
  return function handleEvent(event: E) {
    originalEventHandler?.(event);

    if (
      !checkForDefaultPrevented ||
      !(event as unknown as Event)?.defaultPrevented
    ) {
      return ourEventHandler?.(event);
    }
  };
};

/**
 * Yield to the main thread to prevent UI blocking
 *
 * Use this in CPU-intensive loops to allow the browser to process
 * pending events (user input, rendering, etc.) between iterations.
 *
 * @example
 * ```typescript
 * for (let i = 0; i < largeArray.length; i++) {
 *   processItem(largeArray[i]);
 *   if (i % 10 === 0) {
 *     await yieldToMain(); // Yield every 10 items
 *   }
 * }
 * ```
 */
export const yieldToMain = (): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, 0));
};

/**
 * Process items in batches with yielding to prevent UI blocking
 *
 * @param items - Array of items to process
 * @param processor - Async function to process each item
 * @param batchSize - Number of items to process before yielding (default: 5)
 * @returns Array of results from processor
 *
 * @example
 * ```typescript
 * const results = await processBatched(
 *   boards,
 *   async (board) => {
 *     const json = JSON.stringify(board);
 *     return await encrypt(json);
 *   },
 *   5 // Process 5 boards before yielding
 * );
 * ```
 */
export const processBatched = async <T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  batchSize = 5
): Promise<R[]> => {
  const results: R[] = [];
  for (let i = 0; i < items.length; i++) {
    results.push(await processor(items[i], i));
    if ((i + 1) % batchSize === 0) {
      await yieldToMain();
    }
  }
  return results;
};
