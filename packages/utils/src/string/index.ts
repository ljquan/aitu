/**
 * Sanitize a string to be used as a filename
 * - Removes special characters except Chinese, English, numbers, spaces, and dashes
 * - Replaces spaces with dashes
 * - Truncates to specified max length
 *
 * @param text - The text to sanitize
 * @param maxLength - Maximum length of the filename (default: 50)
 * @returns Sanitized filename
 *
 * @example
 * sanitizeFilename('Hello World! 你好世界') // "Hello-World-你好世界"
 * sanitizeFilename('file@#$%name.txt', 20) // "filename.txt"
 */
export function sanitizeFilename(text: string, maxLength = 50): string {
  return text
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5\s.-]/g, '') // Remove special chars, keep Chinese and dots
    .replace(/\s+/g, '-') // Replace spaces with dashes
    .substring(0, maxLength); // Limit length
}

/**
 * Truncate a string to a specified length and add ellipsis if needed
 *
 * @param text - The text to truncate
 * @param maxLength - Maximum length before truncation
 * @param ellipsis - String to append when truncated (default: '...')
 * @returns Truncated string
 *
 * @example
 * truncate('Hello World', 5) // "Hello..."
 * truncate('Hello World', 20) // "Hello World"
 */
export function truncate(text: string, maxLength: number, ellipsis = '...'): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - ellipsis.length) + ellipsis;
}

/**
 * Capitalize the first letter of a string
 *
 * @param text - The text to capitalize
 * @returns Capitalized string
 *
 * @example
 * capitalize('hello world') // "Hello world"
 */
export function capitalize(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Convert a string to kebab-case
 *
 * @param text - The text to convert
 * @returns Kebab-cased string
 *
 * @example
 * toKebabCase('HelloWorld') // "hello-world"
 * toKebabCase('hello_world') // "hello-world"
 */
export function toKebabCase(text: string): string {
  return text
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

/**
 * Convert a string to camelCase
 *
 * @param text - The text to convert
 * @returns CamelCased string
 *
 * @example
 * toCamelCase('hello-world') // "helloWorld"
 * toCamelCase('hello_world') // "helloWorld"
 */
export function toCamelCase(text: string): string {
  return text
    .replace(/[-_\s]+(.)?/g, (_, char) => (char ? char.toUpperCase() : ''))
    .replace(/^(.)/, (char) => char.toLowerCase());
}
