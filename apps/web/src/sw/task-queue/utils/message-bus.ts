/**
 * Message Bus Module
 *
 * Unified message communication layer for Service Worker.
 * Handles broadcasting to all clients and sending to specific clients.
 */

import { SWToMainMessage } from '../types';

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

      // Send to all matching clients
      for (const client of targetClients) {
        try {
          client.postMessage(message);
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

      client.postMessage(message);
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
