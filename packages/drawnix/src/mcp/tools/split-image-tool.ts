/**
 * 图片拆分 MCP 工具
 *
 * 将一张图片拆分成多个独立图片并插入画板
 * 支持两种模式：
 * - grid：按指定的行列数均匀分割
 * - auto：智能检测白色分割线并拆分
 */

import type { MCPTool, MCPResult, MCPExecuteOptions } from '../types';
import { imageSplitService, SplitMode } from '../../services/image-split-service';
import type { LayoutStyle, GridConfig } from '../../types/photo-wall.types';
import { getCanvasBoard } from './canvas-insertion';

/**
 * 拆分工具参数
 */
export interface SplitImageToolParams {
  /** 图片 URL（支持 http/https/base64） */
  imageUrl: string;
  /** 拆分模式：grid（网格）/ auto（智能检测） */
  mode?: SplitMode;
  /** 网格行数（grid 模式使用） */
  rows?: number;
  /** 网格列数（grid 模式使用） */
  cols?: number;
  /** 布局风格 */
  layoutStyle?: LayoutStyle;
  /** 元素间距 */
  gap?: number;
}

/**
 * 验证图片 URL
 */
function isValidImageUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  return (
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('data:image/') ||
    url.startsWith('blob:')
  );
}

/**
 * 执行拆分
 */
async function executeSplit(
  params: SplitImageToolParams,
  _options: MCPExecuteOptions
): Promise<MCPResult> {
  const {
    imageUrl,
    mode = 'auto',
    rows = 3,
    cols = 3,
    layoutStyle = 'grid',
    gap = 20,
  } = params;

  // 验证参数
  if (!isValidImageUrl(imageUrl)) {
    return {
      success: false,
      error: '无效的图片 URL，支持 http/https/base64/blob 格式',
      type: 'error',
    };
  }

  // 获取画板
  const board = getCanvasBoard();
  if (!board) {
    return {
      success: false,
      error: '画板未初始化',
      type: 'error',
    };
  }

  // 验证网格参数
  const validRows = Math.min(Math.max(1, rows), 10);
  const validCols = Math.min(Math.max(1, cols), 10);

  const gridConfig: GridConfig | undefined =
    mode === 'grid' ? { rows: validRows, cols: validCols } : undefined;

  console.log('[SplitImageTool] Executing split with params:', {
    mode,
    gridConfig,
    layoutStyle,
    gap,
  });

  try {
    const result = await imageSplitService.splitAndInsert(board, imageUrl, {
      mode,
      gridConfig,
      layoutStyle,
      gap,
    });

    if (!result.success) {
      return {
        success: false,
        error: result.error || '拆分失败',
        type: 'error',
      };
    }

    const resultData: Record<string, unknown> = {
      count: result.count,
      mode,
      layoutStyle,
    };

    if (result.detectedGrid) {
      resultData.detectedGrid = result.detectedGrid;
    }

    return {
      success: true,
      data: resultData,
      type: 'text',
    };
  } catch (error: any) {
    console.error('[SplitImageTool] Execution failed:', error);
    return {
      success: false,
      error: error.message || '拆分执行失败',
      type: 'error',
    };
  }
}

/**
 * 图片拆分 MCP 工具定义
 */
export const splitImageTool: MCPTool = {
  name: 'split_image',
  description: `图片拆分工具。将一张包含多个元素的图片拆分成多个独立图片，并插入到画板中。

使用场景：
- 用户有一张九宫格/拼贴图，想要拆分成独立图片
- 用户想要将宫格图图片拆分后重新排列
- 用户有一张包含多个产品的图片，想要分开展示

支持两种拆分模式：
1. auto（智能检测）：自动检测图片中的白色/浅色分割线，适用于有明显分隔的拼贴图
2. grid（网格拆分）：按指定的行列数均匀分割，适用于已知网格结构的图片

布局风格：
- grid：整齐的网格排列
- scattered：随机散落效果
- circular：环形分布

不适用场景：
- 想要生成图片（使用 generate_image 工具）
- 想要生成宫格图（使用 generate_grid_image 工具）
- 图片没有分割线也不是规则网格结构`,

  inputSchema: {
    type: 'object',
    properties: {
      imageUrl: {
        type: 'string',
        description: '要拆分的图片 URL（支持 http/https/base64/blob 格式）',
      },
      mode: {
        type: 'string',
        description: '拆分模式：auto（智能检测分割线）或 grid（按固定网格分割）',
        enum: ['auto', 'grid'],
        default: 'auto',
      },
      rows: {
        type: 'number',
        description: '网格行数（1-10），仅 grid 模式有效',
        default: 3,
      },
      cols: {
        type: 'number',
        description: '网格列数（1-10），仅 grid 模式有效',
        default: 3,
      },
      layoutStyle: {
        type: 'string',
        description: '拆分后的布局风格',
        enum: ['grid', 'scattered', 'circular'],
        default: 'grid',
      },
      gap: {
        type: 'number',
        description: '元素之间的间距（像素）',
        default: 20,
      },
    },
    required: ['imageUrl'],
  },

  supportedModes: ['direct'],

  execute: async (
    params: Record<string, unknown>,
    options?: MCPExecuteOptions
  ): Promise<MCPResult> => {
    return executeSplit(params as unknown as SplitImageToolParams, options || {});
  },
};
