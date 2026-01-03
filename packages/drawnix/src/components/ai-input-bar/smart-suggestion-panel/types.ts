/**
 * SmartSuggestionPanel 类型定义
 * 
 * 统一的智能建议面板，支持：
 * - # 模型选择
 * - - 参数提示
 * - + 生成个数选择
 * - 默认提示词
 */

import type { ModelConfig, ParamConfig, ModelType } from '../../../constants/model-config';

/**
 * 建议模式
 * - model: 模型选择
 * - param: 参数选择
 * - count: 数量选择
 * - prompt: 提示词建议
 * - cold-start: 冷启动引导（无选中内容、输入框为空时显示）
 */
export type SuggestionMode = 'model' | 'param' | 'count' | 'prompt' | 'cold-start' | null;

/**
 * 触发字符映射
 */
export const TRIGGER_CHARS = {
  model: '#',
  param: '-',
  count: '+',
} as const;

/**
 * 生成个数选项
 */
export interface CountOption {
  value: number;
  label: string;
}

/**
 * 默认生成个数选项
 */
export const COUNT_OPTIONS: CountOption[] = [
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4' },
];

/**
 * 提示词项
 */
export interface PromptItem {
  id: string;
  content: string;
  /** 适用场景描述 */
  scene?: string;
  /** 模型调用说明 */
  tips?: string;
  source: 'preset' | 'history';
  timestamp?: number;
  /** 是否在有选中元素时输入的（仅历史记录有此字段） */
  hasSelection?: boolean;
}

/**
 * 建议项基础接口
 */
export interface BaseSuggestionItem {
  id: string;
  label: string;
  shortLabel?: string;
  description?: string;
}

/**
 * 模型建议项
 */
export interface ModelSuggestionItem extends BaseSuggestionItem {
  type: 'model';
  modelType: ModelType;
  modelConfig: ModelConfig;
}

/**
 * 参数建议项
 */
export interface ParamSuggestionItem extends BaseSuggestionItem {
  type: 'param';
  paramConfig: ParamConfig;
  /** 参数值（如果已选择值） */
  value?: string;
}

/**
 * 个数建议项
 */
export interface CountSuggestionItem extends BaseSuggestionItem {
  type: 'count';
  value: number;
}

/**
 * 提示词建议项
 */
export interface PromptSuggestionItem extends BaseSuggestionItem {
  type: 'prompt';
  source: 'preset' | 'history';
  content: string;
  /** 适用场景描述 */
  scene?: string;
  timestamp?: number;
}

/**
 * 冷启动建议项（引导新用户）
 */
export interface ColdStartSuggestionItem extends BaseSuggestionItem {
  type: 'cold-start';
  content: string;
  /** 适用场景描述 */
  scene?: string;
  /** 模型调用说明 */
  tips?: string;
  /** 建议的模型类型 */
  modelType?: 'image' | 'video';
}

/**
 * 联合建议项类型
 */
export type SuggestionItem =
  | ModelSuggestionItem
  | ParamSuggestionItem
  | CountSuggestionItem
  | PromptSuggestionItem
  | ColdStartSuggestionItem;

/**
 * 已选择的参数
 */
export interface SelectedParam {
  id: string;
  value: string;
}

/**
 * 解析结果
 */
export interface ParseResult {
  /** 当前建议模式 */
  mode: SuggestionMode;
  /** 过滤关键词（触发字符后的内容） */
  keyword: string;
  /** 触发字符位置 */
  triggerPosition?: number;
  /** 已选择的图片模型 */
  selectedImageModel?: string;
  /** 已选择的视频模型 */
  selectedVideoModel?: string;
  /** 已选择的参数列表 */
  selectedParams: SelectedParam[];
  /** 已选择的生成个数 */
  selectedCount?: number;
  /** 清理后的文本（移除所有标记） */
  cleanText: string;
  /** 用于富文本显示的分段 */
  segments: ParseSegment[];
}

/**
 * 解析分段
 */
export interface ParseSegment {
  type: 'text' | 'image-model' | 'video-model' | 'param' | 'count';
  content: string;
  displayName?: string;
  id?: string;
  value?: string;
}

/**
 * SmartSuggestionPanel Props
 */
export interface SmartSuggestionPanelProps {
  /** 是否可见 */
  visible: boolean;
  /** 当前建议模式 */
  mode: SuggestionMode;
  /** 过滤关键词 */
  filterKeyword: string;
  /** 已选择的图片模型 */
  selectedImageModel?: string;
  /** 已选择的视频模型 */
  selectedVideoModel?: string;
  /** 已选择的参数列表 */
  selectedParams: SelectedParam[];
  /** 已选择的生成个数 */
  selectedCount?: number;
  /** 提示词列表（用于 prompt/cold-start 模式） */
  prompts?: PromptItem[];
  /** 有选中元素时的历史记录列表（用于 model 模式） */
  selectionHistoryPrompts?: PromptItem[];
  /** 选择模型回调 */
  onSelectModel: (modelId: string) => void;
  /** 选择参数回调 */
  onSelectParam: (paramId: string, value?: string) => void;
  /** 选择个数回调 */
  onSelectCount: (count: number) => void;
  /** 选择提示词回调 */
  onSelectPrompt?: (prompt: PromptItem) => void;
  /** 删除历史提示词回调 */
  onDeleteHistory?: (id: string) => void;
  /** 关闭回调 */
  onClose: () => void;
  /** 语言 */
  language?: 'zh' | 'en';
}

/**
 * 建议列表 Props
 */
export interface SuggestionListProps {
  /** 建议项列表 */
  items: SuggestionItem[];
  /** 高亮索引 */
  highlightedIndex: number;
  /** 选择回调 */
  onSelect: (item: SuggestionItem) => void;
  /** 鼠标进入回调 */
  onMouseEnter: (index: number) => void;
  /** 删除历史回调（仅提示词模式） */
  onDeleteHistory?: (id: string) => void;
  /** 语言 */
  language?: 'zh' | 'en';
}
