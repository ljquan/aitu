/**
 * DOM Utilities
 *
 * Browser DOM manipulation utilities.
 */

/**
 * Trigger a file download from a Blob or MediaSource
 *
 * Creates a temporary download link and triggers it programmatically.
 * Properly cleans up the object URL after download.
 *
 * @param blob - The Blob or MediaSource to download
 * @param filename - The filename for the downloaded file
 *
 * @example
 * // Download a text file
 * const blob = new Blob(['Hello, World!'], { type: 'text/plain' });
 * download(blob, 'hello.txt');
 *
 * // Download an image
 * const imageBlob = await fetch(imageUrl).then(r => r.blob());
 * download(imageBlob, 'image.png');
 */
export function download(blob: Blob | MediaSource, filename: string): void {
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
 * Copy text to clipboard using the modern Clipboard API
 *
 * Falls back to document.execCommand for older browsers.
 *
 * @param text - The text to copy
 * @returns Promise that resolves when copy is complete
 *
 * @example
 * await copyToClipboard('Hello, World!');
 */
export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
  } else {
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    document.execCommand('copy');
    textArea.remove();
  }
}

/**
 * Read text from clipboard
 *
 * @returns Promise that resolves with the clipboard text
 *
 * @example
 * const text = await readFromClipboard();
 * console.log('Clipboard contains:', text);
 */
export async function readFromClipboard(): Promise<string> {
  if (navigator.clipboard && navigator.clipboard.readText) {
    return navigator.clipboard.readText();
  }
  throw new Error('Clipboard API not supported');
}
