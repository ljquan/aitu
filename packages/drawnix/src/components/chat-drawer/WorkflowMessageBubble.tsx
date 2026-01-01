/**
 * 工作流消息气泡组件
 * 
 * 在对话消息中展示工作流执行过程
 */

import React, { useState, useMemo } from 'react';
import type { WorkflowMessageData, AgentLogEntry } from '../../types/chat.types';
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
  // 步骤有详情的条件：有参数、有结果、有错误、有耗时
  const hasArgs = step.args && Object.keys(step.args).length > 0;
  const hasDetails = hasArgs || step.result || step.error || step.duration !== undefined;

  // 格式化显示参数，排除 context 等大对象
  const formatArgs = (args: Record<string, unknown> | undefined) => {
    if (!args) return null;
    const filteredArgs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args)) {
      // 排除 context 等大对象，只显示关键参数
      if (key === 'context') {
        filteredArgs[key] = '[AgentExecutionContext]';
      } else if (typeof value === 'string' && value.length > 200) {
        filteredArgs[key] = value.substring(0, 200) + '...';
      } else {
        filteredArgs[key] = value;
      }
    }
    return filteredArgs;
  };

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

          {/* 输入参数 */}
          {hasArgs && (
            <div className="workflow-bubble-step__detail-row workflow-bubble-step__detail-row--block">
              <span className="workflow-bubble-step__label">输入参数:</span>
              <pre className="workflow-bubble-step__args">
                {JSON.stringify(formatArgs(step.args), null, 2)}
              </pre>
            </div>
          )}

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
                  : String(JSON.stringify(step.result, null, 2))}
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

// ============ Agent 日志项组件 ============

interface AgentLogItemProps {
  log: AgentLogEntry;
}

const AgentLogItem: React.FC<AgentLogItemProps> = ({ log }) => {
  const [expanded, setExpanded] = useState(false);

  if (log.type === 'thinking') {
    // AI 思考内容
    const content = log.content;
    const isLong = content.length > 200;
    const displayContent = expanded ? content : content.substring(0, 200);

    return (
      <div className="agent-log agent-log--thinking">
        <div className="agent-log__header">
          <span className="agent-log__icon">💭</span>
          <span className="agent-log__title">AI 分析</span>
        </div>
        <div className="agent-log__content">
          <pre className="agent-log__thinking-text">
            {displayContent}
            {isLong && !expanded && '...'}
          </pre>
          {isLong && (
            <button
              className="agent-log__toggle"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? '收起' : '展开全部'}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (log.type === 'tool_call') {
    return (
      <div className="agent-log agent-log--tool-call">
        <div
          className="agent-log__header agent-log__header--clickable"
          onClick={() => setExpanded(!expanded)}
        >
          <span className="agent-log__icon">🔧</span>
          <span className="agent-log__title">调用工具: {log.toolName}</span>
          <span className={`agent-log__expand ${expanded ? 'agent-log__expand--open' : ''}`}>
            ▼
          </span>
        </div>
        {expanded && (
          <div className="agent-log__content">
            <pre className="agent-log__args">
              {JSON.stringify(log.args, null, 2)}
            </pre>
          </div>
        )}
      </div>
    );
  }

  if (log.type === 'tool_result') {
    const statusClass = log.success ? 'success' : 'error';
    const statusIcon = log.success ? '✅' : '❌';

    return (
      <div className={`agent-log agent-log--tool-result agent-log--${statusClass}`}>
        <div
          className="agent-log__header agent-log__header--clickable"
          onClick={() => setExpanded(!expanded)}
        >
          <span className="agent-log__icon">{statusIcon}</span>
          <span className="agent-log__title">
            {log.toolName} {log.success ? '执行成功' : '执行失败'}
          </span>
          <span className={`agent-log__expand ${expanded ? 'agent-log__expand--open' : ''}`}>
            ▼
          </span>
        </div>
        {expanded && (
          <div className="agent-log__content">
            {log.error && (
              <div className="agent-log__error">{log.error}</div>
            )}
            {log.data && (
              <pre className="agent-log__data">
                {typeof log.data === 'string'
                  ? log.data
                  : String(JSON.stringify(log.data, null, 2))}
              </pre>
            )}
          </div>
        )}
      </div>
    );
  }

  if (log.type === 'retry') {
    return (
      <div className="agent-log agent-log--retry">
        <div className="agent-log__header">
          <span className="agent-log__icon">🔄</span>
          <span className="agent-log__title">
            重试 #{log.attempt}: {log.reason}
          </span>
        </div>
      </div>
    );
  }

  return null;
};

// ============ 工作流消息气泡组件 ============

interface WorkflowMessageBubbleProps {
  workflow: WorkflowMessageData;
  className?: string;
  /** 重试回调，从指定步骤索引开始重试 */
  onRetry?: (stepIndex: number) => void;
  /** 是否正在重试 */
  isRetrying?: boolean;
}

export const WorkflowMessageBubble: React.FC<WorkflowMessageBubbleProps> = ({
  workflow,
  className = '',
  onRetry,
  isRetrying = false,
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

  // 获取第一个失败步骤的索引
  const firstFailedStepIndex = useMemo(() => {
    return workflow.steps.findIndex(s => s.status === 'failed');
  }, [workflow.steps]);

  // 检查是否可以重试（有重试上下文且有失败步骤）
  const canRetry = isFailed && workflow.retryContext && firstFailedStepIndex >= 0;

  // 处理重试点击
  const handleRetry = () => {
    if (onRetry && firstFailedStepIndex >= 0) {
      onRetry(firstFailedStepIndex);
    }
  };

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

        {/* Agent 执行日志 */}
        {workflow.logs && workflow.logs.length > 0 && (
          <div className="workflow-bubble__logs">
            <div className="workflow-bubble__logs-header">
              <span className="workflow-bubble__logs-title">执行详情</span>
            </div>
            <div className="workflow-bubble__logs-list">
              {workflow.logs.map((log, index) => (
                <AgentLogItem key={`log-${index}-${log.timestamp}`} log={log} />
              ))}
            </div>
          </div>
        )}

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
            {canRetry && onRetry && (
              <button
                className="workflow-bubble__retry-btn"
                onClick={handleRetry}
                disabled={isRetrying}
              >
                {isRetrying ? '重试中...' : '🔄 从失败步骤重试'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkflowMessageBubble;
