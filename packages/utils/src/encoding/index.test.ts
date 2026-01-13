import { describe, it, expect } from 'vitest';
import { base64ToBlob } from './index';

describe('base64ToBlob', () => {
  it('should convert PNG base64 to Blob', () => {
    const base64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const blob = base64ToBlob(base64);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/png');
  });

  it('should convert JPEG base64 to Blob', () => {
    // 1x1 red JPEG (minimal valid JPEG)
    const base64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AN/8A/9k=';
    const blob = base64ToBlob(base64);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/jpeg');
  });

  it('should convert text base64 to Blob', () => {
    const base64 = 'data:text/plain;base64,SGVsbG8gV29ybGQ='; // "Hello World"
    const blob = base64ToBlob(base64);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('text/plain');
  });

  it('should handle SVG base64', () => {
    const base64 = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCI+PC9zdmc+';
    const blob = base64ToBlob(base64);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/svg+xml');
  });

  it('should create Blob with correct size', () => {
    // 1x1 red PNG (very small)
    const base64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
    const blob = base64ToBlob(base64);

    expect(blob.size).toBeGreaterThan(0);
    expect(blob.size).toBe(70); // Known size for this specific PNG
  });

  it('should preserve binary data integrity', async () => {
    const base64 = 'data:text/plain;base64,SGVsbG8gV29ybGQ='; // "Hello World"
    const blob = base64ToBlob(base64);

    const text = await blob.text();
    expect(text).toBe('Hello World');
  });
});
