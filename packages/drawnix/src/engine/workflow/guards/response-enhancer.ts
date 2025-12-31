/**
 * 响应增强器
 * 用于增强工具响应，添加上下文信息
 */

import type { MCPToolResult } from '../types/mcp.types';

export interface EnhancedResponse {
  original: MCPToolResult;
  enhanced: string;
  metadata: {
    toolId: string;
    timestamp: number;
    contextAdded: boolean;
  };
}

export class ResponseEnhancer {
  /**
   * 增强工具响应
   */
  enhance(toolId: string, result: MCPToolResult): EnhancedResponse {
    const content = this.extractContent(result);
    
    return {
      original: result,
      enhanced: content,
      metadata: {
        toolId,
        timestamp: Date.now(),
        contextAdded: false,
      },
    };
  }

  /**
   * 从 MCPToolResult 中提取内容
   */
  private extractContent(result: MCPToolResult): string {
    if (!result.content || result.content.length === 0) {
      return '';
    }

    return result.content
      .map((item) => {
        if (item.type === 'text') {
          return item.text;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  /**
   * 格式化响应用于显示
   */
  formatForDisplay(response: EnhancedResponse): string {
    return response.enhanced;
  }
}

export const responseEnhancer = new ResponseEnhancer();
