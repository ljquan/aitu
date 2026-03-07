/**
 * Backup & Restore Service - Facade
 * 保持向后兼容的入口
 */

import { backupExportService } from './backup-export-service';
import { backupImportService } from './backup-import-service';
import type { BackupOptions, ExportResult, ImportResult, ProgressCallback } from './types';

class BackupRestoreService {
  exportToZip(options: BackupOptions, onProgress?: ProgressCallback): Promise<ExportResult> {
    return backupExportService.exportToZip(options, onProgress);
  }

  importFromZip(file: File, onProgress?: ProgressCallback): Promise<ImportResult> {
    return backupImportService.importFromZip(file, onProgress);
  }

  downloadZip(blob: Blob, filename?: string): void {
    backupExportService.downloadZip(blob, filename);
  }
}

export const backupRestoreService = new BackupRestoreService();

// Re-export all types
export type {
  BackupOptions,
  BackupWorkspaceState,
  ImportResult,
  ExportResult,
  ProgressCallback,
  BackupManifest,
} from './types';
