/**
 * Logger Utility
 *
 * Provides a configurable logging utility that respects environment settings.
 * In production, debug logs are suppressed while errors and warnings are preserved.
 */

const isDev = import.meta.env.DEV;

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Create a namespaced logger for a specific module
 * @param namespace - Module name prefix (e.g., 'CharacterAPI', 'TaskQueue')
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
 */
export const logger = {
  debug: (...args: unknown[]) => isDev && console.log(...args),
  info: (...args: unknown[]) => isDev && console.log(...args),
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),
};

export default logger;
