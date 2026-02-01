/**
 * GitHub Token 管理服务
 * 负责 Token 的安全存储、验证和管理
 */

import { CryptoUtils } from '../../utils/crypto-utils';

/** Token 存储键 */
const GITHUB_TOKEN_KEY = 'github_sync_token';

/** Token 验证缓存键 */
const TOKEN_VALIDATED_KEY = 'github_token_validated';

/** Token 前缀（用于格式验证） */
const TOKEN_PREFIXES = ['ghp_', 'github_pat_', 'gho_', 'ghu_', 'ghs_', 'ghr_'];

/**
 * GitHub Token 管理服务
 */
class TokenService {
  private cachedToken: string | null = null;
  private tokenValidated = false;

  /**
   * 保存 Token（加密存储）
   */
  async saveToken(token: string): Promise<void> {
    if (!token || !this.isValidTokenFormat(token)) {
      throw new Error('无效的 Token 格式');
    }

    try {
      // 加密存储
      const encryptedToken = await CryptoUtils.encrypt(token);
      localStorage.setItem(GITHUB_TOKEN_KEY, encryptedToken);
      
      // 更新缓存
      this.cachedToken = token;
      this.tokenValidated = false;
      
      // 清除验证状态缓存
      localStorage.removeItem(TOKEN_VALIDATED_KEY);
    } catch (error) {
      console.error('[TokenService] Failed to save token:', error);
      throw new Error('保存 Token 失败');
    }
  }

  /**
   * 获取 Token
   */
  async getToken(): Promise<string | null> {
    // 如果有缓存，直接返回
    if (this.cachedToken) {
      return this.cachedToken;
    }

    try {
      const encryptedToken = localStorage.getItem(GITHUB_TOKEN_KEY);
      if (!encryptedToken) {
        return null;
      }

      // 解密
      const token = await CryptoUtils.decrypt(encryptedToken);
      this.cachedToken = token;
      return token;
    } catch (error) {
      console.error('[TokenService] Failed to get token:', error);
      // 解密失败，可能是数据损坏，清除存储
      this.clearToken();
      return null;
    }
  }

  /**
   * 清除 Token
   */
  clearToken(): void {
    localStorage.removeItem(GITHUB_TOKEN_KEY);
    localStorage.removeItem(TOKEN_VALIDATED_KEY);
    this.cachedToken = null;
    this.tokenValidated = false;
  }

  /**
   * 检查是否已配置 Token
   */
  hasToken(): boolean {
    return !!localStorage.getItem(GITHUB_TOKEN_KEY);
  }

  /**
   * 验证 Token 格式
   */
  isValidTokenFormat(token: string): boolean {
    if (!token || typeof token !== 'string') {
      return false;
    }

    // 检查长度（GitHub Token 通常至少 40 个字符）
    if (token.length < 40) {
      return false;
    }

    // 检查是否以已知前缀开头
    const hasValidPrefix = TOKEN_PREFIXES.some(prefix => token.startsWith(prefix));
    
    // 如果有前缀，直接返回 true
    if (hasValidPrefix) {
      return true;
    }

    // 对于旧格式的 Token（40 个十六进制字符），也接受
    if (/^[a-f0-9]{40}$/i.test(token)) {
      return true;
    }

    // 其他格式也尝试接受（用户可能有特殊的 Token）
    return token.length >= 40;
  }

  /**
   * 验证 Token 是否有效（调用 GitHub API）
   */
  async validateToken(token?: string): Promise<boolean> {
    const tokenToValidate = token || await this.getToken();
    
    if (!tokenToValidate) {
      return false;
    }

    // 检查缓存的验证状态
    if (!token && this.tokenValidated && this.cachedToken === tokenToValidate) {
      return true;
    }

    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${tokenToValidate}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });

      const isValid = response.ok;
      
      if (isValid && !token) {
        // 缓存验证结果
        this.tokenValidated = true;
        localStorage.setItem(TOKEN_VALIDATED_KEY, 'true');
      }

      return isValid;
    } catch (error) {
      console.error('[TokenService] Token validation failed:', error);
      return false;
    }
  }

  /**
   * 获取 Token 关联的 GitHub 用户信息
   */
  async getUserInfo(): Promise<{ login: string; name: string | null; avatar_url: string } | null> {
    const token = await this.getToken();
    if (!token) {
      return null;
    }

    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return {
        login: data.login,
        name: data.name,
        avatar_url: data.avatar_url,
      };
    } catch (error) {
      console.error('[TokenService] Failed to get user info:', error);
      return null;
    }
  }

  /**
   * 检查 Token 是否有 gist scope
   */
  async hasGistScope(): Promise<boolean> {
    const token = await this.getToken();
    if (!token) {
      return false;
    }

    try {
      // 尝试列出用户的 gists 来验证权限
      const response = await fetch('https://api.github.com/gists?per_page=1', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });

      // 检查响应头中的 scope
      const scopes = response.headers.get('X-OAuth-Scopes');
      if (scopes) {
        return scopes.includes('gist');
      }

      // 如果没有 scope 头，通过响应状态判断
      return response.ok;
    } catch (error) {
      console.error('[TokenService] Failed to check gist scope:', error);
      return false;
    }
  }

  /**
   * 获取 Token 创建页面 URL
   */
  getTokenCreationUrl(): string {
    const date = new Date();
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    
    // 预填充 Token 配置
    const params = new URLSearchParams({
      description: `Opentu Sync ${dateStr}`,
      scopes: 'gist',
    });
    return `https://github.com/settings/tokens/new?${params.toString()}`;
  }
}

/** Token 服务单例 */
export const tokenService = new TokenService();
