/**
 * Service Worker Task Queue Module
 *
 * Entry point for the SW-based task queue system.
 * Exports storage, channel manager, and utility functions.
 * LLM-related handlers have been moved to the application layer.
 */

// Export types
export * from './types';

// Export storage
export { TaskQueueStorage, taskQueueStorage } from './storage';

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
