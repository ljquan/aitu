/**
 * BottomActionsSection Component
 *
 * 统一的底部工具区域,整合"打开项目"、"工具箱"、"更多工具"和"任务队列"功能
 * 采用上下布局,视觉风格统一,使用标准的 ToolButton 组件
 */

import React from 'react';
import { Badge } from 'tdesign-react';
import { ToolButton } from '../tool-button';
import { useTaskQueue } from '../../hooks/useTaskQueue';
import { FeedbackButton } from '../feedback-button';
import { MoreToolsButton } from './more-tools-button';
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

// 自定义文件夹图标
const FolderIcon: React.FC = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M3 7.5C3 6.67157 3.67157 6 4.5 6H9.87868C10.2765 6 10.658 6.15804 10.9393 6.43934L12.5607 8.06066C12.842 8.34196 13.2235 8.5 13.6213 8.5H19.5C20.3284 8.5 21 9.17157 21 10V17.5C21 18.3284 20.3284 19 19.5 19H4.5C3.67157 19 3 18.3284 3 17.5V7.5Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
);

// 工具箱图标
const ToolboxIcon: React.FC = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M3 5a2 2 0 012-2h10a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V5z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M3 8h14M8 3v14"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// 任务图标 + 文字
const TaskIcon: React.FC = () => (
  <div className="task-icon-with-label">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M9 5H7C5.89543 5 5 5.89543 5 7V19C5 20.1046 5.89543 21 7 21H17C18.1046 21 19 20.1046 19 19V7C19 5.89543 18.1046 5 17 5H15M9 5C9 6.10457 9.89543 7 11 7H13C14.1046 7 15 6.10457 15 5M9 5C9 3.89543 9.89543 3 11 3H13C14.1046 3 15 3.89543 15 5M12 12H15M12 16H15M9 12H9.01M9 16H9.01"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
    <span className="task-icon-label">任务</span>
  </div>
);

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
      {/* 更多工具按钮 */}
      <MoreToolsButton embedded={true} />

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
