/**
 * WorkZone 内容组件
 *
 * 在画布上显示工作流进度的 React 组件
 * 这是 WorkflowMessageBubble 的简化版本，适合在画布元素中使用
 */

import React, { useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import type { WorkflowMessageData } from '../../types/chat.types';
import './workzone-content.scss';

// 状态图标映射
type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

const STATUS_ICONS: Record<StepStatus, string> = {
  pending: '○',
  running: '◉',
  completed: '✓',
  failed: '✗',
  skipped: '⊘',
};

interface WorkZoneContentProps {
  workflow: WorkflowMessageData;
  className?: string;
  onDelete?: () => void;
}

export const WorkZoneContent: React.FC<WorkZoneContentProps> = ({
  workflow,
  className = '',
  onDelete,
}) => {
  // 计算工作流状态
  const workflowStatus = useMemo(() => {
    const steps = workflow.steps;
    const totalSteps = steps.length;
    const completedSteps = steps.filter(s => s.status === 'completed').length;
    const failedSteps = steps.filter(s => s.status === 'failed').length;
    const runningSteps = steps.filter(s => s.status === 'running').length;

    let status: 'pending' | 'running' | 'completed' | 'failed' = 'pending';
    if (failedSteps > 0) {
      status = 'failed';
    } else if (completedSteps === totalSteps && totalSteps > 0) {
      status = 'completed';
    } else if (runningSteps > 0 || completedSteps > 0) {
      status = 'running';
    }

    return { status, totalSteps, completedSteps };
  }, [workflow.steps]);

  // 计算进度百分比
  const progress = workflowStatus.totalSteps > 0
    ? (workflowStatus.completedSteps / workflowStatus.totalSteps) * 100
    : 0;

  // 状态标签
  const statusLabel = useMemo(() => {
    const labels: Record<typeof workflowStatus.status, string> = {
      pending: '待开始',
      running: '执行中',
      completed: '已完成',
      failed: '执行失败',
    };
    return labels[workflowStatus.status];
  }, [workflowStatus.status]);

  // 获取当前执行步骤
  const currentStep = useMemo(() => {
    return workflow.steps.find(s => s.status === 'running');
  }, [workflow.steps]);

  // 类型图标
  const typeIcon = workflow.generationType === 'image' ? '🖼️'
    : workflow.generationType === 'video' ? '🎬'
    : '📝';

  return (
    <div className={`workzone-content workzone-content--${workflowStatus.status} ${className}`}>
      {/* 头部 */}
      <div className="workzone-content__header">
        <span className="workzone-content__icon">{typeIcon}</span>
        <span className="workzone-content__title">{workflow.name}</span>
        <span className={`workzone-content__status workzone-content__status--${workflowStatus.status}`}>
          {statusLabel}
        </span>
        {/* 删除按钮 - 始终显示（如果有 onDelete 回调） */}
        {onDelete && (
          <button
            className="workzone-content__delete-btn"
            onPointerDown={(e) => {
              // 必须在 pointerdown 阶段阻止事件冒泡，否则 Plait 会拦截
              console.log('[WorkZoneContent] Delete button pointerdown - stopping propagation');
              e.stopPropagation();
              e.preventDefault();
            }}
            onPointerUp={(e) => {
              console.log('[WorkZoneContent] Delete button pointerup - triggering delete');
              e.stopPropagation();
              e.preventDefault();
              onDelete();
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            title="删除"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* 进度条 */}
      <div className="workzone-content__progress">
        <div
          className={`workzone-content__progress-bar workzone-content__progress-bar--${workflowStatus.status}`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* 进度文本 */}
      <div className="workzone-content__progress-info">
        <span>{workflowStatus.completedSteps}/{workflowStatus.totalSteps} 步骤</span>
        {currentStep && (
          <span className="workzone-content__current-step">
            {currentStep.description}
          </span>
        )}
      </div>

      {/* 步骤列表（简化版） */}
      <div className="workzone-content__steps">
        {workflow.steps.map((step, index) => (
          <div
            key={step.id}
            className={`workzone-content__step workzone-content__step--${step.status}`}
          >
            <span className="workzone-content__step-status">
              {step.status === 'running' ? (
                <span className="workzone-content__spinner" />
              ) : (
                STATUS_ICONS[step.status]
              )}
            </span>
            <span className="workzone-content__step-desc">
              {step.description}
            </span>
          </div>
        ))}
      </div>

      {/* 失败提示 */}
      {workflowStatus.status === 'failed' && (
        <div className="workzone-content__error">
          ❌ 执行失败
        </div>
      )}

      {/* 完成提示 */}
      {workflowStatus.status === 'completed' && (
        <div className="workzone-content__success">
          ✨ 已完成
        </div>
      )}
    </div>
  );
};

export default WorkZoneContent;
