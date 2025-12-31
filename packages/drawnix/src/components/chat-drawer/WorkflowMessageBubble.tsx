/**
 * 工作流消息气泡组件
 * 
 * 在对话消息中展示工作流执行过程
 */

import React, { useState, useMemo } from 'react';
import type { WorkflowMessageData } from '../../types/chat.types';
import './workflow-message-bubble.scss';

// ============ 状态图标映射 ============

type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

const STATUS_ICONS: Record<StepStatus, string> = {
  pending: '○',
  running: '◉',
  completed: '✓',
  failed: '✗',
  skipped: '⊘',
};

const STATUS_LABELS: Record<StepStatus, string> = {
  pending: '待执行',
  running: '执行中',
  completed: '已完成',
  failed: '失败',
  skipped: '已跳过',
};

// ============ 单个步骤项组件 ============

interface StepItemProps {
  step: WorkflowMessageData['steps'][0];
  index: number;
  isCurrentStep: boolean;
}

const StepItem: React.FC<StepItemProps> = ({
  step,
  index,
  isCurrentStep,
}) => {
  const [expanded, setExpanded] = useState(false);

  const statusIcon = STATUS_ICONS[step.status];
  const statusLabel = STATUS_LABELS[step.status];
  const hasDetails = step.result || step.error || step.duration !== undefined;

  return (
    <div
      className={`workflow-bubble-step workflow-bubble-step--${step.status} ${isCurrentStep ? 'workflow-bubble-step--current' : ''}`}
    >
      <div 
        className="workflow-bubble-step__main" 
        onClick={() => hasDetails && setExpanded(!expanded)}
        style={{ cursor: hasDetails ? 'pointer' : 'default' }}
      >
        <div className="workflow-bubble-step__index">{index + 1}</div>
        <div className={`workflow-bubble-step__status workflow-bubble-step__status--${step.status}`}>
          {step.status === 'running' ? (
            <span className="workflow-bubble-step__spinner" />
          ) : (
            statusIcon
          )}
        </div>
        <div className="workflow-bubble-step__content">
          <div className="workflow-bubble-step__title">{step.description}</div>
          <div className="workflow-bubble-step__status-text">{statusLabel}</div>
        </div>
        {hasDetails && (
          <div className={`workflow-bubble-step__expand ${expanded ? 'workflow-bubble-step__expand--open' : ''}`}>
            ▼
          </div>
        )}
      </div>

      {expanded && hasDetails && (
        <div className="workflow-bubble-step__details">
          {/* 工具名称 */}
          <div className="workflow-bubble-step__detail-row">
            <span className="workflow-bubble-step__label">工具:</span>
            <code className="workflow-bubble-step__tool">{step.mcp}</code>
          </div>

          {/* 执行时间 */}
          {step.duration !== undefined && (
            <div className="workflow-bubble-step__detail-row">
              <span className="workflow-bubble-step__label">耗时:</span>
              <span>{step.duration}ms</span>
            </div>
          )}

          {/* 执行结果 */}
          {step.result && (
            <div className="workflow-bubble-step__detail-row workflow-bubble-step__detail-row--block">
              <span className="workflow-bubble-step__label">执行结果:</span>
              <div className="workflow-bubble-step__result">
                {typeof step.result === 'string' 
                  ? step.result 
                  : JSON.stringify(step.result, null, 2)}
              </div>
            </div>
          )}

          {/* 错误信息 */}
          {step.error && (
            <div className="workflow-bubble-step__detail-row workflow-bubble-step__detail-row--block">
              <span className="workflow-bubble-step__label">错误信息:</span>
              <div className="workflow-bubble-step__error">{step.error}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============ 工作流消息气泡组件 ============

interface WorkflowMessageBubbleProps {
  workflow: WorkflowMessageData;
  className?: string;
}

export const WorkflowMessageBubble: React.FC<WorkflowMessageBubbleProps> = ({
  workflow,
  className = '',
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

  // 计算进度
  const progress = workflowStatus.totalSteps > 0 
    ? (workflowStatus.completedSteps / workflowStatus.totalSteps) * 100 
    : 0;

  // 状态标签
  const statusLabels: Record<typeof workflowStatus.status, string> = {
    pending: '待开始',
    running: '执行中',
    completed: '已完成',
    failed: '执行失败',
  };

  const isCompleted = workflowStatus.status === 'completed';
  const isFailed = workflowStatus.status === 'failed';
  const isRunning = workflowStatus.status === 'running';

  // 获取当前执行步骤的索引
  const currentStepIndex = useMemo(() => {
    return workflow.steps.findIndex(s => s.status === 'running');
  }, [workflow.steps]);

  return (
    <div className={`workflow-bubble chat-message chat-message--assistant ${className}`}>
      <div className="chat-message-avatar">
        <span>{workflow.generationType === 'image' ? '🖼️' : '🎬'}</span>
      </div>
      <div className="workflow-bubble__content chat-message-content">
        {/* 头部 */}
        <div className="workflow-bubble__header">
          <span className="workflow-bubble__title">{workflow.name}</span>
          <div className="workflow-bubble__status-info">
            <span className={`workflow-bubble__status workflow-bubble__status--${workflowStatus.status}`}>
              {statusLabels[workflowStatus.status]}
            </span>
            <span className="workflow-bubble__progress-text">
              {workflowStatus.completedSteps}/{workflowStatus.totalSteps}
            </span>
          </div>
        </div>

        {/* 进度条 */}
        <div className="workflow-bubble__progress">
          <div
            className={`workflow-bubble__progress-bar workflow-bubble__progress-bar--${workflowStatus.status}`}
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* 原始请求 */}
        <div className="workflow-bubble__prompt">
          <span className="workflow-bubble__label">请求:</span>
          <span className="workflow-bubble__prompt-text">
            {workflow.prompt.length > 100 
              ? `${workflow.prompt.substring(0, 100)}...` 
              : workflow.prompt}
          </span>
        </div>

        {/* 步骤列表 */}
        <div className="workflow-bubble__steps">
          {workflow.steps.map((step, index) => (
            <StepItem
              key={step.id}
              step={step}
              index={index}
              isCurrentStep={index === currentStepIndex && isRunning}
            />
          ))}
        </div>

        {/* 完成摘要 */}
        {isCompleted && (
          <div className="workflow-bubble__summary workflow-bubble__summary--success">
            <span className="workflow-bubble__summary-icon">✨</span>
            <span>
              {workflow.generationType === 'image' 
                ? `成功生成 ${workflow.count} 张图片`
                : `成功生成 ${workflow.count} 个视频`}
            </span>
          </div>
        )}

        {/* 失败提示 */}
        {isFailed && (
          <div className="workflow-bubble__summary workflow-bubble__summary--error">
            <span className="workflow-bubble__summary-icon">❌</span>
            <span>执行失败，请重试</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkflowMessageBubble;
