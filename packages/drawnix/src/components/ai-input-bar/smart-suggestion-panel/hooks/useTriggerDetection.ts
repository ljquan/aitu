/**
 * useTriggerDetection Hook
 * 
 * 检测输入中的触发字符（#、-、+）并解析当前模式
 */

import { useMemo } from 'react';
import { 
  getModelConfig, 
  getModelType, 
  getModelIds,
  getParamIds,
} from '../../../../constants/model-config';
import type { 
  SuggestionMode, 
  ParseResult, 
  ParseSegment, 
  SelectedParam,
} from '../types';

/**
 * 解析输入文本，检测触发字符和已选择的内容
 */
export function useTriggerDetection(input: string): ParseResult {
  return useMemo(() => {
    return parseInput(input);
  }, [input]);
}

/**
 * 解析输入文本
 */
export function parseInput(input: string): ParseResult {
  const segments: ParseSegment[] = [];
  let cleanText = '';
  let selectedImageModel: string | undefined;
  let selectedVideoModel: string | undefined;
  const selectedParams: SelectedParam[] = [];
  let selectedCount: number | undefined;
  
  // 获取支持的模型和参数 ID
  const modelIds = getModelIds();
  const paramIds = getParamIds();
  
  // 正则匹配所有标记
  // #模型名、-参数=值（值可包含数字、字母、冒号、点等）、+数字
  // 参数值使用 [\w:x.]+ 以支持 16:9、1024x768 等格式
  const tokenRegex = /(#[\w.-]+)|(-[\w]+(?:=[\w:x.]+)?)|(\+\d+)/g;
  
  let match;
  let lastIndex = 0;
  const processedRanges: Array<{ 
    start: number; 
    end: number; 
    type: ParseSegment['type'];
    id?: string;
    value?: string;
    displayName?: string;
  }> = [];
  
  // 第一遍：找出所有有效的标记
  while ((match = tokenRegex.exec(input)) !== null) {
    const fullMatch = match[0];
    const startIndex = match.index;
    const endIndex = startIndex + fullMatch.length;
    
    // 检查模型标记 #modelId
    if (fullMatch.startsWith('#')) {
      const potentialModelId = fullMatch.substring(1);
      const matchedModel = modelIds.find(
        id => id.toLowerCase() === potentialModelId.toLowerCase()
      );
      
      if (matchedModel) {
        const modelType = getModelType(matchedModel);
        if (modelType === 'image' && !selectedImageModel) {
          selectedImageModel = matchedModel;
          const config = getModelConfig(matchedModel);
          processedRanges.push({
            start: startIndex,
            end: endIndex,
            type: 'image-model',
            id: matchedModel,
            displayName: `#${config?.shortLabel || config?.label || matchedModel}`,
          });
        } else if (modelType === 'video' && !selectedVideoModel) {
          selectedVideoModel = matchedModel;
          const config = getModelConfig(matchedModel);
          processedRanges.push({
            start: startIndex,
            end: endIndex,
            type: 'video-model',
            id: matchedModel,
            displayName: `#${config?.shortLabel || config?.label || matchedModel}`,
          });
        }
      }
    }
    // 检查参数标记 -paramId 或 -paramId=value（使用 = 作为分隔符）
    else if (fullMatch.startsWith('-')) {
      const paramPart = fullMatch.substring(1);
      const equalIndex = paramPart.indexOf('=');
      const paramId = equalIndex > 0 ? paramPart.substring(0, equalIndex) : paramPart;
      const paramValue = equalIndex > 0 ? paramPart.substring(equalIndex + 1) : undefined;
      
      // 检查是否是有效参数且未被选择
      const isValidParam = paramIds.some(id => id.toLowerCase() === paramId.toLowerCase());
      const isAlreadySelected = selectedParams.some(p => p.id.toLowerCase() === paramId.toLowerCase());
      
      if (isValidParam && !isAlreadySelected && paramValue) {
        selectedParams.push({ id: paramId, value: paramValue });
        processedRanges.push({
          start: startIndex,
          end: endIndex,
          type: 'param',
          id: paramId,
          value: paramValue,
          displayName: `-${paramId}=${paramValue}`,
        });
      }
    }
    // 检查个数标记 +数字
    else if (fullMatch.startsWith('+')) {
      const countStr = fullMatch.substring(1);
      const count = parseInt(countStr, 10);
      if (!isNaN(count) && count > 0 && count <= 10 && !selectedCount) {
        selectedCount = count;
        processedRanges.push({
          start: startIndex,
          end: endIndex,
          type: 'count',
          id: 'count',
          value: countStr,
          displayName: `+${count}`,
        });
      }
    }
  }
  
  // 构建 segments
  lastIndex = 0;
  processedRanges.sort((a, b) => a.start - b.start);
  
  for (const range of processedRanges) {
    // 添加标记之前的文本
    if (range.start > lastIndex) {
      const textBefore = input.substring(lastIndex, range.start);
      segments.push({ type: 'text', content: textBefore });
      if (textBefore.trim()) {
        cleanText += textBefore;
      }
    }
    
    // 添加标记
    const originalText = input.substring(range.start, range.end);
    segments.push({
      type: range.type,
      content: originalText,
      displayName: range.displayName,
      id: range.id,
      value: range.value,
    });
    
    lastIndex = range.end;
  }
  
  // 添加剩余文本
  if (lastIndex < input.length) {
    const remaining = input.substring(lastIndex);
    segments.push({ type: 'text', content: remaining });
    if (remaining.trim()) {
      cleanText += remaining;
    }
  }
  
  cleanText = cleanText.trim();
  
  // 检测当前正在输入的模式
  const { mode, keyword, triggerPosition } = detectCurrentMode(
    input, 
    processedRanges,
    modelIds,
    paramIds,
    selectedImageModel,
    selectedVideoModel,
    selectedParams,
    selectedCount
  );
  
  return {
    mode,
    keyword,
    triggerPosition,
    selectedImageModel,
    selectedVideoModel,
    selectedParams,
    selectedCount,
    cleanText,
    segments: segments.length > 0 ? segments : [{ type: 'text', content: input }],
  };
}

/**
 * 检测当前正在输入的模式
 * 
 * 智能提示优先级：
 * 1. 正在输入触发字符（#、-、+）→ 显示对应面板
 * 2. 没有指定模型 → 提示模型
 * 3. 指定了模型，没有指定参数 → 提示参数
 * 4. 指定了模型和参数，没有指定数量 → 提示数量
 * 5. 都指定了 → 提示 Prompt
 */
function detectCurrentMode(
  input: string,
  processedRanges: Array<{ start: number; end: number }>,
  _modelIds: string[],
  _paramIds: string[],
  selectedImageModel?: string,
  selectedVideoModel?: string,
  selectedParams?: SelectedParam[],
  selectedCount?: number
): { mode: SuggestionMode; keyword: string; triggerPosition?: number } {
  // 检查最后一个 # 是否正在输入模型
  const lastHashIndex = input.lastIndexOf('#');
  if (lastHashIndex !== -1) {
    const isPartOfValidToken = processedRanges.some(
      range => lastHashIndex >= range.start && lastHashIndex < range.end
    );
    
    if (!isPartOfValidToken) {
      const afterHash = input.substring(lastHashIndex + 1);
      const spaceIndex = afterHash.indexOf(' ');
      
      // 如果 # 后面没有空格，说明正在输入
      if (spaceIndex === -1) {
        // 检查是否两种模型都已选择
        const allModelsSelected = !!selectedImageModel && !!selectedVideoModel;
        if (!allModelsSelected) {
          return {
            mode: 'model',
            keyword: afterHash,
            triggerPosition: lastHashIndex,
          };
        }
      }
    }
  }
  
  // 检查最后一个 - 是否正在输入参数
  const lastDashIndex = input.lastIndexOf('-');
  if (lastDashIndex !== -1) {
    const isPartOfValidToken = processedRanges.some(
      range => lastDashIndex >= range.start && lastDashIndex < range.end
    );
    
    if (!isPartOfValidToken) {
      const afterDash = input.substring(lastDashIndex + 1);
      const spaceIndex = afterDash.indexOf(' ');
      
      // 如果 - 后面没有空格，说明正在输入
      if (spaceIndex === -1) {
        // 检查是否包含等号（正在输入值）
        const equalIndex = afterDash.indexOf('=');
        if (equalIndex === -1) {
          // 正在输入参数名
          return {
            mode: 'param',
            keyword: afterDash,
            triggerPosition: lastDashIndex,
          };
        } else {
          // 正在输入参数值，也显示参数面板
          return {
            mode: 'param',
            keyword: afterDash,
            triggerPosition: lastDashIndex,
          };
        }
      }
    }
  }
  
  // 检查最后一个 + 是否正在输入个数
  const lastPlusIndex = input.lastIndexOf('+');
  if (lastPlusIndex !== -1) {
    const isPartOfValidToken = processedRanges.some(
      range => lastPlusIndex >= range.start && lastPlusIndex < range.end
    );
    
    if (!isPartOfValidToken) {
      const afterPlus = input.substring(lastPlusIndex + 1);
      const spaceIndex = afterPlus.indexOf(' ');
      
      // 如果 + 后面没有空格，说明正在输入
      if (spaceIndex === -1) {
        return {
          mode: 'count',
          keyword: afterPlus,
          triggerPosition: lastPlusIndex,
        };
      }
    }
  }
  
  // 智能提示：根据已选择的内容决定显示哪种提示
  // 优先级：模型 > 参数 > 数量 > Prompt
  
  // 1. 没有指定任何模型 → 提示模型
  const hasAnyModel = !!selectedImageModel || !!selectedVideoModel;
  if (!hasAnyModel) {
    return {
      mode: 'model',
      keyword: '',
      triggerPosition: undefined,
    };
  }
  
  // 2. 指定了模型，没有指定参数 → 提示参数
  const hasParams = selectedParams && selectedParams.length > 0;
  if (!hasParams) {
    return {
      mode: 'param',
      keyword: '',
      triggerPosition: undefined,
    };
  }
  
  // 3. 指定了模型和参数，没有指定数量 → 提示数量
  if (!selectedCount) {
    return {
      mode: 'count',
      keyword: '',
      triggerPosition: undefined,
    };
  }
  
  // 4. 都指定了 → 提示 Prompt
  return {
    mode: 'prompt',
    keyword: input,
    triggerPosition: undefined,
  };
}

/**
 * 将选择的内容插入到输入中
 * 
 * 插入规则：
 * 1. 如果有 triggerPosition，替换触发字符及其后面的内容
 * 2. 如果没有 triggerPosition（智能提示模式），在已有标记之后、prompt 文本之前插入
 *    - 标记顺序：#模型 -参数 +数量 提示词
 */
export function insertToInput(
  input: string,
  value: string,
  triggerPosition?: number,
  triggerChar: string = '#'
): string {
  if (triggerPosition !== undefined) {
    // 替换触发字符及其后面的内容
    const beforeTrigger = input.substring(0, triggerPosition);
    const afterTrigger = input.substring(triggerPosition + 1);
    const spaceIndex = afterTrigger.indexOf(' ');
    const afterKeyword = spaceIndex === -1 ? '' : afterTrigger.substring(spaceIndex);
    
    return `${beforeTrigger}${triggerChar}${value}${afterKeyword ? afterKeyword : ' '}`.trimEnd() + ' ';
  }
  
  // 智能提示模式：在合适的位置插入
  // 标记顺序：#模型 -参数 +数量 提示词
  const newTag = `${triggerChar}${value}`;
  
  // 解析现有输入，找到各部分的位置
  const parts = parseInputParts(input);
  
  // 根据触发字符类型决定插入位置
  let result = '';
  
  if (triggerChar === '#') {
    // 模型标记：放在最前面
    result = newTag;
    if (parts.models) result += ' ' + parts.models;
    if (parts.params) result += ' ' + parts.params;
    if (parts.count) result += ' ' + parts.count;
    if (parts.prompt) result += ' ' + parts.prompt;
  } else if (triggerChar === '-') {
    // 参数标记：放在模型之后
    if (parts.models) result = parts.models + ' ';
    result += newTag;
    if (parts.params) result += ' ' + parts.params;
    if (parts.count) result += ' ' + parts.count;
    if (parts.prompt) result += ' ' + parts.prompt;
  } else if (triggerChar === '+') {
    // 数量标记：放在模型和参数之后
    if (parts.models) result = parts.models + ' ';
    if (parts.params) result += parts.params + ' ';
    result += newTag;
    if (parts.count) result += ' ' + parts.count; // 已有的数量会被保留（虽然通常只有一个）
    if (parts.prompt) result += ' ' + parts.prompt;
  }
  
  return result.trim() + ' ';
}

/**
 * 解析输入的各个部分
 */
function parseInputParts(input: string): {
  models: string;
  params: string;
  count: string;
  prompt: string;
} {
  const models: string[] = [];
  const params: string[] = [];
  let count = '';
  const promptParts: string[] = [];
  
  // 按空格分割
  const tokens = input.split(/\s+/).filter(t => t);
  
  for (const token of tokens) {
    if (token.startsWith('#')) {
      models.push(token);
    } else if (token.startsWith('-') && token.includes('=')) {
      params.push(token);
    } else if (token.startsWith('+') && /^\+\d+$/.test(token)) {
      count = token;
    } else if (token.startsWith('-')) {
      // 不完整的参数，当作 prompt
      promptParts.push(token);
    } else {
      promptParts.push(token);
    }
  }
  
  return {
    models: models.join(' '),
    params: params.join(' '),
    count,
    prompt: promptParts.join(' '),
  };
}

export default useTriggerDetection;
