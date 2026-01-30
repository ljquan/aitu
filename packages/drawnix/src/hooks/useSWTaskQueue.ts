/**
 * Service Worker Task Queue Hook
 *
 * Initializes and manages the SW-based task queue.
 * Handles initialization, configuration updates, and task synchronization.
 *
 * Key features:
 * - Auto-initializes SW task queue on mount
 * - Syncs tasks from SW on page load (tasks persist in SW's IndexedDB)
 * - Listens for settings changes and updates SW config
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { swTaskQueueService } from '../services/sw-task-queue-service';
import { swChannelClient } from '../services/sw-channel';
import type { SWTask } from '../services/sw-channel';
import { geminiSettings } from '../utils/settings-manager';

interface UseSWTaskQueueOptions {
  /** Auto-initialize on mount */
  autoInit?: boolean;
  /** Callback when tasks are synced from SW */
  onTasksSync?: (tasks: SWTask[]) => void;
}

interface UseSWTaskQueueReturn {
  /** Whether SW task queue is initialized */
  initialized: boolean;
  /** Whether initialization is in progress */
  initializing: boolean;
  /** Error message if initialization failed */
  error: string | null;
  /** Manually initialize the SW task queue */
  initialize: () => Promise<boolean>;
  /** Whether Service Worker is supported */
  isSupported: boolean;
  /** Request task sync from SW */
  syncTasks: () => Promise<SWTask[]>;
}

/**
 * Hook to manage SW task queue lifecycle
 */
export function useSWTaskQueue(
  options: UseSWTaskQueueOptions = {}
): UseSWTaskQueueReturn {
  const { autoInit = true, onTasksSync } = options;

  const [initialized, setInitialized] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initAttempted = useRef(false);
  const onTasksSyncRef = useRef(onTasksSync);

  // Keep callback ref updated
  useEffect(() => {
    onTasksSyncRef.current = onTasksSync;
  }, [onTasksSync]);

  const isSupported = 'serviceWorker' in navigator;

  const syncTasks = useCallback(async () => {
    if (!isSupported) return [];
    const result = await swChannelClient.listTasks();
    const tasks = result.tasks || [];
    if (tasks.length > 0 && onTasksSyncRef.current) {
      onTasksSyncRef.current(tasks);
    }
    return tasks;
  }, [isSupported]);

  const initialize = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      setError('Service Worker not supported');
      return false;
    }

    if (initialized || initializing) {
      return initialized;
    }

    setInitializing(true);
    setError(null);

    try {
      // Initialize SW task queue service
      const success = await swTaskQueueService.initialize();

      if (!success) {
        setError('Failed to initialize SW task queue');
        setInitializing(false);
        return false;
      }

      // Sync tasks from SW (tasks are persisted in SW's IndexedDB)
      const result = await swChannelClient.listTasks();
      const tasks = result.tasks || [];
      if (tasks.length > 0) {
        if (onTasksSyncRef.current) {
          onTasksSyncRef.current(tasks);
        }
      }

      setInitialized(true);
      setInitializing(false);
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      setInitializing(false);
      return false;
    }
  }, [isSupported, initialized, initializing]);

  // Auto-initialize on mount
  useEffect(() => {
    if (autoInit && isSupported && !initAttempted.current) {
      initAttempted.current = true;
      initialize();
    }
  }, [autoInit, isSupported, initialize]);

  // Listen for settings changes and update SW config
  useEffect(() => {
    if (!initialized) return;

    const handleSettingsChange = () => {
      const settings = geminiSettings.get();
      swChannelClient.updateConfig({
        geminiConfig: {
          apiKey: settings.apiKey,
          baseUrl: settings.baseUrl,
          modelName: settings.chatModel,
        },
        videoConfig: {
          baseUrl: 'https://api.tu-zi.com',
        },
      });
    };

    geminiSettings.addListener(handleSettingsChange);
    return () => {
      geminiSettings.removeListener(handleSettingsChange);
    };
  }, [initialized]);

  // Listen for task created events from SW
  useEffect(() => {
    if (!isSupported || !initialized) return;

    // Set up event handler to listen for task sync events
    swChannelClient.setEventHandlers({
      onTaskCreated: (event) => {
        // Trigger sync when new task is created (from another tab)
        if (onTasksSyncRef.current && event.task) {
          syncTasks();
        }
      },
    });

    return () => {
      // Clean up event handlers on unmount
      swChannelClient.setEventHandlers({
        onTaskCreated: undefined,
      });
    };
  }, [isSupported, initialized, syncTasks]);

  return {
    initialized,
    initializing,
    error,
    initialize,
    isSupported,
    syncTasks,
  };
}
