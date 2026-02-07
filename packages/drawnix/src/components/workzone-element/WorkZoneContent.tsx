/**
 * WorkZone 内容组件
 *
 * 在画布上显示工作流进度的 React 组件
 * 这是 WorkflowMessageBubble 的简化版本，适合在画布元素中使用
 */

import React, { useMemo, useEffect, useRef } from 'react';
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

// 全局记录已经 claim 过的工作流，避免重复请求
const claimedWorkflows = new Set<string>();

interface WorkZoneContentProps {
  workflow: WorkflowMessageData;
  className?: string;
  onDelete?: () => void;
  /** 当 SW 中找不到工作流或工作流状态变更时的回调 */
  onWorkflowStateChange?: (workflowId: string, status: 'completed' | 'failed', error?: string) => void;
}

export const WorkZoneContent: React.FC<WorkZoneContentProps> = ({
  workflow,
  className = '',
  onDelete,
  onWorkflowStateChange,
}) => {
  // 用于追踪是否已经尝试 claim
  const hasClaimedRef = useRef(false);

  // 页面刷新后，尝试接管工作流或同步状态
  useEffect(() => {
    const workflowId = workflow.id;
    
    // 检查 workflow.status 或 steps 中是否有活跃状态
    const hasRunningSteps = workflow.steps?.some(s => s.status === 'running' || s.status === 'pending');
    const isTerminalStatus = workflow.status === 'completed' || workflow.status === 'failed' || workflow.status === 'cancelled';
    const isActiveByStatus = workflow.status === 'running' || workflow.status === 'pending';
    const isActiveBySteps = hasRunningSteps && !isTerminalStatus;
    // 不一致状态：终态但有运行中的步骤，需要从 SW 获取真实状态
    const isInconsistentState = isTerminalStatus && hasRunningSteps;
    const needsClaim = isActiveByStatus || isActiveBySteps || isInconsistentState;
    
    // 如果工作流已是终态但 steps 还在 running，这是不一致状态
    // 需要从 SW 获取真实状态，而不是直接标记为失败
    // 这种情况通常发生在页面刷新后，SW 端状态可能已经更新但 UI 还是旧状态
    
    // 避免重复 claim
    if (!needsClaim || hasClaimedRef.current || claimedWorkflows.has(workflowId)) {
      return;
    }
    
    hasClaimedRef.current = true;
    claimedWorkflows.add(workflowId);
    
    // 异步 claim 工作流
    (async () => {
      try {
        const { swChannelClient } = await import('../../services/sw-channel/client');
        
        // 等待 swChannelClient 初始化（最多 5 秒）
        let waited = 0;
        while (!swChannelClient.isInitialized() && waited < 5000) {
          await new Promise(r => setTimeout(r, 200));
          waited += 200;
        }
        
        if (!swChannelClient.isInitialized()) {
          // SW 未初始化，标记为失败
          onWorkflowStateChange?.(workflowId, 'failed', '无法连接到 Service Worker');
          return;
        }
        
        const result = await swChannelClient.claimWorkflow(workflowId);
        
        if (result.success) {
          // 如果 SW 中的工作流已经是终态，通知 UI 更新
          const swStatus = result.workflow?.status;
          if (swStatus === 'completed' || swStatus === 'failed' || swStatus === 'cancelled') {
            onWorkflowStateChange?.(
              workflowId, 
              swStatus === 'completed' ? 'completed' : 'failed',
              result.workflow?.error
            );
          }
        } else {
          // 工作流不存在或 claim 失败，标记为失败
          onWorkflowStateChange?.(workflowId, 'failed', result.error || '工作流已丢失，请重试');
        }
      } catch (error) {
        onWorkflowStateChange?.(workflowId, 'failed', '恢复工作流失败，请重试');
      }
    })();
  }, [workflow.id, workflow.status, onWorkflowStateChange]);
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
    <div
      className={`workzone-content workzone-content--${workflowStatus.status} ${className}`}
    >
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
              // console.log('[WorkZoneContent] Delete button pointerdown - stopping propagation');
              e.stopPropagation();
              e.preventDefault();
            }}
            onPointerUp={(e) => {
              // console.log('[WorkZoneContent] Delete button pointerup - triggering delete');
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
          ❌ {workflow.steps.find(s => s.status === 'failed')?.error || '执行失败'}
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
