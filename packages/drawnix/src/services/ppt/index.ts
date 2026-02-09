/**
 * PPT 模块统一导出
 */

// 类型导出
export type {
  PPTLayoutType,
  PPTPageSpec,
  PPTOutline,
  PPTPageCountOption,
  PPTGenerateOptions,
  PPTFrameMeta,
  LayoutElement,
  FrameRect,
  PPTGenerationParams,
  // 思维导图转 PPT 相关类型
  MindmapNodeInfo,
  MindmapToPPTOptions,
  MindmapToPPTResult,
} from './ppt.types';

// 提示词模块
export {
  generateOutlineSystemPrompt,
  generateOutlineUserPrompt,
  validateOutline,
  parseOutlineResponse,
} from './ppt-prompts';

// 布局引擎
export {
  PPT_FRAME_WIDTH,
  PPT_FRAME_HEIGHT,
  PPT_FONT_STYLES,
  createStyledTextElement,
  layoutPageContent,
  convertToAbsoluteCoordinates,
  getImageRegion,
} from './ppt-layout-engine';
export type { FontStyleLevel } from './ppt-layout-engine';

// 思维导图转 PPT
export {
  extractMindmapStructure,
  convertMindmapToOutline,
  generatePPTFromMindmap,
  isPlaitMind,
} from './mindmap-to-ppt';
