/**
 * 工作流分页同步服务
 * 实现工作流的分页存储和增量同步
 */

import { workflowStorageReader } from '../workflow-storage-reader';
import type { WorkflowDefinition, WorkflowStep } from '../sw-channel/types/workflow';
import { gitHubApiService } from './github-api-service';
import { cryptoService } from './crypto-service';
import { logDebug, logInfo, logWarning, logError } from './sync-log-service';
import { yieldToMain } from '@aitu/utils';
import {
  WorkflowIndex,
  WorkflowIndexItem,
  WorkflowPage,
  WorkflowPageInfo,
  CompactWorkflow,
  CompactWorkflowStep,
  CompactWorkflowStepResult,
  CompactWorkflowContext,
  WorkflowSyncChanges,
  WorkflowSyncStatus,
  PAGED_SYNC_CONFIG,
  PAGED_SYNC_VERSION,
  SYNC_FILES_PAGED,
} from './types';

// ====================================
// 终态判断
// ====================================

/**
 * 判断工作流是否处于终态
 */
function isTerminalStatus(status: WorkflowSyncStatus | string): boolean {
  return status === 'completed' ||
         status === 'failed' ||
         status === 'cancelled';
}

// ====================================
// 数据转换
// ====================================

/**
 * 将 WorkflowStep 转换为精简的 CompactWorkflowStep
 */
function compactStep(step: WorkflowStep): CompactWorkflowStep {
  let compactResult: CompactWorkflowStepResult | undefined;
  if (step.result && typeof step.result === 'object') {
    const result = step.result as any;
    compactResult = {
      success: result.success ?? true,
      type: result.type ?? 'text',
      data: result.data ? {
        url: result.data.url,
        taskId: result.data.taskId,
        taskIds: result.data.taskIds,
        // 省略 content 等大字段
      } : undefined,
      error: result.error,
    };
  }

  return {
    id: step.id,
    mcp: step.mcp,
    description: step.description,
    status: step.status,
    result: compactResult,
    error: step.error,
    duration: step.duration,
    dependsOn: step.dependsOn,
    // 省略 args 大字段
  };
}

/**
 * 将完整 WorkflowDefinition 转换为精简的 CompactWorkflow
 */
function compactWorkflow(workflow: WorkflowDefinition, syncVersion: number): CompactWorkflow {
  let compactContext: CompactWorkflowContext | undefined;
  if (workflow.context) {
    compactContext = {
      userInput: workflow.context.userInput?.substring(0, PAGED_SYNC_CONFIG.PROMPT_PREVIEW_LENGTH),
      model: workflow.context.model,
      params: workflow.context.params,
      textModel: workflow.context.textModel,
      // 省略 selection, referenceImages 等大字段
    };
  }

  return {
    id: workflow.id,
    steps: workflow.steps.map(compactStep),
    status: workflow.status as WorkflowSyncStatus,
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
    completedAt: workflow.completedAt,
    error: workflow.error,
    context: compactContext,
    initiatorBoardId: (workflow as any).initiatorBoardId,
    syncVersion,
  };
}

/**
 * 生成工作流索引项
 */
function createWorkflowIndexItem(
  workflow: WorkflowDefinition,
  syncVersion: number,
  pageId: number
): WorkflowIndexItem {
  return {
    id: workflow.id,
    status: workflow.status as WorkflowSyncStatus,
    stepCount: workflow.steps.length,
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
    completedAt: workflow.completedAt,
    syncVersion,
    pageId,
    userInputPreview: workflow.context?.userInput?.substring(0, PAGED_SYNC_CONFIG.PROMPT_PREVIEW_LENGTH),
  };
}

/**
 * 将工作流列表转换为分页格式
 */
export function convertWorkflowsToPagedFormat(
  workflows: WorkflowDefinition[],
  existingSyncVersions?: Map<string, number>
): { index: WorkflowIndex; pages: WorkflowPage[] } {
  const now = Date.now();
  const pages: WorkflowPage[] = [];
  const items: WorkflowIndexItem[] = [];
  const pageInfos: WorkflowPageInfo[] = [];

  // 按创建时间排序
  const sortedWorkflows = [...workflows].sort((a, b) => a.createdAt - b.createdAt);

  let currentPage: CompactWorkflow[] = [];
  let currentPageId = 0;
  let currentPageSize = 0;

  for (const workflow of sortedWorkflows) {
    // 获取或生成 syncVersion
    const existingVersion = existingSyncVersions?.get(workflow.id);
    const syncVersion = existingVersion ?? 1;

    const compact = compactWorkflow(workflow, syncVersion);
    const compactSize = JSON.stringify(compact).length;

    // 检查是否需要新建分页
    const shouldCreateNewPage =
      currentPage.length >= PAGED_SYNC_CONFIG.MAX_WORKFLOWS_PER_PAGE ||
      (currentPageSize + compactSize > PAGED_SYNC_CONFIG.MAX_PAGE_SIZE && currentPage.length > 0);

    if (shouldCreateNewPage) {
      // 保存当前分页
      pages.push({
        pageId: currentPageId,
        updatedAt: now,
        workflows: currentPage,
      });

      pageInfos.push({
        pageId: currentPageId,
        filename: SYNC_FILES_PAGED.workflowPageFile(currentPageId),
        itemCount: currentPage.length,
        totalSize: currentPageSize,
        updatedAt: now,
      });

      // 创建新分页
      currentPageId++;
      currentPage = [];
      currentPageSize = 0;
    }

    currentPage.push(compact);
    currentPageSize += compactSize;

    // 添加索引项
    items.push(createWorkflowIndexItem(workflow, syncVersion, currentPageId));
  }

  // 保存最后一个分页
  if (currentPage.length > 0) {
    pages.push({
      pageId: currentPageId,
      updatedAt: now,
      workflows: currentPage,
    });

    pageInfos.push({
      pageId: currentPageId,
      filename: SYNC_FILES_PAGED.workflowPageFile(currentPageId),
      itemCount: currentPage.length,
      totalSize: currentPageSize,
      updatedAt: now,
    });
  }

  const index: WorkflowIndex = {
    version: PAGED_SYNC_VERSION,
    updatedAt: now,
    pages: pageInfos,
    items,
  };

  return { index, pages };
}

// ====================================
// 增量同步
// ====================================

/**
 * 比较本地和远程索引，确定需要同步的变更
 */
export function compareWorkflowIndexes(
  localIndex: WorkflowIndex,
  remoteIndex: WorkflowIndex | null
): WorkflowSyncChanges {
  const toUpload: string[] = [];
  const toDownload: string[] = [];
  const skipped: string[] = [];
  const pagesToUpload = new Set<number>();
  const pagesToDownload = new Set<number>();

  // 创建远程索引 Map
  const remoteItemMap = new Map<string, WorkflowIndexItem>();
  if (remoteIndex) {
    for (const item of remoteIndex.items) {
      remoteItemMap.set(item.id, item);
    }
  }

  // 检查本地工作流
  for (const localItem of localIndex.items) {
    const remoteItem = remoteItemMap.get(localItem.id);

    if (!remoteItem) {
      // 远程不存在，需要上传
      toUpload.push(localItem.id);
      pagesToUpload.add(localItem.pageId);
    } else if (isTerminalStatus(localItem.status) && localItem.syncVersion === remoteItem.syncVersion) {
      // 终态且 syncVersion 相同，跳过
      skipped.push(localItem.id);
    } else if (localItem.updatedAt > remoteItem.updatedAt) {
      // 本地更新，需要上传
      toUpload.push(localItem.id);
      pagesToUpload.add(localItem.pageId);
    } else if (localItem.updatedAt < remoteItem.updatedAt) {
      // 远程更新，需要下载
      toDownload.push(localItem.id);
      pagesToDownload.add(remoteItem.pageId);
    } else {
      // 时间相同，跳过
      skipped.push(localItem.id);
    }

    // 从远程 Map 中移除已处理的
    remoteItemMap.delete(localItem.id);
  }

  // 远程独有的工作流需要下载
  for (const [id, item] of remoteItemMap) {
    toDownload.push(id);
    pagesToDownload.add(item.pageId);
  }

  return {
    toUpload,
    toDownload,
    pagesToUpload: Array.from(pagesToUpload),
    pagesToDownload: Array.from(pagesToDownload),
    skipped,
  };
}

/**
 * 判断是否需要同步特定工作流
 */
export function shouldSyncWorkflow(
  local: WorkflowIndexItem,
  remote: WorkflowIndexItem | null
): boolean {
  // 远程不存在，需要上传
  if (!remote) return true;

  // 终态且 syncVersion 相同，跳过
  if (isTerminalStatus(local.status) && local.syncVersion === remote.syncVersion) {
    return false;
  }

  // updatedAt 更新，需要同步
  return local.updatedAt > remote.updatedAt;
}

// ====================================
// 工作流分页同步服务
// ====================================

class WorkflowSyncService {
  /**
   * 收集本地已完成的工作流
   */
  async collectLocalWorkflows(): Promise<WorkflowDefinition[]> {
    const allWorkflows = await workflowStorageReader.getAllWorkflows();
    // 只同步终态的工作流
    return allWorkflows.filter(w => isTerminalStatus(w.status));
  }

  /**
   * 构建本地工作流索引
   */
  async buildLocalIndex(
    existingSyncVersions?: Map<string, number>
  ): Promise<{ index: WorkflowIndex; pages: WorkflowPage[] }> {
    const workflows = await this.collectLocalWorkflows();
    return convertWorkflowsToPagedFormat(workflows, existingSyncVersions);
  }

  /**
   * 下载远程工作流索引
   */
  async downloadRemoteIndex(
    gistId: string,
    customPassword?: string
  ): Promise<WorkflowIndex | null> {
    try {
      const content = await gitHubApiService.getGistFileContent(
        SYNC_FILES_PAGED.WORKFLOW_INDEX
      );

      if (!content) {
        logDebug('WorkflowSyncService: Remote workflow index not found');
        return null;
      }

      const decrypted = await cryptoService.decryptOrPassthrough(
        content,
        gistId,
        customPassword
      );

      return JSON.parse(decrypted) as WorkflowIndex;
    } catch (error) {
      logWarning('WorkflowSyncService: Failed to download remote workflow index', error);
      return null;
    }
  }

  /**
   * 下载远程工作流分页
   */
  async downloadRemotePage(
    pageId: number,
    gistId: string,
    customPassword?: string
  ): Promise<WorkflowPage | null> {
    try {
      const filename = SYNC_FILES_PAGED.workflowPageFile(pageId);
      const content = await gitHubApiService.getGistFileContent(filename);

      if (!content) {
        logWarning(`WorkflowSyncService: Remote workflow page ${pageId} not found`);
        return null;
      }

      const decrypted = await cryptoService.decryptOrPassthrough(
        content,
        gistId,
        customPassword
      );

      return JSON.parse(decrypted) as WorkflowPage;
    } catch (error) {
      logWarning(`WorkflowSyncService: Failed to download workflow page ${pageId}`, error);
      return null;
    }
  }

  /**
   * 上传工作流索引和分页
   */
  async uploadWorkflowData(
    index: WorkflowIndex,
    pages: WorkflowPage[],
    pagesToUpload: number[],
    gistId: string,
    customPassword?: string
  ): Promise<void> {
    const files: Record<string, string> = {};

    // 加密并序列化索引
    const indexJson = JSON.stringify(index, null, 2);
    files[SYNC_FILES_PAGED.WORKFLOW_INDEX] = await cryptoService.encrypt(indexJson, gistId, customPassword);

    // 加密并序列化需要上传的分页
    let uploadedPageCount = 0;
    for (const pageId of pagesToUpload) {
      const page = pages.find(p => p.pageId === pageId);
      if (page) {
        const pageJson = JSON.stringify(page, null, 2);
        const filename = SYNC_FILES_PAGED.workflowPageFile(pageId);
        files[filename] = await cryptoService.encrypt(pageJson, gistId, customPassword);
      }
      // 每处理 3 个分页让出主线程
      uploadedPageCount++;
      if (uploadedPageCount % 3 === 0) {
        await yieldToMain();
      }
    }

    logDebug('WorkflowSyncService: Uploading workflow data', {
      indexItems: index.items.length,
      pagesToUpload: pagesToUpload.length,
    });

    await gitHubApiService.updateGistFiles(files);

    logInfo('WorkflowSyncService: Workflow data uploaded successfully');
  }

  /**
   * 执行完整的工作流同步
   */
  async syncWorkflows(
    gistId: string,
    customPassword?: string
  ): Promise<{
    uploaded: number;
    downloaded: number;
    skipped: number;
  }> {
    logDebug('WorkflowSyncService: Starting workflow sync');

    // 构建本地索引
    const { index: localIndex, pages: localPages } = await this.buildLocalIndex();
    // 让出主线程，避免 UI 阻塞
    await yieldToMain();

    // 如果本地没有工作流，跳过同步
    if (localIndex.items.length === 0) {
      logDebug('WorkflowSyncService: No local workflows to sync');
      
      // 仍然尝试下载远程工作流
      const remoteIndex = await this.downloadRemoteIndex(gistId, customPassword);
      if (remoteIndex && remoteIndex.items.length > 0) {
        let downloaded = 0;
        const pagesToDownload = new Set<number>();
        for (const item of remoteIndex.items) {
          pagesToDownload.add(item.pageId);
        }
        
        let emptyDownloadCount = 0;
        for (const pageId of pagesToDownload) {
          const page = await this.downloadRemotePage(pageId, gistId, customPassword);
          if (page) {
            // 恢复工作流到本地 - 需要通过 SW 的 importWorkflows 方法
            // 这里暂时只记录下载数量
            downloaded += page.workflows.length;
          }
          // 每处理 2 个分页让出主线程
          emptyDownloadCount++;
          if (emptyDownloadCount % 2 === 0) {
            await yieldToMain();
          }
        }
        
        return { uploaded: 0, downloaded, skipped: 0 };
      }
      
      return { uploaded: 0, downloaded: 0, skipped: 0 };
    }

    // 下载远程索引
    const remoteIndex = await this.downloadRemoteIndex(gistId, customPassword);

    // 比较变更
    const changes = compareWorkflowIndexes(localIndex, remoteIndex);

    logDebug('WorkflowSyncService: Changes detected', {
      toUpload: changes.toUpload.length,
      toDownload: changes.toDownload.length,
      skipped: changes.skipped.length,
      pagesToUpload: changes.pagesToUpload.length,
      pagesToDownload: changes.pagesToDownload.length,
    });

    // 下载需要的分页
    let downloaded = 0;
    let downloadedPageCount = 0;
    for (const pageId of changes.pagesToDownload) {
      const page = await this.downloadRemotePage(pageId, gistId, customPassword);
      if (page) {
        // 恢复工作流到本地 - 需要通过 SW 的 importWorkflows 方法
        // 这里暂时只记录下载数量
        downloaded += page.workflows.length;
      }
      // 每处理 2 个分页让出主线程
      downloadedPageCount++;
      if (downloadedPageCount % 2 === 0) {
        await yieldToMain();
      }
    }

    // 上传本地变更
    if (changes.pagesToUpload.length > 0 || !remoteIndex) {
      await this.uploadWorkflowData(
        localIndex,
        localPages,
        changes.pagesToUpload.length > 0 ? changes.pagesToUpload : localPages.map(p => p.pageId),
        gistId,
        customPassword
      );
    }

    logInfo('WorkflowSyncService: Workflow sync completed', {
      uploaded: changes.toUpload.length,
      downloaded,
      skipped: changes.skipped.length,
    });

    return {
      uploaded: changes.toUpload.length,
      downloaded,
      skipped: changes.skipped.length,
    };
  }

  /**
   * 获取本地工作流的 syncVersion Map
   */
  async getLocalSyncVersions(): Promise<Map<string, number>> {
    // 从本地存储获取已有的 syncVersion
    return new Map();
  }

  /**
   * 更新工作流的 syncVersion
   */
  incrementSyncVersion(
    currentVersions: Map<string, number>,
    workflowId: string
  ): number {
    const current = currentVersions.get(workflowId) || 0;
    const newVersion = current + 1;
    currentVersions.set(workflowId, newVersion);
    return newVersion;
  }
}

/** 工作流分页同步服务单例 */
export const workflowSyncService = new WorkflowSyncService();
