/**
 * 加密服务
 * 使用 AES-256-GCM 加密同步数据
 * 支持 Gist ID 或自定义密码派生密钥
 */

/** 固定盐（用于增强安全性） */
const FIXED_SALT = 'opentu-sync-v1';

/** PBKDF2 迭代次数 */
const PBKDF2_ITERATIONS = 100000;

/** AES-GCM IV 长度（字节） */
const IV_LENGTH = 12;

/** 加密数据格式版本 */
export const CRYPTO_VERSION = 2; // 版本 2 支持自定义密码

/** 加密后的数据结构 */
export interface EncryptedData {
  /** 格式版本 */
  v: number;
  /** 是否加密 */
  encrypted: true;
  /** Base64 编码的 IV */
  iv: string;
  /** Base64 编码的密文 */
  data: string;
  /** 是否使用自定义密码（v2+） */
  customPassword?: boolean;
}

/** 解密错误类型 */
export class DecryptionError extends Error {
  /** 是否是密码错误（需要用户输入正确密码） */
  readonly needsPassword: boolean;
  
  constructor(message: string, needsPassword = false) {
    super(message);
    this.name = 'DecryptionError';
    this.needsPassword = needsPassword;
  }
}

/**
 * 检查数据是否为加密格式
 */
export function isEncryptedData(data: unknown): data is EncryptedData {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return obj.encrypted === true && typeof obj.iv === 'string' && typeof obj.data === 'string';
}

/**
 * 检查加密数据是否使用了自定义密码
 */
export function usesCustomPassword(data: unknown): boolean {
  if (!isEncryptedData(data)) return false;
  return data.customPassword === true;
}

/**
 * 加密服务
 */
class CryptoService {
  /** 缓存派生的密钥（避免重复计算） */
  private keyCache: Map<string, CryptoKey> = new Map();

  /**
   * 从密码材料派生加密密钥
   * 使用 PBKDF2 算法
   * @param secret 密码材料（Gist ID 或自定义密码）
   */
  async deriveKey(secret: string): Promise<CryptoKey> {
    // 检查缓存
    if (this.keyCache.has(secret)) {
      return this.keyCache.get(secret)!;
    }

    // 创建密码材料（密码 + 固定盐）
    const encoder = new TextEncoder();
    const passwordData = encoder.encode(secret + FIXED_SALT);

    // 导入为密钥材料
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passwordData,
      'PBKDF2',
      false,
      ['deriveKey']
    );

    // 派生 AES-256 密钥
    const salt = encoder.encode(FIXED_SALT);
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      keyMaterial,
      {
        name: 'AES-GCM',
        length: 256,
      },
      false,
      ['encrypt', 'decrypt']
    );

    // 缓存密钥
    this.keyCache.set(secret, key);
    return key;
  }

  /**
   * 加密字符串数据
   * @param plaintext 明文字符串
   * @param gistId Gist ID（默认密钥源）
   * @param customPassword 自定义密码（可选，优先使用）
   * @returns 加密后的数据结构（JSON 字符串）
   */
  async encrypt(plaintext: string, gistId: string, customPassword?: string): Promise<string> {
    const useCustom = !!customPassword;
    const secret = useCustom ? customPassword : gistId;
    const key = await this.deriveKey(secret);

    // 生成随机 IV
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    // 加密
    const encoder = new TextEncoder();
    const plaintextData = encoder.encode(plaintext);
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      key,
      plaintextData
    );

    // 构建加密数据结构
    const encryptedData: EncryptedData = {
      v: CRYPTO_VERSION,
      encrypted: true,
      iv: this.arrayBufferToBase64(iv),
      data: this.arrayBufferToBase64(ciphertext),
      ...(useCustom && { customPassword: true }),
    };

    return JSON.stringify(encryptedData);
  }

  /**
   * 解密数据
   * @param encryptedJson 加密后的 JSON 字符串
   * @param gistId Gist ID（默认密钥源）
   * @param customPassword 自定义密码（可选）
   * @returns 解密后的明文字符串
   * @throws DecryptionError 解密失败时抛出
   */
  async decrypt(encryptedJson: string, gistId: string, customPassword?: string): Promise<string> {
    const encryptedData = JSON.parse(encryptedJson);

    if (!isEncryptedData(encryptedData)) {
      throw new DecryptionError('Invalid encrypted data format');
    }

    // 检查是否需要自定义密码
    const needsCustomPassword = encryptedData.customPassword === true;
    
    if (needsCustomPassword && !customPassword) {
      throw new DecryptionError('此数据使用自定义密码加密，请输入密码', true);
    }

    const secret = needsCustomPassword ? customPassword! : gistId;
    const key = await this.deriveKey(secret);

    // 解析 IV 和密文
    const iv = this.base64ToArrayBuffer(encryptedData.iv);
    const ciphertext = this.base64ToArrayBuffer(encryptedData.data);

    try {
      // 解密（使用类型断言解决 TypeScript 5.x 的 Uint8Array 兼容性问题）
      const plaintextData = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv as BufferSource,
        },
        key,
        ciphertext as BufferSource
      );

      // 转换为字符串
      const decoder = new TextDecoder();
      return decoder.decode(plaintextData);
    } catch (error) {
      // AES-GCM 解密失败通常意味着密码/密钥错误
      if (needsCustomPassword) {
        throw new DecryptionError('密码错误，请输入正确的密码', true);
      }
      throw new DecryptionError('解密失败，数据可能已损坏');
    }
  }

  /**
   * 尝试解密，如果是明文则直接返回
   * 用于向后兼容
   * @param content 内容（可能是加密或明文）
   * @param gistId Gist ID
   * @param customPassword 自定义密码（可选）
   * @throws DecryptionError 需要密码时抛出
   */
  async decryptOrPassthrough(content: string, gistId: string, customPassword?: string): Promise<string> {
    try {
      const parsed = JSON.parse(content);
      if (isEncryptedData(parsed)) {
        return this.decrypt(content, gistId, customPassword);
      }
      // 不是加密数据，返回原始内容
      return content;
    } catch (error) {
      // 如果是解密错误，向上抛出
      if (error instanceof DecryptionError) {
        throw error;
      }
      // 解析失败，可能是明文 JSON，直接返回
      return content;
    }
  }
  
  /**
   * 检查内容是否需要自定义密码解密
   */
  checkNeedsPassword(content: string): boolean {
    try {
      const parsed = JSON.parse(content);
      return isEncryptedData(parsed) && parsed.customPassword === true;
    } catch {
      return false;
    }
  }

  /**
   * ArrayBuffer 转 Base64
   */
  private arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Base64 转 ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * 清除密钥缓存
   */
  clearKeyCache(): void {
    this.keyCache.clear();
  }
}

/** 加密服务单例 */
export const cryptoService = new CryptoService();
