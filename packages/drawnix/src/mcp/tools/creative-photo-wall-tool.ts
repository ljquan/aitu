/**
 * 照片墙 MCP 工具
 *
 * 生成创意照片墙：调用一次生图模型，生成不规则分割的拼贴图，
 * 然后以散落的横向布局插入画布，营造更有创意感的效果
 */

import type { MCPTool, MCPResult, MCPExecuteOptions, MCPTaskResult } from '../types';
import { PHOTO_WALL_DEFAULTS, PHOTO_WALL_PROMPT_TEMPLATE } from '../../types/photo-wall.types';
import { taskQueueService } from '../../services/task-queue-service';
import { TaskType } from '../../types/task.types';
import { getCurrentImageModel } from './image-generation';

/**
 * 照片墙工具参数
 */
export interface CreativePhotoWallParams {
  /** 主题描述 */
  theme: string;
  /** 图片数量（6-12，默认 9） */
  imageCount?: number;
  /** 图片尺寸比例（默认 16x9 横向） */
  imageSize?: string;
  /** 图片质量（默认 2k） */
  imageQuality?: '1k' | '2k' | '4k';
  /** 语言（默认 zh） */
  language?: 'zh' | 'en';
  /** AI 模型 */
  model?: string;
}

/**
 * 构建照片墙生图提示词
 */
function buildPhotoWallPrompt(
  theme: string,
  imageCount: number,
  language: 'zh' | 'en'
): string {
  const template = PHOTO_WALL_PROMPT_TEMPLATE[language];
  return template(theme, imageCount);
}

/**
 * 创建照片墙任务（queue 模式）
 * 复用图片生成的任务队列，添加照片墙特有参数
 */
function executeQueue(params: CreativePhotoWallParams, options: MCPExecuteOptions): MCPTaskResult {
  const {
    theme,
    imageCount = PHOTO_WALL_DEFAULTS.imageCount,
    imageSize = '16x9', // 照片墙默认横向布局
    imageQuality = '2k',
    language = 'zh',
    model,
  } = params;

  if (!theme || typeof theme !== 'string') {
    return {
      success: false,
      error: '缺少必填参数 theme（主题描述）',
      type: 'error',
    };
  }

  // 验证参数范围
  const validImageCount = Math.min(Math.max(6, imageCount), 12);

  // 构建生图提示词
  const prompt = buildPhotoWallPrompt(theme, validImageCount, language);

  // 确定使用的模型
  const actualModel = model || getCurrentImageModel();

  console.log('[CreativePhotoWallTool] Creating photo wall task with params:', {
    theme,
    imageCount: validImageCount,
    imageSize,
    imageQuality,
    language,
    model: actualModel,
    modelSource: model ? 'user-specified' : 'settings',
  });

  try {
    // 创建照片墙任务
    // 任务完成后由 useAutoInsertToCanvas 检测并处理
    const task = taskQueueService.createTask(
      {
        prompt,
        size: imageSize,
        model: actualModel,
        // 照片墙特有参数
        isPhotoWall: true,
        photoWallImageCount: validImageCount,
        photoWallLayoutStyle: 'photo-wall', // 使用新的照片墙布局
        // 保存原始主题，用于显示
        originalTheme: theme,
        // 批量参数
        batchId: options.batchId,
        globalIndex: options.globalIndex || 1,
      },
      TaskType.IMAGE
    );

    console.log('[CreativePhotoWallTool] Created photo wall task:', task.id);

    return {
      success: true,
      data: {
        taskId: task.id,
        theme,
        imageCount: validImageCount,
        prompt: prompt.substring(0, 100) + '...',
      },
      type: 'image',
      taskId: task.id,
      task,
    };
  } catch (error: any) {
    console.error('[CreativePhotoWallTool] Failed to create task:', error);

    return {
      success: false,
      error: error.message || '创建照片墙任务失败',
      type: 'error',
    };
  }
}

/**
 * 照片墙 MCP 工具定义
 */
export const creativePhotoWallTool: MCPTool = {
  name: 'generate_photo_wall',
  description: `照片墙生成工具。根据主题描述生成一组不同大小、不同角度的创意图片，
以散落的横向布局插入画板，形成更有创意感和艺术感的照片墙效果。

与宫格图的区别：
- 宫格图：等大小的网格分割，整齐排列
- 照片墙：不同大小的图片，散落横向布局，更有创意感

使用场景：
- 用户想要创建有创意感的照片墙、灵感板
- 用户想要生成主题相关的多角度、多风格图片集合
- 用户想要类似 Pinterest 或 Mood Board 的展示效果
- 用户提到"创意"、"灵感"、"艺术感"等关键词

工作原理：
1. 根据主题生成一张包含多个不同大小元素的创意拼贴图
2. 智能检测并分割出各个独立图片
3. 以散落的横向布局计算位置（带旋转和层叠）
4. 批量插入到画板

不适用场景：
- 只想生成单张图片（使用 generate_image 工具）
- 想要整齐的网格排列（使用 generate_grid_image 工具）
- 想要生成视频（使用 generate_video 工具）`,

  inputSchema: {
    type: 'object',
    properties: {
      theme: {
        type: 'string',
        description: '照片墙主题描述，如"可爱香蕉的各种形态"、"咖啡文化"、"城市街角"等',
      },
      imageCount: {
        type: 'number',
        description: '图片数量，6-12 之间，默认 9',
        default: 9,
      },
      imageSize: {
        type: 'string',
        description: '生成图片的尺寸比例（建议横向）',
        enum: ['16x9', '3x2', '1x1'],
        default: '16x9',
      },
      imageQuality: {
        type: 'string',
        description: '图片质量',
        enum: ['1k', '2k', '4k'],
        default: '2k',
      },
      language: {
        type: 'string',
        description: '提示词语言',
        enum: ['zh', 'en'],
        default: 'zh',
      },
      model: {
        type: 'string',
        description: '图片生成模型，不指定时使用用户设置的模型',
      },
    },
    required: ['theme'],
  },

  supportedModes: ['queue'],

  promptGuidance: {
    whenToUse: '当用户想要生成创意照片墙、灵感板、Mood Board 效果时使用。关键词：照片墙、灵感板、创意拼贴、艺术展示、Mood Board、Pinterest 风格。',

    parameterGuidance: {
      theme: '主题描述应该具体且有多样性潜力。好的主题：描述一类事物的多种变体、不同角度或不同场景。避免过于具体的单一描述。',
      imageCount: '建议 9 张左右，太少缺乏层次感，太多会显得拥挤。',
      imageSize: '建议使用 16x9 横向比例，更适合照片墙的横向布局效果。',
    },

    bestPractices: [
      '主题应强调多样性和变化，如"咖啡的各种形态"而非"一杯咖啡"',
      '可以指定风格混搭，如"写实与插画混合"、"不同时代风格"',
      '描述具体的视觉元素，帮助 AI 生成更丰富的内容',
      '适合用于灵感收集、Mood Board、创意展示等场景',
    ],

    examples: [
      {
        input: '生成一个可爱香蕉的照片墙',
        args: { theme: '可爱香蕉的各种形态，包含卡通香蕉、写实香蕉、香蕉角色、香蕉图案等不同风格', imageCount: 9 },
        explanation: '照片墙适合展示主题的多角度、多风格变化',
      },
      {
        input: '创建一个咖啡文化灵感板',
        args: { theme: '咖啡文化，包含咖啡豆、咖啡杯、拉花、咖啡馆场景、手冲咖啡等不同元素', imageCount: 9 },
        explanation: '灵感板展示主题的多个方面，帮助激发创意',
      },
      {
        input: '做个城市街角的 Mood Board',
        args: { theme: '城市街角，包含不同城市、不同时间、不同天气、不同风格的街角场景', imageCount: 9, imageSize: '16x9' },
        explanation: 'Mood Board 适合用照片墙展示氛围和感觉',
      },
    ],

    warnings: [
      '照片墙生成的图片大小不一，位置有随机性，与规整的宫格图不同',
      '建议使用横向比例（16x9 或 3x2）以获得更好的照片墙效果',
      '生成后系统会智能分割图片，图片数量可能略有差异',
    ],
  },

  execute: async (params: Record<string, unknown>, options?: MCPExecuteOptions): Promise<MCPResult> => {
    return executeQueue(params as unknown as CreativePhotoWallParams, options || {});
  },
};

/**
 * 便捷方法：创建照片墙任务
 */
export function createPhotoWallTaskNew(
  params: CreativePhotoWallParams,
  options?: Omit<MCPExecuteOptions, 'mode'>
): MCPTaskResult {
  return creativePhotoWallTool.execute(params as unknown as Record<string, unknown>, {
    ...options,
    mode: 'queue',
  }) as unknown as MCPTaskResult;
}
