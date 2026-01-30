/**
 * Service Worker 双工通信模块
 * 
 * 基于 postmessage-duplex 库的统一导出
 */

// 导出类型
export * from './types';
export * from './chat-workflow-types';

// 导出客户端
export { SWChannelClient, swChannelClient } from './client';
export type { SWChannelEventHandlers } from './client';

// 导出 chat workflow 客户端
export { ChatWorkflowClient, chatWorkflowClient } from './chat-workflow-client';
