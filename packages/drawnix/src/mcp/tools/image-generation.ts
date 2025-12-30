/**
 * 图片生成 MCP 工具
 * 
 * 封装现有的图片生成服务，提供标准化的 MCP 工具接口
 */

import type { MCPTool, MCPResult } from '../types';
import { defaultGeminiClient } from '../../utils/gemini-api';

/**
 * 图片生成参数
 */
interface ImageGenerationParams {
  /** 图片描述提示词 */
  prompt: string;
  /** 图片尺寸，格式如 '1x1', '16x9', '9x16' */
  size?: string;
  /** 参考图片 URL 列表 */
  referenceImages?: string[];
  /** 图片质量 */
  quality?: '1k' | '2k' | '4k';
}

/**
 * 图片生成 MCP 工具定义
 */
export const imageGenerationTool: MCPTool = {
  name: 'generate_image',
  description: `生成图片工具。根据用户的文字描述生成图片。
  
使用场景：
- 用户想要创建、生成、绘制图片
- 用户描述了想要的图片内容
- 用户提供了参考图片并想要生成类似或修改后的图片

不适用场景：
- 用户想要生成视频（使用 generate_video 工具）
- 用户只是在聊天，没有生成图片的意图`,

  inputSchema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: '图片描述提示词，详细描述想要生成的图片内容、风格、构图等',
      },
      size: {
        type: 'string',
        description: '图片尺寸比例，可选值：1x1（正方形）、16x9（横向）、9x16（纵向）、3x2、2x3、4x3、3x4',
        enum: ['1x1', '16x9', '9x16', '3x2', '2x3', '4x3', '3x4', '4x5', '5x4'],
        default: '1x1',
      },
      referenceImages: {
        type: 'array',
        description: '参考图片 URL 列表，用于图生图或风格参考',
        items: {
          type: 'string',
        },
      },
      quality: {
        type: 'string',
        description: '图片质量，可选值：1k、2k、4k',
        enum: ['1k', '2k', '4k'],
        default: '1k',
      },
    },
    required: ['prompt'],
  },

  execute: async (params: Record<string, unknown>): Promise<MCPResult> => {
    const { prompt, size, referenceImages, quality } = params as ImageGenerationParams;

    if (!prompt || typeof prompt !== 'string') {
      return {
        success: false,
        error: '缺少必填参数 prompt',
        type: 'error',
      };
    }

    try {
      console.log('[ImageGenerationTool] Generating image with params:', {
        prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
        size,
        referenceImages: referenceImages?.length || 0,
        quality,
      });

      // 调用 Gemini 图片生成 API
      const result = await defaultGeminiClient.generateImage(prompt, {
        size: size || '1x1',
        image: referenceImages && referenceImages.length > 0 ? referenceImages : undefined,
        response_format: 'url',
        quality: quality || '1k',
      });

      console.log('[ImageGenerationTool] Generation response:', result);

      // 解析响应
      if (result.data && Array.isArray(result.data) && result.data.length > 0) {
        const imageData = result.data[0];
        let imageUrl: string;

        if (imageData.url) {
          imageUrl = imageData.url;
        } else if (imageData.b64_json) {
          imageUrl = `data:image/png;base64,${imageData.b64_json}`;
        } else {
          return {
            success: false,
            error: 'API 未返回有效的图片数据',
            type: 'error',
          };
        }

        return {
          success: true,
          data: {
            url: imageUrl,
            format: 'png',
            prompt,
            size: size || '1x1',
          },
          type: 'image',
        };
      }

      return {
        success: false,
        error: 'API 未返回有效的图片数据',
        type: 'error',
      };
    } catch (error: any) {
      console.error('[ImageGenerationTool] Generation failed:', error);
      
      // 提取更详细的错误信息
      let errorMessage = error.message || '图片生成失败';
      if (error.apiErrorBody) {
        errorMessage = `${errorMessage} - ${JSON.stringify(error.apiErrorBody)}`;
      }

      return {
        success: false,
        error: errorMessage,
        type: 'error',
      };
    }
  },
};
