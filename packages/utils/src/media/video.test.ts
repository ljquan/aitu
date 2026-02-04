/**
 * Video Utilities Tests
 */

import { describe, it, expect } from 'vitest';
import { calculateThumbnailSize, formatVideoTimestamp } from './video';

describe('calculateThumbnailSize', () => {
  it('should handle landscape video (width > height)', () => {
    const result = calculateThumbnailSize(1920, 1080, 400);
    expect(result.width).toBe(400);
    expect(result.height).toBe(225);
  });

  it('should handle portrait video (height > width)', () => {
    const result = calculateThumbnailSize(1080, 1920, 400);
    expect(result.width).toBe(225);
    expect(result.height).toBe(400);
  });

  it('should handle square video', () => {
    const result = calculateThumbnailSize(1000, 1000, 400);
    expect(result.width).toBe(400);
    expect(result.height).toBe(400);
  });

  it('should round dimensions to integers', () => {
    const result = calculateThumbnailSize(1920, 1080, 333);
    expect(Number.isInteger(result.width)).toBe(true);
    expect(Number.isInteger(result.height)).toBe(true);
  });

  it('should handle small maxSize', () => {
    const result = calculateThumbnailSize(1920, 1080, 100);
    expect(result.width).toBe(100);
    expect(result.height).toBe(56);
  });
});

describe('formatVideoTimestamp', () => {
  it('should format seconds correctly', () => {
    expect(formatVideoTimestamp(3.2)).toBe('0:03.2');
  });

  it('should format minutes correctly', () => {
    expect(formatVideoTimestamp(65.5)).toBe('1:05.5');
  });

  it('should format longer durations', () => {
    expect(formatVideoTimestamp(125)).toBe('2:05.0');
  });

  it('should handle zero', () => {
    expect(formatVideoTimestamp(0)).toBe('0:00.0');
  });

  it('should handle exact minutes', () => {
    expect(formatVideoTimestamp(60)).toBe('1:00.0');
  });

  it('should pad seconds correctly', () => {
    expect(formatVideoTimestamp(61.5)).toBe('1:01.5');
  });
});

// Note: generateVideoThumbnailFromBlob, extractVideoFrame, extractFirstFrame, extractLastFrame
// require DOM environment (video element, canvas) and are better tested in E2E tests
