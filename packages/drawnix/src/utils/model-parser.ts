/**
 * 模型解析工具
 * 
 * 解析用户输入中的 "#模型名" 语法
 * 支持同时选择图片模型和视频模型
 */

import { 
  getModelConfig, 
  getModelType, 
  getModelIds,
  type ModelType 
} from '../constants/model-config';

/**
 * 单个模型标记信息
 */
export interface ModelTagInfo {
  modelId: string;
  type: ModelType;
  startIndex: number;
  endIndex: number;
}

/**
 * 模型解析结果
 */
export interface ModelParseResult {
  /** 是否正在输入模型名（# 后面） */
  isTypingModel: boolean;
  /** 模型过滤关键词（# 后面的内容） */
  modelKeyword: string;
  /** 解析出的图片模型 ID */
  imageModelId?: string;
  /** 解析出的视频模型 ID */
  videoModelId?: string;
  /** 所有解析出的模型标记 */
  modelTags: ModelTagInfo[];
  /** 移除模型标记后的纯文本 */
  cleanText: string;
  /** # 符号的位置（正在输入时） */
  hashPosition?: number;
  /** 用于富文本显示的分段（content 保持原始文本长度以确保光标位置正确） */
  segments: Array<{ 
    type: 'text' | 'image-model' | 'video-model'; 
    content: string;  // 原始文本内容
    displayName?: string;  // 显示名称（仅模型标签有）
    modelId?: string 
  }>;
}

/**
 * 解析输入中的所有模型标记
 * 
 * 支持格式：
 * - "#模型名 内容" - 在开头指定模型
 * - "内容 #模型名" - 在任意位置指定模型
 * - "#图片模型 内容 #视频模型" - 同时指定两种模型
 * - "#模" - 正在输入模型名（显示选择器）
 * 
 * @param input 用户输入
 * @returns 解析结果
 */
export function parseModelFromInput(input: string): ModelParseResult {
  const modelTags: ModelTagInfo[] = [];
  let imageModelId: string | undefined;
  let videoModelId: string | undefined;
  const segments: Array<{ 
    type: 'text' | 'image-model' | 'video-model'; 
    content: string; 
    displayName?: string;
    modelId?: string 
  }> = [];
  
  // 动态获取支持的模型列表（避免模块初始化顺序问题）
  const supportedModels = getModelIds();
  
  // 使用正则匹配所有 #模型名 格式
  const modelRegex = /#([\w.-]+)/g;
  let match;
  let lastIndex = 0;
  const processedRanges: Array<{ start: number; end: number }> = [];
  
  // 首先找出所有有效的模型标记
  while ((match = modelRegex.exec(input)) !== null) {
    const potentialModelId = match[1];
    const matchedModel = supportedModels.find(
      id => id.toLowerCase() === potentialModelId.toLowerCase()
    );
    
    if (matchedModel) {
      const modelType = getModelType(matchedModel);
      if (modelType) {
        // 检查该类型是否已有模型
        if (modelType === 'image' && !imageModelId) {
          imageModelId = matchedModel;
          modelTags.push({
            modelId: matchedModel,
            type: modelType,
            startIndex: match.index,
            endIndex: match.index + match[0].length,
          });
          processedRanges.push({ start: match.index, end: match.index + match[0].length });
        } else if (modelType === 'video' && !videoModelId) {
          videoModelId = matchedModel;
          modelTags.push({
            modelId: matchedModel,
            type: modelType,
            startIndex: match.index,
            endIndex: match.index + match[0].length,
          });
          processedRanges.push({ start: match.index, end: match.index + match[0].length });
        }
      }
    }
  }
  
  // 构建分段和清理后的文本
  // 关键：segments 的总字符数必须与原始 input 完全一致，以确保光标位置正确
  let cleanText = '';
  lastIndex = 0;

  // 按位置排序
  processedRanges.sort((a, b) => a.start - b.start);

  for (const range of processedRanges) {
    // 添加模型标记之前的文本（包括空白）
    if (range.start > lastIndex) {
      const textBefore = input.substring(lastIndex, range.start);
      segments.push({ type: 'text', content: textBefore });
      // 只有非空白文本才添加到 cleanText
      if (textBefore.trim()) {
        cleanText += textBefore;
      }
    }

    // 添加模型标记（保持原始文本长度）
    const modelTag = modelTags.find(t => t.startIndex === range.start);
    if (modelTag) {
      const modelConfig = getModelConfig(modelTag.modelId);
      const originalText = input.substring(range.start, range.end);
      segments.push({
        type: modelTag.type === 'image' ? 'image-model' : 'video-model',
        content: originalText,  // 保持原始文本
        displayName: `#${modelConfig?.shortLabel || modelConfig?.label || modelTag.modelId}`,  // 显示名称
        modelId: modelTag.modelId,
      });
    }

    lastIndex = range.end;
    // 不再跳过模型标记后的空格，保持字符位置一致
  }

  // 添加剩余文本（包括空白）
  if (lastIndex < input.length) {
    const remaining = input.substring(lastIndex);
    segments.push({ type: 'text', content: remaining });
    // 只有非空白文本才添加到 cleanText
    if (remaining.trim()) {
      cleanText += remaining;
    }
  }

  cleanText = cleanText.trim();
  
  // 检查是否正在输入模型名
  const lastHashIndex = input.lastIndexOf('#');
  if (lastHashIndex !== -1) {
    // 检查这个 # 是否已经是有效模型的一部分
    const isPartOfValidModel = processedRanges.some(
      range => lastHashIndex >= range.start && lastHashIndex < range.end
    );
    
    if (!isPartOfValidModel) {
      const afterHash = input.substring(lastHashIndex + 1);
      const spaceIndex = afterHash.indexOf(' ');
      
      // 如果 # 后面没有空格，说明正在输入
      if (spaceIndex === -1) {
        return {
          isTypingModel: true,
          modelKeyword: afterHash,
          imageModelId,
          videoModelId,
          modelTags,
          cleanText,
          hashPosition: lastHashIndex,
          segments,
        };
      }
    }
  }
  
  // 如果没有找到任何模型，返回原始输入
  if (modelTags.length === 0) {
    return {
      isTypingModel: false,
      modelKeyword: '',
      modelTags: [],
      cleanText: input,
      segments: input ? [{ type: 'text', content: input }] : [],
    };
  }
  
  return {
    isTypingModel: false,
    modelKeyword: '',
    imageModelId,
    videoModelId,
    modelTags,
    cleanText,
    segments,
  };
}

/**
 * 将模型 ID 插入到输入中
 * 
 * @param input 当前输入
 * @param modelId 模型 ID
 * @param hashPosition # 符号位置
 * @returns 新的输入文本
 */
export function insertModelToInput(
  input: string, 
  modelId: string, 
  hashPosition?: number
): string {
  if (hashPosition !== undefined) {
    // 替换 # 及其后面的内容
    const beforeHash = input.substring(0, hashPosition);
    const afterHash = input.substring(hashPosition + 1);
    const spaceIndex = afterHash.indexOf(' ');
    const afterKeyword = spaceIndex === -1 ? '' : afterHash.substring(spaceIndex);
    
    return `${beforeHash}#${modelId}${afterKeyword ? afterKeyword : ' '}`.trimEnd() + ' ';
  }

  // 在开头添加模型标记
  return `#${modelId} ${input}`;
}

/**
 * 从输入中移除指定类型的模型标记
 */
export function removeModelFromInput(input: string, type?: ModelType): string {
  if (!type) {
    // 移除所有模型标记
    return input.replace(/#[\w.-]+\s*/g, '').trim();
  }
  
  // 移除指定类型的模型标记
  const result = parseModelFromInput(input);
  let newInput = input;
  
  // 从后往前移除，避免索引变化
  const tagsToRemove = result.modelTags
    .filter(tag => tag.type === type)
    .sort((a, b) => b.startIndex - a.startIndex);
  
  for (const tag of tagsToRemove) {
    let endIndex = tag.endIndex;
    // 也移除后面的空格
    if (newInput[endIndex] === ' ') {
      endIndex++;
    }
    newInput = newInput.substring(0, tag.startIndex) + newInput.substring(endIndex);
  }
  
  return newInput.trim();
}

/**
 * 检查输入是否包含模型标记
 */
export function hasModelTag(input: string, type?: ModelType): boolean {
  const result = parseModelFromInput(input);
  if (!type) {
    return result.modelTags.length > 0;
  }
  return result.modelTags.some(tag => tag.type === type);
}

/**
 * 检查是否已选择所有类型的模型
 */
export function hasAllModelTypes(input: string): boolean {
  const result = parseModelFromInput(input);
  return !!result.imageModelId && !!result.videoModelId;
}
