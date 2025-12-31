/**
 * useWorkflow Hook
 * 
 * 管理工作流状态，提供工作流执行和状态更新功能
 */

import { useState, useCallback, useRef } from 'react';
import type { 
  WorkflowDefinition, 
  WorkflowStep 
} from '../components/ai-input-bar/workflow-converter';
import {
  updateStepStatus,
  addStepsToWorkflow,
  getWorkflowStatus,
  parseAIResponseToSteps,
} from '../components/ai-input-bar/workflow-converter';

export interface WorkflowState {
  /** 当前工作流 */
  workflow: WorkflowDefinition | null;
  /** 工作流执行状态 */
  status: 'idle' | 'running' | 'completed' | 'failed';
  /** 当前执行的步骤 */
  currentStep: WorkflowStep | null;
  /** 已完成步骤数 */
  completedSteps: number;
  /** 总步骤数 */
  totalSteps: number;
  /** 错误信息 */
  error: string | null;
}

export interface UseWorkflowReturn {
  /** 工作流状态 */
  state: WorkflowState;
  /** 开始执行工作流 */
  startWorkflow: (workflow: WorkflowDefinition) => void;
  /** 更新步骤状态 */
  updateStep: (
    stepId: string, 
    status: WorkflowStep['status'], 
    result?: unknown, 
    error?: string,
    duration?: number
  ) => void;
  /** 添加新步骤（Agent 流程动态添加） */
  addSteps: (steps: WorkflowStep[]) => void;
  /** 从 AI 响应解析并添加步骤 */
  addStepsFromAIResponse: (response: string) => WorkflowStep[];
  /** 重置工作流 */
  resetWorkflow: () => void;
  /** 中止工作流 */
  abortWorkflow: () => void;
  /** 获取工作流 */
  getWorkflow: () => WorkflowDefinition | null;
}

const initialState: WorkflowState = {
  workflow: null,
  status: 'idle',
  currentStep: null,
  completedSteps: 0,
  totalSteps: 0,
  error: null,
};

/**
 * 工作流管理 Hook
 */
export function useWorkflow(): UseWorkflowReturn {
  const [state, setState] = useState<WorkflowState>(initialState);
  const workflowRef = useRef<WorkflowDefinition | null>(null);
  const abortedRef = useRef(false);

  /**
   * 开始执行工作流
   */
  const startWorkflow = useCallback((workflow: WorkflowDefinition) => {
    workflowRef.current = workflow;
    abortedRef.current = false;
    
    const workflowStatus = getWorkflowStatus(workflow);
    
    setState({
      workflow,
      status: 'running',
      currentStep: workflowStatus.currentStep || null,
      completedSteps: workflowStatus.completedSteps,
      totalSteps: workflowStatus.totalSteps,
      error: null,
    });
  }, []);

  /**
   * 更新步骤状态
   */
  const updateStep = useCallback((
    stepId: string,
    status: WorkflowStep['status'],
    result?: unknown,
    error?: string,
    duration?: number
  ) => {
    if (abortedRef.current) return;
    
    setState(prev => {
      if (!prev.workflow) return prev;
      
      const updatedWorkflow = updateStepStatus(
        prev.workflow,
        stepId,
        status,
        result,
        error,
        duration
      );
      
      workflowRef.current = updatedWorkflow;
      const workflowStatus = getWorkflowStatus(updatedWorkflow);
      
      // 确定整体状态
      let overallStatus: WorkflowState['status'] = 'running';
      if (workflowStatus.status === 'completed') {
        overallStatus = 'completed';
      } else if (workflowStatus.status === 'failed') {
        overallStatus = 'failed';
      }
      
      return {
        ...prev,
        workflow: updatedWorkflow,
        status: overallStatus,
        currentStep: workflowStatus.currentStep || null,
        completedSteps: workflowStatus.completedSteps,
        totalSteps: workflowStatus.totalSteps,
        error: error || prev.error,
      };
    });
  }, []);

  /**
   * 添加新步骤
   */
  const addSteps = useCallback((steps: WorkflowStep[]) => {
    if (abortedRef.current || steps.length === 0) return;
    
    setState(prev => {
      if (!prev.workflow) return prev;
      
      const updatedWorkflow = addStepsToWorkflow(prev.workflow, steps);
      workflowRef.current = updatedWorkflow;
      const workflowStatus = getWorkflowStatus(updatedWorkflow);
      
      return {
        ...prev,
        workflow: updatedWorkflow,
        currentStep: workflowStatus.currentStep || prev.currentStep,
        totalSteps: workflowStatus.totalSteps,
      };
    });
  }, []);

  /**
   * 从 AI 响应解析并添加步骤
   */
  const addStepsFromAIResponse = useCallback((response: string): WorkflowStep[] => {
    const currentWorkflow = workflowRef.current;
    if (!currentWorkflow || abortedRef.current) return [];
    
    const existingStepCount = currentWorkflow.steps.length;
    const newSteps = parseAIResponseToSteps(response, existingStepCount);
    
    if (newSteps.length > 0) {
      addSteps(newSteps);
    }
    
    return newSteps;
  }, [addSteps]);

  /**
   * 重置工作流
   */
  const resetWorkflow = useCallback(() => {
    workflowRef.current = null;
    abortedRef.current = false;
    setState(initialState);
  }, []);

  /**
   * 中止工作流
   */
  const abortWorkflow = useCallback(() => {
    abortedRef.current = true;
    setState(prev => ({
      ...prev,
      status: 'failed',
      error: '工作流已中止',
    }));
  }, []);

  /**
   * 获取当前工作流
   */
  const getWorkflow = useCallback(() => {
    return workflowRef.current;
  }, []);

  return {
    state,
    startWorkflow,
    updateStep,
    addSteps,
    addStepsFromAIResponse,
    resetWorkflow,
    abortWorkflow,
    getWorkflow,
  };
}

export default useWorkflow;
