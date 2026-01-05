import { describe, it, expect } from 'vitest';
import {
  convertDirectGenerationToWorkflow,
  convertAgentFlowToWorkflow,
  convertToWorkflow,
  parseAIResponseToSteps,
  updateStepStatus,
  addStepsToWorkflow,
  getWorkflowStatus,
  WorkflowDefinition,
  WorkflowStep,
} from '../workflow-converter';
import type { ParsedGenerationParams } from '../../../utils/ai-input-parser';

// Helper to create mock ParsedGenerationParams
const createMockParams = (overrides: Partial<ParsedGenerationParams> = {}): ParsedGenerationParams => ({
  scenario: 'direct_generation',
  generationType: 'image',
  modelId: 'gemini-3-pro-image-preview',
  isModelExplicit: false,
  prompt: 'test prompt',
  userInstruction: 'test prompt',
  rawInput: 'test prompt',
  count: 1,
  size: '1x1',
  duration: undefined,
  parseResult: {
    cleanText: 'test prompt',
    triggers: [],
    modelTrigger: null,
    countTrigger: null,
    sizeTrigger: null,
    durationTrigger: null,
    aspectRatioTrigger: null,
    originalText: 'test prompt',
  },
  hasExtraContent: false,
  selection: {
    texts: [],
    images: [],
    videos: [],
    graphics: [],
  },
  ...overrides,
});

describe('workflow-converter', () => {
  describe('convertDirectGenerationToWorkflow', () => {
    describe('图片生成场景', () => {
      it('应该正确转换单张图片生成请求', () => {
        const params = createMockParams({
          generationType: 'image',
          modelId: 'gemini-3-pro-image-preview',
          prompt: '一只可爱的猫',
          count: 1,
          size: '1x1',
        });

        const workflow = convertDirectGenerationToWorkflow(params);

        expect(workflow).toBeDefined();
        expect(workflow.scenarioType).toBe('direct_generation');
        expect(workflow.generationType).toBe('image');
        expect(workflow.steps).toHaveLength(1);
        expect(workflow.steps[0].mcp).toBe('generate_image');
        expect(workflow.steps[0].args).toMatchObject({
          prompt: '一只可爱的猫',
          size: '1x1',
          model: 'gemini-3-pro-image-preview',
        });
        expect(workflow.steps[0].status).toBe('pending');
      });

      it('应该正确处理多张图片生成（count=3）', () => {
        const params = createMockParams({
          generationType: 'image',
          count: 3,
          prompt: '风景画',
        });

        const workflow = convertDirectGenerationToWorkflow(params);

        expect(workflow.steps).toHaveLength(3);
        workflow.steps.forEach((step, index) => {
          expect(step.id).toBe(`step-${index + 1}`);
          expect(step.mcp).toBe('generate_image');
          expect(step.description).toContain(`${index + 1}`);
        });
      });

      it('应该正确传递参考图片', () => {
        const params = createMockParams({
          generationType: 'image',
          prompt: '风格转换',
        });
        const referenceImages = ['https://example.com/ref1.jpg', 'https://example.com/ref2.jpg'];

        const workflow = convertDirectGenerationToWorkflow(params, referenceImages);

        expect(workflow.steps[0].args.referenceImages).toEqual(referenceImages);
      });

      it('应该使用默认宽高 1x1', () => {
        const params = createMockParams({
          generationType: 'image',
          size: undefined,
        });

        const workflow = convertDirectGenerationToWorkflow(params);

        expect(workflow.steps[0].args.size).toBe('1x1');
      });

      it('应该正确处理自定义尺寸', () => {
        const params = createMockParams({
          generationType: 'image',
          size: '16x9',
        });

        const workflow = convertDirectGenerationToWorkflow(params);

        expect(workflow.steps[0].args.size).toBe('16x9');
      });
    });

    describe('视频生成场景', () => {
      it('应该正确转换视频生成请求', () => {
        const params = createMockParams({
          generationType: 'video',
          modelId: 'veo3',
          prompt: '日落场景',
          count: 1,
          size: '16x9',
          duration: '8',
        });

        const workflow = convertDirectGenerationToWorkflow(params);

        expect(workflow.generationType).toBe('video');
        expect(workflow.steps).toHaveLength(1);
        expect(workflow.steps[0].mcp).toBe('generate_video');
        expect(workflow.steps[0].args).toMatchObject({
          prompt: '日落场景',
          size: '16x9',
          seconds: '8',
          model: 'veo3',
        });
      });

      it('应该使用默认视频尺寸 16x9', () => {
        const params = createMockParams({
          generationType: 'video',
          size: undefined,
        });

        const workflow = convertDirectGenerationToWorkflow(params);

        expect(workflow.steps[0].args.size).toBe('16x9');
      });

      it('应该正确处理视频时长', () => {
        const params = createMockParams({
          generationType: 'video',
          duration: '15',
        });

        const workflow = convertDirectGenerationToWorkflow(params);

        expect(workflow.steps[0].args.seconds).toBe('15');
      });

      it('应该使用默认时长 5 秒', () => {
        const params = createMockParams({
          generationType: 'video',
          duration: undefined,
        });

        const workflow = convertDirectGenerationToWorkflow(params);

        expect(workflow.steps[0].args.seconds).toBe('5');
      });
    });

    describe('工作流元数据', () => {
      it('应该生成唯一的工作流 ID', () => {
        const params = createMockParams();

        const workflow1 = convertDirectGenerationToWorkflow(params);
        const workflow2 = convertDirectGenerationToWorkflow(params);

        expect(workflow1.id).toBeDefined();
        expect(workflow2.id).toBeDefined();
        expect(workflow1.id).not.toBe(workflow2.id);
      });

      it('应该设置正确的工作流名称和描述', () => {
        const params = createMockParams({
          generationType: 'image',
          count: 2,
        });

        const workflow = convertDirectGenerationToWorkflow(params);

        expect(workflow.name).toContain('图片');
        expect(workflow.description).toContain('2');
      });

      it('应该包含创建时间', () => {
        const beforeTime = Date.now();
        const params = createMockParams();

        const workflow = convertDirectGenerationToWorkflow(params);
        const afterTime = Date.now();

        expect(workflow.createdAt).toBeGreaterThanOrEqual(beforeTime);
        expect(workflow.createdAt).toBeLessThanOrEqual(afterTime);
      });

      it('应该在 metadata 中保存原始参数', () => {
        const params = createMockParams({
          prompt: '测试提示词',
          modelId: 'gemini-3-pro-image-preview',
        });

        const workflow = convertDirectGenerationToWorkflow(params);

        expect(workflow.metadata).toBeDefined();
        expect(workflow.metadata.prompt).toBe('测试提示词');
        expect(workflow.metadata.modelId).toBe('gemini-3-pro-image-preview');
      });
    });
  });

  describe('convertAgentFlowToWorkflow', () => {
    it('应该创建包含分析步骤的工作流', () => {
      const params = createMockParams({
        scenario: 'agent_flow',
        prompt: '帮我生成一张猫的图片并添加文字',
      });

      const workflow = convertAgentFlowToWorkflow(params);

      expect(workflow.scenarioType).toBe('agent_flow');
      expect(workflow.steps).toHaveLength(1);
      expect(workflow.steps[0].id).toBe('step-analyze');
      expect(workflow.steps[0].mcp).toBe('ai_analyze');
      expect(workflow.steps[0].status).toBe('pending');
    });

    it('应该在 args 中包含上下文信息', () => {
      const params = createMockParams({
        scenario: 'agent_flow',
        prompt: '复杂任务描述',
      });
      const referenceImages = ['https://example.com/ref.jpg'];

      const workflow = convertAgentFlowToWorkflow(params, referenceImages);

      expect(workflow.steps[0].args.context).toBeDefined();
      expect((workflow.steps[0].args.context as any).finalPrompt).toBe('复杂任务描述');
      expect((workflow.steps[0].args.context as any).selection).toBeDefined();
    });
  });

  describe('convertToWorkflow', () => {
    it('应该根据 scenario 分发到正确的转换函数 - direct_generation', () => {
      const params = createMockParams({
        scenario: 'direct_generation',
        generationType: 'image',
      });

      const workflow = convertToWorkflow(params);

      expect(workflow.scenarioType).toBe('direct_generation');
      expect(workflow.steps[0].mcp).toBe('generate_image');
    });

    it('应该根据 scenario 分发到正确的转换函数 - agent_flow', () => {
      const params = createMockParams({
        scenario: 'agent_flow',
      });

      const workflow = convertToWorkflow(params);

      expect(workflow.scenarioType).toBe('agent_flow');
      expect(workflow.steps[0].mcp).toBe('ai_analyze');
    });
  });

  describe('parseAIResponseToSteps', () => {
    it('应该解析 JSON 格式的 AI 响应', () => {
      const response = JSON.stringify({
        next: [
          { mcp: 'generate_image', args: { prompt: 'test' }, description: '生成图片' },
          { mcp: 'add_text', args: { text: 'hello' }, description: '添加文字' },
        ],
      });

      const steps = parseAIResponseToSteps(response);

      expect(steps).toHaveLength(2);
      expect(steps[0].mcp).toBe('generate_image');
      expect(steps[0].args.prompt).toBe('test');
      expect(steps[1].mcp).toBe('add_text');
    });

    it('应该解析 markdown code block 包裹的 JSON', () => {
      const response = `
这是 AI 的分析结果：

\`\`\`json
{
  "next": [
    { "mcp": "generate_video", "args": { "prompt": "sunset" }, "description": "生成视频" }
  ]
}
\`\`\`

以上是执行计划。
`;

      const steps = parseAIResponseToSteps(response);

      expect(steps).toHaveLength(1);
      expect(steps[0].mcp).toBe('generate_video');
    });

    it('应该为步骤生成正确的 ID', () => {
      const response = JSON.stringify({
        next: [
          { mcp: 'step1', args: {}, description: 'Step 1' },
          { mcp: 'step2', args: {}, description: 'Step 2' },
        ],
      });

      const steps = parseAIResponseToSteps(response);

      expect(steps[0].id).toBe('step-1');
      expect(steps[1].id).toBe('step-2');
    });

    it('应该使用 existingStepCount 计算步骤 ID', () => {
      const response = JSON.stringify({
        next: [{ mcp: 'new_step', args: {}, description: 'New Step' }],
      });

      const steps = parseAIResponseToSteps(response, 5);

      expect(steps[0].id).toBe('step-6');
    });

    it('应该为解析的步骤设置 pending 状态', () => {
      const response = JSON.stringify({
        next: [{ mcp: 'test', args: {}, description: 'Test' }],
      });

      const steps = parseAIResponseToSteps(response);

      expect(steps[0].status).toBe('pending');
    });

    it('应该在无效 JSON 时返回空数组', () => {
      const invalidResponse = 'This is not valid JSON';

      const steps = parseAIResponseToSteps(invalidResponse);

      expect(steps).toEqual([]);
    });

    it('应该在缺少 next 字段时返回空数组', () => {
      const response = JSON.stringify({ other: 'data' });

      const steps = parseAIResponseToSteps(response);

      expect(steps).toEqual([]);
    });
  });

  describe('updateStepStatus', () => {
    const createMockWorkflow = (): WorkflowDefinition => ({
      id: 'test-workflow',
      name: 'Test Workflow',
      description: 'Test',
      scenarioType: 'direct_generation',
      generationType: 'image',
      steps: [
        { id: 'step-1', mcp: 'test1', args: {}, description: 'Step 1', status: 'pending' },
        { id: 'step-2', mcp: 'test2', args: {}, description: 'Step 2', status: 'pending' },
        { id: 'step-3', mcp: 'test3', args: {}, description: 'Step 3', status: 'pending' },
      ],
      createdAt: Date.now(),
    });

    it('应该更新指定步骤的状态', () => {
      const workflow = createMockWorkflow();

      const updated = updateStepStatus(workflow, 'step-2', 'running');

      expect(updated.steps[1].status).toBe('running');
      expect(updated.steps[0].status).toBe('pending');
      expect(updated.steps[2].status).toBe('pending');
    });

    it('应该更新步骤的 result', () => {
      const workflow = createMockWorkflow();
      const result = { url: 'https://example.com/image.jpg' };

      const updated = updateStepStatus(workflow, 'step-1', 'completed', result);

      expect(updated.steps[0].status).toBe('completed');
      expect(updated.steps[0].result).toEqual(result);
    });

    it('应该更新步骤的 error', () => {
      const workflow = createMockWorkflow();
      const error = 'Generation failed';

      const updated = updateStepStatus(workflow, 'step-1', 'failed', undefined, error);

      expect(updated.steps[0].status).toBe('failed');
      expect(updated.steps[0].error).toBe(error);
    });

    it('应该更新步骤的 duration', () => {
      const workflow = createMockWorkflow();

      const updated = updateStepStatus(workflow, 'step-1', 'completed', undefined, undefined, 5000);

      expect(updated.steps[0].duration).toBe(5000);
    });

    it('应该保持不可变性 - 返回新对象', () => {
      const workflow = createMockWorkflow();

      const updated = updateStepStatus(workflow, 'step-1', 'running');

      expect(updated).not.toBe(workflow);
      expect(updated.steps).not.toBe(workflow.steps);
      expect(updated.steps[0]).not.toBe(workflow.steps[0]);
    });

    it('应该保持未修改步骤的引用', () => {
      const workflow = createMockWorkflow();

      const updated = updateStepStatus(workflow, 'step-1', 'running');

      // 未修改的步骤应该保持相同引用（浅拷贝优化）
      expect(updated.steps[1]).toBe(workflow.steps[1]);
      expect(updated.steps[2]).toBe(workflow.steps[2]);
    });
  });

  describe('addStepsToWorkflow', () => {
    const createMockWorkflow = (): WorkflowDefinition => ({
      id: 'test-workflow',
      name: 'Test Workflow',
      description: 'Test',
      scenarioType: 'agent_flow',
      generationType: 'image',
      steps: [{ id: 'step-1', mcp: 'analyze', args: {}, description: 'Analyze', status: 'completed' }],
      createdAt: Date.now(),
    });

    it('应该添加新步骤到工作流', () => {
      const workflow = createMockWorkflow();
      const newSteps: WorkflowStep[] = [
        { id: 'step-2', mcp: 'generate', args: {}, description: 'Generate', status: 'pending' },
      ];

      const updated = addStepsToWorkflow(workflow, newSteps);

      expect(updated.steps).toHaveLength(2);
      expect(updated.steps[1].id).toBe('step-2');
    });

    it('应该保持原有步骤不变', () => {
      const workflow = createMockWorkflow();
      const newSteps: WorkflowStep[] = [
        { id: 'step-2', mcp: 'new', args: {}, description: 'New', status: 'pending' },
      ];

      const updated = addStepsToWorkflow(workflow, newSteps);

      expect(updated.steps[0]).toEqual(workflow.steps[0]);
    });

    it('应该支持添加多个步骤', () => {
      const workflow = createMockWorkflow();
      const newSteps: WorkflowStep[] = [
        { id: 'step-2', mcp: 'step2', args: {}, description: 'Step 2', status: 'pending' },
        { id: 'step-3', mcp: 'step3', args: {}, description: 'Step 3', status: 'pending' },
        { id: 'step-4', mcp: 'step4', args: {}, description: 'Step 4', status: 'pending' },
      ];

      const updated = addStepsToWorkflow(workflow, newSteps);

      expect(updated.steps).toHaveLength(4);
    });

    it('应该保持不可变性', () => {
      const workflow = createMockWorkflow();
      const newSteps: WorkflowStep[] = [
        { id: 'step-2', mcp: 'new', args: {}, description: 'New', status: 'pending' },
      ];

      const updated = addStepsToWorkflow(workflow, newSteps);

      expect(updated).not.toBe(workflow);
      expect(updated.steps).not.toBe(workflow.steps);
    });
  });

  describe('getWorkflowStatus', () => {
    const createWorkflowWithSteps = (statuses: WorkflowStep['status'][]): WorkflowDefinition => ({
      id: 'test',
      name: 'Test',
      description: 'Test',
      scenarioType: 'direct_generation',
      generationType: 'image',
      steps: statuses.map((status, i) => ({
        id: `step-${i + 1}`,
        mcp: 'test',
        args: {},
        description: `Step ${i + 1}`,
        status,
      })),
      createdAt: Date.now(),
    });

    it('应该在所有步骤完成时返回 completed', () => {
      const workflow = createWorkflowWithSteps(['completed', 'completed', 'completed']);

      const status = getWorkflowStatus(workflow);

      expect(status.status).toBe('completed');
      expect(status.completedSteps).toBe(3);
      expect(status.totalSteps).toBe(3);
    });

    it('应该在有失败步骤时返回 failed', () => {
      const workflow = createWorkflowWithSteps(['completed', 'failed', 'pending']);

      const status = getWorkflowStatus(workflow);

      expect(status.status).toBe('failed');
    });

    it('应该在有运行中步骤时返回 running', () => {
      const workflow = createWorkflowWithSteps(['completed', 'running', 'pending']);

      const status = getWorkflowStatus(workflow);

      expect(status.status).toBe('running');
      expect(status.currentStep).toBeDefined();
      expect(status.currentStep?.id).toBe('step-2');
    });

    it('应该在所有步骤都是 pending 时返回 pending', () => {
      const workflow = createWorkflowWithSteps(['pending', 'pending', 'pending']);

      const status = getWorkflowStatus(workflow);

      expect(status.status).toBe('pending');
    });

    it('应该正确计算已完成步骤数', () => {
      const workflow = createWorkflowWithSteps(['completed', 'completed', 'running', 'pending']);

      const status = getWorkflowStatus(workflow);

      expect(status.completedSteps).toBe(2);
      expect(status.totalSteps).toBe(4);
    });

    it('应该返回当前运行中的步骤', () => {
      const workflow = createWorkflowWithSteps(['completed', 'running', 'pending']);

      const status = getWorkflowStatus(workflow);

      expect(status.currentStep).toBeDefined();
      expect(status.currentStep?.status).toBe('running');
    });

    it('应该在没有运行中步骤时返回第一个 pending 步骤', () => {
      const workflow = createWorkflowWithSteps(['completed', 'completed', 'pending']);

      const status = getWorkflowStatus(workflow);

      // 实现返回第一个 pending 步骤作为 currentStep
      expect(status.currentStep).toBeDefined();
      expect(status.currentStep?.status).toBe('pending');
    });
  });
});
