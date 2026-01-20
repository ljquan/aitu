/**
 * ToolWinBoxManager Component
 * 
 * 管理所有以 WinBox 弹窗形式打开的工具
 */

import React, { useEffect, useState, Suspense, useCallback } from 'react';
import { PlaitBoard, getViewportOrigination } from '@plait/core';
import { WinBoxWindow } from '../winbox';
import { toolWindowService } from '../../services/tool-window-service';
import { ToolDefinition } from '../../types/toolbox.types';
import { useI18n } from '../../i18n';
import { InternalToolComponents } from './InternalToolComponents';
import { useDrawnix } from '../../hooks/use-drawnix';
import { ToolTransforms } from '../../plugins/with-tool';
import { DEFAULT_TOOL_CONFIG } from '../../constants/built-in-tools';

/**
 * 工具弹窗管理器组件
 */
export const ToolWinBoxManager: React.FC = () => {
  const [openTools, setOpenTools] = useState<ToolDefinition[]>([]);
  const { language } = useI18n();
  const { board } = useDrawnix();

  useEffect(() => {
    const subscription = toolWindowService.observeOpenTools().subscribe(tools => {
      setOpenTools(tools);
    });
    
    return () => subscription.unsubscribe();
  }, []);

  /**
   * 处理将工具插入到画布
   * @param tool 工具定义
   * @param rect 弹窗当前位置和尺寸（屏幕坐标）
   */
  const handleInsertToCanvas = useCallback((
    tool: ToolDefinition,
    rect: { x: number; y: number; width: number; height: number }
  ) => {
    if (!board) {
      console.warn('Board not ready');
      return;
    }

    // 先关闭弹窗
    toolWindowService.closeTool(tool.id);

    // 将屏幕坐标转换为画布坐标
    const boardContainerRect = PlaitBoard.getBoardContainer(board).getBoundingClientRect();
    const zoom = board.viewport.zoom;
    const origination = getViewportOrigination(board);

    // 弹窗位置相对于画布容器的偏移
    const screenX = rect.x - boardContainerRect.left;
    const screenY = rect.y - boardContainerRect.top;

    // 转换为画布坐标
    const canvasX = origination![0] + screenX / zoom;
    const canvasY = origination![1] + screenY / zoom;

    // 使用弹窗的尺寸
    const width = rect.width;
    const height = rect.height;

    // 插入到画布（使用与 ToolboxDrawer 相同的调用方式）
    if (tool.url || tool.component) {
      ToolTransforms.insertTool(
        board,
        tool.id,
        (tool as any).url, // url 可能为 undefined
        [canvasX, canvasY],
        { width, height },
        {
          name: tool.name,
          category: tool.category,
          permissions: tool.permissions,
          component: (tool as any).component,
        }
      );
    }
  }, [board]);

  if (openTools.length === 0) {
    return null;
  }

  return (
    <>
      {openTools.map(tool => {
        const InternalComponent = tool.component ? InternalToolComponents[tool.component] : null;
        
        return (
          <WinBoxWindow
            key={tool.id}
            id={`tool-window-${tool.id}`}
            visible={true}
            title={tool.name}
            width={tool.defaultWidth || 800}
            height={tool.defaultHeight || 600}
            onClose={() => toolWindowService.closeTool(tool.id)}
            onInsertToCanvas={(rect) => handleInsertToCanvas(tool, rect)}
            className="winbox-ai-generation winbox-tool-window"
            background="#ffffff"
          >
            <div className="tool-window-content" style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
              {InternalComponent ? (
                <Suspense fallback={
                  <div style={{ 
                    padding: 20, 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    height: '100%',
                    color: '#666'
                  }}>
                    {language === 'zh' ? '加载中...' : 'Loading...'}
                  </div>
                }>
                  <InternalComponent />
                </Suspense>
              ) : tool.url ? (
                <iframe
                  src={tool.url}
                  title={tool.name}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                  sandbox={tool.permissions?.join(' ') || 'allow-scripts allow-same-origin'}
                />
              ) : (
                <div style={{ padding: 20, textAlign: 'center', color: '#999' }}>
                  {language === 'zh' ? '未定义的工具内容' : 'Undefined tool content'}
                </div>
              )}
            </div>
          </WinBoxWindow>
        );
      })}
    </>
  );
};

export default ToolWinBoxManager;
