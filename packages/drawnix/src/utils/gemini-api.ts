/**
 * Gemini API 主入口文件
 * 重新导出所有模块化的API功能
 */

// 导入所有模块化的API功能
export * from './gemini-api/types';
export * from './gemini-api/config';
export * from './gemini-api/utils';
export * from './gemini-api/apiCalls';
export * from './gemini-api/client';
export * from './gemini-api/services';
export * from './gemini-api/auth';

// 导入默认客户端实例
import { defaultGeminiClient, videoGeminiClient } from './gemini-api/client';
import { promptForApiKey } from './gemini-api/auth';

// 重新导出主要功能以保持向后兼容
export { defaultGeminiClient, videoGeminiClient, promptForApiKey };

// 初始化URL设置处理
import { initializeSettings } from './gemini-api/auth';

// 如果在浏览器环境中，自动初始化设置
if (typeof window !== 'undefined') {
  initializeSettings();
}