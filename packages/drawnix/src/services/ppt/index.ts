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
  layoutPageContent,
  convertToAbsoluteCoordinates,
  getImageRegion,
} from './ppt-layout-engine';
