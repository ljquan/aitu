/**
 * GitHub Gist 同步服务类型定义
 */

import type { Folder, BoardMetadata, Board } from '../../types/workspace.types';
import type { PromptHistoryItem, VideoPromptHistoryItem, ImagePromptHistoryItem } from '../prompt-storage-service';
import type { Task } from '../../types/task.types';

// ====================================
// 同步状态
// ====================================

/** 同步状态枚举 */
export type SyncStatus =
  | 'not_configured'    // 未配置 Token
  | 'synced'            // 已同步
  | 'local_changes'     // 本地有变更待上传
  | 'remote_changes'    // 远程有变更待下载
  | 'syncing'           // 同步中
  | 'conflict'          // 有冲突
  | 'error';            // 错误

/** 媒体同步状态 */
export type MediaSyncStatus =
  | 'not_synced'        // 未同步
  | 'synced'            // 已同步
  | 'syncing'           // 同步中
  | 'too_large'         // 文件过大
  | 'error';            // 错误

// ====================================
// Gist 文件结构
// ====================================

/** 同步清单 - manifest.json */
export interface SyncManifest {
  /** 同步格式版本 */
  version: number;
  /** 应用版本 */
  appVersion: string;
  /** 首次同步时间 */
  createdAt: number;
  /** 最后同步时间 */
  updatedAt: number;
  /** 当前设备标识 */
  deviceId: string;
  /** 所有同步过的设备 */
  devices: Record<string, DeviceInfo>;
  /** 画板索引 */
  boards: Record<string, BoardSyncInfo>;
  /** 已同步的媒体文件索引 */
  syncedMedia: Record<string, MediaSyncInfo>;
}

/** 设备信息 */
export interface DeviceInfo {
  /** 设备名称 */
  name: string;
  /** 最后同步时间 */
  lastSyncTime: number;
}

/** 画板同步信息 */
export interface BoardSyncInfo {
  /** 画板名称 */
  name: string;
  /** 更新时间 */
  updatedAt: number;
  /** 内容校验和 */
  checksum: string;
}

/** 媒体同步信息 */
export interface MediaSyncInfo {
  /** 任务 ID */
  taskId: string;
  /** 媒体类型 */
  type: 'image' | 'video';
  /** 原始文件大小 */
  size: number;
  /** 同步时间 */
  syncedAt: number;
}

/** 工作区数据 - workspace.json */
export interface WorkspaceData {
  /** 文件夹列表 */
  folders: Folder[];
  /** 画板元数据（不含 elements） */
  boardMetadata: BoardMetadata[];
  /** 当前打开的画板 ID */
  currentBoardId: string | null;
  /** 展开的文件夹 ID 列表 */
  expandedFolders: string[];
}

/** 画板数据 - board_{id}.json */
export interface BoardData extends Board {
  // 继承 Board 的所有字段
}

/** 提示词数据 - prompts.json */
export interface PromptsData {
  /** 通用提示词历史 */
  promptHistory: PromptHistoryItem[];
  /** 视频提示词历史 */
  videoPromptHistory: VideoPromptHistoryItem[];
  /** 图片提示词历史 */
  imagePromptHistory: ImagePromptHistoryItem[];
}

/** 任务数据 - tasks.json */
export interface TasksData {
  /** 已完成的任务列表 */
  completedTasks: Task[];
}

/** 同步的媒体文件 - media_{taskId}.json */
export interface SyncedMedia {
  /** 任务 ID */
  taskId: string;
  /** 媒体类型 */
  type: 'image' | 'video';
  /** 生成提示词 */
  prompt: string;
  /** 使用的模型 */
  model: string;
  /** 生成参数 */
  params: Record<string, unknown>;
  /** MIME 类型 */
  mimeType: string;
  /** 原始文件大小 */
  originalSize: number;
  /** Base64 编码的媒体数据 */
  base64Data: string;
  /** 创建时间 */
  createdAt: number;
  /** 同步时间 */
  syncedAt: number;
  /** 同步来源设备 */
  syncedFromDevice: string;
}

// ====================================
// 同步操作结果
// ====================================

/** 同步结果 */
export interface SyncResult {
  /** 是否成功 */
  success: boolean;
  /** 上传的项目数量 */
  uploaded: {
    boards: number;
    prompts: number;
    tasks: number;
    media: number;
  };
  /** 下载的项目数量 */
  downloaded: {
    boards: number;
    prompts: number;
    tasks: number;
    media: number;
  };
  /** 冲突项 */
  conflicts: ConflictItem[];
  /** 错误信息 */
  error?: string;
  /** 同步耗时（毫秒） */
  duration: number;
  /** 远程当前画板 ID */
  remoteCurrentBoardId?: string | null;
}

/** 冲突项 */
export interface ConflictItem {
  /** 冲突类型 */
  type: 'board' | 'prompt' | 'task';
  /** 项目 ID */
  id: string;
  /** 项目名称 */
  name: string;
  /** 本地版本时间 */
  localUpdatedAt: number;
  /** 远程版本时间 */
  remoteUpdatedAt: number;
  /** 是否已自动合并 */
  merged?: boolean;
  /** 合并信息 */
  mergeInfo?: {
    /** 从本地添加的元素数 */
    addedFromLocal: number;
    /** 从远程添加的元素数 */
    addedFromRemote: number;
    /** 冲突的元素数（使用本地版本） */
    conflictingElements: number;
  };
}

/** 冲突解决策略 */
export type ConflictResolution = 
  | 'use_local'     // 使用本地版本
  | 'use_remote'    // 使用远程版本
  | 'use_newer'     // 使用更新时间更晚的版本（默认）
  | 'keep_both';    // 保留两个版本（创建副本）

/** 媒体同步结果 */
export interface MediaSyncResult {
  /** 是否成功 */
  success: boolean;
  /** 任务 ID */
  taskId: string;
  /** 错误信息 */
  error?: string;
}

/** 批量媒体同步结果 */
export interface BatchMediaSyncResult {
  /** 成功数量 */
  succeeded: number;
  /** 失败数量 */
  failed: number;
  /** 跳过数量（文件过大） */
  skipped: number;
  /** 详细结果 */
  results: MediaSyncResult[];
}

// ====================================
// 变更检测
// ====================================

/** 变更集 */
export interface ChangeSet {
  /** 新增的画板 */
  addedBoards: string[];
  /** 修改的画板 */
  modifiedBoards: string[];
  /** 删除的画板 */
  deletedBoards: string[];
  /** 提示词是否有变更 */
  promptsChanged: boolean;
  /** 任务是否有变更 */
  tasksChanged: boolean;
}

// ====================================
// GitHub API 相关
// ====================================

/** Gist 文件内容 */
export interface GistFile {
  filename: string;
  content: string;
  truncated?: boolean;
  raw_url?: string;
}

/** Gist 响应 */
export interface GistResponse {
  id: string;
  url: string;
  html_url: string;
  description: string;
  public: boolean;
  files: Record<string, GistFile>;
  created_at: string;
  updated_at: string;
}

/** 创建 Gist 请求 */
export interface CreateGistRequest {
  description: string;
  public: boolean;
  files: Record<string, { content: string }>;
}

/** 更新 Gist 请求 */
export interface UpdateGistRequest {
  description?: string;
  files: Record<string, { content: string } | null>;
}

// ====================================
// 同步配置
// ====================================

/** 同步配置 */
export interface SyncConfig {
  /** 是否启用同步 */
  enabled: boolean;
  /** 是否启用自动同步 */
  autoSync: boolean;
  /** 自动同步防抖时间（毫秒） */
  autoSyncDebounceMs: number;
  /** Gist ID */
  gistId: string | null;
  /** 最后同步时间 */
  lastSyncTime: number | null;
  /** 最后同步的设备 ID */
  lastSyncDeviceId: string | null;
}

/** 默认同步配置 */
export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  enabled: false,
  autoSync: true,
  autoSyncDebounceMs: 30000, // 30 秒
  gistId: null,
  lastSyncTime: null,
  lastSyncDeviceId: null,
};

// ====================================
// 常量
// ====================================

/** 同步版本号 */
export const SYNC_VERSION = 1;

/** Gist 描述 */
export const GIST_DESCRIPTION = 'Opentu (开图) - 数据同步';

/** 文件名常量 */
export const SYNC_FILES = {
  MANIFEST: 'manifest.json',
  WORKSPACE: 'workspace.json',
  PROMPTS: 'prompts.json',
  TASKS: 'tasks.json',
  SETTINGS: 'settings.json',
  boardFile: (id: string) => `board_${id}.json`,
  mediaFile: (taskId: string) => `media_${taskId}.json`,
} as const;

/** 媒体文件大小限制（50MB） */
export const MAX_MEDIA_SIZE = 50 * 1024 * 1024;

/** GitHub API 基础 URL */
export const GITHUB_API_BASE = 'https://api.github.com';
