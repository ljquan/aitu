import { IS_APPLE, IS_MAC, PlaitBoard, toImage, ToImageOptions } from '@plait/core';




/**
 * Convert Plait board to image (Plait-specific)
 *
 * @param board - Plait board instance
 * @param options - Image export options
 * @returns Promise resolving to image data URL
 */
export const boardToImage = (
  board: PlaitBoard,
  options: ToImageOptions = {}
) => {
  return toImage(board, {
    fillStyle: 'transparent',
    inlineStyleClassNames: '.extend,.emojis,.text',
    padding: 20,
    ratio: 4,
    ...options,
  });
};

/**
 * Trigger download of a Blob or MediaSource
 *
 * @param blob - Blob or MediaSource to download
 * @param filename - Filename for downloaded file
 */
export function download(blob: Blob | MediaSource, filename: string) {
  const a = document.createElement('a');
  const url = window.URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  window.URL.revokeObjectURL(url);
  a.remove();
}

/**
 * Format keyboard shortcut for current platform (Plait-specific)
 *
 * @param shortcut - Shortcut string with placeholders
 * @returns Platform-specific shortcut string
 */
export const getShortcutKey = (shortcut: string): string => {
  shortcut = shortcut
    .replace(/\bAlt\b/i, "Alt")
    .replace(/\bShift\b/i, "Shift")
    .replace(/\b(Enter|Return)\b/i, "Enter");
  if (IS_APPLE || IS_MAC) {
    return shortcut
      .replace(/\bCtrlOrCmd\b/gi, "Cmd")
      .replace(/\bAlt\b/i, "Option");
  }
  return shortcut.replace(/\bCtrlOrCmd\b/gi, "Ctrl");
};