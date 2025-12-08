/**
 * Chat Models Configuration
 *
 * Predefined chat models for the model selector.
 * All models use OpenAI-compatible API format.
 */

/** Model provider enum */
export enum ModelProvider {
  OPENAI = 'OPENAI',
  ANTHROPIC = 'ANTHROPIC',
  DEEPSEEK = 'DEEPSEEK',
  GOOGLE = 'GOOGLE',
}

/** Model badge types */
export type ModelBadge = 'NEW' | 'Fast' | 'Multimodal' | 'Reasoning' | 'Pro' | 'Economic';

/** Model configuration */
export interface ChatModel {
  id: string;
  name: string;
  description: string;
  provider: ModelProvider;
  badges?: ModelBadge[];
  maxTokens?: number;
  supportsVision?: boolean;
}

/** Provider display names */
export const PROVIDER_NAMES: Record<ModelProvider, string> = {
  [ModelProvider.OPENAI]: 'OpenAI',
  [ModelProvider.ANTHROPIC]: 'Anthropic',
  [ModelProvider.DEEPSEEK]: 'DeepSeek',
  [ModelProvider.GOOGLE]: 'Google',
};

/** Predefined chat models */
export const CHAT_MODELS: ChatModel[] = [
  // OpenAI Models
  {
    id: 'gpt-4o-image',
    name: 'GPT-4o Image',
    description: 'OpenAI 多模态图像模型',
    provider: ModelProvider.OPENAI,
    badges: ['Multimodal'],
    maxTokens: 128000,
    supportsVision: true,
  },
  {
    id: 'gpt-5.1',
    name: 'GPT-5.1',
    description: '最新旗舰模型',
    provider: ModelProvider.OPENAI,
    badges: ['NEW'],
    maxTokens: 128000,
  },
  {
    id: 'gpt-5.1-thinking',
    name: 'GPT-5.1 Thinking',
    description: '推理增强版本',
    provider: ModelProvider.OPENAI,
    maxTokens: 128000,
  },
  {
    id: 'gpt-5.1-all',
    name: 'GPT-5.1 All',
    description: '全功能版本',
    provider: ModelProvider.OPENAI,
    maxTokens: 128000,
  },
  {
    id: 'gpt-5',
    name: 'GPT-5',
    description: '通用模型',
    provider: ModelProvider.OPENAI,
    maxTokens: 128000,
  },
  {
    id: 'gpt-5-all',
    name: 'GPT-5 All',
    description: '全功能版本',
    provider: ModelProvider.OPENAI,
    maxTokens: 128000,
  },
  // Google Models
  {
    id: 'gemini-3-pro-image-preview-2k',
    name: 'Gemini 3 Pro Image Preview 2K',
    description: 'Google 图像生成模型 (2K分辨率)',
    provider: ModelProvider.GOOGLE,
    badges: ['NEW', 'Multimodal'],
    maxTokens: 2000000,
    supportsVision: true,
  },
  {
    id: 'gemini-3-pro-image-preview',
    name: 'Gemini 3 Pro Image Preview',
    description: 'Google 图像生成模型',
    provider: ModelProvider.GOOGLE,
    badges: ['NEW', 'Multimodal'],
    maxTokens: 2000000,
    supportsVision: true,
  },
  {
    id: 'gemini-3-pro-preview',
    name: 'Gemini 3 Pro Preview',
    description: 'Google 最新预览版',
    provider: ModelProvider.GOOGLE,
    badges: ['NEW'],
    maxTokens: 2000000,
  },
  {
    id: 'gemini-3-pro-preview-thinking',
    name: 'Gemini 3 Pro Preview Thinking',
    description: '推理增强版本',
    provider: ModelProvider.GOOGLE,
    maxTokens: 2000000,
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    description: '专业版模型',
    provider: ModelProvider.GOOGLE,
    maxTokens: 2000000,
  },
  {
    id: 'gemini-2.5-pro-all',
    name: 'Gemini 2.5 Pro All',
    description: '全功能版本',
    provider: ModelProvider.GOOGLE,
    maxTokens: 2000000,
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    description: '快速模型',
    provider: ModelProvider.GOOGLE,
    maxTokens: 1000000,
  },
  // DeepSeek Models
  {
    id: 'deepseek-v3.2',
    name: 'DeepSeek V3.2',
    description: '最新版本',
    provider: ModelProvider.DEEPSEEK,
    badges: ['NEW'],
    maxTokens: 64000,
  },
  {
    id: 'deepseek-v3.2-thinking',
    name: 'DeepSeek V3.2 Thinking',
    description: '推理增强版本',
    provider: ModelProvider.DEEPSEEK,
    maxTokens: 64000,
  },
  {
    id: 'deepseek-v3.1',
    name: 'DeepSeek V3.1',
    description: '稳定版本',
    provider: ModelProvider.DEEPSEEK,
    maxTokens: 64000,
  },
  {
    id: 'deepseek-v3',
    name: 'DeepSeek V3',
    description: '通用模型',
    provider: ModelProvider.DEEPSEEK,
    maxTokens: 64000,
  },
  {
    id: 'deepseek-r1',
    name: 'DeepSeek R1',
    description: '推理模型',
    provider: ModelProvider.DEEPSEEK,
    maxTokens: 64000,
  },
  // Anthropic Models
  {
    id: 'claude-opus-4-5-20251101',
    name: 'Claude Opus 4.5',
    description: 'Anthropic 旗舰模型',
    provider: ModelProvider.ANTHROPIC,
    badges: ['NEW'],
    maxTokens: 200000,
  },
  {
    id: 'claude-sonnet-4-5-20250929',
    name: 'Claude Sonnet 4.5',
    description: '平衡模型',
    provider: ModelProvider.ANTHROPIC,
    maxTokens: 200000,
  },
  {
    id: 'claude-sonnet-4-5-20250929-thinking',
    name: 'Claude Sonnet 4.5 Thinking',
    description: '推理增强版本',
    provider: ModelProvider.ANTHROPIC,
    maxTokens: 200000,
  },
];

/** Default model ID */
export const DEFAULT_CHAT_MODEL_ID = 'gpt-5.1';

/** Get model by ID */
export function getChatModelById(id: string): ChatModel | undefined {
  return CHAT_MODELS.find((m) => m.id === id);
}

/** Get default model */
export function getDefaultChatModel(): ChatModel {
  return getChatModelById(DEFAULT_CHAT_MODEL_ID) || CHAT_MODELS[0];
}

/** Group models by provider */
export function getModelsByProvider(): Record<ModelProvider, ChatModel[]> {
  const grouped: Record<ModelProvider, ChatModel[]> = {
    [ModelProvider.OPENAI]: [],
    [ModelProvider.ANTHROPIC]: [],
    [ModelProvider.DEEPSEEK]: [],
    [ModelProvider.GOOGLE]: [],
  };

  CHAT_MODELS.forEach((model) => {
    grouped[model.provider].push(model);
  });

  return grouped;
}
