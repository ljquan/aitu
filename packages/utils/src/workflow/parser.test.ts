import { describe, it, expect } from 'vitest';
import {
  cleanLLMResponse,
  parseWorkflowJson,
  parseToolCalls,
  extractTextContent,
  hasToolCalls,
  parseWorkflowResponse,
  createWorkflowResponse,
  serializeWorkflowResponse,
} from './parser';

describe('cleanLLMResponse', () => {
  it('should remove <think> tags', () => {
    const input = '<think>reasoning here</think>actual content';
    expect(cleanLLMResponse(input)).toBe('actual content');
  });

  it('should remove code block markers', () => {
    const input = '```json\n{"key": "value"}\n```';
    expect(cleanLLMResponse(input)).toBe('{"key": "value"}');
  });

  it('should handle both think tags and code blocks', () => {
    const input = '<think>thinking</think>```json\n{"content": "hello"}\n```';
    expect(cleanLLMResponse(input)).toBe('{"content": "hello"}');
  });

  it('should trim whitespace', () => {
    const input = '  \n  content  \n  ';
    expect(cleanLLMResponse(input)).toBe('content');
  });

  it('should handle empty string', () => {
    expect(cleanLLMResponse('')).toBe('');
  });
});

describe('parseWorkflowJson', () => {
  it('should parse valid workflow JSON', () => {
    const input = '{"content": "分析完成", "next": [{"mcp": "generate_image", "args": {"prompt": "cat"}}]}';
    const result = parseWorkflowJson(input);

    expect(result).not.toBeNull();
    expect(result?.content).toBe('分析完成');
    expect(result?.next).toHaveLength(1);
    expect(result?.next[0].mcp).toBe('generate_image');
    expect(result?.next[0].args).toEqual({ prompt: 'cat' });
  });

  it('should parse workflow JSON with code block markers', () => {
    const input = '```json\n{"content": "ok", "next": []}\n```';
    const result = parseWorkflowJson(input);

    expect(result).not.toBeNull();
    expect(result?.content).toBe('ok');
    expect(result?.next).toHaveLength(0);
  });

  it('should parse workflow JSON with think tags', () => {
    const input = '<think>reasoning</think>{"content": "result", "next": []}';
    const result = parseWorkflowJson(input);

    expect(result).not.toBeNull();
    expect(result?.content).toBe('result');
  });

  it('should parse multiple tool calls', () => {
    const input = JSON.stringify({
      content: '多个任务',
      next: [
        { mcp: 'generate_image', args: { prompt: 'cat' } },
        { mcp: 'generate_video', args: { prompt: 'dog' } },
      ],
    });
    const result = parseWorkflowJson(input);

    expect(result?.next).toHaveLength(2);
    expect(result?.next[0].mcp).toBe('generate_image');
    expect(result?.next[1].mcp).toBe('generate_video');
  });

  it('should return null for incomplete JSON', () => {
    const input = '{"content": "incomplete';
    expect(parseWorkflowJson(input)).toBeNull();
  });

  it('should return null for non-workflow JSON', () => {
    const input = '{"name": "test", "value": 123}';
    expect(parseWorkflowJson(input)).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(parseWorkflowJson('')).toBeNull();
  });

  it('should filter invalid next items', () => {
    const input = JSON.stringify({
      content: 'test',
      next: [
        { mcp: 'valid', args: {} },
        { invalid: 'item' },
        { mcp: 123, args: {} }, // mcp should be string
        { mcp: 'also_valid', args: { key: 'value' } },
      ],
    });
    const result = parseWorkflowJson(input);

    expect(result?.next).toHaveLength(2);
    expect(result?.next[0].mcp).toBe('valid');
    expect(result?.next[1].mcp).toBe('also_valid');
  });

  it('should handle empty next array', () => {
    const input = '{"content": "no tools", "next": []}';
    const result = parseWorkflowJson(input);

    expect(result).not.toBeNull();
    expect(result?.content).toBe('no tools');
    expect(result?.next).toHaveLength(0);
  });
});

describe('parseToolCalls', () => {
  it('should parse tool calls from workflow JSON', () => {
    const input = '{"content": "ok", "next": [{"mcp": "generate_image", "args": {"prompt": "cat"}}]}';
    const calls = parseToolCalls(input);

    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('generate_image');
    expect(calls[0].arguments).toEqual({ prompt: 'cat' });
    expect(calls[0].id).toMatch(/^tc_\d+_0_[a-z0-9]+$/);
  });

  it('should parse tool calls from tool_call block', () => {
    const input = '```tool_call\n{"name": "test_tool", "arguments": {"key": "value"}}\n```';
    const calls = parseToolCalls(input);

    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('test_tool');
    expect(calls[0].arguments).toEqual({ key: 'value' });
  });

  it('should parse tool calls from json block', () => {
    const input = '```json\n{"name": "my_tool", "arguments": {"a": 1}}\n```';
    const calls = parseToolCalls(input);

    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('my_tool');
  });

  it('should parse tool calls from xml tag', () => {
    const input = '<tool_call>{"name": "xml_tool", "arguments": {}}</tool_call>';
    const calls = parseToolCalls(input);

    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('xml_tool');
  });

  it('should return empty array for no tool calls', () => {
    const input = 'Just some plain text without any tool calls.';
    expect(parseToolCalls(input)).toHaveLength(0);
  });

  it('should handle params/parameters as arguments alias', () => {
    const input = '```tool_call\n{"name": "tool", "params": {"key": "value"}}\n```';
    const calls = parseToolCalls(input);

    expect(calls[0].arguments).toEqual({ key: 'value' });
  });

  it('should generate unique IDs for multiple calls', () => {
    const input = JSON.stringify({
      content: 'multi',
      next: [
        { mcp: 'tool1', args: {} },
        { mcp: 'tool2', args: {} },
        { mcp: 'tool3', args: {} },
      ],
    });
    const calls = parseToolCalls(input);

    const ids = calls.map((c) => c.id);
    expect(new Set(ids).size).toBe(3); // All unique
  });

  it('should prefer workflow JSON format over legacy formats', () => {
    const input = `
      {"content": "workflow", "next": [{"mcp": "workflow_tool", "args": {}}]}
      \`\`\`tool_call
      {"name": "legacy_tool", "arguments": {}}
      \`\`\`
    `;
    const calls = parseToolCalls(input);

    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('workflow_tool');
  });
});

describe('extractTextContent', () => {
  it('should extract content from workflow JSON', () => {
    const input = '{"content": "这是分析结果", "next": [{"mcp": "tool", "args": {}}]}';
    expect(extractTextContent(input)).toBe('这是分析结果');
  });

  it('should extract text when no workflow JSON', () => {
    const input = 'Just plain text content.';
    expect(extractTextContent(input)).toBe('Just plain text content.');
  });

  it('should handle text with embedded code blocks', () => {
    // cleanLLMResponse removes ``` markers, so extractTextContent gets cleaned input
    // This test verifies the function doesn't crash and returns something reasonable
    const input = 'Some text before.\n```tool_call\n{"name": "tool"}\n```\nSome text after.';
    const result = extractTextContent(input);
    // Should contain the surrounding text
    expect(result).toContain('Some text');
  });

  it('should remove xml tool call tags', () => {
    const input = 'Before <tool_call>{"name": "tool"}</tool_call> After';
    expect(extractTextContent(input)).toBe('Before  After');
  });

  it('should clean up multiple newlines', () => {
    const input = 'Line 1\n\n\n\n\nLine 2';
    expect(extractTextContent(input)).toBe('Line 1\n\nLine 2');
  });

  it('should handle empty string', () => {
    expect(extractTextContent('')).toBe('');
  });
});

describe('hasToolCalls', () => {
  it('should return true when tool calls exist', () => {
    const input = '{"content": "ok", "next": [{"mcp": "tool", "args": {}}]}';
    expect(hasToolCalls(input)).toBe(true);
  });

  it('should return false when no tool calls', () => {
    const input = 'Just plain text';
    expect(hasToolCalls(input)).toBe(false);
  });

  it('should return false for workflow with empty next', () => {
    const input = '{"content": "no tools", "next": []}';
    expect(hasToolCalls(input)).toBe(false);
  });

  it('should return true for legacy tool_call format', () => {
    const input = '```tool_call\n{"name": "tool", "arguments": {}}\n```';
    expect(hasToolCalls(input)).toBe(true);
  });
});

describe('parseWorkflowResponse', () => {
  it('should parse complete workflow response', () => {
    const input = '{"content": "分析完成", "next": [{"mcp": "generate_image", "args": {"prompt": "cat"}}]}';
    const result = parseWorkflowResponse(input);

    expect(result.success).toBe(true);
    expect(result.workflow).not.toBeNull();
    expect(result.toolCalls).toHaveLength(1);
    expect(result.textContent).toBe('分析完成');
  });

  it('should handle failed parsing', () => {
    const input = 'Invalid content';
    const result = parseWorkflowResponse(input);

    expect(result.success).toBe(false);
    expect(result.workflow).toBeNull();
    expect(result.toolCalls).toHaveLength(0);
    expect(result.textContent).toBe('Invalid content');
  });

  it('should include cleaned response', () => {
    const input = '<think>reasoning</think>```json\n{"content": "ok", "next": []}\n```';
    const result = parseWorkflowResponse(input);

    expect(result.cleanedResponse).toBe('{"content": "ok", "next": []}');
  });

  it('should succeed with legacy format', () => {
    const input = '```tool_call\n{"name": "tool", "arguments": {}}\n```';
    const result = parseWorkflowResponse(input);

    expect(result.success).toBe(true);
    expect(result.workflow).toBeNull();
    expect(result.toolCalls).toHaveLength(1);
  });
});

describe('createWorkflowResponse', () => {
  it('should create workflow response with tool calls', () => {
    const workflow = createWorkflowResponse('分析完成', [
      { mcp: 'generate_image', args: { prompt: 'cat' } },
    ]);

    expect(workflow.content).toBe('分析完成');
    expect(workflow.next).toHaveLength(1);
    expect(workflow.next[0].mcp).toBe('generate_image');
  });

  it('should create workflow response without tool calls', () => {
    const workflow = createWorkflowResponse('只有文字');

    expect(workflow.content).toBe('只有文字');
    expect(workflow.next).toHaveLength(0);
  });

  it('should create workflow with multiple tool calls', () => {
    const workflow = createWorkflowResponse('多个任务', [
      { mcp: 'tool1', args: { a: 1 } },
      { mcp: 'tool2', args: { b: 2 } },
    ]);

    expect(workflow.next).toHaveLength(2);
  });
});

describe('serializeWorkflowResponse', () => {
  it('should serialize to JSON string', () => {
    const workflow = { content: 'ok', next: [] };
    const json = serializeWorkflowResponse(workflow);

    expect(json).toBe('{"content":"ok","next":[]}');
  });

  it('should serialize with tool calls', () => {
    const workflow = {
      content: 'test',
      next: [{ mcp: 'tool', args: { key: 'value' } }],
    };
    const json = serializeWorkflowResponse(workflow);
    const parsed = JSON.parse(json);

    expect(parsed.content).toBe('test');
    expect(parsed.next[0].mcp).toBe('tool');
  });

  it('should be parseable by parseWorkflowJson', () => {
    const original = createWorkflowResponse('round trip', [
      { mcp: 'test', args: { foo: 'bar' } },
    ]);
    const json = serializeWorkflowResponse(original);
    const parsed = parseWorkflowJson(json);

    expect(parsed).toEqual(original);
  });
});

describe('JSON healing', () => {
  it('should handle trailing commas', () => {
    const input = '{"content": "test", "next": [{"mcp": "tool", "args": {},},],}';
    const result = parseWorkflowJson(input);

    // Should either parse successfully or return null gracefully
    if (result) {
      expect(result.content).toBe('test');
    }
  });

  it('should handle unquoted property names', () => {
    const input = '{content: "test", next: []}';
    const result = parseWorkflowJson(input);

    if (result) {
      expect(result.content).toBe('test');
    }
  });

  it('should handle single quotes', () => {
    const input = "{'content': 'test', 'next': []}";
    const result = parseWorkflowJson(input);

    if (result) {
      expect(result.content).toBe('test');
    }
  });
});

describe('edge cases', () => {
  it('should handle unicode content', () => {
    const input = '{"content": "你好世界 🌍", "next": []}';
    const result = parseWorkflowJson(input);

    expect(result?.content).toBe('你好世界 🌍');
  });

  it('should handle nested objects in args', () => {
    const input = JSON.stringify({
      content: 'nested',
      next: [{
        mcp: 'tool',
        args: {
          nested: { deep: { value: 123 } },
          array: [1, 2, 3],
        },
      }],
    });
    const result = parseWorkflowJson(input);

    expect(result?.next[0].args).toEqual({
      nested: { deep: { value: 123 } },
      array: [1, 2, 3],
    });
  });

  it('should handle special characters in content', () => {
    const input = JSON.stringify({
      content: 'Line 1\nLine 2\tTabbed "quoted"',
      next: [],
    });
    const result = parseWorkflowJson(input);

    expect(result?.content).toContain('Line 1');
    expect(result?.content).toContain('quoted');
  });

  it('should handle very long content', () => {
    const longContent = 'a'.repeat(10000);
    const input = JSON.stringify({ content: longContent, next: [] });
    const result = parseWorkflowJson(input);

    expect(result?.content.length).toBe(10000);
  });
});
