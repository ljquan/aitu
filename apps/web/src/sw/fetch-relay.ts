/**
 * SW Fetch Relay
 *
 * Service Worker 端的 Fetch 代理模块。
 * 核心职责：
 * 1. 接收主线程的 fetch 请求并执行
 * 2. 流式响应逐 chunk 广播回主线程
 * 3. 页面关闭后继续执行 fetch，将结果存入 IDB
 * 4. 页面重新加载时返回已完成的结果
 *
 * 设计原则：
 * - 极简：不理解业务逻辑，只做 fetch 代理
 * - 独立 IDB：使用 sw-fetch-relay 数据库，不与主线程共享
 * - 自动清理：10 分钟过期的结果自动删除
 */

/// <reference lib="webworker" />

import type { ServiceWorkerChannel } from 'postmessage-duplex';

// ============================================================================
// 常量（与主线程 types.ts 保持一致，SW 构建独立所以直接定义）
// ============================================================================

const METHODS = {
  START: 'fetchRelay:start',
  CANCEL: 'fetchRelay:cancel',
  RECOVER: 'fetchRelay:recover',
  PING: 'fetchRelay:ping',
} as const;

const EVENTS = {
  STREAM_CHUNK: 'fetchRelay:chunk',
  STREAM_DONE: 'fetchRelay:done',
  STREAM_ERROR: 'fetchRelay:error',
} as const;

// IDB 配置
const DB_NAME = 'sw-fetch-relay';
const DB_VERSION = 1;
const STORE_INFLIGHT = 'inflight';
const STORE_RESULTS = 'results';

// 结果过期时间：10 分钟
const RESULT_EXPIRY_MS = 10 * 60 * 1000;

// ============================================================================
// 类型
// ============================================================================

interface FetchRelayRequest {
  requestId: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  stream: boolean;
}

interface InflightRecord {
  requestId: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  stream: boolean;
  startedAt: number;
}

interface CompletedResultRecord {
  requestId: string;
  status: number;
  body: string;
  completedAt: number;
}

// ============================================================================
// 状态
// ============================================================================

/** 正在执行的请求及其 AbortController */
const inflightRequests = new Map<string, AbortController>();

/** SW 全局引用 */
let swRef: ServiceWorkerGlobalScope;

// ============================================================================
// IDB 操作（极简，仅 2 个 store）
// ============================================================================

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('[FetchRelay] IDB open timeout'));
    }, 3000);

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      clearTimeout(timeout);
      reject(request.error);
    };

    request.onsuccess = () => {
      clearTimeout(timeout);
      resolve(request.result);
    };

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_INFLIGHT)) {
        db.createObjectStore(STORE_INFLIGHT, { keyPath: 'requestId' });
      }
      if (!db.objectStoreNames.contains(STORE_RESULTS)) {
        const store = db.createObjectStore(STORE_RESULTS, { keyPath: 'requestId' });
        store.createIndex('completedAt', 'completedAt', { unique: false });
      }
    };
  });
}

async function saveInflight(record: InflightRecord): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_INFLIGHT, 'readwrite');
    tx.objectStore(STORE_INFLIGHT).put(record);
    db.close();
  } catch {
    // 静默：IDB 不可用不阻塞执行
  }
}

async function removeInflight(requestId: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_INFLIGHT, 'readwrite');
    tx.objectStore(STORE_INFLIGHT).delete(requestId);
    db.close();
  } catch {
    // 静默
  }
}

async function saveResult(record: CompletedResultRecord): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_RESULTS, 'readwrite');
    tx.objectStore(STORE_RESULTS).put(record);
    db.close();
  } catch {
    // 静默
  }
}

async function getAllResults(): Promise<CompletedResultRecord[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_RESULTS, 'readonly');
      const request = tx.objectStore(STORE_RESULTS).getAll();
      request.onsuccess = () => {
        db.close();
        resolve(request.result || []);
      };
      request.onerror = () => {
        db.close();
        resolve([]);
      };
    });
  } catch {
    return [];
  }
}

async function clearResults(requestIds: string[]): Promise<void> {
  if (requestIds.length === 0) return;
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_RESULTS, 'readwrite');
    const store = tx.objectStore(STORE_RESULTS);
    for (const id of requestIds) {
      store.delete(id);
    }
    db.close();
  } catch {
    // 静默
  }
}

async function cleanupExpiredResults(): Promise<void> {
  try {
    const results = await getAllResults();
    const now = Date.now();
    const expired = results
      .filter((r) => now - r.completedAt > RESULT_EXPIRY_MS)
      .map((r) => r.requestId);
    await clearResults(expired);
  } catch {
    // 静默
  }
}

// ============================================================================
// 核心逻辑
// ============================================================================

/**
 * 检查客户端是否仍然连接
 */
async function isClientConnected(clientId: string): Promise<boolean> {
  try {
    const clients = await swRef.clients.matchAll({ type: 'window' });
    return clients.some((c) => c.id === clientId);
  } catch {
    return false;
  }
}

/**
 * 向指定客户端广播事件
 */
function broadcastToClient(
  channel: ServiceWorkerChannel,
  event: string,
  data: Record<string, unknown>
): void {
  try {
    channel.broadcast(event, data);
  } catch {
    // 客户端可能已断开
  }
}

/**
 * 处理非流式 fetch 请求
 */
async function handleNonStreamFetch(
  req: FetchRelayRequest,
  clientChannel: ServiceWorkerChannel,
  clientId: string
): Promise<{
  requestId: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  ok: boolean;
}> {
  const controller = new AbortController();
  inflightRequests.set(req.requestId, controller);

  // 记录到 IDB
  await saveInflight({
    requestId: req.requestId,
    url: req.url,
    method: req.method,
    headers: req.headers,
    body: req.body,
    stream: false,
    startedAt: Date.now(),
  });

  try {
    const response = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
      signal: controller.signal,
    });

    const body = await response.text();
    const headers: Record<string, string> = {};
    response.headers.forEach((v, k) => { headers[k] = v; });

    // 清理
    inflightRequests.delete(req.requestId);
    await removeInflight(req.requestId);

    const result = {
      requestId: req.requestId,
      status: response.status,
      statusText: response.statusText,
      headers,
      body,
      ok: response.ok,
    };

    // 检查客户端是否仍然连接
    const connected = await isClientConnected(clientId);
    if (!connected) {
      // 客户端已断开，保存结果到 IDB
      await saveResult({
        requestId: req.requestId,
        status: response.status,
        body,
        completedAt: Date.now(),
      });
    }

    return result;
  } catch (error: any) {
    inflightRequests.delete(req.requestId);
    await removeInflight(req.requestId);
    throw error;
  }
}

/**
 * 处理流式 fetch 请求
 */
async function handleStreamFetch(
  req: FetchRelayRequest,
  clientChannel: ServiceWorkerChannel,
  clientId: string
): Promise<void> {
  const controller = new AbortController();
  inflightRequests.set(req.requestId, controller);

  await saveInflight({
    requestId: req.requestId,
    url: req.url,
    method: req.method,
    headers: req.headers,
    body: req.body,
    stream: true,
    startedAt: Date.now(),
  });

  try {
    const response = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      inflightRequests.delete(req.requestId);
      await removeInflight(req.requestId);

      broadcastToClient(clientChannel, EVENTS.STREAM_ERROR, {
        requestId: req.requestId,
        error: `HTTP ${response.status}: ${errorBody.substring(0, 500)}`,
      });
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      inflightRequests.delete(req.requestId);
      await removeInflight(req.requestId);

      broadcastToClient(clientChannel, EVENTS.STREAM_ERROR, {
        requestId: req.requestId,
        error: 'No response body',
      });
      return;
    }

    const decoder = new TextDecoder();
    let fullBody = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullBody += chunk;

        // 尝试将 chunk 发送给客户端
        broadcastToClient(clientChannel, EVENTS.STREAM_CHUNK, {
          requestId: req.requestId,
          chunk,
        });
      }
    } finally {
      reader.releaseLock();
    }

    // 流完成
    inflightRequests.delete(req.requestId);
    await removeInflight(req.requestId);

    // 检查客户端是否仍然连接
    const connected = await isClientConnected(clientId);
    if (connected) {
      broadcastToClient(clientChannel, EVENTS.STREAM_DONE, {
        requestId: req.requestId,
        status: response.status,
        body: fullBody,
      });
    } else {
      // 客户端已断开，保存完整结果
      await saveResult({
        requestId: req.requestId,
        status: response.status,
        body: fullBody,
        completedAt: Date.now(),
      });
    }
  } catch (error: any) {
    inflightRequests.delete(req.requestId);
    await removeInflight(req.requestId);

    if (error.name === 'AbortError') {
      // 请求被主动取消，不需要发送错误
      return;
    }

    broadcastToClient(clientChannel, EVENTS.STREAM_ERROR, {
      requestId: req.requestId,
      error: error.message || 'Stream fetch failed',
    });
  }
}

// ============================================================================
// 创建 subscribeMap（注册到 channel-manager）
// ============================================================================

/**
 * 创建 Fetch Relay 的 RPC 处理器 map
 * 供 channel-manager 在 createSubscribeMap 时合并使用
 *
 * @param clientId 客户端 ID
 * @param getChannel 懒加载 channel getter（handlers 被调用时 channel 已就绪）
 */
export function createFetchRelaySubscribeMap(
  clientId: string,
  getChannel: () => ServiceWorkerChannel
): Record<string, (data: any) => any> {
  return {
    [METHODS.PING]: async () => {
      return { ok: true };
    },

    [METHODS.START]: async (rawData: any) => {
      const req = (rawData?.data ?? rawData) as FetchRelayRequest;
      if (!req?.requestId || !req?.url) {
        return { success: false, error: 'Invalid request' };
      }

      const channel = getChannel();

      if (req.stream) {
        // 流式：异步执行，通过事件回调通知结果
        handleStreamFetch(req, channel, clientId).catch((err) => {
          console.error('[FetchRelay] Stream fetch error:', err);
        });
        return { success: true, requestId: req.requestId };
      } else {
        // 非流式：同步等待结果
        try {
          const result = await handleNonStreamFetch(req, channel, clientId);
          return { success: true, ...result };
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      }
    },

    [METHODS.CANCEL]: async (rawData: any) => {
      const data = (rawData?.data ?? rawData) as { requestId: string };
      const controller = inflightRequests.get(data?.requestId);
      if (controller) {
        controller.abort();
        inflightRequests.delete(data.requestId);
        await removeInflight(data.requestId);
      }
      return { success: true };
    },

    [METHODS.RECOVER]: async () => {
      // 清理过期结果
      await cleanupExpiredResults();
      // 返回所有未过期的结果
      const results = await getAllResults();
      // 清理已返回的结果
      if (results.length > 0) {
        await clearResults(results.map((r) => r.requestId));
      }
      return { results };
    },
  };
}

/**
 * 初始化 Fetch Relay
 */
export function initFetchRelay(sw: ServiceWorkerGlobalScope): void {
  swRef = sw;

  // 定期清理过期结果（每 5 分钟）
  setInterval(() => {
    cleanupExpiredResults().catch(() => {});
  }, 5 * 60 * 1000);
}
