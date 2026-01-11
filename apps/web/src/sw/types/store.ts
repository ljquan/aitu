/**
 * Service Worker IndexedDB 存储类型定义
 *
 * 定义任务和工作流的存储结构
 */

// ==================== 任务类型 ====================

/**
 * 任务类型枚举
 */
export enum TaskType {
  IMAGE = 'image',
  VIDEO = 'video',
  CHARACTER = 'character',
  INSPIRATION_BOARD = 'inspiration_board',
}

/**
 * 任务状态枚举
 */
export enum TaskStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  RETRYING = 'retrying',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * 任务执行阶段枚举
 */
export enum TaskExecutionPhase {
  SUBMITTING = 'submitting',
  POLLING = 'polling',
  DOWNLOADING = 'downloading',
}

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
  sourceVideoTaskId?: string;
  characterTimestamps?: string;
  sourceLocalTaskId?: string;
  gridImageRows?: number;
  gridImageCols?: number;
  gridImageLayoutStyle?: 'scattered' | 'grid' | 'circular';
  inspirationBoardLayoutStyle?: 'inspiration-board';
  isInspirationBoard?: boolean;
  inspirationBoardImageCount?: number;
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
  characterUsername?: string;
  characterProfileUrl?: string;
  characterPermalink?: string;
}

/**
 * 任务错误详情
 */
export interface TaskErrorDetails {
  originalError?: string;
  apiResponse?: unknown;
  timestamp?: number;
}

/**
 * 任务错误
 */
export interface TaskError {
  code: string;
  message: string;
  details?: TaskErrorDetails;
}

/**
 * 任务存储结构
 */
export interface Task {
  id: string;
  type: TaskType;
  status: TaskStatus;
  params: GenerationParams;
  result?: TaskResult;
  error?: TaskError;
  progress?: number;
  remoteId?: string;
  executionPhase?: TaskExecutionPhase;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
  retryCount: number;
  nextRetryAt?: number;
  savedToLibrary?: boolean;
}

// ==================== 工作流类型 ====================

/**
 * 工作流步骤状态
 */
export type WorkflowStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/**
 * 工作流状态
 */
export type WorkflowStatus = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * 工作流步骤存储结构
 */
export interface WorkflowStepStore {
  id: string;
  name: string;
  type: string;
  status: WorkflowStepStatus;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  duration?: number;
}

/**
 * 工作流定义存储结构
 */
export interface WorkflowDefinitionStore {
  id: string;
  name: string;
  steps: WorkflowStepStore[];
  metadata?: Record<string, unknown>;
}

/**
 * 工作流存储结构
 */
export interface WorkflowStore {
  id: string;
  definition: WorkflowDefinitionStore;
  status: WorkflowStatus;
  currentStepIndex: number;
  steps: WorkflowStepStore[];
  result?: WorkflowResultStore;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * 工作流结果存储结构
 */
export interface WorkflowResultStore {
  success: boolean;
  output: string;
  finalOutput: string;
  iterations: number;
  error?: string;
}

// ==================== 数据库配置 ====================

/**
 * IndexedDB 数据库名称
 */
export const DB_NAME = 'aitu-sw-store';

/**
 * IndexedDB 数据库版本
 */
export const DB_VERSION = 1;

/**
 * 存储对象名称
 */
export const STORES = {
  tasks: 'tasks',
  workflows: 'workflows',
  metadata: 'metadata',
} as const;

/**
 * 元数据键
 */
export const METADATA_KEYS = {
  lastSyncTime: 'lastSyncTime',
  version: 'version',
} as const;
