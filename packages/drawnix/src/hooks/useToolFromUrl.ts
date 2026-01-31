/**
 * useToolFromUrl Hook
 *
 * 处理 URL 参数中的 tool 参数
 * 当访问页面带有 ?tool=xxx 时，自动以 WinBox 全屏形式打开指定工具并设为常驻
 */

import { useEffect, useRef } from 'react';
import { toolboxService } from '../services/toolbox-service';
import { toolWindowService } from '../services/tool-window-service';

/**
 * 从 URL 参数中解析并打开工具
 *
 * @example
 * // 访问 https://opentu.ai/?tool=ai-image
 * // 会自动全屏打开 AI 图片生成工具并设为常驻
 *
 * useToolFromUrl();
 */
export function useToolFromUrl(): void {
  // 使用 ref 确保只执行一次
  const hasProcessedRef = useRef(false);

  useEffect(() => {
    // 防止重复执行
    if (hasProcessedRef.current) {
      return;
    }

    const processToolParam = async () => {
      try {
        // 获取 URL 参数
        const urlParams = new URLSearchParams(window.location.search);
        const toolId = urlParams.get('tool');

        if (!toolId) {
          return;
        }

        // 标记为已处理
        hasProcessedRef.current = true;

        // 等待 toolboxService 初始化完成
        // toolboxService 构造函数中会调用 initialize，这是一个异步操作
        // 需要等待自定义工具加载完成
        await new Promise(resolve => setTimeout(resolve, 100));

        // 根据工具 ID 获取工具定义
        const tool = toolboxService.getToolById(toolId);

        if (!tool) {
          console.warn(`[useToolFromUrl] Tool not found: ${toolId}`);
          return;
        }

        // 以 WinBox 全屏形式打开工具，并设为常驻
        toolWindowService.openTool(tool, {
          autoMaximize: true,
          autoPin: true,
        });

        // 清理 URL 参数（可选，避免刷新时重复打开）
        // 使用 replaceState 而非 pushState，不增加历史记录
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('tool');
        window.history.replaceState({}, '', newUrl.toString());

      } catch (error) {
        console.error('[useToolFromUrl] Failed to open tool from URL:', error);
      }
    };

    processToolParam();
  }, []);
}

export default useToolFromUrl;
