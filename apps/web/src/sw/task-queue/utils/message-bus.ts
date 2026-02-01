/**
 * Message Bus Module
 *
 * Unified message communication layer for Service Worker.
 * 现已迁移到使用 postmessage-duplex 通过 channelManager 发送消息。
 * 
 * 注意：PostMessage 日志记录完全由调试模式控制，当调试模式关闭时
 * 不会进行任何日志记录操作，避免对应用性能的影响。
 */

import { SWToMainMessage } from '../types';
import {
  logSentMessage,
  getAllLogs as getAllPostMessageLogs,
  setPostMessageLoggerDebugMode,
  isPostMessageLoggerDebugMode,
  type PostMessageLogEntry,
} from '../postmessage-logger';
import { getChannelManager } from '../channel-manager';

// Debug mode configuration
let debugModeEnabled = false;
let broadcastLogCallback: ((entry: PostMessageLogEntry) => void) | null = null;

/**
 * Configure debug mode for message logging
 * Also updates postmessage-logger debug mode to control log collection
 */
export function setDebugMode(enabled: boolean): void {
  debugModeEnabled = enabled;
  // Sync debug mode to postmessage-logger
  setPostMessageLoggerDebugMode(enabled);
}

/**
 * Set callback for broadcasting debug logs
 */
export function setBroadcastCallback(
  callback: ((entry: PostMessageLogEntry) => void) | null
): void {
  broadcastLogCallback = callback;
}

/**
 * Send message to a client with logging
 * 使用 channelManager 通过 postmessage-duplex 发送消息
 */
export function sendToClient(client: Client, message: unknown): void {
  if (!client) {
    console.warn('[MessageBus] No client provided');
    return;
  }

  const messageType = (message as { type?: string })?.type || 'unknown';
  
  // Log if debug mode is enabled
  let logId = '';
  if (isPostMessageLoggerDebugMode()) {
    logId = logSentMessage(messageType, message, client.id);
  }

  // 使用 channelManager (postmessage-duplex)
  const cm = getChannelManager();
  if (!cm) {
    console.warn('[MessageBus] channelManager not initialized');
    return;
  }

  try {
    cm.publishToClient(client.id, messageType, message as Record<string, unknown>);
  } catch (error) {
    console.warn('[MessageBus] Failed to publish to client:', client.id, error);
    return;
  }

  // Broadcast to debug panel if enabled and logging is active
  if (logId && debugModeEnabled && broadcastLogCallback) {
    const logs = getAllPostMessageLogs();
    const entry = logs.find((l) => l.id === logId);
    if (entry) {
      broadcastLogCallback(entry);
    }
  }
}

// Internal reference for use within MessageBus class to avoid name collision
const sendToClientInternal = sendToClient;

/**
 * Broadcast message to all clients with logging
 * 使用 channelManager 通过 postmessage-duplex 广播消息
 */
export function broadcastToAllClients(message: unknown): void {
  const messageType = (message as { type?: string })?.type || 'unknown';

  const cm = getChannelManager();
  if (!cm) {
    console.warn('[MessageBus] channelManager not initialized');
    return;
  }

  try {
    cm.broadcastToAll(messageType, message as Record<string, unknown>);
    
    // Log if debug mode is enabled
    if (isPostMessageLoggerDebugMode()) {
      logSentMessage(messageType, message, 'broadcast');
    }
  } catch (error) {
    console.warn('[MessageBus] Failed to broadcast:', error);
  }
}

/**
 * Send message to client by ID with logging
 * 使用 channelManager 通过 postmessage-duplex 发送消息
 */
export async function sendToClientById(
  clientId: string,
  message: unknown
): Promise<boolean> {
  if (!clientId) {
    console.warn('[MessageBus] No clientId provided');
    return false;
  }

  const messageType = (message as { type?: string })?.type || 'unknown';

  const cm = getChannelManager();
  if (!cm) {
    console.warn('[MessageBus] channelManager not initialized');
    return false;
  }

  try {
    cm.publishToClient(clientId, messageType, message as Record<string, unknown>);
    
    // Log if debug mode is enabled
    if (isPostMessageLoggerDebugMode()) {
      logSentMessage(messageType, message, clientId);
    }
    return true;
  } catch (error) {
    console.warn('[MessageBus] Failed to publish to client:', clientId, error);
    return false;
  }
}

// 注意：MessageBus 类和 BroadcastChannel 遗留代码已删除
// 使用 channelManager (postmessage-duplex) 代替
// 所有消息发送应通过 sendToClient、sendToClientById 或 broadcastToAllClients 函数
// 这些函数内部使用 channelManager.publishToClient 和 channelManager.broadcastToAll
