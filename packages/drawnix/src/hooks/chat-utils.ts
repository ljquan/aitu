/**
 * Chat Utilities
 *
 * Shared utilities for chat handlers.
 */

import type { ChatMessage, WorkflowMessageData } from '../types/chat.types';
import type { Message, MessagePart } from '@llamaindex/chat-ui';
import { MessageStatus, MessageRole } from '../types/chat.types';
import { geminiSettings } from '../utils/settings-manager';
import { getModelType, IMAGE_MODELS } from '../constants/model-config';

// 工作流消息的特殊标记前缀
export const WORKFLOW_MESSAGE_PREFIX = '[[WORKFLOW_MESSAGE]]';

// 生成类工具列表
const GENERATION_TOOLS = ['generate_image', 'generate_video', 'generate_grid_image', 'generate_photo_wall'];

/**
 * 工具调用接口（通用，id 可选）
 */
export interface GenericToolCall {
  id?: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * 为生成工具注入正确的模型
 * 如果 AI 没有指定模型或指定了文本模型，使用默认的图片/视频模型
 */
export function injectModelForGenerationTool<T extends GenericToolCall>(toolCall: T): T {
  if (!GENERATION_TOOLS.includes(toolCall.name)) {
    return toolCall;
  }

  const args = { ...toolCall.arguments };
  const specifiedModel = args.model as string | undefined;

  let needsInjection = false;

  if (!specifiedModel) {
    needsInjection = true;
  } else {
    const modelType = getModelType(specifiedModel);
    const isVideoTool = toolCall.name === 'generate_video';

    if (isVideoTool && modelType !== 'video') {
      needsInjection = true;
    } else if (!isVideoTool && modelType !== 'image') {
      needsInjection = true;
    }
  }

  if (needsInjection) {
    const settings = geminiSettings.get();
    const isVideoTool = toolCall.name === 'generate_video';

    let targetModel: string;
    if (isVideoTool) {
      targetModel = settings.videoModelName || 'veo3';
    } else {
      targetModel = settings.imageModelName || IMAGE_MODELS[0]?.id || 'gemini-2.5-flash-image-vip';
    }

    args.model = targetModel;
  }

  return { ...toolCall, arguments: args };
}

/**
 * 将工作流数据序列化为 JSON 格式（用于发送给 API）
 *
 * 重要：必须返回符合系统提示词要求的 JSON 格式，否则模型在多轮对话中会"忘记"自己是代理角色
 * 格式：{"content": "...", "next": [...]}
 */
export function serializeWorkflowToContext(workflow: WorkflowMessageData): string {
  const contentParts: string[] = [];

  if (workflow.aiAnalysis) {
    contentParts.push(workflow.aiAnalysis);
  }

  const completedSteps = workflow.steps.filter(s => s.status === 'completed');
  const failedSteps = workflow.steps.filter(s => s.status === 'failed');

  if (completedSteps.length > 0 || failedSteps.length > 0) {
    const summaryParts: string[] = [];
    if (completedSteps.length > 0) {
      summaryParts.push(`成功执行 ${completedSteps.length} 个工具`);
    }
    if (failedSteps.length > 0) {
      summaryParts.push(`${failedSteps.length} 个工具执行失败`);
    }
    if (summaryParts.length > 0) {
      contentParts.push(`[执行结果: ${summaryParts.join('，')}]`);
    }
  }

  const nextArray = workflow.steps.map(step => {
    const simplifiedArgs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(step.args || {})) {
      if (key === 'context') continue;
      if (typeof value === 'string' && value.length > 200) {
        simplifiedArgs[key] = value.substring(0, 200) + '...';
      } else {
        simplifiedArgs[key] = value;
      }
    }
    return {
      mcp: step.mcp,
      args: simplifiedArgs,
    };
  });

  const response = {
    content: contentParts.join('\n') || `已完成任务: ${workflow.name}`,
    next: nextArray,
  };

  return JSON.stringify(response);
}

/**
 * Convert our ChatMessage to chat-ui Message format
 */
export function toChatUIMessage(msg: ChatMessage): Message {
  const parts: MessagePart[] = [{ type: 'text', text: msg.content }];

  if (msg.attachments && msg.attachments.length > 0) {
    for (const att of msg.attachments) {
      parts.push({
        type: 'data-file',
        data: {
          filename: att.name,
          mediaType: att.type,
          url: att.data,
        },
      });
    }
  }

  return {
    id: msg.id,
    role: msg.role === MessageRole.USER ? 'user' : 'assistant',
    parts,
  };
}

/**
 * Convert chat-ui Message to our ChatMessage format
 */
export function fromChatUIMessage(msg: Message, sessionId: string): ChatMessage {
  const textParts = msg.parts.filter((p) => p.type === 'text');
  const content = textParts.map((p) => (p as { type: 'text'; text: string }).text).join('');

  const fileParts = msg.parts.filter((p) => p.type === 'data-file');
  const attachments = fileParts.map((p, idx) => {
    const data = (p as any).data;
    return {
      id: `${msg.id}-att-${idx}`,
      name: data.filename,
      type: data.mediaType,
      size: 0,
      data: data.url,
      isBlob: false,
    };
  });

  return {
    id: msg.id,
    sessionId,
    role: msg.role === 'user' ? MessageRole.USER : MessageRole.ASSISTANT,
    content,
    timestamp: Date.now(),
    status: MessageStatus.SUCCESS,
    attachments: attachments.length > 0 ? attachments : undefined,
  };
}

/**
 * 将 ChatMessage 转换为适合发送给 API 的格式
 * 如果是工作流消息，将工作流数据序列化为可读上下文
 */
export function toApiMessage(msg: ChatMessage): ChatMessage {
  if (msg.workflow && msg.content.startsWith(WORKFLOW_MESSAGE_PREFIX)) {
    return {
      ...msg,
      content: serializeWorkflowToContext(msg.workflow),
    };
  }
  return msg;
}

/**
 * 从 Message 中提取文本内容
 */
export function extractMessageText(msg: Message): string {
  return msg.parts
    .filter((p) => p.type === 'text')
    .map((p) => (p as { type: 'text'; text: string }).text)
    .join('');
}
