/**
 * BottomActionsSection Component
 *
 * 统一的底部工具区域,整合"打开项目"、"工具箱"和"任务队列"功能
 * 采用上下布局,视觉风格统一,使用标准的 ToolButton 组件
 */

import React from 'react';
import { Badge } from 'tdesign-react';
import { ToolButton } from '../tool-button';
import { useTaskQueue } from '../../hooks/useTaskQueue';
import { FeedbackButton } from '../feedback-button/feedback-button';
import { FolderIcon, ToolboxIcon, TaskIcon } from '../icons';
import './bottom-actions-section.scss';

export interface BottomActionsSectionProps {
  /** 项目抽屉是否打开 */
  projectDrawerOpen: boolean;
  /** 项目抽屉切换回调 */
  onProjectDrawerToggle: () => void;
  /** 工具箱抽屉是否打开 */
  toolboxDrawerOpen?: boolean;
  /** 工具箱抽屉切换回调 */
  onToolboxDrawerToggle?: () => void;
  /** 任务面板是否展开 */
  taskPanelExpanded: boolean;
  /** 任务面板切换回调 */
  onTaskPanelToggle: () => void;
}

export const BottomActionsSection: React.FC<BottomActionsSectionProps> = ({
  projectDrawerOpen,
  onProjectDrawerToggle,
  toolboxDrawerOpen = false,
  onToolboxDrawerToggle,
  taskPanelExpanded,
  onTaskPanelToggle,
}) => {
  const { activeTasks, completedTasks, failedTasks } = useTaskQueue();

  // 准备任务提示内容
  const totalTasks = activeTasks.length + completedTasks.length + failedTasks.length;
  const taskTooltip = totalTasks > 0
    ? `任务队列 (生成中: ${activeTasks.length}, 已完成: ${completedTasks.length}, 失败: ${failedTasks.length})`
    : '任务队列 (暂无任务)';

  return (
    <div className="bottom-actions-section">
      {/* 反馈按钮 */}
      <FeedbackButton />

      {/* 打开项目按钮 - 使用 ToolButton */}
      <ToolButton
        type="icon"
        icon={<FolderIcon />}
        aria-label={projectDrawerOpen ? '关闭项目' : '打开项目'}
        title={projectDrawerOpen ? '关闭项目' : '打开项目'}
        tooltipPlacement="right"
        selected={projectDrawerOpen}
        visible={true}
        data-track="toolbar_click_project_drawer"
        data-testid="toolbar-project"
        onPointerDown={(e) => {
          e.event.stopPropagation();
        }}
        onClick={onProjectDrawerToggle}
      />

      {/* 工具箱按钮 */}
      {onToolboxDrawerToggle && (
        <ToolButton
          type="icon"
          icon={<ToolboxIcon />}
          aria-label={toolboxDrawerOpen ? '关闭工具箱' : '打开工具箱'}
          title={toolboxDrawerOpen ? '关闭工具箱' : '打开工具箱'}
          tooltipPlacement="right"
          selected={toolboxDrawerOpen}
          visible={true}
          data-track="toolbar_click_toolbox"
          data-testid="toolbar-toolbox"
          onPointerDown={(e) => {
            e.event.stopPropagation();
          }}
          onClick={onToolboxDrawerToggle}
        />
      )}

      {/* 任务队列按钮 - 使用 ToolButton + Badge */}
      <div className="bottom-actions-section__task-wrapper">
        <Badge
          count={activeTasks.length > 0 ? activeTasks.length : 0}
          showZero={false}
          offset={[6, -6]}
        >
          <ToolButton
            type="icon"
            icon={<TaskIcon />}
            aria-label="任务队列"
            title={taskTooltip}
            tooltipPlacement="right"
            selected={taskPanelExpanded}
            visible={true}
            data-track="toolbar_click_tasks"
            data-testid="toolbar-tasks"
            onPointerDown={(e) => {
              e.event.stopPropagation();
            }}
            onClick={onTaskPanelToggle}
          />
        </Badge>

        {/* 状态指示点 */}
        {activeTasks.length > 0 && (
          <div className="bottom-actions-section__status bottom-actions-section__status--active" />
        )}
        {failedTasks.length > 0 && activeTasks.length === 0 && (
          <div className="bottom-actions-section__status bottom-actions-section__status--failed" />
        )}
      </div>
    </div>
  );
};
