/**
 * Logger Utility
 *
 * Provides a configurable logging utility that respects environment settings.
 * In production, debug and info logs are suppressed while errors and warnings are preserved.
 */

const isDev = import.meta.env.DEV;

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Create a namespaced logger for a specific module
 *
 * @param namespace - Module name prefix (e.g., 'CharacterAPI', 'TaskQueue')
 * @returns Logger instance with namespaced methods
 *
 * @example
 * ```typescript
 * const logger = createLogger('MyModule');
 * logger.debug('Initialization started'); // Only in dev
 * logger.error('Failed to load data'); // Always shown
 * ```
 */
export function createLogger(namespace: string) {
  const prefix = `[${namespace}]`;

  return {
    /**
     * Debug log - only shown in development
     */
    debug: (...args: unknown[]) => {
      if (isDev) {
        console.log(prefix, ...args);
      }
    },

    /**
     * Info log - only shown in development
     */
    info: (...args: unknown[]) => {
      if (isDev) {
        console.log(prefix, ...args);
      }
    },

    /**
     * Warning log - always shown
     */
    warn: (...args: unknown[]) => {
      console.warn(prefix, ...args);
    },

    /**
     * Error log - always shown
     */
    error: (...args: unknown[]) => {
      console.error(prefix, ...args);
    },
  };
}

/**
 * Default logger instance for general use
 *
 * @example
 * ```typescript
 * import { logger } from '@aitu/utils';
 *
 * logger.debug('Debug message'); // Only in dev
 * logger.info('Info message'); // Only in dev
 * logger.warn('Warning message'); // Always
 * logger.error('Error message'); // Always
 * ```
 */
export const logger = {
  debug: (...args: unknown[]) => isDev && console.log(...args),
  info: (...args: unknown[]) => isDev && console.log(...args),
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),
};

export default logger;
