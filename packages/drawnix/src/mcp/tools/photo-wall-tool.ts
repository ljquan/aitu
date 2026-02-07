/**
 * 宫格图 MCP 工具
 *
 * 一键生成宫格图：创建图片生成任务 → 任务完成后 Canvas 分割 → 布局计算 → 批量插入画板
 * 复用 generate_image 工具的任务队列能力
 */

import type { MCPTool, MCPResult, MCPExecuteOptions, MCPTaskResult } from '../types';
import type { LayoutStyle, GridConfig } from '../../types/photo-wall.types';
import { LAYOUT_STYLES, GRID_IMAGE_DEFAULTS, GRID_IMAGE_PROMPT_TEMPLATE } from '../../types/photo-wall.types';
import { taskQueueService } from '../../services/task-queue';
import { TaskType } from '../../types/task.types';
import { getCurrentImageModel } from './image-generation';

/**
 * 宫格图工具参数
 */
export interface GridImageToolParams {
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
  /** 参考图片 URL 列表 */
  referenceImages?: string[];
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
 * 构建宫格图生图提示词
 */
function buildGridImagePrompt(theme: string, gridConfig: GridConfig): string {
  const template = GRID_IMAGE_PROMPT_TEMPLATE.zh;
  return template(theme, gridConfig.rows, gridConfig.cols);
}

/**
 * 创建宫格图任务（queue 模式）
 * 复用图片生成的任务队列，添加宫格图特有参数
 */
function executeQueue(params: GridImageToolParams, options: MCPExecuteOptions): MCPTaskResult {
  const {
    theme,
    rows = GRID_IMAGE_DEFAULTS.gridConfig.rows,
    cols = GRID_IMAGE_DEFAULTS.gridConfig.cols,
    layoutStyle = GRID_IMAGE_DEFAULTS.layoutStyle,
    imageSize = GRID_IMAGE_DEFAULTS.imageSize,
    imageQuality = GRID_IMAGE_DEFAULTS.imageQuality,
    referenceImages,
    model,
  } = params;

  // 获取实际使用的模型
  const actualModel = model || getCurrentImageModel();

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
  const prompt = buildGridImagePrompt(theme, gridConfig);

  // 将参考图片转换为 uploadedImages 格式
  const uploadedImages = referenceImages?.map((url, index) => ({
    type: 'url' as const,
    url,
    name: `reference-${index + 1}`,
  }));

  // console.log('[GridImageTool] Creating grid image task with params:', {
  //   theme,
  //   gridConfig,
  //   layoutStyle,
  //   imageSize,
  //   imageQuality,
  //   referenceImages: referenceImages?.length || 0,
  // });

  try {
    let task;

    // 如果是重试，复用原有任务
    if (options.retryTaskId) {
      // console.log('[GridImageTool] Retrying existing task:', options.retryTaskId);
      taskQueueService.retryTask(options.retryTaskId);
      task = taskQueueService.getTask(options.retryTaskId);
      if (!task) {
        throw new Error(`重试任务不存在: ${options.retryTaskId}`);
      }
    } else {
      // 创建宫格图任务（使用 IMAGE 类型复用图片生成能力）
      // 任务完成后由 useAutoInsertToCanvas 使用 splitAndInsertImages 处理分割和布局
      task = taskQueueService.createTask(
        {
          prompt,
          size: imageSize,
          model: actualModel,
          // 参考图片
          uploadedImages: uploadedImages && uploadedImages.length > 0 ? uploadedImages : undefined,
          // 宫格图特有参数，用于任务完成后的处理
          gridImageRows: validRows,
          gridImageCols: validCols,
          gridImageLayoutStyle: layoutStyle as 'scattered' | 'grid' | 'circular',
          // 保存原始主题，用于显示
          originalTheme: theme,
          // 批量参数
          batchId: options.batchId,
          globalIndex: options.globalIndex || 1,
          // 自动插入画布
          autoInsertToCanvas: true,
        },
        TaskType.IMAGE
      );
    }

    // console.log('[GridImageTool] Created/retried grid image task:', task.id);

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
    console.error('[GridImageTool] Failed to create task:', error);

    return {
      success: false,
      error: error.message || '创建宫格图任务失败',
      type: 'error',
    };
  }
}

/**
 * 宫格图 MCP 工具定义
 */
export const gridImageTool: MCPTool = {
  name: 'generate_grid_image',
  description: `宫格图生成工具。根据主题描述生成一组相关图片，并按照指定布局风格排列在画板上，形成宫格图效果。

使用场景：
- 用户想要创建宫格图、图片墙、产品展示墙
- 用户想要生成一组主题相关的图片并排列展示
- 用户想要创建拼贴画、图片集合、表情包

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
        description: '宫格图主题描述，如"孟菲斯风格餐具"、"可爱猫咪表情包"、"复古相机收藏"等',
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
      referenceImages: {
        type: 'array',
        description: '参考图片 URL 列表，用于风格参考',
        items: {
          type: 'string',
        },
      },
      model: {
        type: 'string',
        description: '图片生成模型名称（可选，默认使用当前设置的模型）',
      },
    },
    required: ['theme'],
  },

  supportedModes: ['queue'],

  promptGuidance: {
    whenToUse: '当用户想要生成多个相关主题的图片并以宫格图/拼贴画形式展示时使用。关键词：宫格图、九宫格、图片墙、表情包、产品展示、拼贴画、系列图片。',

    parameterGuidance: {
      theme: '主题描述应该具体且有多样性潜力。好的主题：描述一类事物的多种变体（如"不同品种的可爱猫咪"、"各种颜色的马卡龙"）。避免：过于具体的单一描述（如"一只橘猫"）。',
      rows: '根据内容数量决定：表情包通常3x3或4x4，产品展示2x3或3x4，大型展示4x4或5x5。',
      cols: '建议与rows相同创建正方形网格，或cols略大于rows创建横向布局。',
      layoutStyle: 'scattered（散落）适合艺术感展示；grid（网格）适合产品目录；circular（环形）适合突出中心主题。',
    },

    bestPractices: [
      '主题应强调多样性，如"各种姿态的猫咪"而非"一只猫"',
      '描述具体的视觉风格，如"扁平插画风格"、"3D渲染"、"水彩画风"',
      '对于表情包，明确情绪类型如"开心、惊讶、生气、困惑等表情"',
      '对于产品展示，说明产品类别和风格如"北欧简约风格家具"',
    ],

    examples: [
      {
        input: '生成一个猫咪表情包',
        args: { theme: '可爱猫咪表情包，包含开心、惊讶、生气、困惑、得意、卖萌等各种有趣表情，卡通风格', rows: 4, cols: 4, layoutStyle: 'grid' },
        explanation: '表情包适合用网格布局，主题描述了多种表情变体',
      },
      {
        input: '做一个孟菲斯风格的餐具宫格图',
        args: { theme: '孟菲斯风格餐具，包含碗、盘、杯、勺等不同类型，色彩鲜艳，几何图案装饰，白色背景', rows: 3, cols: 3, layoutStyle: 'scattered' },
        explanation: '散落布局增加艺术感，主题明确了风格和物品多样性',
      },
      {
        input: '创建花卉插画集',
        args: { theme: '水彩风格花卉插画，包含玫瑰、向日葵、郁金香、樱花、薰衣草等不同种类的花朵，柔和色彩', rows: 4, cols: 4, layoutStyle: 'scattered' },
        explanation: '4x4网格提供更多展示空间，主题列举了多种花卉种类',
      },
      {
        input: '做个美食九宫格',
        args: { theme: '精致甜点美食摄影，包含蛋糕、马卡龙、泡芙、冰淇淋等各式甜品，俯视角度，浅色背景', rows: 3, cols: 3, layoutStyle: 'grid' },
        explanation: '美食九宫格用网格布局更整齐，俯视角度适合食物展示',
      },
    ],

    warnings: [
      '避免主题过于抽象（如"美丽的东西"），应该具体到某类事物',
      'rows 和 cols 的乘积即生成图片数量，过大（如5x5=25张）会增加处理时间',
      '生成后系统会自动拆分图片，请确保主题适合被分割成独立元素',
    ],
  },

  execute: async (params: Record<string, unknown>, options?: MCPExecuteOptions): Promise<MCPResult> => {
    // 宫格图只支持 queue 模式，因为需要任务完成后的后处理
    // taskQueueService 会根据 SW 可用性自动选择正确的服务
    return executeQueue(params as unknown as GridImageToolParams, options || {});
  },
};


/**
 * 便捷方法：创建宫格图任务
 */
export function createGridImageTask(
  params: GridImageToolParams,
  options?: Omit<MCPExecuteOptions, 'mode'>
): MCPTaskResult {
  return gridImageTool.execute(params as unknown as Record<string, unknown>, {
    ...options,
    mode: 'queue',
  }) as unknown as MCPTaskResult;
}

