/**
 * 设备信息工具模块
 *
 * 提供设备识别和信息获取功能
 */

/**
 * 设备 ID 存储配置
 */
export interface DeviceIdConfig {
  /** localStorage 存储键 */
  storageKey: string;
}

/**
 * 获取或创建设备 ID
 *
 * 如果 localStorage 中已存在设备 ID，则返回它；
 * 否则生成一个新的设备 ID 并存储。
 *
 * @param config 配置选项
 * @returns 设备 ID 字符串
 *
 * @example
 * ```typescript
 * const deviceId = getOrCreateDeviceId({ storageKey: 'my_app_device_id' });
 * console.log(deviceId); // "m4x7k3-a9b2c1d"
 * ```
 */
export function getOrCreateDeviceId(config: DeviceIdConfig): string {
  const { storageKey } = config;

  try {
    let deviceId = localStorage.getItem(storageKey);
    if (!deviceId) {
      deviceId = generateDeviceId();
      localStorage.setItem(storageKey, deviceId);
    }
    return deviceId;
  } catch {
    // localStorage 不可用时，返回临时 ID
    return generateDeviceId();
  }
}

/**
 * 获取设备 ID（只读，不创建）
 *
 * @param config 配置选项
 * @returns 设备 ID 或 'unknown'
 *
 * @example
 * ```typescript
 * const deviceId = getDeviceId({ storageKey: 'my_app_device_id' });
 * ```
 */
export function getDeviceId(config: DeviceIdConfig): string {
  const { storageKey } = config;

  try {
    return localStorage.getItem(storageKey) || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * 生成唯一的设备 ID
 *
 * 格式: {timestamp36}-{random}
 *
 * @returns 设备 ID 字符串
 */
export function generateDeviceId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 获取设备名称（基于 User Agent 推断）
 *
 * @returns 设备名称字符串
 *
 * @example
 * ```typescript
 * const name = getDeviceName();
 * console.log(name); // "macOS" / "Windows" / "iOS Device" / ...
 * ```
 */
export function getDeviceName(): string {
  if (typeof navigator === 'undefined') {
    return 'Unknown';
  }

  const userAgent = navigator.userAgent;
  const platform = navigator.platform || '';

  // 移动设备检测
  if (/iPhone|iPad|iPod/.test(userAgent)) {
    return 'iOS Device';
  }
  if (/Android/.test(userAgent)) {
    return 'Android Device';
  }

  // 桌面操作系统检测
  if (/Mac/.test(platform)) {
    return 'macOS';
  }
  if (/Win/.test(platform)) {
    return 'Windows';
  }
  if (/Linux/.test(platform)) {
    return 'Linux';
  }

  return platform || 'Unknown';
}

/**
 * 获取设备类型
 *
 * @returns 设备类型: 'mobile' | 'tablet' | 'desktop'
 */
export function getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
  if (typeof navigator === 'undefined') {
    return 'desktop';
  }

  const userAgent = navigator.userAgent;

  // 平板检测
  if (/iPad|Android(?!.*Mobile)/.test(userAgent)) {
    return 'tablet';
  }

  // 手机检测
  if (/iPhone|iPod|Android.*Mobile|webOS|BlackBerry|IEMobile|Opera Mini/.test(userAgent)) {
    return 'mobile';
  }

  return 'desktop';
}

/**
 * 获取浏览器名称
 *
 * @returns 浏览器名称
 */
export function getBrowserName(): string {
  if (typeof navigator === 'undefined') {
    return 'Unknown';
  }

  const userAgent = navigator.userAgent;

  if (/Edg/.test(userAgent)) return 'Edge';
  if (/Chrome/.test(userAgent)) return 'Chrome';
  if (/Safari/.test(userAgent)) return 'Safari';
  if (/Firefox/.test(userAgent)) return 'Firefox';
  if (/Opera|OPR/.test(userAgent)) return 'Opera';

  return 'Unknown';
}
