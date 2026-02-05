/**
 * 加密工具类
 *
 * 使用 @aitu/utils 的加密功能，结合业务特定的密码生成逻辑。
 * 基于设备 ID 生成密码种子，确保同一设备上的加密数据可以解密。
 */

import { DRAWNIX_DEVICE_ID_KEY } from '../constants/storage';
import {
  encrypt as baseEncrypt,
  decrypt as baseDecrypt,
  isEncrypted as baseIsEncrypted,
  testCrypto as baseTestCrypto,
  isCryptoSupported,
} from '@aitu/utils';

/**
 * 获取或生成设备唯一标识符
 */
function getDeviceId(): string {
  let deviceId = localStorage.getItem(DRAWNIX_DEVICE_ID_KEY);
  if (!deviceId) {
    // 生成基于时间戳和随机数的设备ID
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2);
    deviceId = `${timestamp}-${random}`;
    localStorage.setItem(DRAWNIX_DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

/**
 * 生成密码种子 (v2)
 * 基于设备 ID 和稳定信息生成密码
 */
function generatePasswordSeed(): string {
  const deviceId = getDeviceId();
  // 只使用真正稳定的信息，避免任何会话间可能变化的信息
  const stableInfo = [
    deviceId,
    navigator.language || 'en-US',
    'drawnix-crypto-key', // 固定标识符
  ].join('-');

  return `drawnix-v2-${stableInfo}`;
}

/**
 * 加密工具类
 *
 * 提供与原有 API 兼容的静态方法，内部使用 @aitu/utils 的加密功能。
 */
export class CryptoUtils {
  /**
   * 加密数据
   */
  public static async encrypt(plaintext: string): Promise<string> {
    const password = generatePasswordSeed();
    return baseEncrypt(plaintext, password);
  }

  /**
   * 解密数据
   */
  public static async decrypt(encryptedData: string): Promise<string> {
    const password = generatePasswordSeed();
    return baseDecrypt(encryptedData, password);
  }

  /**
   * 检查数据是否已加密
   */
  public static isEncrypted(data: string): boolean {
    return baseIsEncrypted(data);
  }

  /**
   * 测试加密功能是否可用
   */
  public static async testCrypto(): Promise<boolean> {
    const password = generatePasswordSeed();
    return baseTestCrypto(password);
  }

  /**
   * 检查 Web Crypto API 是否可用
   */
  public static isCryptoSupported(): boolean {
    return isCryptoSupported();
  }
}
