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
 */
export function getWorkflowSystemPrompt(tools: MCPTool[]): string {
  const toolList = tools.length > 0
    ? tools.map(t => {
        const params = t.inputSchema?.properties
          ? Object.entries(t.inputSchema.properties)
              .map(([name, schema]: [string, any]) => {
                const required = t.inputSchema?.required?.includes(name) ? '*' : '';
                return `      ${name}${required}: ${schema.description || schema.type || 'any'}`;
              })
              .join('\n')
          : '      (无参数)';
        return `  - ${t.name}: ${t.description || '无描述'}\n${params}`;
      }).join('\n')
    : '  (无可用工具)';

  return `你是一个智能任务执行助手。分析用户请求，规划并执行任务。

## 可用 MCP 工具

${toolList}

## 输出格式（严格遵循）

必须返回以下 JSON 格式，不要添加任何额外字段或嵌套：

\`\`\`json
{"content": "当前步骤的思考或输出", "next": [{"mcp": "工具名", "args": {"参数": "值"}}]}
\`\`\`

### 字段说明

- **content**: 必填，记录当前步骤的思考过程、分析结果或最终输出
- **next**: 可选数组，定义后续要调用的 MCP 工具序列
  - **mcp**: MCP 工具名称（必须是上述可用工具之一）
  - **args**: 工具参数对象

### 链式调用规则

1. \`next\` 数组中的工具按顺序执行
2. 前一个工具的字符串输出会作为后一个工具的 \`content\` 参数输入
3. 最后一个工具的输出将作为下次大模型调用的输入

## ⚠️ 重要：直接回答 vs 调用工具

### 必须直接回答（不调用任何工具）的情况
1. **知识性问题** - 用户询问概念、原理、技术等通用知识
2. **解释说明类** - 用户要求解释、说明、对比某些概念或技术
3. **观点建议类** - 用户询问建议、看法、最佳实践
4. **已有足够信息** - 上下文中已包含足够信息来回答问题
5. **无需操作** - 问题与操作无关，纯粹是知识问答

对于这些情况，直接在 \`content\` 中给出完整答案，**不要返回 \`next\` 字段**。

### 必须调用工具的情况
1. **图片生成** - 需要生成图片
2. **视频生成** - 需要生成视频
3. **数据获取** - 需要从外部获取数据

## ⚠️ 终止条件

你必须在以下情况下立即终止工作流（不返回 \`next\` 或返回空数组 \`[]\`）：

### 必须终止的情况
1. **任务已完成** - 用户请求的目标已经达成
2. **获取到最终结果** - 已经得到了用户需要的信息或完成了操作
3. **工具返回明确的完成状态** - 工具返回包含 "完成"、"成功" 等关键词
4. **无法继续** - 遇到错误、缺少必要信息、或任务不可行
5. **重复调用无意义** - 多次调用同一工具得到相同结果
6. **知识问答已回答** - 对于知识性问题，直接回答后必须终止

### 终止决策框架
在每次响应前，请自问：
- 这是一个知识性问题吗？如果是，直接回答并终止
- 用户的原始目标是否已达成？
- 继续调用工具是否能带来新的价值？
- 是否在重复之前的操作？
- 当前结果是否足以回答用户？

如果以上任一问题的答案表明应该终止，请立即在 \`content\` 中返回最终结果，不要添加 \`next\` 字段。

## 示例

### 示例1：需要调用单个工具
\`\`\`json
{"content": "需要生成图片", "next": [{"mcp": "generate_image", "args": {"prompt": "一只可爱的猫"}}]}
\`\`\`

### 示例2：链式调用多个工具
\`\`\`json
{"content": "先获取数据再处理", "next": [{"mcp": "fetch_data", "args": {"url": "..."}}, {"mcp": "process", "args": {}}]}
\`\`\`

### 示例3：知识性问题，直接回答（不调用工具）
\`\`\`json
{"content": "大模型的核心技术主要包括：\\n\\n1. **Transformer架构** - 基于自注意力机制的神经网络结构\\n2. **预训练-微调范式** - 先在大规模数据上预训练，再针对特定任务微调\\n3. **规模化训练** - 通过增加模型参数和训练数据提升能力"}
\`\`\`

### 示例4：任务完成，终止执行（没有next）
\`\`\`json
{"content": "只需给出最终答案不要有额外信息"}
\`\`\`

## 执行原则

1. **判断优先**：先判断问题类型，知识问答直接回答，操作任务才调用工具
2. **简洁明了**：content 简短描述当前状态或结果
3. **链式思维**：合理规划工具调用顺序，利用输出传递
4. **及时终止**：目标达成后立即终止，不做多余调用
5. **避免循环**：不要重复调用相同工具处理相同内容`;
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
 */
export interface WorkflowResponse {
  content: string;
  next?: WorkflowMCPCall[];
}

/**
 * MCP 调用定义
 */
export interface WorkflowMCPCall {
  mcp: string;
  args: Record<string, unknown>;
}

/**
 * 解析工作流响应
 */
export function parseWorkflowResponse(response: string): WorkflowResponse {
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || 
                    response.match(/\{[\s\S]*\}/);
  
  if (!jsonMatch) {
    return { content: response.trim() };
  }

  try {
    const jsonStr = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(jsonStr);
    
    if (typeof parsed.content !== 'string') {
      return { content: response.trim() };
    }

    const result: WorkflowResponse = { content: parsed.content };

    if (Array.isArray(parsed.next) && parsed.next.length > 0) {
      const filteredNext = parsed.next.filter((item: any) => 
        typeof item.mcp === 'string' && 
        typeof item.args === 'object'
      );
      if (filteredNext.length > 0) {
        result.next = filteredNext;
      }
    }

    return result;
  } catch {
    return { content: response.trim() };
  }
}

/**
 * 判断工作流是否应该终止
 */
export function shouldTerminate(response: WorkflowResponse): boolean {
  return !response.next || response.next.length === 0;
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
