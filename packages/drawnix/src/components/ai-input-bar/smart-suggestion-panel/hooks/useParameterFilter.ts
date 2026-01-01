/**
 * useParameterFilter Hook
 * 
 * 根据已选模型动态过滤参数列表
 * 已选参数互斥，不再显示
 */

import { useMemo } from 'react';
import { 
  IMAGE_VIDEO_MODELS,
  ALL_PARAMS,
  getCompatibleParams,
  getModelConfig,
  type ParamConfig,
  type ModelType,
} from '../../../../constants/model-config';
import type {
  SuggestionItem,
  ModelSuggestionItem,
  ParamSuggestionItem,
  CountSuggestionItem,
  PromptSuggestionItem,
  ColdStartSuggestionItem,
  SelectedParam,
  PromptItem,
  SuggestionMode,
} from '../types';

/**
 * 生成个数选项
 * 参考设计：1, 2, 3, 4, 5, 10, 20 张
 */
const COUNT_OPTIONS_DATA = [
  { value: 1, label: '1 张' },
  { value: 2, label: '2 张' },
  { value: 3, label: '3 张' },
  { value: 4, label: '4 张' },
  { value: 5, label: '5 张' },
  { value: 10, label: '10 张' },
  { value: 20, label: '20 张' },
];

interface FilterOptions {
  mode: SuggestionMode;
  keyword: string;
  selectedImageModel?: string;
  selectedVideoModel?: string;
  selectedParams: SelectedParam[];
  selectedCount?: number;
  prompts?: PromptItem[];
  /** 待选枚举值的参数（选择参数后自动展开枚举值） */
  pendingParam?: ParamConfig;
}

/**
 * 过滤并返回建议列表
 */
export function useParameterFilter(options: FilterOptions): SuggestionItem[] {
  const {
    mode,
    keyword,
    selectedImageModel,
    selectedVideoModel,
    selectedParams,
    selectedCount,
    prompts = [],
    pendingParam,
  } = options;

  return useMemo(() => {
    // 如果有待选参数，显示其枚举值
    if (pendingParam && pendingParam.options) {
      return filterParamValues(keyword, pendingParam);
    }

    switch (mode) {
      case 'model':
        return filterModels(keyword, selectedImageModel, selectedVideoModel);
      case 'param':
        return filterParams(keyword, selectedImageModel, selectedVideoModel, selectedParams);
      case 'count':
        return filterCounts(keyword, selectedCount);
      case 'prompt':
        return filterPrompts(keyword, prompts);
      case 'cold-start':
        // 冷启动模式直接显示所有提示词，无需过滤
        return filterColdStartPrompts(prompts);
      default:
        return [];
    }
  }, [mode, keyword, selectedImageModel, selectedVideoModel, selectedParams, selectedCount, prompts, pendingParam]);
}

/**
 * 过滤模型列表
 */
function filterModels(
  keyword: string,
  selectedImageModel?: string,
  selectedVideoModel?: string
): ModelSuggestionItem[] {
  const normalizedKeyword = keyword.toLowerCase().trim();
  
  // 过滤已选择类型的模型
  let models = IMAGE_VIDEO_MODELS.filter(model => {
    if (model.type === 'image' && selectedImageModel) return false;
    if (model.type === 'video' && selectedVideoModel) return false;
    return true;
  });
  
  // 按关键词过滤
  if (normalizedKeyword) {
    models = models.filter(model =>
      model.id.toLowerCase().includes(normalizedKeyword) ||
      model.label.toLowerCase().includes(normalizedKeyword) ||
      (model.shortLabel && model.shortLabel.toLowerCase().includes(normalizedKeyword))
    );
  }
  
  return models.map(model => ({
    id: model.id,
    type: 'model' as const,
    label: model.label,
    shortLabel: model.shortLabel,
    description: model.description,
    modelType: model.type as ModelType,
    modelConfig: model,
  }));
}

/**
 * 过滤参数的枚举值列表（选择参数后自动展开）
 */
function filterParamValues(
  keyword: string,
  param: ParamConfig
): ParamSuggestionItem[] {
  if (!param.options) return [];
  
  const normalizedKeyword = keyword.toLowerCase().trim();
  let options = param.options;
  
  // 按关键词过滤
  if (normalizedKeyword) {
    options = options.filter(opt =>
      opt.value.toLowerCase().includes(normalizedKeyword) ||
      opt.label.toLowerCase().includes(normalizedKeyword)
    );
  }
  
  return options.map(opt => ({
    id: `${param.id}=${opt.value}`,
    type: 'param' as const,
    label: opt.label,
    shortLabel: opt.value,
    description: `${param.label}=${opt.label}`,
    paramConfig: param,
    value: opt.value,
  }));
}

/**
 * 过滤参数列表
 */
function filterParams(
  keyword: string,
  selectedImageModel?: string,
  selectedVideoModel?: string,
  selectedParams: SelectedParam[] = []
): ParamSuggestionItem[] {
  const normalizedKeyword = keyword.toLowerCase().trim();
  
  // 确定当前模型类型
  const currentModelId = selectedImageModel || selectedVideoModel;
  const currentModelConfig = currentModelId ? getModelConfig(currentModelId) : null;
  const currentModelType = currentModelConfig?.type;
  
  // 获取兼容的参数
  let params: ParamConfig[];
  if (currentModelId) {
    params = getCompatibleParams(currentModelId);
  } else if (currentModelType) {
    params = ALL_PARAMS.filter(p => p.modelType === currentModelType);
  } else {
    // 没有选择模型时，显示所有参数
    params = ALL_PARAMS;
  }
  
  // 过滤已选择的参数
  const selectedParamIds = selectedParams.map(p => p.id.toLowerCase());
  params = params.filter(param => !selectedParamIds.includes(param.id.toLowerCase()));
  
  // 过滤只有一个选项的参数（没有选择意义）
  params = params.filter(param => !param.options || param.options.length > 1);
  
  // 按关键词过滤参数名
  if (normalizedKeyword) {
    params = params.filter(param =>
      param.id.toLowerCase().includes(normalizedKeyword) ||
      param.label.toLowerCase().includes(normalizedKeyword) ||
      (param.shortLabel && param.shortLabel.toLowerCase().includes(normalizedKeyword))
    );
  }
  
  return params.map(param => ({
    id: param.id,
    type: 'param' as const,
    label: param.label,
    shortLabel: param.shortLabel,
    description: param.description,
    paramConfig: param,
  }));
}

/**
 * 过滤生成个数选项
 */
function filterCounts(
  keyword: string,
  selectedCount?: number
): CountSuggestionItem[] {
  const normalizedKeyword = keyword.trim();
  
  // 如果已选择个数，不显示
  if (selectedCount !== undefined) {
    return [];
  }
  
  let options = COUNT_OPTIONS_DATA;
  
  // 按关键词过滤
  if (normalizedKeyword) {
    options = options.filter(opt =>
      opt.label.includes(normalizedKeyword) ||
      opt.value.toString() === normalizedKeyword
    );
  }
  
  return options.map(opt => ({
    id: `count-${opt.value}`,
    type: 'count' as const,
    label: opt.label,
    shortLabel: `${opt.value}`,
    value: opt.value,
  }));
}

/**
 * 冷启动模式的建议列表（不需要过滤，直接返回所有）
 */
function filterColdStartPrompts(
  prompts: PromptItem[]
): ColdStartSuggestionItem[] {
  return prompts.map(prompt => ({
    id: prompt.id,
    type: 'cold-start' as const,
    label: prompt.content,
    shortLabel: prompt.content.length > 50 ? prompt.content.substring(0, 50) + '...' : prompt.content,
    description: prompt.scene || '',
    content: prompt.content,
    scene: prompt.scene,
  }));
}

/**
 * 过滤提示词列表
 */
function filterPrompts(
  keyword: string,
  prompts: PromptItem[]
): PromptSuggestionItem[] {
  const normalizedKeyword = keyword.toLowerCase().trim();
  
  let filtered = prompts;
  
  // 按关键词过滤
  if (normalizedKeyword) {
    filtered = prompts.filter(prompt => {
      const content = prompt.content.toLowerCase();
      // 排除完全相同的
      if (content === normalizedKeyword) return false;
      // 包含关键词的保留
      return content.includes(normalizedKeyword);
    });
  }
  
  return filtered.map(prompt => ({
    id: prompt.id,
    type: 'prompt' as const,
    label: prompt.content,
    shortLabel: prompt.content.length > 50 ? prompt.content.substring(0, 50) + '...' : prompt.content,
    description: prompt.source === 'history' ? '历史记录' : '推荐提示词',
    source: prompt.source,
    content: prompt.content,
    scene: prompt.scene,
    timestamp: prompt.timestamp,
  }));
}

export default useParameterFilter;
