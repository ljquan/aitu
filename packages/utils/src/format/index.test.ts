import { describe, it, expect } from 'vitest';
import {
  formatSize,
  formatDurationMs,
  formatNumber,
  formatPercent,
  formatRelativeTime,
  truncateText,
} from './index';

describe('formatSize', () => {
  it('should format bytes', () => {
    expect(formatSize(0)).toBe('0 B');
    expect(formatSize(500)).toBe('500 B');
    expect(formatSize(1023)).toBe('1023 B');
  });

  it('should format kilobytes', () => {
    expect(formatSize(1024)).toBe('1.0 KB');
    expect(formatSize(1536)).toBe('1.5 KB');
    expect(formatSize(10240)).toBe('10.0 KB');
  });

  it('should format megabytes', () => {
    expect(formatSize(1048576)).toBe('1.0 MB');
    expect(formatSize(5242880)).toBe('5.0 MB');
    expect(formatSize(1572864)).toBe('1.5 MB');
  });

  it('should format gigabytes', () => {
    expect(formatSize(1073741824)).toBe('1.0 GB');
    expect(formatSize(5368709120)).toBe('5.0 GB');
  });

  it('should format terabytes', () => {
    expect(formatSize(1099511627776)).toBe('1.0 TB');
  });

  it('should respect decimal places', () => {
    expect(formatSize(1536, 0)).toBe('2 KB');
    expect(formatSize(1536, 2)).toBe('1.50 KB');
    expect(formatSize(1536, 3)).toBe('1.500 KB');
  });

  it('should handle negative values', () => {
    expect(formatSize(-100)).toBe('Invalid size');
  });
});

describe('formatDurationMs', () => {
  it('should format milliseconds', () => {
    expect(formatDurationMs(0)).toBe('0ms');
    expect(formatDurationMs(500)).toBe('500ms');
    expect(formatDurationMs(999)).toBe('999ms');
  });

  it('should format seconds', () => {
    expect(formatDurationMs(1000)).toBe('1.0s');
    expect(formatDurationMs(1500)).toBe('1.5s');
    expect(formatDurationMs(30000)).toBe('30.0s');
  });

  it('should format minutes and seconds', () => {
    expect(formatDurationMs(60000)).toBe('1m 0s');
    expect(formatDurationMs(65000)).toBe('1m 5s');
    expect(formatDurationMs(125000)).toBe('2m 5s');
  });

  it('should format hours, minutes and seconds', () => {
    expect(formatDurationMs(3600000)).toBe('1h 0m');
    expect(formatDurationMs(3661000)).toBe('1h 1m 1s');
    expect(formatDurationMs(7325000)).toBe('2h 2m 5s');
  });

  it('should handle negative values', () => {
    expect(formatDurationMs(-100)).toBe('Invalid duration');
  });
});

describe('formatNumber', () => {
  it('should format with thousand separators', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatNumber(1000)).toBe('1,000');
    expect(formatNumber(999)).toBe('999');
  });

  it('should handle decimals', () => {
    expect(formatNumber(1234.56)).toBe('1,234.56');
  });

  it('should handle zero', () => {
    expect(formatNumber(0)).toBe('0');
  });

  it('should handle negative numbers', () => {
    expect(formatNumber(-1234567)).toBe('-1,234,567');
  });
});

describe('formatPercent', () => {
  it('should format decimal to percent', () => {
    expect(formatPercent(0.75)).toBe('75%');
    expect(formatPercent(0.5)).toBe('50%');
    expect(formatPercent(1)).toBe('100%');
  });

  it('should respect decimal places', () => {
    expect(formatPercent(0.756, 1)).toBe('75.6%');
    expect(formatPercent(0.7567, 2)).toBe('75.67%');
  });

  it('should handle non-decimal values', () => {
    expect(formatPercent(75, 0, false)).toBe('75%');
    expect(formatPercent(33.33, 1, false)).toBe('33.3%');
  });

  it('should handle edge cases', () => {
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(0.001, 1)).toBe('0.1%');
  });
});

describe('formatRelativeTime', () => {
  const now = Date.now();

  it('should format seconds ago', () => {
    expect(formatRelativeTime(now - 30000, now)).toBe('30 秒前');
    expect(formatRelativeTime(now - 1000, now)).toBe('1 秒前');
  });

  it('should format minutes ago', () => {
    expect(formatRelativeTime(now - 60000, now)).toBe('1 分钟前');
    expect(formatRelativeTime(now - 120000, now)).toBe('2 分钟前');
  });

  it('should format hours ago', () => {
    expect(formatRelativeTime(now - 3600000, now)).toBe('1 小时前');
    expect(formatRelativeTime(now - 7200000, now)).toBe('2 小时前');
  });

  it('should format days ago', () => {
    expect(formatRelativeTime(now - 86400000, now)).toBe('1 天前');
    expect(formatRelativeTime(now - 172800000, now)).toBe('2 天前');
  });

  it('should format months ago', () => {
    expect(formatRelativeTime(now - 2592000000, now)).toBe('1 个月前');
  });

  it('should format years ago', () => {
    expect(formatRelativeTime(now - 31536000000, now)).toBe('1 年前');
  });

  it('should handle future dates', () => {
    expect(formatRelativeTime(now + 10000, now)).toBe('刚刚');
  });

  it('should handle Date objects', () => {
    const date = new Date(now - 60000);
    expect(formatRelativeTime(date, now)).toBe('1 分钟前');
  });
});

describe('truncateText', () => {
  it('should truncate long text', () => {
    expect(truncateText('Hello World', 8)).toBe('Hello...');
    expect(truncateText('Long text here', 10)).toBe('Long te...');
  });

  it('should not truncate short text', () => {
    expect(truncateText('Hello', 10)).toBe('Hello');
    expect(truncateText('Hi', 5)).toBe('Hi');
  });

  it('should handle exact length', () => {
    expect(truncateText('Hello', 5)).toBe('Hello');
  });

  it('should use custom ellipsis', () => {
    expect(truncateText('Hello World', 8, '…')).toBe('Hello W…');
    expect(truncateText('Hello World', 6, '--')).toBe('Hell--');
  });

  it('should handle empty string', () => {
    expect(truncateText('', 10)).toBe('');
  });

  it('should handle very short max length', () => {
    expect(truncateText('Hello', 3)).toBe('...');
    expect(truncateText('Hello', 1, '…')).toBe('…');
  });
});
