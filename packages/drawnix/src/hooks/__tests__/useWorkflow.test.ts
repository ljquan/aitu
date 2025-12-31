import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWorkflow } from '../useWorkflow';
import type { WorkflowDefinition, WorkflowStep } from '../../components/ai-input-bar/workflow-converter';

// Helper to create mock workflow
const createMockWorkflow = (overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition => ({
  id: `workflow-${Date.now()}`,
  name: 'Test Workflow',
  description: 'Test workflow description',
  scenarioType: 'direct_generation',
  generationType: 'image',
  steps: [
    { id: 'step-1', mcp: 'generate_image', args: { prompt: 'test' }, description: 'Generate image 1', status: 'pending' },
    { id: 'step-2', mcp: 'generate_image', args: { prompt: 'test' }, description: 'Generate image 2', status: 'pending' },
  ],
  metadata: {
    prompt: 'test',
    modelId: 'test-model',
    count: 2,
  },
  createdAt: Date.now(),
  ...overrides,
});

describe('useWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('初始状态', () => {
    it('应该返回初始空状态', () => {
      const { result } = renderHook(() => useWorkflow());

      expect(result.current.state.workflow).toBeNull();
      expect(result.current.state.status).toBe('idle');
      expect(result.current.state.currentStep).toBeNull();
      expect(result.current.state.completedSteps).toBe(0);
      expect(result.current.state.totalSteps).toBe(0);
      expect(result.current.state.error).toBeNull();
    });
  });

  describe('startWorkflow', () => {
    it('应该启动工作流并设置状态为 running', () => {
      const { result } = renderHook(() => useWorkflow());
      const workflow = createMockWorkflow();

      act(() => {
        result.current.startWorkflow(workflow);
      });

      expect(result.current.state.workflow).toBeDefined();
      expect(result.current.state.workflow?.id).toBe(workflow.id);
      expect(result.current.state.status).toBe('running');
      expect(result.current.state.totalSteps).toBe(2);
      expect(result.current.state.completedSteps).toBe(0);
    });

    it('应该重置之前的工作流状态', () => {
      const { result } = renderHook(() => useWorkflow());
      const workflow1 = createMockWorkflow({ id: 'workflow-1' });
      const workflow2 = createMockWorkflow({ id: 'workflow-2' });

      act(() => {
        result.current.startWorkflow(workflow1);
        result.current.updateStep('step-1', 'completed');
      });

      act(() => {
        result.current.startWorkflow(workflow2);
      });

      expect(result.current.state.workflow?.id).toBe('workflow-2');
      expect(result.current.state.completedSteps).toBe(0);
      expect(result.current.state.error).toBeNull();
    });

    it('应该设置 currentStep 为第一个 pending 步骤', () => {
      const { result } = renderHook(() => useWorkflow());
      const workflow = createMockWorkflow();

      act(() => {
        result.current.startWorkflow(workflow);
      });

      // currentStep 应该是第一个 pending 步骤
      expect(result.current.state.currentStep).toBeDefined();
      expect(result.current.state.currentStep?.id).toBe('step-1');
    });
  });

  describe('updateStep', () => {
    it('应该更新步骤状态为 running', () => {
      const { result } = renderHook(() => useWorkflow());
      const workflow = createMockWorkflow();

      act(() => {
        result.current.startWorkflow(workflow);
      });

      act(() => {
        result.current.updateStep('step-1', 'running');
      });

      const step = result.current.state.workflow?.steps.find(s => s.id === 'step-1');
      expect(step?.status).toBe('running');
      expect(result.current.state.currentStep?.id).toBe('step-1');
    });

    it('应该更新步骤状态为 completed 并增加 completedSteps', () => {
      const { result } = renderHook(() => useWorkflow());
      const workflow = createMockWorkflow();

      act(() => {
        result.current.startWorkflow(workflow);
      });

      act(() => {
        result.current.updateStep('step-1', 'completed', { url: 'https://example.com/image.jpg' });
      });

      const step = result.current.state.workflow?.steps.find(s => s.id === 'step-1');
      expect(step?.status).toBe('completed');
      expect(step?.result).toEqual({ url: 'https://example.com/image.jpg' });
      expect(result.current.state.completedSteps).toBe(1);
    });

    it('应该更新步骤状态为 failed 并设置错误信息', () => {
      const { result } = renderHook(() => useWorkflow());
      const workflow = createMockWorkflow();

      act(() => {
        result.current.startWorkflow(workflow);
      });

      act(() => {
        result.current.updateStep('step-1', 'failed', undefined, 'Generation failed');
      });

      const step = result.current.state.workflow?.steps.find(s => s.id === 'step-1');
      expect(step?.status).toBe('failed');
      expect(step?.error).toBe('Generation failed');
      expect(result.current.state.status).toBe('failed');
    });

    it('应该记录步骤执行时长', () => {
      const { result } = renderHook(() => useWorkflow());
      const workflow = createMockWorkflow();

      act(() => {
        result.current.startWorkflow(workflow);
      });

      act(() => {
        result.current.updateStep('step-1', 'completed', undefined, undefined, 5000);
      });

      const step = result.current.state.workflow?.steps.find(s => s.id === 'step-1');
      expect(step?.duration).toBe(5000);
    });

    it('应该在所有步骤完成后设置状态为 completed', () => {
      const { result } = renderHook(() => useWorkflow());
      const workflow = createMockWorkflow();

      act(() => {
        result.current.startWorkflow(workflow);
      });

      act(() => {
        result.current.updateStep('step-1', 'completed');
      });

      act(() => {
        result.current.updateStep('step-2', 'completed');
      });

      expect(result.current.state.status).toBe('completed');
      expect(result.current.state.completedSteps).toBe(2);
    });

    it('应该在工作流为空时不执行任何操作', () => {
      const { result } = renderHook(() => useWorkflow());

      act(() => {
        result.current.updateStep('step-1', 'running');
      });

      expect(result.current.state.workflow).toBeNull();
    });
  });

  describe('addSteps', () => {
    it('应该向工作流添加新步骤', () => {
      const { result } = renderHook(() => useWorkflow());
      const workflow = createMockWorkflow({
        steps: [{ id: 'step-1', mcp: 'analyze', args: {}, description: 'Analyze', status: 'completed' }],
      });

      act(() => {
        result.current.startWorkflow(workflow);
      });

      const newSteps: WorkflowStep[] = [
        { id: 'step-2', mcp: 'generate', args: {}, description: 'Generate', status: 'pending' },
        { id: 'step-3', mcp: 'process', args: {}, description: 'Process', status: 'pending' },
      ];

      act(() => {
        result.current.addSteps(newSteps);
      });

      expect(result.current.state.workflow?.steps).toHaveLength(3);
      expect(result.current.state.totalSteps).toBe(3);
    });

    it('应该保持已有步骤不变', () => {
      const { result } = renderHook(() => useWorkflow());
      const workflow = createMockWorkflow();

      act(() => {
        result.current.startWorkflow(workflow);
        result.current.updateStep('step-1', 'completed');
      });

      act(() => {
        result.current.addSteps([
          { id: 'step-3', mcp: 'new', args: {}, description: 'New', status: 'pending' },
        ]);
      });

      const step1 = result.current.state.workflow?.steps.find(s => s.id === 'step-1');
      expect(step1?.status).toBe('completed');
    });

    it('应该在工作流为空时不执行任何操作', () => {
      const { result } = renderHook(() => useWorkflow());

      act(() => {
        result.current.addSteps([
          { id: 'step-1', mcp: 'test', args: {}, description: 'Test', status: 'pending' },
        ]);
      });

      expect(result.current.state.workflow).toBeNull();
    });
  });

  describe('addStepsFromAIResponse', () => {
    it('应该从 AI 响应解析并添加步骤', () => {
      const { result } = renderHook(() => useWorkflow());
      const workflow = createMockWorkflow({
        scenarioType: 'agent_flow',
        steps: [{ id: 'step-analyze', mcp: 'ai_analyze', args: {}, description: 'Analyze', status: 'completed' }],
      });

      act(() => {
        result.current.startWorkflow(workflow);
      });

      const aiResponse = JSON.stringify({
        next: [
          { mcp: 'generate_image', args: { prompt: 'cat' }, description: '生成猫图' },
        ],
      });

      let addedSteps: WorkflowStep[] = [];
      act(() => {
        addedSteps = result.current.addStepsFromAIResponse(aiResponse);
      });

      expect(addedSteps).toHaveLength(1);
      expect(addedSteps[0].mcp).toBe('generate_image');
      expect(result.current.state.workflow?.steps).toHaveLength(2);
    });

    it('应该在无效响应时返回空数组', () => {
      const { result } = renderHook(() => useWorkflow());
      const workflow = createMockWorkflow();

      act(() => {
        result.current.startWorkflow(workflow);
      });

      let addedSteps: WorkflowStep[] = [];
      act(() => {
        addedSteps = result.current.addStepsFromAIResponse('invalid json');
      });

      expect(addedSteps).toEqual([]);
    });
  });

  describe('resetWorkflow', () => {
    it('应该重置工作流到初始状态', () => {
      const { result } = renderHook(() => useWorkflow());
      const workflow = createMockWorkflow();

      act(() => {
        result.current.startWorkflow(workflow);
        result.current.updateStep('step-1', 'completed');
      });

      act(() => {
        result.current.resetWorkflow();
      });

      expect(result.current.state.workflow).toBeNull();
      expect(result.current.state.status).toBe('idle');
      expect(result.current.state.currentStep).toBeNull();
      expect(result.current.state.completedSteps).toBe(0);
      expect(result.current.state.totalSteps).toBe(0);
      expect(result.current.state.error).toBeNull();
    });
  });

  describe('abortWorkflow', () => {
    it('应该中止工作流并设置状态为 failed', () => {
      const { result } = renderHook(() => useWorkflow());
      const workflow = createMockWorkflow();

      act(() => {
        result.current.startWorkflow(workflow);
        result.current.updateStep('step-1', 'running');
      });

      act(() => {
        result.current.abortWorkflow();
      });

      expect(result.current.state.status).toBe('failed');
      expect(result.current.state.error).toBe('工作流已中止');
    });

    it('应该阻止后续的步骤更新', () => {
      const { result } = renderHook(() => useWorkflow());
      const workflow = createMockWorkflow();

      act(() => {
        result.current.startWorkflow(workflow);
      });

      act(() => {
        result.current.abortWorkflow();
      });

      // 尝试更新步骤，应该被忽略
      act(() => {
        result.current.updateStep('step-1', 'completed');
      });

      const step = result.current.state.workflow?.steps.find(s => s.id === 'step-1');
      expect(step?.status).toBe('pending');
      expect(result.current.state.status).toBe('failed');
    });

    it('应该阻止后续的步骤添加', () => {
      const { result } = renderHook(() => useWorkflow());
      const workflow = createMockWorkflow();

      act(() => {
        result.current.startWorkflow(workflow);
      });

      const initialStepCount = result.current.state.workflow?.steps.length;

      act(() => {
        result.current.abortWorkflow();
      });

      act(() => {
        result.current.addSteps([
          { id: 'step-new', mcp: 'new', args: {}, description: 'New', status: 'pending' },
        ]);
      });

      expect(result.current.state.workflow?.steps.length).toBe(initialStepCount);
    });
  });

  describe('getWorkflow', () => {
    it('应该返回当前工作流', () => {
      const { result } = renderHook(() => useWorkflow());
      const workflow = createMockWorkflow();

      act(() => {
        result.current.startWorkflow(workflow);
      });

      const currentWorkflow = result.current.getWorkflow();

      expect(currentWorkflow).toBeDefined();
      expect(currentWorkflow?.id).toBe(workflow.id);
    });

    it('应该在没有工作流时返回 null', () => {
      const { result } = renderHook(() => useWorkflow());

      const currentWorkflow = result.current.getWorkflow();

      expect(currentWorkflow).toBeNull();
    });
  });

  describe('状态计算', () => {
    it('应该正确计算当前步骤', () => {
      const { result } = renderHook(() => useWorkflow());
      const workflow = createMockWorkflow();

      act(() => {
        result.current.startWorkflow(workflow);
      });

      // 启动后 currentStep 应该是第一个 pending 步骤
      expect(result.current.state.currentStep).toBeDefined();
      expect(result.current.state.currentStep?.id).toBe('step-1');

      act(() => {
        result.current.updateStep('step-1', 'running');
      });

      expect(result.current.state.currentStep?.id).toBe('step-1');

      act(() => {
        result.current.updateStep('step-1', 'completed');
      });

      // 完成后 currentStep 应该是下一个 pending 步骤
      expect(result.current.state.currentStep?.id).toBe('step-2');
    });

    it('应该在步骤失败时正确设置工作流状态', () => {
      const { result } = renderHook(() => useWorkflow());
      const workflow = createMockWorkflow({
        steps: [
          { id: 'step-1', mcp: 'test1', args: {}, description: 'Step 1', status: 'pending' },
          { id: 'step-2', mcp: 'test2', args: {}, description: 'Step 2', status: 'pending' },
          { id: 'step-3', mcp: 'test3', args: {}, description: 'Step 3', status: 'pending' },
        ],
      });

      act(() => {
        result.current.startWorkflow(workflow);
      });

      act(() => {
        result.current.updateStep('step-1', 'completed');
      });

      act(() => {
        result.current.updateStep('step-2', 'failed', undefined, 'Error occurred');
      });

      expect(result.current.state.status).toBe('failed');
      expect(result.current.state.completedSteps).toBe(1);
    });
  });
});
