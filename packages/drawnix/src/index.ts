export * from './drawnix';
export * from './utils';
export * from './i18n';
export * from './constants/storage';

// Export Gemini API utilities
export * from './utils/gemini-api';

// Export project management (folder/board structure)
export * from './hooks/useWorkspace';
export * from './hooks/useDocumentTitle';
export * from './services/workspace-service';
export * from './services/workspace-migration';
export * from './types/workspace.types';

// Export unified cache service
export { unifiedCacheService } from './services/unified-cache-service';
export type { CachedMedia, CacheStatus } from './services/unified-cache-service';

// Export SW channel client
export { swChannelClient } from './services/sw-channel/client';
export type { SWChannelEventHandlers } from './services/sw-channel/client';

// Export initialization services (for main.tsx)
export { initWebVitals } from './services/web-vitals-service';
export { initPageReport } from './services/page-report-service';
export { initPreventPinchZoom } from './services/prevent-pinch-zoom-service';
export { runDatabaseCleanup } from './services/db-cleanup-service';
export { storageMigrationService } from './services/storage-migration-service';
export { initPromptStorageCache } from './services/prompt-storage-service';
export { toolbarConfigService } from './services/toolbar-config-service';
export { memoryMonitorService } from './services/memory-monitor-service';
export { crashRecoveryService } from './services/crash-recovery-service';
export type { CrashRecoveryState, CrashInfo } from './services/crash-recovery-service';