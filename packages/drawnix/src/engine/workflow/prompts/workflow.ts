/**
 * 工作流驱动的简洁 Prompt
 * 输出格式：{"content": "输出内容", "next": [{"mcp": "mcp名称", "args": {}}]}
 */

import type { MCPTool } from '../types/mcp.types';

/**
 * 过滤 Markdown 中的图片（特别是 base64 编码的图片）
 */
export function filterMarkdownImages(text: string): string {
  if (!text) return text;
  
  let filtered = text;
  
  // 1. 移除 base64 图片
  filtered = filtered.replace(/!\[[^\]]*\]\(data:image\/[^)]+\)/g, '[图片已过滤]');
  
  // 2. 移除超长图片 URL
  filtered = filtered.replace(/!\[[^\]]*\]\(([^)]{50,})\)/g, '[图片已过滤]');
  
  // 3. 移除 HTML img 标签中的 base64 图片
  filtered = filtered.replace(/<img[^>]*src=["']data:image\/[^"']+["'][^>]*>/gi, '[图片已过滤]');
  
  // 4. 移除 HTML img 标签中超长的 src
  filtered = filtered.replace(/<img[^>]*src=["']([^"']{200,})["'][^>]*>/gi, '[图片已过滤]');
  
  return filtered;
}

/**
 * 生成工作流系统提示词
 * 采用简洁的 JSON 格式约束，支持链式 MCP 调用
 */
export function getWorkflowSystemPrompt(tools: MCPTool[]): string {
  const toolList = tools.length > 0
    ? tools.map(t => {
        const params = t.inputSchema?.properties
          ? Object.entries(t.inputSchema.properties)
              .map(([name, schema]: [string, any]) => {
                const required = t.inputSchema?.required?.includes(name) ? '*' : '';
                return `    ${name}${required}: ${schema.description || schema.type || 'any'}`;
              })
              .join('\n')
          : '    (无参数)';
        return `- ${t.name}: ${t.description || '无描述'}\n${params}`;
      }).join('\n')
    : '(无可用工具)';

  return `你是智能任务执行助手。分析请求，规划并执行任务。

# 可用工具
${toolList}

# 输出格式（严格 JSON）

**只允许两个字段**：\`content\` 和 \`next\`，禁止任何额外字段。

\`\`\`json
{"content": "思考或输出", "next": [{"mcp": "工具名", "args": {}}]}
\`\`\`

## 字段规范

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| content | string | ✅ | 当前步骤的思考、分析或最终输出 |
| next | array | ❌ | MCP 工具调用序列，省略或空数组表示终止 |

## next 数组元素格式

\`\`\`json
{"mcp": "工具名称", "args": {"参数名": "参数值"}}
\`\`\`

# 链式调用规则

1. \`next\` 数组按索引顺序执行
2. **输出传递**：前一个工具的输出自动注入后一个工具的 \`content\` 参数
3. **递归输入**：最后一个工具的输出作为下次大模型调用的输入

# 终止条件

**以下情况必须终止**（不返回 \`next\` 或返回 \`[]\`）：
- 任务已完成
- 知识性问题已回答
- 工具返回最终结果
- 遇到错误或无法继续
- 重复调用无意义

# 示例

## ✅ 正确示例

**调用单个工具**：
\`\`\`json
{"content": "生成一张猫的图片", "next": [{"mcp": "generate_image", "args": {"prompt": "一只可爱的猫"}}]}
\`\`\`

**链式调用**：
\`\`\`json
{"content": "先生成图片再插入画布", "next": [{"mcp": "generate_image", "args": {"prompt": "风景画"}}, {"mcp": "insert_to_canvas", "args": {"type": "image"}}]}
\`\`\`

**直接回答（终止）**：
\`\`\`json
{"content": "Transformer 是一种基于自注意力机制的神经网络架构，广泛应用于 NLP 和多模态任务。"}
\`\`\`

**任务完成（终止）**：
\`\`\`json
{"content": "图片已成功生成并插入画布。"}
\`\`\`

## ❌ 错误示例

**错误：添加额外字段**
\`\`\`json
{"content": "...", "next": [...], "status": "success", "thinking": "..."}
\`\`\`

**错误：嵌套结构**
\`\`\`json
{"response": {"content": "...", "next": [...]}}
\`\`\`

**错误：next 格式错误**
\`\`\`json
{"content": "...", "next": [{"tool": "xxx", "params": {}}]}
\`\`\`

# 执行原则

1. **格式优先**：严格遵循 JSON 格式，只有 content 和 next
2. **判断优先**：知识问答直接回答，操作任务才调用工具
3. **及时终止**：目标达成立即终止，不做多余调用
4. **链式思维**：合理规划工具顺序，利用输出传递`;
}

/**
 * 用户提示词选项
 */
export interface UserPromptOptions {
  userRequest: string;
  previousOutput?: string;
  pageContext?: string;
  warningMessage?: string;
  currentIteration?: number;
  maxIterations?: number;
}

/**
 * 生成工作流用户提示词
 */
export function getWorkflowUserPrompt(
  userRequestOrOptions: string | UserPromptOptions,
  previousOutput?: string,
  pageContext?: string
): string {
  const options: UserPromptOptions = typeof userRequestOrOptions === 'string'
    ? { userRequest: userRequestOrOptions, previousOutput, pageContext }
    : userRequestOrOptions;

  const parts: string[] = [];

  if (options.warningMessage) {
    parts.push(options.warningMessage);
  }

  if (options.currentIteration !== undefined && options.maxIterations !== undefined) {
    const remaining = options.maxIterations - options.currentIteration;
    if (remaining <= 5) {
      parts.push(`⏱️ **剩余迭代次数: ${remaining}/${options.maxIterations}** - 请尽快完成任务或终止`);
    }
  }

  parts.push(`## 用户请求\n${options.userRequest}`);

  if (options.previousOutput) {
    const truncated = options.previousOutput.length > 30000
      ? options.previousOutput.substring(0, 20000) + '...(已截断)'
      : options.previousOutput;
    parts.push(`## 上一步输出\n${truncated}`);
  }

  if (options.pageContext) {
    const truncated = options.pageContext.length > 20000
      ? options.pageContext.substring(0, 10000) + '...(已截断)'
      : options.pageContext;
    parts.push(`## 上下文\n${truncated}`);
  }

  parts.push('请分析并返回 JSON 格式的响应。如果任务已完成，请不要返回 next 字段。');

  return parts.join('\n\n');
}

/**
 * 工作流响应类型
 * 
 * 大模型返回的 JSON 响应格式，只允许两个字段：
 * - content: 必填，当前步骤的思考或输出
 * - next: 可选，MCP 工具调用序列
 * 
 * @example
 * // 调用工具
 * { content: "生成图片", next: [{ mcp: "generate_image", args: { prompt: "猫" } }] }
 * 
 * // 终止（无 next）
 * { content: "任务完成" }
 */
export interface WorkflowResponse {
  /** 当前步骤的思考、分析或最终输出（必填） */
  content: string;
  /** MCP 工具调用序列，省略或空数组表示终止 */
  next?: WorkflowMCPCall[];
}

/**
 * MCP 调用定义
 * 
 * 定义单个 MCP 工具调用的格式：
 * - mcp: 工具名称
 * - args: 工具参数对象
 * 
 * @example
 * { mcp: "generate_image", args: { prompt: "一只可爱的猫", style: "realistic" } }
 */
export interface WorkflowMCPCall {
  /** MCP 工具名称 */
  mcp: string;
  /** 工具参数对象 */
  args: Record<string, unknown>;
}

/**
 * 解析结果类型
 */
export interface ParseResult {
  /** 是否解析成功 */
  success: boolean;
  /** 解析后的响应 */
  response: WorkflowResponse;
  /** 错误信息（解析失败时） */
  error?: string;
  /** 原始 JSON 字符串 */
  rawJson?: string;
}

/**
 * 从响应中提取 JSON 字符串
 * 支持多种格式：```json 代码块、裸 JSON、嵌套 JSON
 */
function extractJsonString(response: string): string | null {
  // 1. 优先匹配 ```json 代码块
  const codeBlockMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // 2. 匹配裸 JSON 对象（从第一个 { 到最后一个 }）
  const firstBrace = response.indexOf('{');
  const lastBrace = response.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return response.substring(firstBrace, lastBrace + 1);
  }

  return null;
}

/**
 * 校验 MCP 调用格式
 */
function isValidMCPCall(item: unknown): item is WorkflowMCPCall {
  if (!item || typeof item !== 'object') return false;
  const obj = item as Record<string, unknown>;
  return (
    typeof obj.mcp === 'string' &&
    obj.mcp.length > 0 &&
    typeof obj.args === 'object' &&
    obj.args !== null
  );
}

/**
 * 校验响应格式是否符合规范
 * 只允许 content 和 next 两个字段
 */
function validateResponseFormat(parsed: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!parsed || typeof parsed !== 'object') {
    errors.push('响应必须是 JSON 对象');
    return { valid: false, errors };
  }

  const obj = parsed as Record<string, unknown>;

  // 检查必填字段 content
  if (!('content' in obj)) {
    errors.push('缺少必填字段 content');
  } else if (typeof obj.content !== 'string') {
    errors.push('content 必须是字符串');
  }

  // 检查 next 字段格式
  if ('next' in obj && obj.next !== undefined) {
    if (!Array.isArray(obj.next)) {
      errors.push('next 必须是数组');
    } else {
      obj.next.forEach((item, index) => {
        if (!isValidMCPCall(item)) {
          errors.push(`next[${index}] 格式错误，必须包含 mcp(string) 和 args(object)`);
        }
      });
    }
  }

  // 检查是否有额外字段（警告但不阻止）
  const allowedFields = ['content', 'next'];
  const extraFields = Object.keys(obj).filter(k => !allowedFields.includes(k));
  if (extraFields.length > 0) {
    errors.push(`存在额外字段将被忽略: ${extraFields.join(', ')}`);
  }

  return { valid: errors.filter(e => !e.startsWith('存在额外字段')).length === 0, errors };
}

/**
 * 解析工作流响应
 * 
 * 从大模型的原始响应中解析出结构化的 WorkflowResponse。
 * 支持多种输入格式，具有容错能力。
 * 
 * @param response - 大模型的原始响应字符串
 * @returns 解析后的 WorkflowResponse
 * 
 * @example
 * // 正常 JSON
 * parseWorkflowResponse('{"content": "hello", "next": []}')
 * // => { content: "hello" }
 * 
 * // 带代码块
 * parseWorkflowResponse('```json\n{"content": "test"}\n```')
 * // => { content: "test" }
 * 
 * // 纯文本（降级处理）
 * parseWorkflowResponse('这是一段纯文本')
 * // => { content: "这是一段纯文本" }
 */
export function parseWorkflowResponse(response: string): WorkflowResponse {
  const jsonStr = extractJsonString(response);

  if (!jsonStr) {
    // 无法提取 JSON，将整个响应作为 content
    return { content: response.trim() };
  }

  try {
    const parsed = JSON.parse(jsonStr);

    // 校验格式
    const validation = validateResponseFormat(parsed);
    if (!validation.valid) {
      console.warn('[WorkflowParser] 格式校验失败:', validation.errors);
      // 尝试容错处理
      if (typeof parsed.content === 'string') {
        return { content: parsed.content };
      }
      return { content: response.trim() };
    }

    // 构建结果，只提取 content 和 next
    const result: WorkflowResponse = { content: parsed.content };

    if (Array.isArray(parsed.next) && parsed.next.length > 0) {
      const validCalls = parsed.next.filter(isValidMCPCall);
      if (validCalls.length > 0) {
        result.next = validCalls;
      }
    }

    return result;
  } catch (error) {
    console.warn('[WorkflowParser] JSON 解析失败:', error);
    return { content: response.trim() };
  }
}

/**
 * 解析工作流响应（带详细结果）
 * 
 * 与 parseWorkflowResponse 类似，但返回更详细的解析结果，
 * 包括成功/失败状态、错误信息等。
 * 
 * @param response - 大模型的原始响应字符串
 * @returns 详细的解析结果
 */
export function parseWorkflowResponseDetailed(response: string): ParseResult {
  const jsonStr = extractJsonString(response);

  if (!jsonStr) {
    return {
      success: false,
      response: { content: response.trim() },
      error: '无法从响应中提取 JSON',
    };
  }

  try {
    const parsed = JSON.parse(jsonStr);
    const validation = validateResponseFormat(parsed);

    if (!validation.valid) {
      return {
        success: false,
        response: { content: typeof parsed.content === 'string' ? parsed.content : response.trim() },
        error: validation.errors.join('; '),
        rawJson: jsonStr,
      };
    }

    const result: WorkflowResponse = { content: parsed.content };
    if (Array.isArray(parsed.next) && parsed.next.length > 0) {
      const validCalls = parsed.next.filter(isValidMCPCall);
      if (validCalls.length > 0) {
        result.next = validCalls;
      }
    }

    return {
      success: true,
      response: result,
      rawJson: jsonStr,
    };
  } catch (error) {
    return {
      success: false,
      response: { content: response.trim() },
      error: `JSON 解析失败: ${error instanceof Error ? error.message : String(error)}`,
      rawJson: jsonStr,
    };
  }
}

/**
 * 终止原因枚举
 */
export enum TerminationReason {
  /** 无 next 字段 */
  NO_NEXT = 'no_next',
  /** next 为空数组 */
  EMPTY_NEXT = 'empty_next',
  /** 任务完成关键词 */
  TASK_COMPLETED = 'task_completed',
  /** 继续执行 */
  CONTINUE = 'continue',
}

/**
 * 终止检测结果
 */
export interface TerminationCheckResult {
  /** 是否应该终止 */
  shouldTerminate: boolean;
  /** 终止原因 */
  reason: TerminationReason;
  /** 详细描述 */
  description?: string;
}

/**
 * 判断工作流是否应该终止
 * 
 * 终止条件：
 * 1. next 字段不存在
 * 2. next 为空数组 []
 * 3. next 中没有有效的 MCP 调用
 * 
 * @param response - 解析后的工作流响应
 * @returns 是否应该终止
 */
export function shouldTerminate(response: WorkflowResponse): boolean {
  return !response.next || response.next.length === 0;
}

/**
 * 详细的终止条件检测
 * 
 * 提供更详细的终止原因分析，用于调试和日志记录。
 * 
 * @param response - 解析后的工作流响应
 * @returns 终止检测结果
 */
export function checkTermination(response: WorkflowResponse): TerminationCheckResult {
  // 检查 next 字段是否存在
  if (response.next === undefined) {
    return {
      shouldTerminate: true,
      reason: TerminationReason.NO_NEXT,
      description: 'next 字段不存在，工作流终止',
    };
  }

  // 检查 next 是否为空数组
  if (Array.isArray(response.next) && response.next.length === 0) {
    return {
      shouldTerminate: true,
      reason: TerminationReason.EMPTY_NEXT,
      description: 'next 为空数组，工作流终止',
    };
  }

  // 检查 content 中是否包含任务完成的关键词
  const completionKeywords = [
    '任务完成', '执行完成', '操作完成', '处理完成',
    '已完成', '已结束', '已终止',
    'completed', 'finished', 'done',
  ];
  
  const contentLower = response.content.toLowerCase();
  const hasCompletionKeyword = completionKeywords.some(kw => 
    contentLower.includes(kw.toLowerCase())
  );

  // 如果有完成关键词但仍有 next，记录但不强制终止
  if (hasCompletionKeyword && response.next && response.next.length > 0) {
    console.warn('[Termination] content 包含完成关键词但仍有 next 调用，继续执行');
  }

  // 有有效的 next 调用，继续执行
  return {
    shouldTerminate: false,
    reason: TerminationReason.CONTINUE,
    description: `继续执行 ${response.next?.length || 0} 个 MCP 调用`,
  };
}

/**
 * 清理最终输出内容
 */
export function cleanFinalOutput(content: string): string {
  if (!content) return content;
  
  let cleaned = content;
  
  const prefixPatterns = [
    /^用户(询问|请求|要求|想要|希望|需要)[^。]*。\s*/,
    /^根据用户(的)?(请求|要求|需求)[^。]*。\s*/,
    /^针对用户(的)?(问题|请求)[^。]*。\s*/,
  ];
  
  for (const pattern of prefixPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  const suffixPatterns = [
    /[。，]?\s*(任务已完成|执行完成|操作完成|处理完成)[，。]?\s*(无需|不需要|没有)(进一步|更多|其他)(操作|处理|动作)[。]?\s*$/,
    /[。，]?\s*(任务|工作流?|执行)已(完成|结束|终止)[。]?\s*$/,
    /[。，]?\s*无需(进一步|更多|其他)(操作|处理|动作)[。]?\s*$/,
    /[。，]?\s*不需要(继续|进一步)(执行|操作|处理)[。]?\s*$/,
  ];
  
  for (const pattern of suffixPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  cleaned = cleaned.trim();
  
  return cleaned || content;
}
