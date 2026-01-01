/**
 * 照片墙 MCP 工具
 *
 * 一键生成照片墙：创建图片生成任务 → 任务完成后 Canvas 分割 → 布局计算 → 批量插入画板
 * 复用 generate_image 工具的任务队列能力
 */

import type { MCPTool, MCPResult, MCPExecuteOptions, MCPTaskResult } from '../types';
import type { LayoutStyle, GridConfig } from '../../types/photo-wall.types';
import { LAYOUT_STYLES, PHOTO_WALL_DEFAULTS, PHOTO_WALL_PROMPT_TEMPLATE } from '../../types/photo-wall.types';
import { taskQueueService } from '../../services/task-queue-service';
import { TaskType } from '../../types/task.types';
import { DEFAULT_IMAGE_MODEL } from '../../constants/model-config';

/**
 * 照片墙工具参数
 */
export interface PhotoWallToolParams {
  /** 主题描述 */
  theme: string;
  /** 网格行数（默认 3） */
  rows?: number;
  /** 网格列数（默认 3） */
  cols?: number;
  /** 布局风格（默认散落） */
  layoutStyle?: LayoutStyle;
  /** 图片尺寸（默认 1x1） */
  imageSize?: string;
  /** 图片质量（默认 2k） */
  imageQuality?: '1k' | '2k' | '4k';
  /** 语言（默认 zh） */
  language?: 'zh' | 'en';
  /** AI 模型 */
  model?: string;
}

/**
 * 获取布局风格描述
 */
function getLayoutStyleDescription(): string {
  return LAYOUT_STYLES.map(s => `- ${s.style}（${s.labelZh}）：${s.description}`).join('\n');
}

/**
 * 构建照片墙生图提示词
 */
function buildPhotoWallPrompt(
  theme: string,
  gridConfig: GridConfig,
  language: 'zh' | 'en'
): string {
  const template = PHOTO_WALL_PROMPT_TEMPLATE[language];
  return template(theme, gridConfig.rows, gridConfig.cols);
}

/**
 * 创建照片墙任务（queue 模式）
 * 复用图片生成的任务队列，添加照片墙特有参数
 */
function executeQueue(params: PhotoWallToolParams, options: MCPExecuteOptions): MCPTaskResult {
  const {
    theme,
    rows = PHOTO_WALL_DEFAULTS.gridConfig.rows,
    cols = PHOTO_WALL_DEFAULTS.gridConfig.cols,
    layoutStyle = PHOTO_WALL_DEFAULTS.layoutStyle,
    imageSize = PHOTO_WALL_DEFAULTS.imageSize,
    imageQuality = PHOTO_WALL_DEFAULTS.imageQuality,
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
  const validRows = Math.min(Math.max(2, rows), 5);
  const validCols = Math.min(Math.max(2, cols), 5);

  const gridConfig: GridConfig = { rows: validRows, cols: validCols };

  // 构建生图提示词
  const prompt = buildPhotoWallPrompt(theme, gridConfig, language);

  console.log('[PhotoWallTool] Creating photo wall task with params:', {
    theme,
    gridConfig,
    layoutStyle,
    imageSize,
    imageQuality,
    language,
  });

  try {
    // 创建照片墙任务（使用 PHOTO_WALL 类型）
    // 任务完成后由 photo-wall-integration-service 处理分割和布局
    const task = taskQueueService.createTask(
      {
        prompt,
        size: imageSize,
        model: model || DEFAULT_IMAGE_MODEL,
        // 照片墙特有参数，用于任务完成后的处理
        photoWallRows: validRows,
        photoWallCols: validCols,
        photoWallLayoutStyle: layoutStyle,
        // 保存原始主题，用于显示
        originalTheme: theme,
        // 批量参数
        batchId: options.batchId,
        globalIndex: options.globalIndex || 1,
      },
      TaskType.PHOTO_WALL
    );

    console.log('[PhotoWallTool] Created photo wall task:', task.id);

    return {
      success: true,
      data: {
        taskId: task.id,
        theme,
        gridConfig,
        layoutStyle,
        prompt: prompt.substring(0, 100) + '...',
      },
      type: 'image', // 使用 image 类型以便 UI 正确显示
      taskId: task.id,
      task,
    };
  } catch (error: any) {
    console.error('[PhotoWallTool] Failed to create task:', error);

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
export const photoWallTool: MCPTool = {
  name: 'generate_photo_wall',
  description: `照片墙生成工具。根据主题描述生成一组相关图片，并按照指定布局风格排列在画板上，形成照片墙效果。

使用场景：
- 用户想要创建照片墙、图片墙、产品展示墙
- 用户想要生成一组主题相关的图片并排列展示
- 用户想要创建拼贴画、图片集合

工作原理：
1. 根据主题生成一张包含多个元素的拼贴图
2. 将拼贴图按网格分割成独立图片
3. 按选定的布局风格计算位置
4. 批量插入到画板

可用布局风格：
${getLayoutStyleDescription()}

不适用场景：
- 只想生成单张图片（使用 generate_image 工具）
- 想要生成视频（使用 generate_video 工具）`,

  inputSchema: {
    type: 'object',
    properties: {
      theme: {
        type: 'string',
        description: '照片墙主题描述，如"孟菲斯风格餐具"、"可爱猫咪表情包"、"复古相机收藏"等',
      },
      rows: {
        type: 'number',
        description: '网格行数，2-5 之间，默认 3',
        default: 3,
      },
      cols: {
        type: 'number',
        description: '网格列数，2-5 之间，默认 3',
        default: 3,
      },
      layoutStyle: {
        type: 'string',
        description: '布局风格',
        enum: ['scattered', 'grid', 'circular'],
        default: 'scattered',
      },
      imageSize: {
        type: 'string',
        description: '生成图片的尺寸比例',
        enum: ['1x1', '16x9', '9x16', '3x2', '4x3'],
        default: '1x1',
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
    },
    required: ['theme'],
  },

  supportedModes: ['queue'],

  execute: async (params: Record<string, unknown>, options?: MCPExecuteOptions): Promise<MCPResult> => {
    // 照片墙只支持 queue 模式，因为需要任务完成后的后处理
    return executeQueue(params as unknown as PhotoWallToolParams, options || {});
  },
};

/**
 * 便捷方法：创建照片墙任务
 */
export function createPhotoWallTask(
  params: PhotoWallToolParams,
  options?: Omit<MCPExecuteOptions, 'mode'>
): MCPTaskResult {
  return photoWallTool.execute(params as unknown as Record<string, unknown>, {
    ...options,
    mode: 'queue',
  }) as unknown as MCPTaskResult;
}
