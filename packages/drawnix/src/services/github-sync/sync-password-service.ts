/**
 * 同步密码存储服务
 * 用于加密存储用户的自定义同步密码
 */

import { kvStorageService } from '../kv-storage-service';

/** 密码存储键 */
const SYNC_PASSWORD_KEY = 'github_sync_password';

/** 用于加密存储密码的固定密钥（基于设备信息） */
function getDeviceKey(): string {
  // 使用多个浏览器特征组合成设备密钥
  const features = [
    navigator.userAgent,
    navigator.language,
    screen.width.toString(),
    screen.height.toString(),
    new Date().getTimezoneOffset().toString(),
  ];
  return features.join('|');
}

/**
 * 简单的对称加密（用于本地存储密码）
 * 注意：这不是高安全性加密，只是防止明文存储
 */
function encryptPassword(password: string): string {
  const key = getDeviceKey();
  let result = '';
  for (let i = 0; i < password.length; i++) {
    const charCode = password.charCodeAt(i) ^ key.charCodeAt(i % key.length);
    result += String.fromCharCode(charCode);
  }
  return btoa(result);
}

/**
 * 解密本地存储的密码
 */
function decryptPassword(encrypted: string): string {
  const key = getDeviceKey();
  const decoded = atob(encrypted);
  let result = '';
  for (let i = 0; i < decoded.length; i++) {
    const charCode = decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length);
    result += String.fromCharCode(charCode);
  }
  return result;
}

/** 存储的密码数据结构 */
interface StoredPassword {
  /** 加密后的密码 */
  encrypted: string;
  /** 存储时间 */
  storedAt: number;
}

/**
 * 同步密码存储服务
 */
class SyncPasswordService {
  /** 内存缓存（避免频繁读取存储） */
  private cachedPassword: string | null = null;
  private cacheLoaded = false;

  /**
   * 保存自定义密码
   * @param password 明文密码，传空字符串表示清除密码
   */
  async savePassword(password: string): Promise<void> {
    if (!password) {
      // 清除密码
      await kvStorageService.remove(SYNC_PASSWORD_KEY);
      this.cachedPassword = null;
      this.cacheLoaded = true;
      return;
    }

    const stored: StoredPassword = {
      encrypted: encryptPassword(password),
      storedAt: Date.now(),
    };
    
    await kvStorageService.set(SYNC_PASSWORD_KEY, stored);
    this.cachedPassword = password;
    this.cacheLoaded = true;
  }

  /**
   * 获取已保存的密码
   * @returns 明文密码，如果没有设置则返回 null
   */
  async getPassword(): Promise<string | null> {
    if (this.cacheLoaded) {
      return this.cachedPassword;
    }

    const stored = await kvStorageService.get<StoredPassword>(SYNC_PASSWORD_KEY);
    if (!stored) {
      this.cachedPassword = null;
      this.cacheLoaded = true;
      return null;
    }

    try {
      this.cachedPassword = decryptPassword(stored.encrypted);
      this.cacheLoaded = true;
      return this.cachedPassword;
    } catch {
      // 解密失败，可能是设备信息变化了
      this.cachedPassword = null;
      this.cacheLoaded = true;
      return null;
    }
  }

  /**
   * 检查是否设置了自定义密码
   */
  async hasPassword(): Promise<boolean> {
    const password = await this.getPassword();
    return !!password;
  }

  /**
   * 清除缓存（用于测试或强制重新加载）
   */
  clearCache(): void {
    this.cachedPassword = null;
    this.cacheLoaded = false;
  }
}

/** 同步密码存储服务单例 */
export const syncPasswordService = new SyncPasswordService();
