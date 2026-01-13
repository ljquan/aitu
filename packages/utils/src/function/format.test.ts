import { describe, it, expect } from 'vitest';
import { formatFileSize, formatDate, formatDuration } from './format';

describe('formatFileSize', () => {
  it('should format bytes correctly', () => {
    expect(formatFileSize(0)).toBe('0 Bytes');
    expect(formatFileSize(1)).toBe('1 Bytes');
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(1048576)).toBe('1 MB');
    expect(formatFileSize(1073741824)).toBe('1 GB');
    expect(formatFileSize(1099511627776)).toBe('1 TB');
  });

  it('should handle decimal values', () => {
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(2621440)).toBe('2.5 MB');
  });
});

describe('formatDate', () => {
  it('should format timestamp correctly', () => {
    const timestamp = new Date('2024-01-06T12:30:45').getTime();
    const formatted = formatDate(timestamp);

    expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(formatted).toContain('2024-01-06');
  });

  it('should pad single digits with zero', () => {
    const timestamp = new Date('2024-01-06T08:05:03').getTime();
    const formatted = formatDate(timestamp);

    expect(formatted).toContain('08:05:03');
  });
});

describe('formatDuration', () => {
  it('should format seconds', () => {
    expect(formatDuration(1000)).toBe('1s');
    expect(formatDuration(30000)).toBe('30s');
    expect(formatDuration(59000)).toBe('59s');
  });

  it('should format minutes and seconds', () => {
    expect(formatDuration(60000)).toBe('1m 0s');
    expect(formatDuration(90000)).toBe('1m 30s');
    expect(formatDuration(125000)).toBe('2m 5s');
  });

  it('should format hours, minutes and seconds', () => {
    expect(formatDuration(3600000)).toBe('1h 0m 0s');
    expect(formatDuration(3665000)).toBe('1h 1m 5s');
    expect(formatDuration(7384000)).toBe('2h 3m 4s');
  });
});
