/**
 * Crypto Utilities
 *
 * 加密工具模块
 * - AES-GCM 对称加密
 * - 支持 Web Crypto API
 * - 非安全环境自动降级
 */

export * from './types';
export {
  isCryptoSupported,
  encrypt,
  decrypt,
  isEncrypted,
  testCrypto,
  createCryptoUtils,
} from './aes-gcm';
