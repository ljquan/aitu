/**
 * Message Bus Module
 *
 * Unified message communication layer for Service Worker.
 * Handles broadcasting to all clients and sending to specific clients.
 * Includes integrated message logging for debugging.
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
 * 日志记录由调试模式控制，调试模式关闭时不会进行任何日志操作
 */
export function sendToClient(client: Client, message: unknown): void {
  if (!client) {
    console.warn('[MessageBus] No client provided');
    return;
  }

  // Only attempt to log if debug mode is enabled
  let logId = '';
  if (isPostMessageLoggerDebugMode()) {
    const messageType = (message as { type?: string })?.type || 'unknown';
    logId = logSentMessage(messageType, message, client.id);
  }

  try {
    client.postMessage(message);
  } catch (error) {
    console.warn('[MessageBus] Failed to postMessage to client:', client.id, error);
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
 * 日志记录由调试模式控制，调试模式关闭时不会进行任何日志操作
 */
export function broadcastToAllClients(message: unknown): void {
  const sw = self as unknown as ServiceWorkerGlobalScope;

  const messageType = (message as { type?: string })?.type || 'unknown';

  sw.clients.matchAll().then((clients) => {
    clients.forEach((client) => {
      // Only attempt to log if debug mode is enabled
      let logId = '';
      if (isPostMessageLoggerDebugMode()) {
        logId = logSentMessage(messageType, message, client.id);
      }

      client.postMessage(message);

      // Broadcast to debug panel if enabled and logging is active
      if (logId && debugModeEnabled && broadcastLogCallback) {
        const logs = getAllPostMessageLogs();
        const entry = logs.find((l) => l.id === logId);
        if (entry) {
          broadcastLogCallback(entry);
        }
      }
    });
  });
}

/**
 * Send message to client by ID with logging
 */
export async function sendToClientById(
  clientId: string,
  message: unknown
): Promise<boolean> {
  const sw = self as unknown as ServiceWorkerGlobalScope;

  if (!clientId) {
    console.warn('[MessageBus] No clientId provided');
    return false;
  }

  try {
    const client = await sw.clients.get(clientId);
    if (client) {
      sendToClient(client, message);
      return true;
    } else {
      console.warn('[MessageBus] Client not found:', clientId);
      return false;
    }
  } catch (error) {
    console.warn('[MessageBus] Failed to send to client:', clientId, error);
    return false;
  }
}

/**
 * Initialize message sender (for backwards compatibility)
 * @deprecated Use setDebugMode and setBroadcastCallback directly
 */
export function initMessageSender(
  _sw: ServiceWorkerGlobalScope,
  options?: {
    debugMode?: boolean;
    onLogBroadcast?: (entry: PostMessageLogEntry) => void;
  }
): void {
  const enabled = options?.debugMode ?? false;
  debugModeEnabled = enabled;
  // Sync debug mode to postmessage-logger
  setPostMessageLoggerDebugMode(enabled);
  broadcastLogCallback = options?.onLogBroadcast ?? null;
}

/**
 * Get SW global scope (for backwards compatibility)
 * @deprecated Access self directly instead
 */
export function getSWGlobal(): ServiceWorkerGlobalScope {
  return self as unknown as ServiceWorkerGlobalScope;
}

/**
 * Message handler callback type
 */
export type MessageHandler = (message: unknown, source?: Client) => void;

/**
 * Broadcast options
 */
export interface BroadcastOptions {
  /** Only send to visible clients */
  visibleOnly?: boolean;
  /** Exclude specific client IDs */
  excludeClients?: string[];
  /** Include specific client IDs only */
  includeClients?: string[];
}

/**
 * MessageBus class
 * Provides unified messaging interface for SW communication
 */
export class MessageBus {
  private channel: BroadcastChannel | null = null;
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private channelName: string;

  constructor(channelName: string = 'aitu-task-queue') {
    this.channelName = channelName;
    this.initBroadcastChannel();
  }

  /**
   * Initialize BroadcastChannel for cross-tab communication
   */
  private initBroadcastChannel(): void {
    try {
      this.channel = new BroadcastChannel(this.channelName);
      this.channel.onmessage = (event) => {
        this.handleChannelMessage(event.data);
      };
    } catch (error) {
      console.warn('[MessageBus] BroadcastChannel not available:', error);
    }
  }

  /**
   * Broadcast a message to all connected clients via postMessage
   * @param message Message to broadcast
   * @param options Broadcast options
   */
  async broadcast(message: SWToMainMessage, options: BroadcastOptions = {}): Promise<void> {
    const { visibleOnly = false, excludeClients = [], includeClients } = options;

    try {
      const allClients = await (self as unknown as ServiceWorkerGlobalScope).clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      let targetClients = allClients;

      // Filter by visibility
      if (visibleOnly) {
        targetClients = targetClients.filter(
          client => (client as WindowClient).visibilityState === 'visible'
        );
      }

      // Filter by include list
      if (includeClients && includeClients.length > 0) {
        targetClients = targetClients.filter(client => includeClients.includes(client.id));
      }

      // Filter by exclude list
      if (excludeClients.length > 0) {
        targetClients = targetClients.filter(client => !excludeClients.includes(client.id));
      }

      // Send to all matching clients using integrated message sender
      for (const client of targetClients) {
        try {
          sendToClient(client, message);
        } catch (error) {
          console.warn(`[MessageBus] Failed to send to client ${client.id}:`, error);
        }
      }
    } catch (error) {
      console.error('[MessageBus] Broadcast failed:', error);
    }
  }

  /**
   * Broadcast via BroadcastChannel (for cross-tab sync)
   * @param event Event name
   * @param data Event data
   */
  broadcastChannel(event: string, data: unknown): void {
    if (!this.channel) {
      console.warn('[MessageBus] BroadcastChannel not available');
      return;
    }

    try {
      this.channel.postMessage({ event, data, timestamp: Date.now() });
    } catch (error) {
      console.error('[MessageBus] Channel broadcast failed:', error);
    }
  }

  /**
   * Send a message to a specific client
   * @param clientId Target client ID
   * @param message Message to send
   * @returns True if sent successfully, false otherwise
   */
  async sendToClient(clientId: string, message: SWToMainMessage): Promise<boolean> {
    try {
      const client = await (self as unknown as ServiceWorkerGlobalScope).clients.get(clientId);

      if (!client) {
        console.warn(`[MessageBus] Client ${clientId} not found`);
        return false;
      }

      sendToClientInternal(client, message);
      return true;
    } catch (error) {
      console.error(`[MessageBus] Failed to send to client ${clientId}:`, error);
      return false;
    }
  }

  /**
   * Send a message to the focused/active client
   * @param message Message to send
   * @returns True if sent successfully, false if no focused client
   */
  async sendToFocused(message: SWToMainMessage): Promise<boolean> {
    try {
      const allClients = await (self as unknown as ServiceWorkerGlobalScope).clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      // Find focused client
      const focusedClient = allClients.find(
        client => (client as WindowClient).focused
      );

      if (focusedClient) {
        focusedClient.postMessage(message);
        return true;
      }

      // Fallback to first visible client
      const visibleClient = allClients.find(
        client => (client as WindowClient).visibilityState === 'visible'
      );

      if (visibleClient) {
        visibleClient.postMessage(message);
        return true;
      }

      return false;
    } catch (error) {
      console.error('[MessageBus] Failed to send to focused client:', error);
      return false;
    }
  }

  /**
   * Register a handler for channel messages
   * @param event Event name
   * @param handler Handler callback
   */
  onMessage(event: string, handler: MessageHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  /**
   * Remove a handler for channel messages
   * @param event Event name
   * @param handler Handler callback
   */
  offMessage(event: string, handler: MessageHandler): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * Handle incoming channel messages
   */
  private handleChannelMessage(data: { event: string; data: unknown }): void {
    const { event, data: eventData } = data;
    const handlers = this.handlers.get(event);

    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(eventData);
        } catch (error) {
          console.error(`[MessageBus] Handler error for event ${event}:`, error);
        }
      }
    }

    // Also trigger wildcard handlers
    const wildcardHandlers = this.handlers.get('*');
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        try {
          handler({ event, data: eventData });
        } catch (error) {
          console.error('[MessageBus] Wildcard handler error:', error);
        }
      }
    }
  }

  /**
   * Get count of connected clients
   */
  async getClientCount(): Promise<number> {
    try {
      const clients = await (self as unknown as ServiceWorkerGlobalScope).clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      return clients.length;
    } catch {
      return 0;
    }
  }

  /**
   * Get all connected client IDs
   */
  async getClientIds(): Promise<string[]> {
    try {
      const clients = await (self as unknown as ServiceWorkerGlobalScope).clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      return clients.map(client => client.id);
    } catch {
      return [];
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    this.handlers.clear();
  }
}

// Singleton instance for SW context
let instance: MessageBus | null = null;

/**
 * Get the singleton MessageBus instance
 */
export function getMessageBus(): MessageBus {
  if (!instance) {
    instance = new MessageBus();
  }
  return instance;
}

export default MessageBus;
