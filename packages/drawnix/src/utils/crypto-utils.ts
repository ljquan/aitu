/**
 * 加密工具类
 * 使用 Web Crypto API 提供安全的数据加密/解密功能
 */

import { DRAWNIX_DEVICE_ID_KEY } from '../constants/storage';

// 加密配置
const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits for AES-GCM

/**
 * 检查 Web Crypto API 是否可用
 * 在非 HTTPS 环境下，crypto.subtle 可能不可用
 */
const isCryptoAvailable = (): boolean => {
  return typeof crypto !== 'undefined' && 
         crypto.subtle !== undefined && 
         typeof crypto.subtle.importKey === 'function';
};

/**
 * 加密结果接口
 */
interface EncryptedData {
  data: string; // Base64 编码的加密数据
  iv: string;   // Base64 编码的初始化向量
  salt: string; // Base64 编码的盐值
}

/**
 * 加密工具类
 */
export class CryptoUtils {
  
  /**
   * 生成密钥材料
   */
  private static async deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    // 使用用户设备信息和应用标识作为基础密码
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);
    
    // 导入密码作为密钥材料
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );
    
    // 使用 PBKDF2 派生加密密钥
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt as BufferSource,
        iterations: 100000, // 10万次迭代
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: ALGORITHM, length: KEY_LENGTH },
      false,
      ['encrypt', 'decrypt']
    );
  }
  
  /**
   * 获取或生成设备唯一标识符
   */
  private static getDeviceId(): string {
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
   */
  private static generatePasswordSeed(): string {
    const deviceId = this.getDeviceId();
    // 只使用真正稳定的信息，避免任何会话间可能变化的信息
    const stableInfo = [
      deviceId,
      navigator.language || 'en-US',
      'drawnix-crypto-key'  // 固定标识符
    ].join('-');
    
    return `drawnix-v2-${stableInfo}`;
  }

  
  /**
   * 加密数据
   */
  public static async encrypt(plaintext: string): Promise<string> {
    // 检查 crypto.subtle 是否可用
    if (!isCryptoAvailable()) {
      console.warn('Web Crypto API not available, using fallback encoding');
      return this.fallbackEncode(plaintext);
    }
    
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(plaintext);
      
      // 生成随机盐值和IV
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
      
      // 生成加密密钥
      const password = this.generatePasswordSeed();
      const key = await this.deriveKey(password, salt);
      
      // 加密数据
      const encrypted = await crypto.subtle.encrypt(
        { name: ALGORITHM, iv },
        key,
        data
      );
      
      // 构建加密结果
      const result: EncryptedData = {
        data: this.arrayBufferToBase64(encrypted),
        iv: this.arrayBufferToBase64(iv.buffer),
        salt: this.arrayBufferToBase64(salt.buffer)
      };
      
      return JSON.stringify(result);
    } catch (error) {
      console.error('Encryption failed:', error);
      // Fallback to simple encoding
      console.warn('Falling back to simple encoding');
      return this.fallbackEncode(plaintext);
    }
  }
  
  /**
   * 解密数据
   */
  public static async decrypt(encryptedData: string): Promise<string> {
    // 检查是否是 fallback 编码的数据
    if (this.isFallbackEncoded(encryptedData)) {
      return this.fallbackDecode(encryptedData);
    }
    
    // 检查 crypto.subtle 是否可用
    if (!isCryptoAvailable()) {
      console.warn('Web Crypto API not available for decryption');
      throw new Error('Cannot decrypt: Web Crypto API not available');
    }
    
    try {
      const parsed: EncryptedData = JSON.parse(encryptedData);
      
      // 解析加密数据
      const data = this.base64ToArrayBuffer(parsed.data);
      const iv = this.base64ToArrayBuffer(parsed.iv);
      const salt = this.base64ToArrayBuffer(parsed.salt);
      
      // 生成解密密钥
      const password = this.generatePasswordSeed();
      const key = await this.deriveKey(password, new Uint8Array(salt));
      
      // 解密数据
      const decrypted = await crypto.subtle.decrypt(
        { name: ALGORITHM, iv: iv as BufferSource },
        key,
        data
      );
      
      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      console.error('Decryption failed:', error);
      throw new Error('Failed to decrypt data');
    }
  }
  
  /**
   * 检查数据是否已加密
   */
  public static isEncrypted(data: string): boolean {
    try {
      const parsed = JSON.parse(data);
      return parsed && 
             typeof parsed.data === 'string' && 
             typeof parsed.iv === 'string' && 
             typeof parsed.salt === 'string';
    } catch {
      return false;
    }
  }
  
  /**
   * ArrayBuffer 转 Base64
   */
  private static arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return globalThis.btoa(binary);
  }
  
  /**
   * Base64 转 ArrayBuffer
   */
  private static base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = globalThis.atob(base64);
    const buffer = new ArrayBuffer(binary.length);
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return buffer;
  }
  
  /**
   * 测试加密功能是否可用
   */
  public static async testCrypto(): Promise<boolean> {
    try {
      const testData = 'test-encryption-data';
      const encrypted = await this.encrypt(testData);
      const decrypted = await this.decrypt(encrypted);
      return testData === decrypted;
    } catch {
      return false;
    }
  }
  
  /**
   * 检查 Web Crypto API 是否可用
   */
  public static isCryptoSupported(): boolean {
    return isCryptoAvailable();
  }
  
  // ========== Fallback 编码方法 (非安全上下文) ==========
  
  private static readonly FALLBACK_PREFIX = 'DRAWNIX_FB:';
  
  /**
   * Fallback 编码 - 使用简单的 Base64 编码（不安全，仅用于开发环境）
   */
  private static fallbackEncode(plaintext: string): string {
    const encoded = globalThis.btoa(encodeURIComponent(plaintext));
    return this.FALLBACK_PREFIX + encoded;
  }
  
  /**
   * Fallback 解码
   */
  private static fallbackDecode(encoded: string): string {
    const data = encoded.slice(this.FALLBACK_PREFIX.length);
    return decodeURIComponent(globalThis.atob(data));
  }
  
  /**
   * 检查是否是 fallback 编码的数据
   */
  private static isFallbackEncoded(data: string): boolean {
    return data.startsWith(this.FALLBACK_PREFIX);
  }
}