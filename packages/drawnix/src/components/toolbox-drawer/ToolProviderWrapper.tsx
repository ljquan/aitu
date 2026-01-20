import React from 'react';
import { I18nProvider } from '../../i18n';
import { AssetProvider } from '../../contexts/AssetContext';
import { WorkflowProvider } from '../../contexts/WorkflowContext';
import { RecentColorsProvider } from '../unified-color-picker';
import { ToolbarConfigProvider } from '../../hooks/use-toolbar-config';
import { DrawnixContext } from '../../hooks/use-drawnix';
import { PlaitBoard } from '@plait/core';

interface ToolProviderWrapperProps {
  children: React.ReactNode;
  board: PlaitBoard;
}

/**
 * 工具组件提供者包装器
 * 
 * 用于在独立渲染（如 createRoot）的工具组件中提供必要的上下文环境
 */
export const ToolProviderWrapper: React.FC<ToolProviderWrapperProps> = ({
  children,
  board,
}) => {
  // 从 board 实例中获取应用状态（由 Drawnix.tsx 同步到 board 上）
  const appState = (board as any).appState;
  
  // 模拟 setAppState，实际上内部组件通常不需要在画布内修改全局 appState
  // 如果需要修改，可能需要通过 board 扩展方法或事件
  const setAppState = () => {
    console.warn('setAppState is not supported in ToolProviderWrapper');
  };

  const contextValue = {
    appState,
    setAppState,
    board: board as any,
  };

  return (
    <I18nProvider>
      <RecentColorsProvider>
        <AssetProvider>
          <ToolbarConfigProvider>
            <WorkflowProvider>
              <DrawnixContext.Provider value={contextValue}>
                {children}
              </DrawnixContext.Provider>
            </WorkflowProvider>
          </ToolbarConfigProvider>
        </AssetProvider>
      </RecentColorsProvider>
    </I18nProvider>
  );
};
