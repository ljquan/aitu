/**
 * AI 输入解析工具
 * 
 * 解析 AI 输入框的内容，判断发送场景：
 * 1. 只有选择元素，没有输入文字 -> 直接生成
 * 2. 输入内容有模型、参数 -> 解析后直接生成
 * 3. 输入内容指定了数量 -> 按数量生成
 * 4. 输入内容包含其他内容 -> 走 Agent 流程
 */

import { parseInput, type ParseResult } from '../components/ai-input-bar/smart-suggestion-panel';
import { geminiSettings } from './settings-manager';
import { 
  getModelConfig, 
  getImageModelDefaults, 
  getVideoModelDefaults,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
} from '../constants/model-config';

/**
 * 发送场景类型
 */
export type SendScenario = 
  | 'direct_generation'  // 场景1-3: 直接生成（无额外内容）
  | 'agent_flow';        // 场景4: Agent 流程（有额外内容）

/**
 * 生成类型
 */
export type GenerationType = 'image' | 'video';

/**
 * 解析后的生成参数
 */
export interface ParsedGenerationParams {
  /** 发送场景 */
  scenario: SendScenario;
  /** 生成类型 */
  generationType: GenerationType;
  /** 使用的模型 ID */
  modelId: string;
  /** 提示词 */
  prompt: string;
  /** 生成数量 */
  count: number;
  /** 尺寸参数 */
  size?: string;
  /** 时长参数（视频） */
  duration?: string;
  /** 宽度 */
  width?: number;
  /** 高度 */
  height?: number;
  /** 原始解析结果 */
  parseResult: ParseResult;
  /** 是否有额外内容（除模型/参数/数量外） */
  hasExtraContent: boolean;
}

/**
 * 获取默认图片模型
 */
function getDefaultImageModel(): string {
  const settings = geminiSettings.get();
  return settings?.imageModelName || DEFAULT_IMAGE_MODEL;
}

/**
 * 获取默认视频模型
 */
function getDefaultVideoModel(): string {
  const settings = geminiSettings.get();
  return settings?.videoModelName || DEFAULT_VIDEO_MODEL;
}

/**
 * 生成默认提示词
 * 
 * @param hasSelectedElements 是否有选中元素
 * @param selectedTexts 选中的文字内容数组
 * @param imageCount 选中的图片数量
 */
export function generateDefaultPrompt(
  hasSelectedElements: boolean,
  selectedTexts: string[],
  imageCount: number
): string {
  // 如果有选中的文字，合并作为 prompt
  if (selectedTexts.length > 0) {
    return selectedTexts.join('\n');
  }
  
  // 如果没有文字，根据图片数量生成默认 prompt
  if (hasSelectedElements) {
    if (imageCount === 1) {
      return '请仔细分析这张图片的内容、风格、构图、色调和艺术特点，推测生成这张图片可能使用的原始提示词，然后基于你推测的提示词重新生成一张全新的、风格相似但内容不完全相同的图片。不要直接复制原图。';
    } else if (imageCount > 1) {
      return '请分析这些图片的主题、风格和视觉元素，找出它们之间的共同点或关联性，然后创造性地将它们融合成一张全新的、和谐统一的图片。融合时请保持各图片的精华元素，确保最终作品在构图、色调和风格上协调一致。';
    }
  }
  
  return '';
}

/**
 * 解析尺寸字符串为宽高
 * 支持格式: "1024x768", "16x9", "1:1"
 */
function parseSizeToWidthHeight(size: string): { width: number; height: number } | null {
  // 尝试解析 "1024x768" 格式
  const pixelMatch = size.match(/^(\d+)x(\d+)$/i);
  if (pixelMatch) {
    return {
      width: parseInt(pixelMatch[1], 10),
      height: parseInt(pixelMatch[2], 10),
    };
  }
  
  // 尝试解析 "16x9" 或 "16:9" 比例格式，转换为标准尺寸
  const ratioMatch = size.match(/^(\d+)[x:](\d+)$/i);
  if (ratioMatch) {
    const ratioW = parseInt(ratioMatch[1], 10);
    const ratioH = parseInt(ratioMatch[2], 10);
    
    // 常见比例映射到标准尺寸
    const ratioMap: Record<string, { width: number; height: number }> = {
      '1:1': { width: 1024, height: 1024 },
      '16:9': { width: 1344, height: 768 },
      '9:16': { width: 768, height: 1344 },
      '3:2': { width: 1248, height: 832 },
      '2:3': { width: 832, height: 1248 },
      '4:3': { width: 1184, height: 864 },
      '3:4': { width: 864, height: 1184 },
      '5:4': { width: 1152, height: 896 },
      '4:5': { width: 896, height: 1152 },
      '21:9': { width: 1536, height: 672 },
    };
    
    const key = `${ratioW}:${ratioH}`;
    if (ratioMap[key]) {
      return ratioMap[key];
    }
    
    // 如果不是标准比例，按比例计算（基于 1024 的基准）
    const baseSize = 1024;
    if (ratioW > ratioH) {
      return {
        width: baseSize,
        height: Math.round(baseSize * ratioH / ratioW),
      };
    } else {
      return {
        width: Math.round(baseSize * ratioW / ratioH),
        height: baseSize,
      };
    }
  }
  
  return null;
}

/**
 * 解析 AI 输入内容
 * 
 * @param inputText 输入框文本
 * @param hasSelectedElements 是否有选中元素
 * @param selectedTexts 选中的文字内容数组
 * @param imageCount 选中的图片数量
 */
export function parseAIInput(
  inputText: string,
  hasSelectedElements: boolean,
  selectedTexts: string[],
  imageCount: number
): ParsedGenerationParams {
  // 使用现有的 parseInput 函数解析输入
  const parseResult = parseInput(inputText);
  
  // 判断是否有额外内容（除了模型/参数/数量标记外的文字）
  const hasExtraContent = parseResult.cleanText.trim().length > 0;
  
  // 确定发送场景
  const scenario: SendScenario = hasExtraContent ? 'agent_flow' : 'direct_generation';
  
  // 确定生成类型和模型
  let generationType: GenerationType = 'image';
  let modelId: string;
  
  if (parseResult.selectedVideoModel) {
    // 如果明确选择了视频模型，生成视频
    generationType = 'video';
    modelId = parseResult.selectedVideoModel;
  } else if (parseResult.selectedImageModel) {
    // 如果选择了图片模型，生成图片
    generationType = 'image';
    modelId = parseResult.selectedImageModel;
  } else {
    // 默认使用设置中的图片模型
    modelId = getDefaultImageModel();
  }
  
  // 生成提示词
  let prompt = parseResult.cleanText.trim();
  if (!prompt) {
    prompt = generateDefaultPrompt(hasSelectedElements, selectedTexts, imageCount);
  }
  
  // 获取数量（默认为 1）
  const count = parseResult.selectedCount || 1;
  
  // 解析参数
  let size: string | undefined;
  let duration: string | undefined;
  let width: number | undefined;
  let height: number | undefined;
  
  for (const param of parseResult.selectedParams) {
    if (param.id === 'size') {
      size = param.value;
      const dimensions = parseSizeToWidthHeight(param.value);
      if (dimensions) {
        width = dimensions.width;
        height = dimensions.height;
      }
    } else if (param.id === 'duration') {
      duration = param.value;
    }
  }
  
  // 如果没有指定尺寸，使用模型默认值
  if (!width || !height) {
    const modelConfig = getModelConfig(modelId);
    if (modelConfig?.type === 'image' && modelConfig.imageDefaults) {
      width = modelConfig.imageDefaults.width;
      height = modelConfig.imageDefaults.height;
    } else if (modelConfig?.type === 'video' && modelConfig.videoDefaults) {
      const defaultSize = modelConfig.videoDefaults.size;
      const dimensions = parseSizeToWidthHeight(defaultSize);
      if (dimensions) {
        width = dimensions.width;
        height = dimensions.height;
      }
      if (!duration) {
        duration = modelConfig.videoDefaults.duration;
      }
    } else {
      // 使用通用默认值
      if (generationType === 'image') {
        const defaults = getImageModelDefaults(modelId);
        width = defaults.width;
        height = defaults.height;
      } else {
        const defaults = getVideoModelDefaults(modelId);
        const dimensions = parseSizeToWidthHeight(defaults.size);
        if (dimensions) {
          width = dimensions.width;
          height = dimensions.height;
        }
        if (!duration) {
          duration = defaults.duration;
        }
      }
    }
  }
  
  return {
    scenario,
    generationType,
    modelId,
    prompt,
    count,
    size,
    duration,
    width,
    height,
    parseResult,
    hasExtraContent,
  };
}

/**
 * 检查是否应该走 Agent 流程
 * 
 * 场景4的判断条件：输入内容除了选择模型、参数、数量外，还包含了其他内容
 */
export function shouldUseAgentFlow(inputText: string): boolean {
  const parseResult = parseInput(inputText);
  return parseResult.cleanText.trim().length > 0;
}
