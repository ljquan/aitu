/**
 * Channel Manager Constants
 *
 * RPC 方法名和事件名常量定义
 */

// ============================================================================
// RPC 方法名常量
// ============================================================================

export const RPC_METHODS = {
  // 初始化
  INIT: 'init',
  UPDATE_CONFIG: 'updateConfig',

  // 任务操作
  TASK_CREATE: 'task:create',
  TASK_CANCEL: 'task:cancel',
  TASK_RETRY: 'task:retry',
  TASK_DELETE: 'task:delete',
  TASK_MARK_INSERTED: 'task:markInserted',

  // 任务查询
  TASK_GET: 'task:get',
  TASK_LIST_PAGINATED: 'task:listPaginated',

  // Chat
  CHAT_START: 'chat:start',
  CHAT_STOP: 'chat:stop',
  CHAT_GET_CACHED: 'chat:getCached',

  // Workflow
  WORKFLOW_SUBMIT: 'workflow:submit',
  WORKFLOW_CANCEL: 'workflow:cancel',
  WORKFLOW_GET_STATUS: 'workflow:getStatus',
  WORKFLOW_GET_ALL: 'workflow:getAll',
  WORKFLOW_RESPOND_TOOL: 'workflow:respondTool',
  WORKFLOW_CLAIM: 'workflow:claim', // 客户端声明接管工作流

  // Thumbnail (图片缩略图，由 SW 生成)
  THUMBNAIL_GENERATE: 'thumbnail:generate',

  // Crash monitoring
  CRASH_SNAPSHOT: 'crash:snapshot',
  CRASH_HEARTBEAT: 'crash:heartbeat',

  // Console
  CONSOLE_REPORT: 'console:report',

  // Debug
  DEBUG_GET_STATUS: 'debug:getStatus',
  DEBUG_ENABLE: 'debug:enable',
  DEBUG_DISABLE: 'debug:disable',
  DEBUG_GET_LOGS: 'debug:getLogs',
  DEBUG_CLEAR_LOGS: 'debug:clearLogs',
  DEBUG_GET_CONSOLE_LOGS: 'debug:getConsoleLogs',
  DEBUG_CLEAR_CONSOLE_LOGS: 'debug:clearConsoleLogs',
  DEBUG_GET_POSTMESSAGE_LOGS: 'debug:getPostMessageLogs',
  DEBUG_CLEAR_POSTMESSAGE_LOGS: 'debug:clearPostMessageLogs',
  DEBUG_GET_CRASH_SNAPSHOTS: 'debug:getCrashSnapshots',
  DEBUG_CLEAR_CRASH_SNAPSHOTS: 'debug:clearCrashSnapshots',
  DEBUG_GET_LLM_API_LOGS: 'debug:getLLMApiLogs',
  DEBUG_GET_LLM_API_LOG_BY_ID: 'debug:getLLMApiLogById',
  DEBUG_CLEAR_LLM_API_LOGS: 'debug:clearLLMApiLogs',
  DEBUG_DELETE_LLM_API_LOGS: 'debug:deleteLLMApiLogs',
  DEBUG_GET_CACHE_ENTRIES: 'debug:getCacheEntries',
  DEBUG_GET_CACHE_STATS: 'debug:getCacheStats',
  DEBUG_EXPORT_LOGS: 'debug:exportLogs',

  // CDN
  CDN_GET_STATUS: 'cdn:getStatus',
  CDN_RESET_STATUS: 'cdn:resetStatus',
  CDN_HEALTH_CHECK: 'cdn:healthCheck',

  // Upgrade
  UPGRADE_GET_STATUS: 'upgrade:getStatus',
  UPGRADE_FORCE: 'upgrade:force',

  // Cache management
  CACHE_DELETE: 'cache:delete',
} as const;

// ============================================================================
// 事件名常量（SW 推送给客户端）
// ============================================================================

export const SW_EVENTS = {
  // Task events
  TASK_CREATED: 'task:created',
  TASK_STATUS: 'task:status',
  TASK_PROGRESS: 'task:progress',
  TASK_COMPLETED: 'task:completed',
  TASK_FAILED: 'task:failed',
  TASK_CANCELLED: 'task:cancelled',
  TASK_DELETED: 'task:deleted',
  TASK_REJECTED: 'task:rejected',
  TASK_SUBMITTED: 'task:submitted',
  QUEUE_INITIALIZED: 'queue:initialized',

  // Chat events
  CHAT_CHUNK: 'chat:chunk',
  CHAT_DONE: 'chat:done',
  CHAT_ERROR: 'chat:error',

  // Workflow events
  WORKFLOW_STATUS: 'workflow:status',
  WORKFLOW_STEP_STATUS: 'workflow:stepStatus',
  WORKFLOW_COMPLETED: 'workflow:completed',
  WORKFLOW_FAILED: 'workflow:failed',
  WORKFLOW_STEPS_ADDED: 'workflow:stepsAdded',
  WORKFLOW_TOOL_REQUEST: 'workflow:toolRequest',
  WORKFLOW_RECOVERED: 'workflow:recovered',

  // Cache events
  CACHE_IMAGE_CACHED: 'cache:imageCached',
  CACHE_DELETED: 'cache:deleted',
  CACHE_QUOTA_WARNING: 'cache:quotaWarning',

  // SW status events
  SW_NEW_VERSION_READY: 'sw:newVersionReady',
  SW_ACTIVATED: 'sw:activated',
  SW_UPDATED: 'sw:updated',
  SW_REQUEST_CONFIG: 'sw:requestConfig',

  // MCP events
  MCP_TOOL_RESULT: 'mcp:toolResult',

  // Console events
  CONSOLE_LOG: 'console:log',

  // Debug events
  DEBUG_LOG: 'debug:log',
  DEBUG_LLM_LOG: 'debug:llmLog',
  DEBUG_STATUS_CHANGED: 'debug:statusChanged',
  DEBUG_NEW_CRASH_SNAPSHOT: 'debug:newCrashSnapshot',
  POSTMESSAGE_LOG: 'postmessage:log',
  POSTMESSAGE_LOG_BATCH: 'postmessage:logBatch',
} as const;
