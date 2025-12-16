/**
 * ToolboxDrawer Component
 *
 * 工具箱侧边栏 - 展示可用工具列表
 * 用户点击工具项后，将工具插入到画布中心
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Button, Input, DialogPlugin, MessagePlugin } from 'tdesign-react';
import { CloseIcon, SearchIcon, AddIcon } from 'tdesign-icons-react';
import { PlaitBoard, getViewportOrigination } from '@plait/core';
import { useDrawnix } from '../../hooks/use-drawnix';
import { ToolTransforms } from '../../plugins/with-tool';
import { toolboxService } from '../../services/toolbox-service';
import { ToolDefinition } from '../../types/toolbox.types';
import { DEFAULT_TOOL_CONFIG, TOOL_CATEGORY_LABELS } from '../../constants/built-in-tools';
import { ToolList } from './ToolList';
import { CustomToolDialog } from '../custom-tool-dialog/CustomToolDialog';
import './toolbox-drawer.scss';

export interface ToolboxDrawerProps {
  /** 是否打开抽屉 */
  isOpen: boolean;
  /** 抽屉打开状态变化回调 */
  onOpenChange: (open: boolean) => void;
}

/**
 * 工具箱抽屉组件
 */
export const ToolboxDrawer: React.FC<ToolboxDrawerProps> = ({
  isOpen,
  onOpenChange,
}) => {
  const { board } = useDrawnix();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [customToolDialogVisible, setCustomToolDialogVisible] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  /**
   * 关闭抽屉
   */
  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  /**
   * 处理工具点击 - 插入到画布中心
   */
  const handleToolClick = useCallback(
    (tool: ToolDefinition) => {
      if (!board) {
        console.warn('Board not ready');
        return;
      }

      // 计算画布中心位置
      // 使用 Plait 的 getViewportOrigination 获取视口原点
      const boardContainerRect =
        PlaitBoard.getBoardContainer(board).getBoundingClientRect();
      const focusPoint = [
        boardContainerRect.width / 2,
        boardContainerRect.height / 2,
      ];
      const zoom = board.viewport.zoom;
      const origination = getViewportOrigination(board);
      const centerX = origination![0] + focusPoint[0] / zoom;
      const centerY = origination![1] + focusPoint[1] / zoom;

      // 工具尺寸
      const width = tool.defaultWidth || DEFAULT_TOOL_CONFIG.defaultWidth;
      const height = tool.defaultHeight || DEFAULT_TOOL_CONFIG.defaultHeight;

      // 插入到画布（中心对齐）
      ToolTransforms.insertTool(
        board,
        tool.id,
        tool.url,
        [centerX - width / 2, centerY - height / 2],
        { width, height },
        {
          name: tool.name,
          category: tool.category,
          permissions: tool.permissions,
        }
      );

      console.log(`Tool "${tool.name}" inserted to canvas`);

      // 插入后关闭抽屉
      handleClose();
    },
    [board, handleClose]
  );

  /**
   * 获取所有工具（搜索 + 分类过滤）
   */
  const filteredTools = useMemo(() => {
    let tools = toolboxService.getAvailableTools();

    // 搜索过滤
    if (searchQuery.trim()) {
      tools = toolboxService.searchTools(searchQuery);
    }

    // 分类过滤
    if (selectedCategory) {
      tools = tools.filter((tool) => tool.category === selectedCategory);
    }

    return tools;
  }, [searchQuery, selectedCategory, refreshKey]);

  /**
   * 按分类分组
   */
  const toolsByCategory = useMemo(() => {
    const categorized = toolboxService.getToolsByCategory();

    // 如果有搜索或分类过滤，使用过滤后的结果
    if (searchQuery || selectedCategory) {
      const result: Record<string, ToolDefinition[]> = {};
      filteredTools.forEach((tool) => {
        const category = tool.category || 'utilities';
        if (!result[category]) {
          result[category] = [];
        }
        result[category].push(tool);
      });
      return result;
    }

    return categorized;
  }, [filteredTools, searchQuery, selectedCategory]);

  /**
   * 获取分类列表
   */
  const categories = useMemo(() => {
    return Object.keys(toolsByCategory);
  }, [toolsByCategory]);

  /**
   * 处理添加自定义工具按钮点击
   */
  const handleAddCustomTool = useCallback(() => {
    setCustomToolDialogVisible(true);
  }, []);

  /**
   * 处理删除工具
   */
  const handleDeleteTool = useCallback(async (tool: ToolDefinition) => {
    // 使用 TDesign 的确认对话框
    const confirmDialog = DialogPlugin.confirm({
      header: '确认删除',
      body: `确定要删除工具 "${tool.name}" 吗？此操作不可撤销。`,
      onConfirm: async () => {
        try {
          const removed = await toolboxService.removeCustomTool(tool.id);
          if (removed) {
            MessagePlugin.success('工具已删除');
            // 触发列表刷新
            setRefreshKey((prev) => prev + 1);
          } else {
            MessagePlugin.warning('工具不存在或删除失败');
          }
        } catch (error) {
          console.error('Failed to delete tool:', error);
          MessagePlugin.error('删除工具失败，请重试');
        }
        confirmDialog.destroy();
      },
      onClose: () => {
        confirmDialog.destroy();
      },
    });
  }, []);

  /**
   * 处理添加成功
   */
  const handleCustomToolSaved = useCallback(() => {
    // 触发列表刷新
    setRefreshKey((prev) => prev + 1);
    // 清空搜索和分类过滤，显示所有工具
    setSearchQuery('');
    setSelectedCategory(null);
  }, []);

  /**
   * 处理对话框关闭
   */
  const handleDialogClose = useCallback(() => {
    setCustomToolDialogVisible(false);
  }, []);

  return (
    <div className={`toolbox-drawer ${isOpen ? 'toolbox-drawer--open' : ''}`}>
      {/* Header */}
      <div className="toolbox-drawer__header">
        <div className="toolbox-drawer__header-left">
          <h3 className="toolbox-drawer__title">工具箱</h3>
          <span className="toolbox-drawer__count">
            {filteredTools.length} 个工具
          </span>
        </div>
        <div className="toolbox-drawer__header-right">
          <Button
            variant="outline"
            size="small"
            icon={<AddIcon />}
            onClick={handleAddCustomTool}
            title="添加自定义工具"
            data-track="toolbox_click_add_custom_tool"
          >
            添加工具
          </Button>
          <Button
            variant="text"
            size="small"
            icon={<CloseIcon />}
            onClick={handleClose}
            title="关闭"
          />
        </div>
      </div>

      {/* Search */}
      <div className="toolbox-drawer__search">
        <Input
          placeholder="搜索工具..."
          value={searchQuery}
          onChange={setSearchQuery}
          prefixIcon={<SearchIcon />}
          size="small"
          clearable
        />
      </div>

      {/* Category Filter */}
      <div className="toolbox-drawer__categories">
        <Button
          variant={selectedCategory === null ? 'base' : 'outline'}
          size="small"
          onClick={() => setSelectedCategory(null)}
        >
          全部
        </Button>
        {categories.map((category) => (
          <Button
            key={category}
            variant={selectedCategory === category ? 'base' : 'outline'}
            size="small"
            onClick={() => setSelectedCategory(category)}
          >
            {TOOL_CATEGORY_LABELS[category] || category}
          </Button>
        ))}
      </div>

      {/* Content */}
      <div className="toolbox-drawer__content">
        {filteredTools.length === 0 ? (
          <div className="toolbox-drawer__empty">
            <p>未找到匹配的工具</p>
          </div>
        ) : (
          <ToolList
            toolsByCategory={toolsByCategory}
            onToolClick={handleToolClick}
            onToolDelete={handleDeleteTool}
          />
        )}
      </div>

      {/* Custom Tool Dialog */}
      <CustomToolDialog
        visible={customToolDialogVisible}
        onClose={handleDialogClose}
        onSuccess={handleCustomToolSaved}
      />
    </div>
  );
};
