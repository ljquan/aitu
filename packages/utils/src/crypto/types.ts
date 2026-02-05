/**
 * Crypto Utilities - Types
 *
 * 加密工具类型定义
 */

/**
 * 加密结果
 */
export interface EncryptedData {
  /** Base64 编码的加密数据 */
  data: string;
  /** Base64 编码的初始化向量 */
  iv: string;
  /** Base64 编码的盐值 */
  salt: string;
}

/**
 * AES-GCM 加密选项
 */
export interface AesGcmOptions {
  /** 密码（用于派生密钥） */
  password?: string;
  /** PBKDF2 迭代次数（默认 100000） */
  iterations?: number;
  /** 密钥长度（默认 256） */
  keyLength?: 128 | 192 | 256;
}

/**
 * 设备标识符获取函数类型
 */
export type DeviceIdGetter = () => string;
