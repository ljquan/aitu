/**
 * 图片拆分 MCP 工具
 *
 * 将一张图片拆分成多个独立图片并插入画板
 * 使用智能检测模式自动识别网格分割线或灵感图格式
 */

import type { MCPTool, MCPResult, MCPExecuteOptions } from '../types';
import { splitAndInsertImages } from '../../utils/image-splitter';
import { getCanvasBoard } from './canvas-insertion';

/**
 * 拆分工具参数
 */
export interface SplitImageToolParams {
  /** 图片 URL（支持 http/https/base64） */
  imageUrl: string;
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
  const { imageUrl } = params;

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

  console.log('[SplitImageTool] Executing split with smart detection');

  try {
    // 使用统一的 splitAndInsertImages 函数
    // 自动检测网格或灵感图格式、去除白边、清理子图白边并滚动到结果位置
    const result = await splitAndInsertImages(board, imageUrl, {
      scrollToResult: true,
    });

    if (!result.success) {
      return {
        success: false,
        error: result.error || '拆分失败',
        type: 'error',
      };
    }

    return {
      success: true,
      data: {
        count: result.count,
      },
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

功能特点：
- 自动检测图片中的白色/浅色分割线
- 支持检测灵感图格式（灰色背景 + 白边框图片）
- 自动去除图片四周白边
- 对每个拆分后的子图进行白边清理
- 拆分后自动滚动到结果位置

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
