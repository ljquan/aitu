/**
 * Paged Sync Services Tests
 * 分页同步服务测试
 *
 * 测试场景：
 * 1. 任务转换为分页格式
 * 2. 工作流转换为分页格式
 * 3. 增量同步逻辑
 * 4. 终态任务跳过同步
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  convertTasksToPagedFormat,
  compareTaskIndexes,
} from '../task-sync-service';
import {
  convertWorkflowsToPagedFormat,
  compareWorkflowIndexes,
} from '../workflow-sync-service';
import {
  TaskIndex,
  TaskIndexItem,
  WorkflowIndex,
  WorkflowIndexItem,
  PAGED_SYNC_CONFIG,
  detectTaskSyncFormat,
  SYNC_FILES_PAGED,
} from '../types';
import type { Task } from '../../../types/task.types';
import { TaskStatus, TaskType } from '../../../types/task.types';

// 模拟任务数据
function createMockTask(overrides: Partial<Task> = {}): Task {
  const now = Date.now();
  return {
    id: `task-${Math.random().toString(36).substring(7)}`,
    type: TaskType.IMAGE,
    status: TaskStatus.COMPLETED,
    params: {
      prompt: 'A beautiful sunset over the ocean',
    },
    createdAt: now,
    updatedAt: now,
    completedAt: now,
    result: {
      url: 'https://example.com/image.png',
      format: 'png',
      size: 1024,
    },
    ...overrides,
  };
}

// 模拟工作流数据
function createMockWorkflow(overrides: Partial<any> = {}): any {
  const now = Date.now();
  return {
    id: `workflow-${Math.random().toString(36).substring(7)}`,
    name: 'Test Workflow',
    steps: [
      {
        id: 'step-1',
        mcp: 'generate_image',
        args: { prompt: 'Test' },
        description: 'Generate an image',
        status: 'completed',
        result: { success: true, type: 'image' },
      },
    ],
    status: 'completed',
    createdAt: now,
    updatedAt: now,
    completedAt: now,
    context: {
      userInput: 'Generate a test image',
    },
    ...overrides,
  };
}

describe('Task Paged Sync', () => {
  describe('convertTasksToPagedFormat', () => {
    it('should convert empty task list', () => {
      const { index, pages } = convertTasksToPagedFormat([]);

      expect(index.items).toHaveLength(0);
      expect(pages).toHaveLength(0);
      expect(index.version).toBe(1);
    });

    it('should convert single task', () => {
      const task = createMockTask();
      const { index, pages } = convertTasksToPagedFormat([task]);

      expect(index.items).toHaveLength(1);
      expect(pages).toHaveLength(1);
      expect(index.items[0].id).toBe(task.id);
      expect(index.items[0].status).toBe(task.status);
      expect(index.items[0].pageId).toBe(0);
      expect(pages[0].tasks).toHaveLength(1);
      expect(pages[0].tasks[0].id).toBe(task.id);
    });

    it('should create multiple pages when exceeding limit', () => {
      // 创建超过一页的任务
      const tasks: Task[] = [];
      for (let i = 0; i < PAGED_SYNC_CONFIG.MAX_TASKS_PER_PAGE + 5; i++) {
        tasks.push(createMockTask({ id: `task-${i}` }));
      }

      const { index, pages } = convertTasksToPagedFormat(tasks);

      expect(pages.length).toBeGreaterThan(1);
      expect(index.pages.length).toBe(pages.length);

      // 验证第一页满了
      expect(pages[0].tasks.length).toBe(PAGED_SYNC_CONFIG.MAX_TASKS_PER_PAGE);
      // 剩余任务在第二页
      expect(pages[1].tasks.length).toBe(5);
    });

    it('should truncate prompt preview', () => {
      const longPrompt = 'a'.repeat(200);
      const task = createMockTask({
        params: { prompt: longPrompt },
      });

      const { index } = convertTasksToPagedFormat([task]);

      expect(index.items[0].promptPreview?.length).toBeLessThanOrEqual(
        PAGED_SYNC_CONFIG.PROMPT_PREVIEW_LENGTH
      );
    });

    it('should preserve existing syncVersion', () => {
      const task = createMockTask({ id: 'task-1' });
      const existingVersions = new Map([['task-1', 5]]);

      const { index, pages } = convertTasksToPagedFormat([task], existingVersions);

      expect(index.items[0].syncVersion).toBe(5);
      expect(pages[0].tasks[0].syncVersion).toBe(5);
    });

    it('should omit large fields in compact task', () => {
      const task = createMockTask({
        result: {
          url: 'https://example.com/image.png',
          format: 'png',
          size: 1024,
          chatResponse: 'This is a very long chat response...',
          toolCalls: [{ name: 'test', arguments: {} }],
        },
        error: {
          code: 'ERROR',
          message: 'Test error',
          details: {
            apiResponse: { huge: 'data' },
          },
        },
      });

      const { pages } = convertTasksToPagedFormat([task]);
      const compactTask = pages[0].tasks[0];

      // chatResponse 和 toolCalls 应该被省略
      expect(compactTask.result).not.toHaveProperty('chatResponse');
      expect(compactTask.result).not.toHaveProperty('toolCalls');
      // error.details 应该被省略
      expect(compactTask.error).not.toHaveProperty('details');
    });
  });

  describe('compareTaskIndexes', () => {
    it('should detect new local tasks', () => {
      const localIndex: TaskIndex = {
        version: 1,
        updatedAt: Date.now(),
        pages: [{ pageId: 0, filename: 'tasks_p0.json', itemCount: 1, totalSize: 100, updatedAt: Date.now() }],
        items: [
          { id: 'task-1', type: 'image', status: 'completed', createdAt: 1000, updatedAt: 2000, syncVersion: 1, pageId: 0 },
        ],
      };

      const changes = compareTaskIndexes(localIndex, null);

      expect(changes.toUpload).toContain('task-1');
      expect(changes.toDownload).toHaveLength(0);
      expect(changes.pagesToUpload).toContain(0);
    });

    it('should detect remote-only tasks for download', () => {
      const localIndex: TaskIndex = {
        version: 1,
        updatedAt: Date.now(),
        pages: [],
        items: [],
      };

      const remoteIndex: TaskIndex = {
        version: 1,
        updatedAt: Date.now(),
        pages: [{ pageId: 0, filename: 'tasks_p0.json', itemCount: 1, totalSize: 100, updatedAt: Date.now() }],
        items: [
          { id: 'task-1', type: 'image', status: 'completed', createdAt: 1000, updatedAt: 2000, syncVersion: 1, pageId: 0 },
        ],
      };

      const changes = compareTaskIndexes(localIndex, remoteIndex);

      expect(changes.toDownload).toContain('task-1');
      expect(changes.toUpload).toHaveLength(0);
      expect(changes.pagesToDownload).toContain(0);
    });

    it('should skip terminal tasks with same syncVersion', () => {
      const now = Date.now();
      const localIndex: TaskIndex = {
        version: 1,
        updatedAt: now,
        pages: [{ pageId: 0, filename: 'tasks_p0.json', itemCount: 1, totalSize: 100, updatedAt: now }],
        items: [
          { id: 'task-1', type: 'image', status: 'completed', createdAt: 1000, updatedAt: 2000, syncVersion: 3, pageId: 0 },
        ],
      };

      const remoteIndex: TaskIndex = {
        version: 1,
        updatedAt: now,
        pages: [{ pageId: 0, filename: 'tasks_p0.json', itemCount: 1, totalSize: 100, updatedAt: now }],
        items: [
          { id: 'task-1', type: 'image', status: 'completed', createdAt: 1000, updatedAt: 2000, syncVersion: 3, pageId: 0 },
        ],
      };

      const changes = compareTaskIndexes(localIndex, remoteIndex);

      expect(changes.skipped).toContain('task-1');
      expect(changes.toUpload).not.toContain('task-1');
      expect(changes.toDownload).not.toContain('task-1');
    });

    it('should upload local task with newer updatedAt', () => {
      const localIndex: TaskIndex = {
        version: 1,
        updatedAt: Date.now(),
        pages: [{ pageId: 0, filename: 'tasks_p0.json', itemCount: 1, totalSize: 100, updatedAt: Date.now() }],
        items: [
          { id: 'task-1', type: 'image', status: 'processing', createdAt: 1000, updatedAt: 3000, syncVersion: 2, pageId: 0 },
        ],
      };

      const remoteIndex: TaskIndex = {
        version: 1,
        updatedAt: Date.now(),
        pages: [{ pageId: 0, filename: 'tasks_p0.json', itemCount: 1, totalSize: 100, updatedAt: Date.now() }],
        items: [
          { id: 'task-1', type: 'image', status: 'processing', createdAt: 1000, updatedAt: 2000, syncVersion: 1, pageId: 0 },
        ],
      };

      const changes = compareTaskIndexes(localIndex, remoteIndex);

      expect(changes.toUpload).toContain('task-1');
      expect(changes.pagesToUpload).toContain(0);
    });

    it('should download remote task with newer updatedAt', () => {
      const localIndex: TaskIndex = {
        version: 1,
        updatedAt: Date.now(),
        pages: [{ pageId: 0, filename: 'tasks_p0.json', itemCount: 1, totalSize: 100, updatedAt: Date.now() }],
        items: [
          { id: 'task-1', type: 'image', status: 'processing', createdAt: 1000, updatedAt: 2000, syncVersion: 1, pageId: 0 },
        ],
      };

      const remoteIndex: TaskIndex = {
        version: 1,
        updatedAt: Date.now(),
        pages: [{ pageId: 0, filename: 'tasks_p0.json', itemCount: 1, totalSize: 100, updatedAt: Date.now() }],
        items: [
          { id: 'task-1', type: 'image', status: 'completed', createdAt: 1000, updatedAt: 3000, syncVersion: 2, pageId: 0 },
        ],
      };

      const changes = compareTaskIndexes(localIndex, remoteIndex);

      expect(changes.toDownload).toContain('task-1');
      expect(changes.pagesToDownload).toContain(0);
    });
  });

});

describe('Workflow Paged Sync', () => {
  describe('convertWorkflowsToPagedFormat', () => {
    it('should convert empty workflow list', () => {
      const { index, pages } = convertWorkflowsToPagedFormat([]);

      expect(index.items).toHaveLength(0);
      expect(pages).toHaveLength(0);
    });

    it('should convert single workflow', () => {
      const workflow = createMockWorkflow();
      const { index, pages } = convertWorkflowsToPagedFormat([workflow]);

      expect(index.items).toHaveLength(1);
      expect(pages).toHaveLength(1);
      expect(index.items[0].id).toBe(workflow.id);
      expect(index.items[0].stepCount).toBe(workflow.steps.length);
    });

    it('should omit large fields in compact workflow', () => {
      const workflow = createMockWorkflow({
        steps: [
          {
            id: 'step-1',
            mcp: 'generate_image',
            args: { prompt: 'Test', hugeData: { nested: 'data' } },
            description: 'Generate an image',
            status: 'completed',
            result: {
              success: true,
              type: 'image',
              data: { url: 'test.png', content: 'Large content...' },
            },
          },
        ],
        context: {
          userInput: 'Test input',
          referenceImages: ['base64data...'],
          selection: { texts: ['text1'], images: ['img1'] },
        },
      });

      const { pages } = convertWorkflowsToPagedFormat([workflow]);
      const compactWorkflow = pages[0].workflows[0];

      // args 应该被省略
      expect(compactWorkflow.steps[0]).not.toHaveProperty('args');
      // result.data.content 应该被省略
      expect(compactWorkflow.steps[0].result?.data).not.toHaveProperty('content');
      // context 中的大字段应该被省略
      expect(compactWorkflow.context).not.toHaveProperty('referenceImages');
      expect(compactWorkflow.context).not.toHaveProperty('selection');
    });
  });

  describe('compareWorkflowIndexes', () => {
    it('should detect new local workflows', () => {
      const localIndex: WorkflowIndex = {
        version: 1,
        updatedAt: Date.now(),
        pages: [{ pageId: 0, filename: 'workflows_p0.json', itemCount: 1, totalSize: 100, updatedAt: Date.now() }],
        items: [
          { id: 'wf-1', status: 'completed', stepCount: 2, createdAt: 1000, updatedAt: 2000, syncVersion: 1, pageId: 0 },
        ],
      };

      const changes = compareWorkflowIndexes(localIndex, null);

      expect(changes.toUpload).toContain('wf-1');
      expect(changes.toDownload).toHaveLength(0);
    });

    it('should skip terminal workflows with same syncVersion', () => {
      const now = Date.now();
      const localIndex: WorkflowIndex = {
        version: 1,
        updatedAt: now,
        pages: [{ pageId: 0, filename: 'workflows_p0.json', itemCount: 1, totalSize: 100, updatedAt: now }],
        items: [
          { id: 'wf-1', status: 'completed', stepCount: 2, createdAt: 1000, updatedAt: 2000, syncVersion: 3, pageId: 0 },
        ],
      };

      const remoteIndex: WorkflowIndex = {
        version: 1,
        updatedAt: now,
        pages: [{ pageId: 0, filename: 'workflows_p0.json', itemCount: 1, totalSize: 100, updatedAt: now }],
        items: [
          { id: 'wf-1', status: 'completed', stepCount: 2, createdAt: 1000, updatedAt: 2000, syncVersion: 3, pageId: 0 },
        ],
      };

      const changes = compareWorkflowIndexes(localIndex, remoteIndex);

      expect(changes.skipped).toContain('wf-1');
      expect(changes.toUpload).not.toContain('wf-1');
    });
  });
});

describe('Format Detection', () => {
  describe('detectTaskSyncFormat', () => {
    it('should detect paged format', () => {
      const files = {
        [SYNC_FILES_PAGED.TASK_INDEX]: '{}',
        'tasks_p0.json': '{}',
      };

      expect(detectTaskSyncFormat(files)).toBe('paged');
    });

    it('should return none for empty files', () => {
      const files = {};

      expect(detectTaskSyncFormat(files)).toBe('none');
    });
  });
});

describe('SYNC_FILES_PAGED', () => {
  it('should generate correct task page filename', () => {
    expect(SYNC_FILES_PAGED.taskPageFile(0)).toBe('tasks_p0.json');
    expect(SYNC_FILES_PAGED.taskPageFile(5)).toBe('tasks_p5.json');
  });

  it('should detect task page files', () => {
    expect(SYNC_FILES_PAGED.isTaskPageFile('tasks_p0.json')).toBe(true);
    expect(SYNC_FILES_PAGED.isTaskPageFile('tasks_p123.json')).toBe(true);
    expect(SYNC_FILES_PAGED.isTaskPageFile('tasks.json')).toBe(false);
    expect(SYNC_FILES_PAGED.isTaskPageFile('other.json')).toBe(false);
  });

  it('should extract task page ID', () => {
    expect(SYNC_FILES_PAGED.getTaskPageId('tasks_p0.json')).toBe(0);
    expect(SYNC_FILES_PAGED.getTaskPageId('tasks_p123.json')).toBe(123);
    expect(SYNC_FILES_PAGED.getTaskPageId('tasks.json')).toBe(null);
  });

  it('should generate correct workflow page filename', () => {
    expect(SYNC_FILES_PAGED.workflowPageFile(0)).toBe('workflows_p0.json');
    expect(SYNC_FILES_PAGED.workflowPageFile(3)).toBe('workflows_p3.json');
  });

  it('should detect workflow page files', () => {
    expect(SYNC_FILES_PAGED.isWorkflowPageFile('workflows_p0.json')).toBe(true);
    expect(SYNC_FILES_PAGED.isWorkflowPageFile('workflows_p99.json')).toBe(true);
    expect(SYNC_FILES_PAGED.isWorkflowPageFile('workflows.json')).toBe(false);
  });

  it('should extract workflow page ID', () => {
    expect(SYNC_FILES_PAGED.getWorkflowPageId('workflows_p0.json')).toBe(0);
    expect(SYNC_FILES_PAGED.getWorkflowPageId('workflows_p42.json')).toBe(42);
    expect(SYNC_FILES_PAGED.getWorkflowPageId('workflows.json')).toBe(null);
  });
});
