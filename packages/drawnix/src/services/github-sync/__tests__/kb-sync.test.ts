
import { describe, it, expect, vi } from 'vitest';
import { KnowledgeBaseSyncService } from '../knowledge-base-sync-service';
import { KBExportData } from '../../kb-import-export-service';
import { KBDirectory, KBNote } from '../../../types/knowledge-base.types';

// Mock logger
vi.mock('../sync-log-service', () => ({
  logInfo: vi.fn(),
  logDebug: vi.fn(),
}));

// Mock KBImportExportService
vi.mock('../../kb-import-export-service', () => ({
  exportAllData: vi.fn(),
}));

// Mock KnowledgeBaseService
vi.mock('../../knowledge-base-service', () => ({
  _getStoreInstances: vi.fn(),
}));

describe('KnowledgeBaseSyncService', () => {
  const service = new KnowledgeBaseSyncService();

  describe('merge', () => {
    it('should merge identical directories by ID', () => {
      const local: KBExportData = {
        directories: [{ id: 'd1', name: 'Dir1', updatedAt: 100 } as KBDirectory],
        notes: [], tags: [], noteTags: [], images: [], version: 2, exportedAt: 100
      };
      const remote: KBExportData = {
        directories: [{ id: 'd1', name: 'Dir1', updatedAt: 200 } as KBDirectory],
        notes: [], tags: [], noteTags: [], images: [], version: 2, exportedAt: 200
      };

      const result = service.merge(local, remote);
      expect(result.directories).toHaveLength(1);
      expect(result.directories[0].updatedAt).toBe(200);
    });

    it('should merge identical directories by Name (different IDs)', () => {
      const local: KBExportData = {
        directories: [{ id: 'd1', name: 'SameName', updatedAt: 100 } as KBDirectory],
        notes: [{ id: 'n1', directoryId: 'd1', title: 'Note1', updatedAt: 100 } as KBNote],
        tags: [], noteTags: [], images: [], version: 2, exportedAt: 100
      };
      const remote: KBExportData = {
        directories: [{ id: 'd2', name: 'SameName', updatedAt: 200 } as KBDirectory],
        notes: [], tags: [], noteTags: [], images: [], version: 2, exportedAt: 200
      };

      const result = service.merge(local, remote);
      
      // Directories should be merged into one
      expect(result.directories).toHaveLength(1);
      const mergedDir = result.directories[0];
      expect(mergedDir.name).toBe('SameName');
      expect(mergedDir.id).toBe('d2'); // Should keep remote ID (since remote processed first)
      expect(mergedDir.updatedAt).toBe(200); // Should pick newer timestamp

      // Notes should have directoryId remapped
      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].directoryId).toBe('d2');
    });

    it('should keep default status when merging', () => {
      const local: KBExportData = {
        directories: [{ id: 'd1', name: 'Inbox', isDefault: true, updatedAt: 100 } as KBDirectory],
        notes: [], tags: [], noteTags: [], images: [], version: 2, exportedAt: 100
      };
      const remote: KBExportData = {
        directories: [{ id: 'd2', name: 'Inbox', isDefault: false, updatedAt: 200 } as KBDirectory],
        notes: [], tags: [], noteTags: [], images: [], version: 2, exportedAt: 200
      };

      const result = service.merge(local, remote);
      expect(result.directories).toHaveLength(1);
      expect(result.directories[0].isDefault).toBe(true);
      expect(result.directories[0].id).toBe('d2');
    });
  });
});
