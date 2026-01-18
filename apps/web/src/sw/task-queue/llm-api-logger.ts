/**
 * LLM API Logger for Service Worker
 * 
 * 记录所有大模型 API 调用，用于成本追踪和调试。
 * 此日志记录不受调试模式影响，始终运行。
 * 数据持久化到 IndexedDB，可在 sw-debug.html 查看和导出。
 */

export interface LLMApiLog {
  id: string;
  timestamp: number;
  
  // 请求信息
  endpoint: string;        // API endpoint (e.g., /images/generations, /chat/completions)
  model: string;           // 使用的模型
  taskType: 'image' | 'video' | 'chat' | 'character' | 'other';
  
  // 请求参数（脱敏后）
  prompt?: string;         // 提示词（截断）
  requestBody?: string;    // 完整请求体（仅 chat 类型，不截断）
  hasReferenceImages?: boolean;  // 是否有参考图
  referenceImageCount?: number;  // 参考图数量
  
  // 响应信息
  status: 'pending' | 'success' | 'error';
  httpStatus?: number;
  duration?: number;       // 耗时（毫秒）
  
  // 结果
  resultType?: string;     // 结果类型 (image/video/text)
  resultCount?: number;    // 生成数量
  resultUrl?: string;      // 生成的图片/视频 URL
  resultText?: string;     // 聊天响应文本（截断）
  responseBody?: string;   // 原始响应体（截断）
  errorMessage?: string;   // 错误信息
  
  // 关联任务
  taskId?: string;
  workflowId?: string;
}

// 内存中的日志缓存（最近 N 条）
const memoryLogs: LLMApiLog[] = [];
const MAX_MEMORY_LOGS = 50;

// IndexedDB 配置
const DB_NAME = 'llm-api-logs';
const DB_VERSION = 1;
const STORE_NAME = 'logs';
const MAX_DB_LOGS = 500; // IndexedDB 中最多保存的日志数量

// 广播回调
let broadcastCallback: ((log: LLMApiLog) => void) | null = null;

/**
 * 打开 IndexedDB
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('taskType', 'taskType', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }
    };
  });
}

/**
 * 保存日志到 IndexedDB
 */
async function saveLogToDB(log: LLMApiLog): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    store.put(log);
    
    // 清理旧日志（保留最新的 MAX_DB_LOGS 条）
    const countRequest = store.count();
    countRequest.onsuccess = () => {
      const count = countRequest.result;
      if (count > MAX_DB_LOGS) {
        const index = store.index('timestamp');
        const deleteCount = count - MAX_DB_LOGS;
        let deleted = 0;
        
        index.openCursor().onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor && deleted < deleteCount) {
            cursor.delete();
            deleted++;
            cursor.continue();
          }
        };
      }
    };
    
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch (error) {
    console.warn('[LLMApiLogger] Failed to save log to DB:', error);
  }
}

/**
 * 更新 IndexedDB 中的日志
 */
async function updateLogInDB(log: LLMApiLog): Promise<void> {
  await saveLogToDB(log);
}

/**
 * 从 IndexedDB 获取所有日志
 */
export async function getAllLLMApiLogs(): Promise<LLMApiLog[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('timestamp');
    
    return new Promise((resolve, reject) => {
      const request = index.getAll();
      request.onsuccess = () => {
        db.close();
        // 按时间倒序排列
        const logs = (request.result as LLMApiLog[]).reverse();
        resolve(logs);
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  } catch (error) {
    console.warn('[LLMApiLogger] Failed to get logs from DB:', error);
    return memoryLogs;
  }
}

/**
 * 通过 taskId 查找成功的 LLM API 日志
 * 用于恢复已完成但状态未更新的任务
 */
export async function findSuccessLogByTaskId(taskId: string): Promise<LLMApiLog | null> {
  // 先从内存缓存查找
  const memoryLog = memoryLogs.find(
    log => log.taskId === taskId && log.status === 'success' && log.resultUrl
  );
  if (memoryLog) {
    return memoryLog;
  }
  
  // 从 IndexedDB 查找
  try {
    const allLogs = await getAllLLMApiLogs();
    const log = allLogs.find(
      l => l.taskId === taskId && l.status === 'success' && l.resultUrl
    );
    return log || null;
  } catch (error) {
    console.warn('[LLMApiLogger] Failed to find log by taskId:', error);
    return null;
  }
}

/**
 * 清空所有 LLM API 日志
 */
export async function clearAllLLMApiLogs(): Promise<void> {
  memoryLogs.length = 0;
  
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch (error) {
    console.warn('[LLMApiLogger] Failed to clear logs from DB:', error);
  }
}

/**
 * 设置广播回调（用于实时推送到 sw-debug.html）
 */
export function setLLMApiLogBroadcast(callback: (log: LLMApiLog) => void) {
  broadcastCallback = callback;
}

/**
 * 获取内存中的日志（用于快速访问）
 */
export function getMemoryLLMApiLogs(): LLMApiLog[] {
  return [...memoryLogs];
}

/**
 * 创建一个新的 LLM API 日志条目
 * 返回日志 ID，用于后续更新
 */
export function startLLMApiLog(params: {
  endpoint: string;
  model: string;
  taskType: LLMApiLog['taskType'];
  prompt?: string;
  requestBody?: string;  // 完整请求体（仅 chat 类型使用，不截断）
  hasReferenceImages?: boolean;
  referenceImageCount?: number;
  taskId?: string;
  workflowId?: string;
}): string {
  const id = `llm-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  
  const log: LLMApiLog = {
    id,
    timestamp: Date.now(),
    endpoint: params.endpoint,
    model: params.model,
    taskType: params.taskType,
    prompt: params.prompt ? truncatePrompt(params.prompt) : undefined,
    requestBody: params.requestBody,  // 完整保存，不截断
    hasReferenceImages: params.hasReferenceImages,
    referenceImageCount: params.referenceImageCount,
    status: 'pending',
    taskId: params.taskId,
    workflowId: params.workflowId,
  };
  
  // 添加到内存缓存
  memoryLogs.unshift(log);
  if (memoryLogs.length > MAX_MEMORY_LOGS) {
    memoryLogs.pop();
  }
  
  // 保存到 IndexedDB
  saveLogToDB(log);
  
  // 广播
  if (broadcastCallback) {
    broadcastCallback({ ...log });
  }
  
  return id;
}

/**
 * 更新 LLM API 日志为成功状态
 */
export function completeLLMApiLog(
  logId: string,
  params: {
    httpStatus: number;
    duration: number;
    resultType?: string;
    resultCount?: number;
    resultUrl?: string;
    resultText?: string;
    responseBody?: string;
  }
): void {
  const log = memoryLogs.find(l => l.id === logId);
  if (log) {
    log.status = 'success';
    log.httpStatus = params.httpStatus;
    log.duration = params.duration;
    log.resultType = params.resultType;
    log.resultCount = params.resultCount;
    log.resultUrl = params.resultUrl;
    log.resultText = params.resultText ? truncateText(params.resultText, 1000) : undefined;
    log.responseBody = params.responseBody ? truncateText(params.responseBody, 2000) : undefined;
    
    // 更新 IndexedDB
    updateLogInDB(log);
    
    // 广播
    if (broadcastCallback) {
      broadcastCallback({ ...log });
    }
  }
}

/**
 * 更新 LLM API 日志为失败状态
 */
export function failLLMApiLog(
  logId: string,
  params: {
    httpStatus?: number;
    duration: number;
    errorMessage: string;
    responseBody?: string;
  }
): void {
  const log = memoryLogs.find(l => l.id === logId);
  if (log) {
    log.status = 'error';
    log.httpStatus = params.httpStatus;
    log.duration = params.duration;
    log.errorMessage = truncateError(params.errorMessage);
    log.responseBody = params.responseBody ? truncateText(params.responseBody, 2000) : undefined;
    
    // 更新 IndexedDB
    updateLogInDB(log);
    
    // 广播
    if (broadcastCallback) {
      broadcastCallback({ ...log });
    }
  }
}

/**
 * 截断提示词（保护隐私，减少存储）
 */
function truncatePrompt(prompt: string): string {
  if (prompt.length <= 200) return prompt;
  return prompt.substring(0, 200) + '...';
}

/**
 * 截断文本到指定长度
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * 截断错误信息
 */
function truncateError(error: string): string {
  if (error.length <= 500) return error;
  return error.substring(0, 500) + '...';
}

/**
 * 高级 fetch 包装器，自动记录 LLM API 调用
 * 始终记录，不受调试模式影响
 */
export async function llmFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  meta: {
    model: string;
    taskType: LLMApiLog['taskType'];
    prompt?: string;
    hasReferenceImages?: boolean;
    referenceImageCount?: number;
    taskId?: string;
    workflowId?: string;
  }
): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const endpoint = new URL(url).pathname;
  const startTime = Date.now();
  
  // 开始记录
  const logId = startLLMApiLog({
    endpoint,
    model: meta.model,
    taskType: meta.taskType,
    prompt: meta.prompt,
    hasReferenceImages: meta.hasReferenceImages,
    referenceImageCount: meta.referenceImageCount,
    taskId: meta.taskId,
    workflowId: meta.workflowId,
  });
  
  try {
    const response = await fetch(input, init);
    const duration = Date.now() - startTime;
    
    if (response.ok) {
      completeLLMApiLog(logId, {
        httpStatus: response.status,
        duration,
        resultType: meta.taskType === 'image' ? 'image' : meta.taskType === 'video' ? 'video' : 'text',
        resultCount: 1,
      });
    } else {
      const errorText = await response.clone().text().catch(() => 'Unknown error');
      failLLMApiLog(logId, {
        httpStatus: response.status,
        duration,
        errorMessage: errorText,
      });
    }
    
    return response;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    failLLMApiLog(logId, {
      duration,
      errorMessage: error.message || String(error),
    });
    throw error;
  }
}
