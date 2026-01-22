/**
 * MinimizedToolsBar Component
 *
 * 显示最小化的工具图标和常驻工具图标
 * 位于左侧工具栏底部，工具箱按钮下方
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Dropdown, DropdownOption } from 'tdesign-react';
import { ToolButton } from '../../tool-button';
import { toolWindowService } from '../../../services/tool-window-service';
import { toolboxService } from '../../../services/toolbox-service';
import { ToolWindowState } from '../../../types/toolbox.types';
import { useI18n } from '../../../i18n';
import classNames from 'classnames';
import './minimized-tools-bar.scss';

/**
 * 渲染图标组件，支持字符串和 React 组件
 */
const renderIcon = (icon: any, size = 20): React.ReactNode => {
  if (!icon) return <span style={{ fontSize: size }}>🔧</span>;
  if (typeof icon === 'function') {
    const IconComponent = icon;
    return <IconComponent size={size} />;
  }
  if (typeof icon === 'string') {
    return <span style={{ fontSize: size }}>{icon}</span>;
  }
  return icon;
};

/**
 * 最小化工具栏组件
 */
export const MinimizedToolsBar: React.FC = () => {
  const [toolbarTools, setToolbarTools] = useState<ToolWindowState[]>([]);
  const [contextMenuOpenId, setContextMenuOpenId] = useState<string | null>(null);
  const { language } = useI18n();

  useEffect(() => {
    const subscription = toolWindowService.observeToolStates().subscribe(() => {
      // 获取需要在工具栏显示的工具
      setToolbarTools(toolWindowService.getToolbarTools());
    });

    // 初始化
    setToolbarTools(toolWindowService.getToolbarTools());

    return () => subscription.unsubscribe();
  }, []);

  /**
   * 处理工具图标点击
   */
  const handleToolClick = useCallback((toolId: string) => {
    const state = toolWindowService.getToolState(toolId);
    console.log('[MinimizedToolsBar] handleToolClick', { toolId, currentStatus: state?.status });
    
    // 如果是 closed 状态（常驻工具刷新后），需要从 toolboxService 获取完整的工具定义
    if (state?.status === 'closed') {
      const fullTool = toolboxService.getToolById(toolId);
      if (fullTool) {
        toolWindowService.openTool(fullTool);
      } else {
        console.warn('[MinimizedToolsBar] Tool not found:', toolId);
      }
    } else {
      toolWindowService.toggleToolVisibility(toolId);
    }
  }, []);

  /**
   * 处理右键菜单操作
   */
  const handleContextMenuAction = useCallback((
    toolId: string,
    action: 'toggle-pin' | 'close'
  ) => {
    switch (action) {
      case 'toggle-pin':
        const isPinned = toolWindowService.isPinned(toolId);
        toolWindowService.setPinned(toolId, !isPinned);
        break;
      case 'close':
        toolWindowService.closeTool(toolId);
        break;
    }
  }, []);

  /**
   * 生成右键菜单选项
   */
  const getContextMenuOptions = useCallback((state: ToolWindowState): DropdownOption[] => {
    const isPinned = state.isPinned;
    const options: DropdownOption[] = [
      {
        content: isPinned 
          ? (language === 'zh' ? '取消常驻' : 'Unpin from toolbar')
          : (language === 'zh' ? '常驻工具栏' : 'Pin to toolbar'),
        value: 'toggle-pin',
      },
    ];

    // 只有非常驻工具或已最小化的工具才显示关闭选项
    if (!isPinned || state.status === 'minimized') {
      options.push({
        content: language === 'zh' ? '关闭' : 'Close',
        value: 'close',
        theme: 'error' as const,
      });
    }

    return options;
  }, [language]);

  if (toolbarTools.length === 0) {
    return null;
  }

  return (
    <div className="minimized-tools-bar">
      {toolbarTools.map(state => {
        const { tool } = state;
        // 尝试从 toolboxService 获取完整的工具定义（包括 icon）
        const fullTool = toolboxService.getToolById(tool.id) || tool;
        
        return (
          <Dropdown
            key={tool.id}
            options={getContextMenuOptions(state)}
            trigger="context-menu"
            popupProps={{
              onVisibleChange: (visible) => {
                setContextMenuOpenId(visible ? tool.id : null);
              }
            }}
            onClick={(data) => {
              handleContextMenuAction(tool.id, data.value as 'toggle-pin' | 'close');
            }}
          >
            <div 
              className="minimized-tools-bar__item"
              onClick={(e) => {
                // 只响应左键
                if (e.button === 0) {
                  e.stopPropagation();
                  handleToolClick(fullTool.id);
                }
              }}
            >
              <ToolButton
                type="icon"
                visible={true}
                selected={state.status === 'open'}
                icon={renderIcon(fullTool.icon)}
                title={contextMenuOpenId === tool.id ? undefined : fullTool.name}
                aria-label={fullTool.name}
                data-track="toolbar_click_minimized_tool"
                data-tool-id={fullTool.id}
              />
              {state.status !== 'closed' && (
                <div 
                  className={classNames('minimized-tools-bar__indicator', {
                    'minimized-tools-bar__indicator--active': state.status === 'open'
                  })} 
                />
              )}
            </div>
          </Dropdown>
        );
      })}
    </div>
  );
};

export default MinimizedToolsBar;
