/**
 * 格式化工具模块
 *
 * 提供各种数据格式化函数
 */

/**
 * 格式化文件大小为人类可读的字符串
 *
 * @param bytes 字节数
 * @param decimals 小数位数，默认 1
 * @returns 格式化后的字符串
 *
 * @example
 * ```typescript
 * formatSize(1024);        // "1.0 KB"
 * formatSize(1536);        // "1.5 KB"
 * formatSize(1048576);     // "1.0 MB"
 * formatSize(1073741824);  // "1.0 GB"
 * formatSize(500);         // "500 B"
 * ```
 */
export function formatSize(bytes: number, decimals: number = 1): string {
  if (bytes === 0) return '0 B';
  if (bytes < 0) return 'Invalid size';

  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const k = 1024;

  // 找到合适的单位
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const unitIndex = Math.min(i, units.length - 1);

  if (unitIndex === 0) {
    return `${bytes} ${units[0]}`;
  }

  const size = bytes / Math.pow(k, unitIndex);
  return `${size.toFixed(decimals)} ${units[unitIndex]}`;
}

/**
 * 格式化持续时间为人类可读的字符串（支持毫秒级别）
 *
 * 注意：如果不需要毫秒级精度，可以使用 `@aitu/utils` 的 `formatDuration`（来自 function/format）。
 *
 * @param ms 毫秒数
 * @returns 格式化后的字符串
 *
 * @example
 * ```typescript
 * formatDurationMs(500);      // "500ms"
 * formatDurationMs(1500);     // "1.5s"
 * formatDurationMs(65000);    // "1m 5s"
 * formatDurationMs(3661000);  // "1h 1m 1s"
 * ```
 */
export function formatDurationMs(ms: number): string {
  if (ms < 0) return 'Invalid duration';
  if (ms < 1000) return `${ms}ms`;

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    const remainingSeconds = seconds % 60;
    if (remainingSeconds > 0) {
      return `${hours}h ${remainingMinutes}m ${remainingSeconds}s`;
    }
    return `${hours}h ${remainingMinutes}m`;
  }

  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  // 小于 1 分钟时显示小数秒
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * 格式化数字为带千分位分隔符的字符串
 *
 * @param num 数字
 * @param locale 区域设置，默认 'en-US'
 * @returns 格式化后的字符串
 *
 * @example
 * ```typescript
 * formatNumber(1234567);   // "1,234,567"
 * formatNumber(1234.56);   // "1,234.56"
 * ```
 */
export function formatNumber(num: number, locale: string = 'en-US'): string {
  return new Intl.NumberFormat(locale).format(num);
}

/**
 * 格式化百分比
 *
 * @param value 值（0-1 之间的小数，或 0-100 之间的百分比）
 * @param decimals 小数位数，默认 0
 * @param isDecimal 是否为小数（true 表示 0-1，false 表示 0-100），默认 true
 * @returns 格式化后的百分比字符串
 *
 * @example
 * ```typescript
 * formatPercent(0.75);          // "75%"
 * formatPercent(0.756, 1);      // "75.6%"
 * formatPercent(75, 0, false);  // "75%"
 * ```
 */
export function formatPercent(
  value: number,
  decimals: number = 0,
  isDecimal: boolean = true
): string {
  const percentage = isDecimal ? value * 100 : value;
  return `${percentage.toFixed(decimals)}%`;
}

/**
 * 格式化日期为相对时间（如 "3 分钟前"）
 *
 * @param date 日期（Date 对象或时间戳）
 * @param now 当前时间，默认为 Date.now()
 * @returns 相对时间字符串
 *
 * @example
 * ```typescript
 * formatRelativeTime(Date.now() - 30000);  // "30 秒前"
 * formatRelativeTime(Date.now() - 120000); // "2 分钟前"
 * ```
 */
export function formatRelativeTime(date: Date | number, now: number = Date.now()): string {
  const timestamp = typeof date === 'number' ? date : date.getTime();
  const diff = now - timestamp;

  if (diff < 0) {
    return '刚刚';
  }

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) return `${years} 年前`;
  if (months > 0) return `${months} 个月前`;
  if (days > 0) return `${days} 天前`;
  if (hours > 0) return `${hours} 小时前`;
  if (minutes > 0) return `${minutes} 分钟前`;
  if (seconds > 0) return `${seconds} 秒前`;

  return '刚刚';
}

/**
 * 截断文本并添加省略号
 *
 * @param text 原始文本
 * @param maxLength 最大长度
 * @param ellipsis 省略号，默认 '...'
 * @returns 截断后的文本
 *
 * @example
 * ```typescript
 * truncateText('Hello World', 8);       // "Hello..."
 * truncateText('Hello', 10);            // "Hello"
 * truncateText('Hello World', 8, '…');  // "Hello W…"
 * ```
 */
export function truncateText(
  text: string,
  maxLength: number,
  ellipsis: string = '...'
): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - ellipsis.length) + ellipsis;
}
