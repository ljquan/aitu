/**
 * Service Worker Task Queue Module
 *
 * Entry point for the SW-based task queue system.
 * Exports all necessary types and functions for integration with the main SW.
 */

// Export types
export * from './types';
export * from './workflow-types';
export * from './chat-workflow/types';

// Export queue management
export {
  SWTaskQueue,
  initTaskQueue,
  getTaskQueue,
} from './queue';

// Export workflow management
export {
  initWorkflowHandler,
  updateWorkflowConfig,
  isWorkflowMessage,
  handleWorkflowMessage,
  handleMainThreadToolResponse,
  getWorkflowExecutor,
  getChatWorkflowHandler,
  resendPendingToolRequests,
} from './workflow-handler';

// Export storage
export { TaskQueueStorage, taskQueueStorage } from './storage';

// Export handlers (for testing/extension)
export { ImageHandler } from './handlers/image';
export { VideoHandler } from './handlers/video';
export { CharacterHandler } from './handlers/character';
export { ChatHandler } from './handlers/chat';

// Export MCP tools
export { swMCPTools, getSWMCPTool, executeSWMCPTool } from './mcp/tools';

// Export chat workflow
export { ChatWorkflowHandler } from './chat-workflow/handler';

// Export message sender (from message-bus)
export {
  setDebugMode as setMessageSenderDebugMode,
  setBroadcastCallback,
  sendToClient,
  broadcastToAllClients,
  sendToClientById,
} from './utils/message-bus';

// Export channel manager (postmessage-duplex based)
export {
  SWChannelManager,
  initChannelManager,
  getChannelManager,
  RPC_METHODS,
  SW_EVENTS,
} from './channel-manager';
