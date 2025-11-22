/**
 * Task Test Utilities
 * 
 * Utilities for creating mock tasks for testing purposes.
 * This file can be used during development to test the task queue UI.
 */

import { Task, TaskStatus, TaskType } from '../types/task.types';
import { generateTaskId } from './task-utils';

/**
 * Creates a mock task with specified parameters
 */
export function createMockTask(overrides?: Partial<Task>): Task {
  const now = Date.now();
  return {
    id: generateTaskId(),
    type: TaskType.IMAGE,
    status: TaskStatus.PENDING,
    params: {
      prompt: 'A beautiful sunset over the ocean',
      width: 1024,
      height: 1024,
    },
    createdAt: now,
    updatedAt: now,
    retryCount: 0,
    ...overrides,
  };
}

/**
 * Creates multiple mock tasks with various statuses
 */
export function createMockTasks(): Task[] {
  const now = Date.now();
  
  return [
    // Pending task
    createMockTask({
      params: { prompt: '一只可爱的猫咪在草地上玩耍', width: 1024, height: 1024 },
      status: TaskStatus.PENDING,
      createdAt: now - 30000, // 30 seconds ago
    }),
    
    // Processing task
    createMockTask({
      type: TaskType.IMAGE,
      params: { prompt: '未来城市的科幻场景，霓虹灯闪烁', width: 1920, height: 1080 },
      status: TaskStatus.PROCESSING,
      startedAt: now - 60000, // Started 1 minute ago
      createdAt: now - 120000, // Created 2 minutes ago
    }),
    
    // Completed task with result
    createMockTask({
      type: TaskType.IMAGE,
      params: { prompt: '宁静的山水画，水墨风格', width: 1024, height: 768 },
      status: TaskStatus.COMPLETED,
      createdAt: now - 300000, // 5 minutes ago
      startedAt: now - 280000,
      completedAt: now - 200000,
      result: {
        url: 'https://picsum.photos/1024/768',
        format: 'png',
        size: 2048000, // 2MB
        width: 1024,
        height: 768,
      },
    }),
    
    // Failed task
    createMockTask({
      type: TaskType.VIDEO,
      params: { prompt: '海浪拍打礁石的视频', duration: 5 },
      status: TaskStatus.FAILED,
      createdAt: now - 600000, // 10 minutes ago
      startedAt: now - 580000,
      completedAt: now - 500000,
      retryCount: 3,
      error: {
        code: 'TIMEOUT',
        message: '视频生成超时，请稍后重试',
      },
    }),
    
    // Retrying task
    createMockTask({
      params: { prompt: '抽象艺术作品，色彩鲜艳', width: 1024, height: 1024 },
      status: TaskStatus.RETRYING,
      createdAt: now - 400000,
      retryCount: 1,
      nextRetryAt: now + 60000, // Next retry in 1 minute
      error: {
        code: 'API_ERROR',
        message: 'API 暂时不可用',
      },
    }),

    // Completed video task
    createMockTask({
      type: TaskType.VIDEO,
      params: { prompt: '星空延时摄影效果', duration: 10 },
      status: TaskStatus.COMPLETED,
      createdAt: now - 900000, // 15 minutes ago
      startedAt: now - 880000,
      completedAt: now - 600000,
      result: {
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
        format: 'mp4',
        size: 5242880, // 5MB
        width: 1920,
        height: 1080,
        duration: 10,
      },
    }),
  ];
}

/**
 * Window utility to add mock tasks (for browser console testing)
 * Usage: window.addMockTasks()
 */
if (typeof window !== 'undefined') {
  (window as any).addMockTasks = () => {
    const { taskQueueService } = require('../services/task-queue-service');
    const mockTasks = createMockTasks();
    taskQueueService.restoreTasks(mockTasks);
    console.log('Added mock tasks:', mockTasks.length);
  };
}
