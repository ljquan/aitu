/**
 * GitHub Gist API 服务
 * 封装所有与 GitHub Gist API 的交互
 */

import { tokenService } from './token-service';
import {
  GITHUB_API_BASE,
  GIST_DESCRIPTION,
  GistResponse,
  CreateGistRequest,
  UpdateGistRequest,
  SYNC_FILES,
} from './types';

/** API 错误 */
export class GitHubApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public response?: unknown
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

/**
 * GitHub Gist API 服务
 */
class GitHubApiService {
  private gistId: string | null = null;

  /**
   * 设置 Gist ID
   */
  setGistId(gistId: string | null): void {
    this.gistId = gistId;
  }

  /**
   * 获取当前 Gist ID
   */
  getGistId(): string | null {
    return this.gistId;
  }

  /**
   * 获取请求头
   */
  private async getHeaders(): Promise<Headers> {
    const token = await tokenService.getToken();
    if (!token) {
      throw new GitHubApiError('未配置 GitHub Token', 401);
    }

    return new Headers({
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    });
  }

  /**
   * 发起 API 请求
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers = await this.getHeaders();
    
    const response = await fetch(`${GITHUB_API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errorData: unknown;
      try {
        errorData = await response.json();
      } catch {
        errorData = await response.text();
      }

      const message = this.getErrorMessage(response.status, errorData);
      throw new GitHubApiError(message, response.status, errorData);
    }

    // 对于 DELETE 请求，可能没有响应体
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  /**
   * 获取错误消息
   */
  private getErrorMessage(status: number, data: unknown): string {
    const messages: Record<number, string> = {
      401: 'Token 无效或已过期，请重新配置',
      403: '权限不足，请确保 Token 具有 gist 权限',
      404: '资源不存在',
      422: '请求数据无效',
      500: 'GitHub 服务器错误，请稍后重试',
    };

    if (messages[status]) {
      return messages[status];
    }

    if (data && typeof data === 'object' && 'message' in data) {
      return (data as { message: string }).message;
    }

    return `请求失败 (${status})`;
  }

  /**
   * 查找现有的同步 Gist
   */
  async findSyncGist(): Promise<GistResponse | null> {
    try {
      // 列出用户的所有 Gists
      const gists = await this.request<GistResponse[]>('/gists?per_page=100');

      // 查找包含 manifest.json 的 Gist（同步 Gist 的标识）
      const syncGist = gists.find(gist => {
        const hasManifest = SYNC_FILES.MANIFEST in gist.files;
        const matchDescription = gist.description === GIST_DESCRIPTION;
        return hasManifest || matchDescription;
      });

      if (syncGist) {
        this.gistId = syncGist.id;
        return syncGist;
      }

      return null;
    } catch (error) {
      console.error('[GitHubApiService] Failed to find sync gist:', error);
      throw error;
    }
  }

  /**
   * 获取所有同步 Gist 列表
   */
  async listSyncGists(): Promise<GistResponse[]> {
    try {
      // 列出用户的所有 Gists
      const gists = await this.request<GistResponse[]>('/gists?per_page=100');

      // 筛选同步 Gist（包含 manifest.json 或描述匹配）
      return gists.filter(gist => {
        const hasManifest = SYNC_FILES.MANIFEST in gist.files;
        const matchDescription = gist.description === GIST_DESCRIPTION;
        return hasManifest || matchDescription;
      });
    } catch (error) {
      console.error('[GitHubApiService] Failed to list sync gists:', error);
      throw error;
    }
  }

  /**
   * 创建新的同步 Gist
   */
  async createSyncGist(initialFiles: Record<string, string>): Promise<GistResponse> {
    const files: Record<string, { content: string }> = {};
    
    for (const [filename, content] of Object.entries(initialFiles)) {
      files[filename] = { content };
    }

    const request: CreateGistRequest = {
      description: GIST_DESCRIPTION,
      public: false,
      files,
    };

    const gist = await this.request<GistResponse>('/gists', {
      method: 'POST',
      body: JSON.stringify(request),
    });

    this.gistId = gist.id;
    return gist;
  }

  /**
   * 查找或创建同步 Gist
   */
  async findOrCreateSyncGist(initialFiles: Record<string, string>): Promise<GistResponse> {
    // 先尝试查找现有的
    const existingGist = await this.findSyncGist();
    if (existingGist) {
      return existingGist;
    }

    // 不存在则创建新的
    return this.createSyncGist(initialFiles);
  }

  /**
   * 获取 Gist 内容
   */
  async getGist(gistId?: string): Promise<GistResponse> {
    const id = gistId || this.gistId;
    if (!id) {
      throw new GitHubApiError('未指定 Gist ID', 400);
    }

    return this.request<GistResponse>(`/gists/${id}`);
  }

  /**
   * 获取 Gist 文件内容
   * 对于被截断的文件，会通过 raw_url 获取完整内容
   */
  async getGistFileContent(filename: string, gistId?: string): Promise<string | null> {
    const gist = await this.getGist(gistId);
    const file = gist.files[filename];

    if (!file) {
      return null;
    }

    // 如果文件被截断，需要通过 raw_url 获取完整内容
    if (file.truncated && file.raw_url) {
      const response = await fetch(file.raw_url);
      if (!response.ok) {
        throw new GitHubApiError(`获取文件内容失败: ${filename}`, response.status);
      }
      return response.text();
    }

    return file.content;
  }

  /**
   * 更新 Gist 文件
   */
  async updateGistFiles(
    files: Record<string, string>,
    gistId?: string
  ): Promise<GistResponse> {
    const id = gistId || this.gistId;
    if (!id) {
      throw new GitHubApiError('未指定 Gist ID', 400);
    }

    const filesPayload: Record<string, { content: string }> = {};
    for (const [filename, content] of Object.entries(files)) {
      filesPayload[filename] = { content };
    }

    const request: UpdateGistRequest = { files: filesPayload };

    return this.request<GistResponse>(`/gists/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(request),
    });
  }

  /**
   * 删除 Gist 文件
   */
  async deleteGistFiles(filenames: string[], gistId?: string): Promise<GistResponse> {
    const id = gistId || this.gistId;
    if (!id) {
      throw new GitHubApiError('未指定 Gist ID', 400);
    }

    const filesPayload: Record<string, null> = {};
    for (const filename of filenames) {
      filesPayload[filename] = null;
    }

    const request: UpdateGistRequest = { files: filesPayload };

    return this.request<GistResponse>(`/gists/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(request),
    });
  }

  /**
   * 删除整个 Gist
   */
  async deleteGist(gistId?: string): Promise<void> {
    const id = gistId || this.gistId;
    if (!id) {
      throw new GitHubApiError('未指定 Gist ID', 400);
    }

    await this.request<void>(`/gists/${id}`, {
      method: 'DELETE',
    });

    if (id === this.gistId) {
      this.gistId = null;
    }
  }

  /**
   * 获取 Gist 的所有文件名
   */
  async getGistFileNames(gistId?: string): Promise<string[]> {
    const gist = await this.getGist(gistId);
    return Object.keys(gist.files);
  }

  /**
   * 检查 Gist 是否存在某个文件
   */
  async hasFile(filename: string, gistId?: string): Promise<boolean> {
    const gist = await this.getGist(gistId);
    return filename in gist.files;
  }

  /**
   * 获取 Gist 的 Web URL
   */
  getGistWebUrl(gistId?: string): string | null {
    const id = gistId || this.gistId;
    if (!id) {
      return null;
    }
    return `https://gist.github.com/${id}`;
  }

  /**
   * 验证 Token 并检查 Gist 权限
   */
  async validateConnection(): Promise<{
    valid: boolean;
    hasGistScope: boolean;
    error?: string;
  }> {
    try {
      const isValid = await tokenService.validateToken();
      if (!isValid) {
        return { valid: false, hasGistScope: false, error: 'Token 无效' };
      }

      const hasGistScope = await tokenService.hasGistScope();
      if (!hasGistScope) {
        return { valid: true, hasGistScope: false, error: 'Token 缺少 gist 权限' };
      }

      return { valid: true, hasGistScope: true };
    } catch (error) {
      return {
        valid: false,
        hasGistScope: false,
        error: error instanceof Error ? error.message : '验证失败',
      };
    }
  }
}

/** GitHub API 服务单例 */
export const gitHubApiService = new GitHubApiService();
