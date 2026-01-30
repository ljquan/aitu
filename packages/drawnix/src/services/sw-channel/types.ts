/**
 * Service Worker 双工通信类型定义
 * 
 * 基于 postmessage-duplex 库的类型定义
 */

import type { Methods, PostResponse, ReturnCode } from 'postmessage-duplex';

// ============================================================================
// 任务相关类型
// ============================================================================

/**
 * 任务状态
 */
export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

/**
 * 任务类型
 */
export type TaskType = 'image' | 'video' | 'character' | 'inspiration_board' | 'chat';

/**
 * 任务执行阶段
 */
export type TaskExecutionPhase = 'submitting' | 'polling' | 'downloading';

/**
 * 生成参数
 */
export interface GenerationParams {
  prompt: string;
  width?: number;
  height?: number;
  size?: string;
  duration?: number;
  style?: string;
  model?: string;
  seed?: number;
  batchId?: string;
  aspectRatio?: string;
  autoInsertToCanvas?: boolean;
  [key: string]: unknown;
}

/**
 * 任务结果
 */
export interface TaskResult {
  url: string;
  format: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number;
  thumbnailUrl?: string;
}

/**
 * 任务错误
 */
export interface TaskError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * SW 任务
 */
export interface SWTask {
  id: string;
  type: TaskType;
  status: TaskStatus;
  params: GenerationParams;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
  result?: TaskResult;
  error?: TaskError;
  progress?: number;
  remoteId?: string;
  executionPhase?: TaskExecutionPhase;
  insertedToCanvas?: boolean;
}

// ============================================================================
// RPC 方法定义
// ============================================================================

/**
 * 任务创建请求参数
 */
export interface TaskCreateParams {
  taskId: string;
  taskType: TaskType;
  params: GenerationParams;
}

/**
 * 任务创建响应
 */
export interface TaskCreateResult {
  success: boolean;
  task?: SWTask;
  existingTaskId?: string;
  reason?: 'duplicate' | 'not_initialized' | string;
}

/**
 * 任务列表响应
 */
export interface TaskListResult {
  tasks: SWTask[];
  total: number;
}

/**
 * 分页任务列表请求
 */
export interface TaskListPaginatedParams {
  offset: number;
  limit: number;
  status?: TaskStatus;
  type?: TaskType;
  sortOrder?: 'asc' | 'desc';
}

/**
 * 分页任务列表响应
 */
export interface TaskListPaginatedResult {
  tasks: SWTask[];
  total: number;
  offset: number;
  hasMore: boolean;
}

/**
 * 任务操作参数
 */
export interface TaskOperationParams {
  taskId: string;
}

/**
 * 任务操作响应
 */
export interface TaskOperationResult {
  success: boolean;
  error?: string;
}

/**
 * 初始化参数
 */
export interface InitParams {
  geminiConfig: {
    apiKey: string;
    baseUrl: string;
    modelName?: string;
  };
  videoConfig: {
    baseUrl: string;
    apiKey?: string;
  };
}

/**
 * 初始化响应
 */
export interface InitResult {
  success: boolean;
  error?: string;
}

// ============================================================================
// Chat 相关类型
// ============================================================================

/**
 * Chat 消息
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: ChatAttachment[];
}

/**
 * Chat 附件
 */
export interface ChatAttachment {
  type: 'image' | 'file';
  name: string;
  mimeType: string;
  data: string;
}

/**
 * Chat 请求参数
 */
export interface ChatStartParams {
  chatId: string;
  messages: ChatMessage[];
  newContent: string;
  attachments?: ChatAttachment[];
  temporaryModel?: string;
  systemPrompt?: string;
}

/**
 * Chat 停止参数
 */
export interface ChatStopParams {
  chatId: string;
}

// ============================================================================
// 事件类型（用于 subscribe）
// ============================================================================

/**
 * 任务状态变更事件
 */
export interface TaskStatusEvent {
  taskId: string;
  status: TaskStatus;
  progress?: number;
  phase?: TaskExecutionPhase;
  updatedAt: number;
}

/**
 * 任务完成事件
 */
export interface TaskCompletedEvent {
  taskId: string;
  result: TaskResult;
  completedAt: number;
  remoteId?: string;
}

/**
 * 任务失败事件
 */
export interface TaskFailedEvent {
  taskId: string;
  error: TaskError;
}

/**
 * 任务创建事件（广播给其他客户端）
 */
export interface TaskCreatedEvent {
  task: SWTask;
  sourceClientId?: string;
}

/**
 * Chat 数据块事件
 */
export interface ChatChunkEvent {
  chatId: string;
  content: string;
}

/**
 * Chat 完成事件
 */
export interface ChatDoneEvent {
  chatId: string;
  fullContent: string;
}

/**
 * Chat 错误事件
 */
export interface ChatErrorEvent {
  chatId: string;
  error: string;
}

// ============================================================================
// RPC 方法映射（用于类型安全的 call）
// ============================================================================

/**
 * SW RPC 方法定义
 * 格式: methodName: (params) => result
 */
export interface SWMethods extends Methods {
  // 初始化
  'init': (params: InitParams) => InitResult;
  'updateConfig': (params: Partial<InitParams>) => InitResult;
  
  // 任务操作
  'task:create': (params: TaskCreateParams) => TaskCreateResult;
  'task:cancel': (params: TaskOperationParams) => TaskOperationResult;
  'task:retry': (params: TaskOperationParams) => TaskOperationResult;
  'task:delete': (params: TaskOperationParams) => TaskOperationResult;
  'task:markInserted': (params: TaskOperationParams) => TaskOperationResult;
  
  // 任务查询
  'task:get': (params: TaskOperationParams) => { task: SWTask | null };
  'task:list': (params?: undefined) => TaskListResult;
  'task:listPaginated': (params: TaskListPaginatedParams) => TaskListPaginatedResult;
  
  // Chat
  'chat:start': (params: ChatStartParams) => TaskOperationResult;
  'chat:stop': (params: ChatStopParams) => TaskOperationResult;
  'chat:getCached': (params: { chatId: string }) => { found: boolean; fullContent?: string };
  
  // Workflow
  'workflow:submit': (params: WorkflowSubmitParams) => WorkflowSubmitResult;
  'workflow:cancel': (params: { workflowId: string }) => TaskOperationResult;
  'workflow:getStatus': (params: { workflowId: string }) => WorkflowStatusResponse;
  'workflow:getAll': (params?: undefined) => WorkflowAllResponse;
  'workflow:respondCanvas': (params: CanvasOperationResponse) => TaskOperationResult;
  'workflow:respondTool': (params: MainThreadToolResponse) => TaskOperationResult;
  
  // Thumbnail
  'thumbnail:generate': (params: ThumbnailGenerateParams) => TaskOperationResult;
  'thumbnail:videoResponse': (params: ThumbnailVideoResponseParams) => TaskOperationResult;
  
  // Crash monitoring
  'crash:snapshot': (params: CrashSnapshotParams) => TaskOperationResult;
  'crash:heartbeat': (params: HeartbeatParams) => TaskOperationResult;
  
  // Console
  'console:report': (params: ConsoleReportParams) => TaskOperationResult;
  
  // Debug
  'debug:getStatus': (params?: undefined) => DebugStatusResult;
}

/**
 * 调试状态结果
 */
export interface DebugStatusResult {
  enabled: boolean;
  logCount?: number;
  cacheStats?: {
    imageCount: number;
    totalSize: number;
  };
}

// ============================================================================
// Workflow 相关类型
// ============================================================================

/**
 * 工作流步骤状态
 */
export type WorkflowStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/**
 * 工作流状态
 */
export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * 工作流步骤选项
 */
export interface WorkflowStepOptions {
  mode?: 'async' | 'queue';
  batchId?: string;
  batchIndex?: number;
  batchTotal?: number;
  globalIndex?: number;
}

/**
 * 工作流步骤
 */
export interface WorkflowStep {
  id: string;
  mcp: string;
  args: Record<string, unknown>;
  description: string;
  status: WorkflowStepStatus;
  result?: unknown;
  error?: string;
  duration?: number;
  options?: WorkflowStepOptions;
}

/**
 * 工作流定义
 */
export interface WorkflowDefinition {
  id: string;
  name: string;
  steps: WorkflowStep[];
  status: WorkflowStatus;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  error?: string;
  context?: {
    userInput?: string;
    model?: string;
    params?: {
      count?: number;
      size?: string;
      duration?: string;
    };
    referenceImages?: string[];
  };
}

/**
 * 工作流提交参数
 */
export interface WorkflowSubmitParams {
  workflow: WorkflowDefinition;
}

/**
 * 工作流提交结果
 */
export interface WorkflowSubmitResult {
  success: boolean;
  workflowId?: string;
  error?: string;
}

/**
 * 工作流状态响应
 */
export interface WorkflowStatusResponse {
  success: boolean;
  workflow?: WorkflowDefinition;
  error?: string;
}

/**
 * 获取所有工作流响应
 */
export interface WorkflowAllResponse {
  success: boolean;
  workflows: WorkflowDefinition[];
}

/**
 * Canvas 操作响应参数
 */
export interface CanvasOperationResponse {
  requestId: string;
  success: boolean;
  error?: string;
}

/**
 * 主线程工具响应参数
 */
export interface MainThreadToolResponse {
  requestId: string;
  success: boolean;
  result?: unknown;
  error?: string;
  addSteps?: Array<{
    id: string;
    mcp: string;
    args: Record<string, unknown>;
    description: string;
    status: WorkflowStepStatus;
  }>;
}

/**
 * 工作流状态变更事件
 */
export interface WorkflowStatusEvent {
  workflowId: string;
  status: WorkflowStatus;
  updatedAt: number;
}

/**
 * 工作流步骤状态事件
 */
export interface WorkflowStepStatusEvent {
  workflowId: string;
  stepId: string;
  status: WorkflowStepStatus;
  result?: unknown;
  error?: string;
  duration?: number;
}

/**
 * 工作流完成事件
 */
export interface WorkflowCompletedEvent {
  workflowId: string;
  workflow: WorkflowDefinition;
}

/**
 * 工作流失败事件
 */
export interface WorkflowFailedEvent {
  workflowId: string;
  error: string;
}

/**
 * 工作流步骤添加事件
 */
export interface WorkflowStepsAddedEvent {
  workflowId: string;
  steps: WorkflowStep[];
}

/**
 * Canvas 操作请求事件
 */
export interface CanvasOperationRequestEvent {
  requestId: string;
  operation: 'insert_image' | 'insert_video' | 'insert_text' | 'canvas_insert';
  params: {
    url?: string;
    content?: string;
    position?: { x: number; y: number };
    items?: Array<{ type: string; url?: string; content?: string }>;
  };
}

/**
 * 主线程工具请求事件
 */
export interface MainThreadToolRequestEvent {
  requestId: string;
  workflowId: string;
  stepId: string;
  toolName: string;
  args: Record<string, unknown>;
}

/**
 * 工作流恢复事件
 */
export interface WorkflowRecoveredEvent {
  workflowId: string;
  workflow: WorkflowDefinition;
}

/**
 * SW 事件类型映射
 */
export interface SWEvents {
  'task:status': TaskStatusEvent;
  'task:completed': TaskCompletedEvent;
  'task:failed': TaskFailedEvent;
  'task:created': TaskCreatedEvent;
  'task:cancelled': { taskId: string };
  'task:deleted': { taskId: string };
  'chat:chunk': ChatChunkEvent;
  'chat:done': ChatDoneEvent;
  'chat:error': ChatErrorEvent;
  // Workflow events
  'workflow:status': WorkflowStatusEvent;
  'workflow:stepStatus': WorkflowStepStatusEvent;
  'workflow:completed': WorkflowCompletedEvent;
  'workflow:failed': WorkflowFailedEvent;
  'workflow:stepsAdded': WorkflowStepsAddedEvent;
  'workflow:canvasRequest': CanvasOperationRequestEvent;
  'workflow:toolRequest': MainThreadToolRequestEvent;
  'workflow:recovered': WorkflowRecoveredEvent;
  // Cache events
  'cache:imageCached': CacheImageCachedEvent;
  'cache:deleted': CacheDeletedEvent;
  'cache:quotaWarning': CacheQuotaWarningEvent;
  // SW status events
  'sw:newVersionReady': SWNewVersionReadyEvent;
  'sw:activated': SWActivatedEvent;
  'sw:updated': SWUpdatedEvent;
  'sw:requestConfig': SWRequestConfigEvent;
  // Thumbnail events
  'thumbnail:videoRequest': ThumbnailVideoRequestEvent;
  // MCP events
  'mcp:toolResult': MCPToolResultEvent;
  // Console events
  'console:log': ConsoleLogEvent;
  // Debug events
  'debug:log': DebugLogEvent;
  'debug:llmLog': DebugLLMLogEvent;
  'debug:statusChanged': DebugStatusChangedEvent;
  'debug:newCrashSnapshot': DebugNewCrashSnapshotEvent;
  'postmessage:log': PostMessageLogEvent;
  'postmessage:logBatch': PostMessageLogBatchEvent;
}

// ============================================================================
// Cache 事件类型
// ============================================================================

/**
 * 图片缓存事件
 */
export interface CacheImageCachedEvent {
  url: string;
  size?: number;
  thumbnailUrl?: string;
}

/**
 * 缓存删除事件
 */
export interface CacheDeletedEvent {
  url: string;
}

/**
 * 缓存配额警告事件
 */
export interface CacheQuotaWarningEvent {
  usage: number;
  quota: number;
  percentUsed: number;
}

// ============================================================================
// SW 状态事件类型
// ============================================================================

/**
 * 新版本就绪事件
 */
export interface SWNewVersionReadyEvent {
  version: string;
}

/**
 * SW 激活事件
 */
export interface SWActivatedEvent {
  version: string;
}

/**
 * SW 更新事件
 */
export interface SWUpdatedEvent {
  version?: string;
}

/**
 * SW 请求配置事件
 */
export interface SWRequestConfigEvent {
  reason: string;
}

// ============================================================================
// 缩略图事件类型
// ============================================================================

/**
 * 视频缩略图请求事件（SW -> 主线程）
 */
export interface ThumbnailVideoRequestEvent {
  requestId: string;
  url: string;
  timestamp?: number;
}

/**
 * 生成缩略图参数
 */
export interface ThumbnailGenerateParams {
  url: string;
  mediaType: 'image' | 'video';
  blob: ArrayBuffer;
  mimeType: string;
}

/**
 * 视频缩略图响应参数
 */
export interface ThumbnailVideoResponseParams {
  requestId: string;
  thumbnailUrl?: string;
  error?: string;
}

// ============================================================================
// MCP 事件类型
// ============================================================================

/**
 * MCP 工具结果事件
 */
export interface MCPToolResultEvent {
  requestId: string;
  result: unknown;
  error?: string;
}

// ============================================================================
// 控制台事件类型
// ============================================================================

/**
 * 控制台日志事件
 */
export interface ConsoleLogEvent {
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  args: unknown[];
  timestamp: number;
  source?: string;
}

/**
 * 控制台日志上报参数
 */
export interface ConsoleReportParams {
  logLevel: string;
  logArgs: unknown[];
  timestamp: number;
}

// ============================================================================
// 调试事件类型
// ============================================================================

/**
 * 调试日志事件
 */
export interface DebugLogEvent {
  id: string;
  timestamp: number;
  type: string;
  data?: unknown;
}

/**
 * LLM API 日志事件
 */
export interface DebugLLMLogEvent {
  id: string;
  timestamp: number;
  type: string;
  url?: string;
  method?: string;
  status?: number;
  duration?: number;
  error?: string;
}

/**
 * 调试状态变更事件
 */
export interface DebugStatusChangedEvent {
  enabled: boolean;
}

/**
 * 新崩溃快照事件
 */
export interface DebugNewCrashSnapshotEvent {
  snapshot: CrashSnapshot;
}

/**
 * 崩溃快照
 */
export interface CrashSnapshot {
  id: string;
  timestamp: number;
  error?: {
    message: string;
    stack?: string;
    name?: string;
  };
  url?: string;
  userAgent?: string;
  memory?: {
    usedJSHeapSize?: number;
    totalJSHeapSize?: number;
  };
}

/**
 * PostMessage 日志事件
 */
export interface PostMessageLogEvent {
  id: string;
  timestamp: number;
  direction: 'sent' | 'received';
  type: string;
  data?: unknown;
  clientId?: string;
}

/**
 * PostMessage 批量日志事件
 */
export interface PostMessageLogBatchEvent {
  entries: PostMessageLogEvent[];
}

// ============================================================================
// 崩溃监控参数
// ============================================================================

/**
 * 崩溃快照上报参数
 */
export interface CrashSnapshotParams {
  snapshot: CrashSnapshot;
}

/**
 * 心跳参数
 */
export interface HeartbeatParams {
  timestamp: number;
}

// ============================================================================
// 工具类型
// ============================================================================

/**
 * 类型安全的 PostResponse
 */
export { ReturnCode } from 'postmessage-duplex';
export type TypedPostResponse<T> = PostResponse & { data?: T };
