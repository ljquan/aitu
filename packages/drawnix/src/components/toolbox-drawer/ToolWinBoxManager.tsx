/**
 * ToolWinBoxManager Component
 * 
 * 管理所有以 WinBox 弹窗形式打开的工具
 */

import React, { useEffect, useState, Suspense, lazy } from 'react';
import { WinBoxWindow } from '../winbox';
import { toolWindowService } from '../../services/tool-window-service';
import { ToolDefinition } from '../../types/toolbox.types';
import { useI18n } from '../../i18n';
import { InternalToolComponents } from './InternalToolComponents';

/**
 * 工具弹窗管理器组件
 */
export const ToolWinBoxManager: React.FC = () => {
  const [openTools, setOpenTools] = useState<ToolDefinition[]>([]);
  const { language } = useI18n();

  useEffect(() => {
    const subscription = toolWindowService.observeOpenTools().subscribe(tools => {
      setOpenTools(tools);
    });
    
    return () => subscription.unsubscribe();
  }, []);

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
