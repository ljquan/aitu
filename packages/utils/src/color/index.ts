/**
 * Color Utilities
 *
 * Pure functions for color manipulation, hex color conversions, and opacity handling.
 * All functions are framework-agnostic and have zero external dependencies.
 */

// Color constants
export const TRANSPARENT = 'TRANSPARENT';
export const NO_COLOR = 'NO_COLOR';
export const WHITE = '#FFFFFF';

/**
 * Convert 0-100 opacity percentage to 0-255 alpha value
 *
 * @param transparency - Transparency value from 0 (opaque) to 100 (transparent)
 * @returns Alpha value from 0 (transparent) to 255 (opaque)
 *
 * @example
 * ```typescript
 * transparencyToAlpha255(0); // 255 (fully opaque)
 * transparencyToAlpha255(50); // 128 (50% transparent)
 * transparencyToAlpha255(100); // 0 (fully transparent)
 * ```
 */
export function transparencyToAlpha255(transparency: number): number {
  return Math.round(((100 - transparency) / 100) * 255);
}

/**
 * Convert 0-255 alpha value to 0-100 opacity percentage
 *
 * @param alpha255 - Alpha value from 0 (transparent) to 255 (opaque)
 * @returns Transparency value from 0 (opaque) to 100 (transparent)
 *
 * @example
 * ```typescript
 * alpha255ToTransparency(255); // 0 (fully opaque)
 * alpha255ToTransparency(128); // 50 (50% transparent)
 * alpha255ToTransparency(0); // 100 (fully transparent)
 * ```
 */
export function alpha255ToTransparency(alpha255: number): number {
  return Math.round((1 - alpha255 / 255) * 100);
}

/**
 * Apply opacity to a hex color by appending alpha channel
 *
 * @param hexColor - Base hex color (e.g., '#FF0000')
 * @param opacity - Opacity from 0 (transparent) to 100 (opaque)
 * @returns Hex color with alpha channel (e.g., '#FF000080')
 *
 * @example
 * ```typescript
 * applyOpacityToHex('#FF0000', 100); // '#FF0000FF' (fully opaque red)
 * applyOpacityToHex('#FF0000', 50); // '#FF000080' (50% opaque red)
 * applyOpacityToHex('#FF0000', 0); // '#FF000000' (fully transparent red)
 * ```
 */
export function applyOpacityToHex(hexColor: string, opacity: number): string {
  const alpha = transparencyToAlpha255(100 - opacity);
  const alphaHex = alpha.toString(16).padStart(2, '0');
  return `${hexColor}${alphaHex}`;
}

/**
 * Extract opacity percentage from hex color with alpha channel
 *
 * @param hexColor - Hex color with or without alpha (e.g., '#FF000080')
 * @returns Opacity from 0 (transparent) to 100 (opaque)
 *
 * @example
 * ```typescript
 * hexAlphaToOpacity('#FF0000FF'); // 100 (fully opaque)
 * hexAlphaToOpacity('#FF000080'); // 50 (50% opaque)
 * hexAlphaToOpacity('#FF0000'); // 100 (no alpha = fully opaque)
 * hexAlphaToOpacity('#F00F'); // 100 (short form with alpha)
 * hexAlphaToOpacity('#F008'); // ~50 (short form 50% opaque)
 * ```
 */
export function hexAlphaToOpacity(hexColor: string): number {
  // Remove possible # prefix
  hexColor = hexColor.replace(/^#/, '');

  let alpha;
  if (hexColor.length === 8) {
    // 8-digit hex, extract last 2 digits as alpha value
    alpha = parseInt(hexColor.slice(6, 8), 16);
  } else if (hexColor.length === 4) {
    // 4-digit hex (shorthand), extract last digit and repeat
    alpha = parseInt(hexColor.slice(3, 4).repeat(2), 16);
  } else {
    // No alpha channel, assume fully opaque
    return 100;
  }

  return 100 - alpha255ToTransparency(alpha);
}

/**
 * Remove alpha channel from hex color
 *
 * @param hexColor - Hex color with or without alpha
 * @returns Hex color without alpha channel (always 6 or 3 digits with #)
 *
 * @example
 * ```typescript
 * removeHexAlpha('#FF0000FF'); // '#FF0000'
 * removeHexAlpha('#FF000080'); // '#FF0000'
 * removeHexAlpha('#F008'); // '#F00'
 * removeHexAlpha('#FF0000'); // '#FF0000' (unchanged)
 * ```
 */
export function removeHexAlpha(hexColor: string): string {
  // Remove possible # prefix and convert to uppercase
  const hexColorClone = hexColor.replace(/^#/, '').toUpperCase();

  if (hexColorClone.length === 8) {
    // 8-digit hex, remove last 2 digits
    return '#' + hexColorClone.slice(0, 6);
  } else if (hexColorClone.length === 4) {
    // 4-digit hex (shorthand), remove last digit
    return '#' + hexColorClone.slice(0, 3);
  } else if (hexColorClone.length === 6 || hexColorClone.length === 3) {
    // Already standard 6 or 3 digit form, return as-is
    return '#' + hexColorClone;
  } else {
    return hexColor;
  }
}

/**
 * Check if a color value is valid (not 'none')
 *
 * @param color - Color string to validate
 * @returns True if color is valid, false if 'none'
 *
 * @example
 * ```typescript
 * isValidColor('#FF0000'); // true
 * isValidColor('none'); // false
 * ```
 */
export function isValidColor(color: string): boolean {
  if (color === 'none') {
    return false;
  }
  return true;
}

/**
 * Check if color represents transparent
 *
 * @param color - Color string to check
 * @returns True if color is TRANSPARENT constant
 *
 * @example
 * ```typescript
 * isTransparent('TRANSPARENT'); // true
 * isTransparent('#FF0000'); // false
 * ```
 */
export function isTransparent(color?: string): boolean {
  return color === TRANSPARENT;
}

/**
 * Check if color is white
 *
 * @param color - Color string to check
 * @returns True if color is white (#FFFFFF)
 *
 * @example
 * ```typescript
 * isWhite('#FFFFFF'); // true
 * isWhite('#FF0000'); // false
 * ```
 */
export function isWhite(color?: string): boolean {
  return color === WHITE;
}

/**
 * Check if opacity represents fully transparent (0%)
 *
 * @param opacity - Opacity value from 0 to 100
 * @returns True if opacity is 0
 *
 * @example
 * ```typescript
 * isFullyTransparent(0); // true
 * isFullyTransparent(50); // false
 * isFullyTransparent(100); // false
 * ```
 */
export function isFullyTransparent(opacity: number): boolean {
  return opacity === 0;
}

/**
 * Check if opacity represents fully opaque (100%)
 *
 * @param opacity - Opacity value from 0 to 100
 * @returns True if opacity is 100
 *
 * @example
 * ```typescript
 * isFullyOpaque(100); // true
 * isFullyOpaque(50); // false
 * isFullyOpaque(0); // false
 * ```
 */
export function isFullyOpaque(opacity: number): boolean {
  return opacity === 100;
}

/**
 * Check if value represents "no color" selection
 *
 * @param value - Color value to check
 * @returns True if value is NO_COLOR constant
 *
 * @example
 * ```typescript
 * isNoColor('NO_COLOR'); // true
 * isNoColor('#FF0000'); // false
 * ```
 */
export function isNoColor(value: string): boolean {
  return value === NO_COLOR;
}
