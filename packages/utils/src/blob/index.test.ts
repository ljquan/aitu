/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import {
  blobToBase64,
  pureBase64ToBlob,
  dataUrlToBlob,
  blobToDataUrl,
} from './index';

describe('blobToBase64', () => {
  it('should convert text Blob to base64', async () => {
    const blob = new Blob(['Hello'], { type: 'text/plain' });
    const base64 = await blobToBase64(blob);

    // "Hello" in base64 is "SGVsbG8="
    expect(base64).toBe('SGVsbG8=');
  });

  it('should convert binary Blob to base64', async () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 4, 5]);
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const base64 = await blobToBase64(blob);

    expect(base64).toBe('AAECAwQF');
  });

  it('should handle empty Blob', async () => {
    const blob = new Blob([], { type: 'text/plain' });
    const base64 = await blobToBase64(blob);

    expect(base64).toBe('');
  });
});

describe('pureBase64ToBlob', () => {
  it('should convert base64 to Blob with correct type', () => {
    // "Hello" in base64 is "SGVsbG8="
    const blob = pureBase64ToBlob('SGVsbG8=', 'text/plain');

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('text/plain');
    expect(blob.size).toBe(5); // "Hello" is 5 bytes
  });

  it('should convert binary base64 to Blob', () => {
    // [0, 1, 2, 3, 4, 5] in base64 is "AAECAwQF"
    const blob = pureBase64ToBlob('AAECAwQF', 'application/octet-stream');

    expect(blob.size).toBe(6);
    expect(blob.type).toBe('application/octet-stream');
  });

  it('should handle empty base64', () => {
    const blob = pureBase64ToBlob('', 'text/plain');

    expect(blob.size).toBe(0);
  });
});

describe('dataUrlToBlob', () => {
  it('should extract mime type and convert to Blob', () => {
    const dataUrl = 'data:text/plain;base64,SGVsbG8=';
    const blob = dataUrlToBlob(dataUrl);

    expect(blob.type).toBe('text/plain');
    expect(blob.size).toBe(5);
  });

  it('should handle image data URL', () => {
    // Minimal 1x1 PNG
    const dataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const blob = dataUrlToBlob(dataUrl);

    expect(blob.type).toBe('image/png');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('should default to application/octet-stream for unknown types', () => {
    // Malformed header without proper mime type
    const dataUrl = 'data:;base64,SGVsbG8=';
    const blob = dataUrlToBlob(dataUrl);

    expect(blob.type).toBe('application/octet-stream');
  });
});

describe('blobToDataUrl', () => {
  it('should convert Blob to data URL', async () => {
    const blob = new Blob(['Hello'], { type: 'text/plain' });
    const dataUrl = await blobToDataUrl(blob);

    expect(dataUrl).toBe('data:text/plain;base64,SGVsbG8=');
  });

  it('should preserve mime type in data URL', async () => {
    const blob = new Blob(['test'], { type: 'application/json' });
    const dataUrl = await blobToDataUrl(blob);

    expect(dataUrl.startsWith('data:application/json;base64,')).toBe(true);
  });
});

describe('roundtrip conversions', () => {
  // Helper to read blob as text
  async function readBlobAsText(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
  }

  it('should roundtrip blobToBase64 -> pureBase64ToBlob', async () => {
    const original = new Blob(['Test content 123'], { type: 'text/plain' });
    const base64 = await blobToBase64(original);
    const restored = pureBase64ToBlob(base64, 'text/plain');

    expect(restored.size).toBe(original.size);
    expect(await readBlobAsText(restored)).toBe(await readBlobAsText(original));
  });

  it('should roundtrip blobToDataUrl -> dataUrlToBlob', async () => {
    const original = new Blob(['Binary data'], { type: 'application/octet-stream' });
    const dataUrl = await blobToDataUrl(original);
    const restored = dataUrlToBlob(dataUrl);

    expect(restored.size).toBe(original.size);
    expect(await readBlobAsText(restored)).toBe(await readBlobAsText(original));
  });
});
