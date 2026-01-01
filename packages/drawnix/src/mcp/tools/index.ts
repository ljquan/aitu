/**
 * MCP 工具统一导出
 */

export { imageGenerationTool, generateImage, createImageTask } from './image-generation';
export type { ImageGenerationParams } from './image-generation';

export { videoGenerationTool, generateVideo, createVideoTask } from './video-generation';
export type { VideoGenerationParams } from './video-generation';

export { aiAnalyzeTool, analyzeWithAI } from './ai-analyze';
export type { AIAnalyzeParams, AIAnalyzeResult } from './ai-analyze';
