/**
 * Media Executor Tests
 * 媒体执行器模块测试
 *
 * 测试场景：
 * 1. 执行器接口验证
 * 2. 执行器工厂基本功能
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  IMediaExecutor,
  ImageGenerationParams,
  VideoGenerationParams,
  AIAnalyzeParams,
} from '../media-executor/types';

describe('Media Executor Module', () => {
  describe('IMediaExecutor Interface', () => {
    it('should define correct interface structure', () => {
      // 验证接口类型定义存在
      const imageParams: ImageGenerationParams = {
        taskId: 'test-1',
        prompt: 'A cat',
      };

      const videoParams: VideoGenerationParams = {
        taskId: 'test-2',
        prompt: 'A dancing cat',
      };

      const analyzeParams: AIAnalyzeParams = {
        taskId: 'test-3',
        prompt: 'Analyze this image',
        images: ['http://example.com/image.png'],
      };

      expect(imageParams.taskId).toBe('test-1');
      expect(videoParams.prompt).toBe('A dancing cat');
      expect(analyzeParams.images).toHaveLength(1);
    });

    it('should support optional parameters for image generation', () => {
      const params: ImageGenerationParams = {
        taskId: 'test-1',
        prompt: 'A landscape',
        model: 'imagen-3.0-generate-002',
        size: '1024x1024',
        count: 4,
        referenceImages: ['http://example.com/ref.png'],
      };

      expect(params.model).toBe('imagen-3.0-generate-002');
      expect(params.size).toBe('1024x1024');
      expect(params.count).toBe(4);
      expect(params.referenceImages).toHaveLength(1);
    });

    it('should support optional parameters for video generation', () => {
      const params: VideoGenerationParams = {
        taskId: 'test-1',
        prompt: 'A video',
        model: 'veo-2.0-generate-001',
        duration: '10',
        size: '1280x720',
      };

      expect(params.model).toBe('veo-2.0-generate-001');
      expect(params.duration).toBe('10');
      expect(params.size).toBe('1280x720');
    });
  });

  describe('SWMediaExecutor', () => {
    it('should have correct executor name', async () => {
      // 动态导入以避免 mock 问题
      vi.doMock('../sw-channel/client', () => ({
        swChannelClient: {
          isInitialized: () => false,
          ping: async () => false,
          callExecutor: async () => ({ success: false }),
        },
      }));

      const { SWMediaExecutor } = await import('../media-executor/sw-executor');
      const executor = new SWMediaExecutor();

      expect(executor.name).toBe('SWMediaExecutor');
    });

    it('should implement IMediaExecutor interface', async () => {
      vi.doMock('../sw-channel/client', () => ({
        swChannelClient: {
          isInitialized: () => false,
          ping: async () => false,
          callExecutor: async () => ({ success: false }),
        },
      }));

      const { SWMediaExecutor } = await import('../media-executor/sw-executor');
      const executor: IMediaExecutor = new SWMediaExecutor();

      expect(typeof executor.name).toBe('string');
      expect(typeof executor.isAvailable).toBe('function');
      expect(typeof executor.generateImage).toBe('function');
      expect(typeof executor.generateVideo).toBe('function');
      expect(typeof executor.aiAnalyze).toBe('function');
    });
  });

  describe('FallbackMediaExecutor', () => {
    beforeEach(() => {
      vi.resetModules();
    });

    it('should have correct executor name', async () => {
      vi.doMock('../media-executor/task-storage-writer', () => ({
        taskStorageWriter: {
          isAvailable: async () => true,
          createTask: async () => {},
          updateTaskStatus: async () => {},
          completeTask: async () => {},
          failTask: async () => {},
        },
      }));

      vi.doMock('../../utils/settings-manager', () => ({
        geminiSettings: {
          get: () => ({
            apiKey: 'test-key',
            baseUrl: 'https://api.example.com',
          }),
        },
      }));

      const { FallbackMediaExecutor } = await import(
        '../media-executor/fallback-executor'
      );
      const executor = new FallbackMediaExecutor();

      expect(executor.name).toBe('FallbackMediaExecutor');
    });

    it('should implement IMediaExecutor interface', async () => {
      vi.doMock('../media-executor/task-storage-writer', () => ({
        taskStorageWriter: {
          isAvailable: async () => true,
          createTask: async () => {},
          updateTaskStatus: async () => {},
          completeTask: async () => {},
          failTask: async () => {},
        },
      }));

      vi.doMock('../../utils/settings-manager', () => ({
        geminiSettings: {
          get: () => ({
            apiKey: 'test-key',
            baseUrl: 'https://api.example.com',
          }),
        },
      }));

      const { FallbackMediaExecutor } = await import(
        '../media-executor/fallback-executor'
      );
      const executor: IMediaExecutor = new FallbackMediaExecutor();

      expect(typeof executor.name).toBe('string');
      expect(typeof executor.isAvailable).toBe('function');
      expect(typeof executor.generateImage).toBe('function');
      expect(typeof executor.generateVideo).toBe('function');
      expect(typeof executor.aiAnalyze).toBe('function');
    });
  });

  describe('ExecutorFactory', () => {
    beforeEach(() => {
      vi.resetModules();
    });

    it('should export getExecutor function', async () => {
      vi.doMock('../sw-channel/client', () => ({
        swChannelClient: {
          isInitialized: () => false,
          ping: async () => false,
        },
      }));

      vi.doMock('../media-executor/task-storage-writer', () => ({
        taskStorageWriter: {
          isAvailable: async () => true,
        },
      }));

      vi.doMock('../../utils/settings-manager', () => ({
        geminiSettings: {
          get: () => ({
            apiKey: 'test-key',
            baseUrl: 'https://api.example.com',
          }),
        },
      }));

      const { executorFactory } = await import('../media-executor/factory');

      expect(typeof executorFactory.getExecutor).toBe('function');
    });
  });

  describe('Task Polling Types', () => {
    it('should export waitForTaskCompletion function', async () => {
      vi.doMock('../task-storage-reader', () => ({
        taskStorageReader: {
          isAvailable: async () => true,
          getTask: async () => null,
        },
      }));

      const { waitForTaskCompletion } = await import(
        '../media-executor/task-polling'
      );

      expect(typeof waitForTaskCompletion).toBe('function');
    });
  });
});
