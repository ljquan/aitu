/**
 * Fetch Relay Client
 *
 * 主线程端的 Fetch Relay 客户端。
 * 通过 SW 代理关键 API 请求（LLM/图片/视频），页面关闭后 SW 继续执行。
 *
 * 核心逻辑：
 * 1. SW 可用时：通过 postmessage-duplex 将 fetch 请求发送给 SW 执行
 * 2. SW 不可用时：直接使用主线程 fetch（降级模式）
 * 3. 页面加载时：检查 SW 是否有断开期间完成的请求结果
 */

import { ServiceWorkerChannel, ReturnCode } from 'postmessage-duplex';
import {
  FETCH_RELAY_METHODS,
  FETCH_RELAY_EVENTS,
  type FetchRelayRequest,
  type FetchRelayResponse,
  type FetchRelayChunkEvent,
  type FetchRelayDoneEvent,
  type FetchRelayErrorEvent,
  type FetchRelayRecoveredResult,
} from './types';

// ============================================================================
// 类型
// ============================================================================

interface StreamCallbacks {
  onChunk: (chunk: string) => void;
  onDone: (body: string, status: number) => void;
  onError: (error: string) => void;
}

interface PendingStream {
  requestId: string;
  callbacks: StreamCallbacks;
}

// ============================================================================
// FetchRelayClient
// ============================================================================

class FetchRelayClient {
  private channel: ServiceWorkerChannel | null = null;
  private initialized = false;
  private initializing: Promise<boolean> | null = null;
  private pendingStreams: Map<string, PendingStream> = new Map();

  /**
   * 初始化与 SW 的通信通道
   */
  async initialize(): Promise<boolean> {
    if (this.initialized && this.channel) {
      return true;
    }
    if (this.initializing) {
      return this.initializing;
    }
    this.initializing = this.doInitialize();
    try {
      return await this.initializing;
    } finally {
      this.initializing = null;
    }
  }

  private async doInitialize(): Promise<boolean> {
    try {
      if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
        return false;
      }

      this.channel = await ServiceWorkerChannel.createFromPage({
        timeout: 120000,
        autoReconnect: true,
        log: { log: () => {}, warn: () => {}, error: () => {} },
      } as any);

      // 订阅流式事件
      this.setupStreamSubscriptions();

      this.initialized = true;
      return true;
    } catch (error) {
      console.warn('[FetchRelayClient] 初始化失败:', error);
      this.channel = null;
      this.initialized = false;
      return false;
    }
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized && !!this.channel;
  }

  /**
   * 快速检查 SW Fetch Relay 是否可用
   */
  async isAvailable(): Promise<boolean> {
    if (!this.isInitialized()) {
      return false;
    }
    try {
      const result = await Promise.race([
        this.channel!.call(FETCH_RELAY_METHODS.PING, undefined),
        new Promise<{ ret: number }>((r) => setTimeout(() => r({ ret: -1 }), 1000)),
      ]);
      return result.ret === ReturnCode.Success;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // 核心 Fetch 方法
  // ============================================================================

  /**
   * 通过 SW 代理发送 fetch 请求（非流式）
   *
   * @returns 类 Response 结果，包含 status, ok, headers, body (text)
   */
  async fetch(
    url: string,
    init: RequestInit = {}
  ): Promise<FetchRelayResponse> {
    // SW 不可用时直接降级
    if (!this.isInitialized()) {
      return this.directFetch(url, init);
    }

    const requestId = this.generateRequestId();
    const request: FetchRelayRequest = {
      requestId,
      url,
      method: init.method || 'GET',
      headers: this.extractHeaders(init.headers),
      body: typeof init.body === 'string' ? init.body : undefined,
      stream: false,
    };

    try {
      const response = await this.channel!.call(FETCH_RELAY_METHODS.START, request as any);
      if (response.ret !== ReturnCode.Success) {
        throw new Error(`Fetch relay failed: ${response.ret}`);
      }
      return response.data as unknown as FetchRelayResponse;
    } catch (error) {
      console.warn('[FetchRelayClient] SW fetch 失败，降级到直接 fetch:', error);
      return this.directFetch(url, init);
    }
  }

  /**
   * 通过 SW 代理发送流式 fetch 请求
   *
   * @param url 请求 URL
   * @param init 请求选项
   * @param onChunk 流式回调，每次收到新 chunk 时调用（传入本次 chunk 文本）
   * @param signal 取消信号
   * @returns 完整响应体
   */
  async fetchStream(
    url: string,
    init: RequestInit = {},
    onChunk?: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<{ status: number; body: string }> {
    // SW 不可用时直接降级
    if (!this.isInitialized()) {
      return this.directFetchStream(url, init, onChunk, signal);
    }

    const requestId = this.generateRequestId();
    const request: FetchRelayRequest = {
      requestId,
      url,
      method: init.method || 'POST',
      headers: this.extractHeaders(init.headers),
      body: typeof init.body === 'string' ? init.body : undefined,
      stream: true,
    };

    return new Promise<{ status: number; body: string }>((resolve, reject) => {
      // 处理取消
      if (signal?.aborted) {
        reject(new Error('Request cancelled'));
        return;
      }

      const abortHandler = () => {
        this.pendingStreams.delete(requestId);
        this.cancelRequest(requestId).catch(() => {});
        reject(new Error('Request cancelled'));
      };

      if (signal) {
        signal.addEventListener('abort', abortHandler, { once: true });
      }

      // 注册流式回调
      this.pendingStreams.set(requestId, {
        requestId,
        callbacks: {
          onChunk: (chunk) => onChunk?.(chunk),
          onDone: (body, status) => {
            signal?.removeEventListener('abort', abortHandler);
            this.pendingStreams.delete(requestId);
            resolve({ status, body });
          },
          onError: (error) => {
            signal?.removeEventListener('abort', abortHandler);
            this.pendingStreams.delete(requestId);
            reject(new Error(error));
          },
        },
      });

      // 发起请求
      this.channel!.call(FETCH_RELAY_METHODS.START, request as any).then((response) => {
        if (response.ret !== ReturnCode.Success) {
          // RPC 调用本身失败
          this.pendingStreams.delete(requestId);
          signal?.removeEventListener('abort', abortHandler);
          // 降级到直接 fetch
          this.directFetchStream(url, init, onChunk, signal).then(resolve, reject);
        }
        // 成功时，等待流式事件回调完成
      }).catch((err) => {
        this.pendingStreams.delete(requestId);
        signal?.removeEventListener('abort', abortHandler);
        console.warn('[FetchRelayClient] SW stream fetch 失败，降级:', err);
        this.directFetchStream(url, init, onChunk, signal).then(resolve, reject);
      });
    });
  }

  /**
   * 取消正在进行的请求
   */
  async cancelRequest(requestId: string): Promise<void> {
    if (!this.isInitialized()) return;
    try {
      await this.channel!.call(FETCH_RELAY_METHODS.CANCEL, { requestId } as any);
    } catch {
      // 忽略取消失败
    }
  }

  /**
   * 恢复断开期间完成的请求结果
   */
  async recoverResults(): Promise<FetchRelayRecoveredResult[]> {
    if (!this.isInitialized()) return [];
    try {
      const response = await this.channel!.call(FETCH_RELAY_METHODS.RECOVER, undefined);
      if (response.ret === ReturnCode.Success && response.data) {
        return (response.data as any).results || [];
      }
    } catch (error) {
      console.warn('[FetchRelayClient] 恢复结果失败:', error);
    }
    return [];
  }

  // ============================================================================
  // 流式事件订阅
  // ============================================================================

  private setupStreamSubscriptions(): void {
    if (!this.channel) return;

    // 接收流式 chunk
    (this.channel as any).onBroadcast(FETCH_RELAY_EVENTS.STREAM_CHUNK, (response: any) => {
      const data = response?.data ?? response;
      if (!data?.requestId) return;
      const pending = this.pendingStreams.get(data.requestId);
      pending?.callbacks.onChunk(data.chunk || '');
    });

    // 接收流式完成
    (this.channel as any).onBroadcast(FETCH_RELAY_EVENTS.STREAM_DONE, (response: any) => {
      const data = response?.data ?? response;
      if (!data?.requestId) return;
      const pending = this.pendingStreams.get(data.requestId);
      pending?.callbacks.onDone(data.body || '', data.status || 200);
    });

    // 接收流式错误
    (this.channel as any).onBroadcast(FETCH_RELAY_EVENTS.STREAM_ERROR, (response: any) => {
      const data = response?.data ?? response;
      if (!data?.requestId) return;
      const pending = this.pendingStreams.get(data.requestId);
      pending?.callbacks.onError(data.error || 'Unknown error');
    });
  }

  // ============================================================================
  // 降级：直接使用主线程 fetch
  // ============================================================================

  private async directFetch(url: string, init: RequestInit): Promise<FetchRelayResponse> {
    const response = await fetch(url, init);
    const body = await response.text();
    return {
      requestId: '',
      status: response.status,
      statusText: response.statusText,
      headers: this.responseHeadersToRecord(response.headers),
      body,
      ok: response.ok,
    };
  }

  private async directFetchStream(
    url: string,
    init: RequestInit,
    onChunk?: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<{ status: number; body: string }> {
    const response = await fetch(url, { ...init, signal });
    if (!response.body) {
      const body = await response.text();
      return { status: response.status, body };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let body = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        body += chunk;
        onChunk?.(chunk);
      }
    } finally {
      reader.releaseLock();
    }

    return { status: response.status, body };
  }

  // ============================================================================
  // 工具方法
  // ============================================================================

  private generateRequestId(): string {
    return `fr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  private extractHeaders(headers?: HeadersInit): Record<string, string> {
    const result: Record<string, string> = {};
    if (!headers) return result;
    if (headers instanceof Headers) {
      headers.forEach((value, key) => { result[key] = value; });
    } else if (Array.isArray(headers)) {
      for (const [key, value] of headers) {
        result[key] = value;
      }
    } else {
      Object.assign(result, headers);
    }
    return result;
  }

  private responseHeadersToRecord(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => { result[key] = value; });
    return result;
  }

  /**
   * 销毁
   */
  destroy(): void {
    this.channel?.destroy();
    this.channel = null;
    this.initialized = false;
    this.pendingStreams.clear();
  }
}

/** 单例 */
export const fetchRelayClient = new FetchRelayClient();
