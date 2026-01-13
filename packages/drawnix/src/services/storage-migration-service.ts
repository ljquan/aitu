/**
 * Storage Migration Service
 *
 * 负责将 LocalStorage 中有增量风险的数据迁移到 IndexedDB
 * 实现向下兼容：先迁移数据，验证成功后再删除旧数据
 */

import { LS_KEYS, LS_KEYS_TO_MIGRATE } from '../constants/storage-keys';
import { kvStorageService } from './kv-storage-service';

/** 迁移配置 */
interface MigrationConfig {
  /** LocalStorage 中的键名 */
  lsKey: string;
  /** IndexedDB 中的键名（可以与 lsKey 相同） */
  idbKey: string;
  /** 迁移后是否删除 LocalStorage 中的数据 */
  deleteAfterMigration: boolean;
}

/** 迁移结果 */
interface MigrationResult {
  key: string;
  success: boolean;
  error?: string;
}

/**
 * 需要迁移的数据配置
 */
const MIGRATION_CONFIGS: MigrationConfig[] = [
  {
    lsKey: LS_KEYS_TO_MIGRATE.PROMPT_HISTORY,
    idbKey: LS_KEYS_TO_MIGRATE.PROMPT_HISTORY,
    deleteAfterMigration: true,
  },
  {
    lsKey: LS_KEYS_TO_MIGRATE.VIDEO_PROMPT_HISTORY,
    idbKey: LS_KEYS_TO_MIGRATE.VIDEO_PROMPT_HISTORY,
    deleteAfterMigration: true,
  },
  {
    lsKey: LS_KEYS_TO_MIGRATE.PRESET_SETTINGS,
    idbKey: LS_KEYS_TO_MIGRATE.PRESET_SETTINGS,
    deleteAfterMigration: true,
  },
  {
    lsKey: LS_KEYS_TO_MIGRATE.BATCH_IMAGE_CACHE,
    idbKey: LS_KEYS_TO_MIGRATE.BATCH_IMAGE_CACHE,
    deleteAfterMigration: true,
  },
  {
    lsKey: LS_KEYS_TO_MIGRATE.RECENT_TEXT_COLORS,
    idbKey: LS_KEYS_TO_MIGRATE.RECENT_TEXT_COLORS,
    deleteAfterMigration: true,
  },
  {
    lsKey: LS_KEYS_TO_MIGRATE.CUSTOM_GRADIENTS,
    idbKey: LS_KEYS_TO_MIGRATE.CUSTOM_GRADIENTS,
    deleteAfterMigration: true,
  },
  {
    lsKey: LS_KEYS_TO_MIGRATE.CUSTOM_FONTS,
    idbKey: LS_KEYS_TO_MIGRATE.CUSTOM_FONTS,
    deleteAfterMigration: true,
  },
  {
    lsKey: LS_KEYS_TO_MIGRATE.TOOLBAR_CONFIG,
    idbKey: LS_KEYS_TO_MIGRATE.TOOLBAR_CONFIG,
    deleteAfterMigration: true,
  },
];

/**
 * 检查迁移是否已完成
 */
function isMigrationDone(): boolean {
  try {
    return localStorage.getItem(LS_KEYS.LS_TO_IDB_MIGRATION_DONE) !== null;
  } catch {
    return false;
  }
}

/**
 * 标记迁移完成
 */
function markMigrationDone(): void {
  try {
    localStorage.setItem(LS_KEYS.LS_TO_IDB_MIGRATION_DONE, Date.now().toString());
  } catch (error) {
    console.error('[StorageMigration] Failed to mark migration done:', error);
  }
}

/**
 * 从 LocalStorage 读取数据
 */
function readFromLocalStorage(key: string): unknown | null {
  try {
    const data = localStorage.getItem(key);
    if (data === null) return null;
    return JSON.parse(data);
  } catch (error) {
    console.warn(`[StorageMigration] Failed to read ${key} from LocalStorage:`, error);
    return null;
  }
}

/**
 * 从 LocalStorage 删除数据
 */
function deleteFromLocalStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.warn(`[StorageMigration] Failed to delete ${key} from LocalStorage:`, error);
  }
}

/**
 * 迁移单个数据项
 */
async function migrateItem(config: MigrationConfig): Promise<MigrationResult> {
  const { lsKey, idbKey, deleteAfterMigration } = config;

  try {
    // 1. 从 LocalStorage 读取数据
    const data = readFromLocalStorage(lsKey);

    // 如果没有数据，跳过
    if (data === null) {
      return { key: lsKey, success: true };
    }

    // 2. 检查 IndexedDB 中是否已有数据
    const existingData = await kvStorageService.get(idbKey);
    if (existingData !== null) {
      // IndexedDB 中已有数据，可能是之前迁移过但标记失败
      // 删除 LocalStorage 中的旧数据
      if (deleteAfterMigration) {
        deleteFromLocalStorage(lsKey);
      }
      return { key: lsKey, success: true };
    }

    // 3. 写入 IndexedDB
    await kvStorageService.set(idbKey, data);

    // 4. 验证写入成功
    const verifyData = await kvStorageService.get(idbKey);
    if (verifyData === null) {
      return {
        key: lsKey,
        success: false,
        error: 'Verification failed: data not found after write',
      };
    }

    // 5. 删除 LocalStorage 中的旧数据
    if (deleteAfterMigration) {
      deleteFromLocalStorage(lsKey);
    }

    return { key: lsKey, success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[StorageMigration] Failed to migrate ${lsKey}:`, error);
    return { key: lsKey, success: false, error: errorMessage };
  }
}

/**
 * 执行所有数据迁移
 */
async function runMigration(): Promise<MigrationResult[]> {
  // 检查 IndexedDB 是否可用
  if (!kvStorageService.isAvailable()) {
    console.warn('[StorageMigration] IndexedDB not available, skipping migration');
    return [];
  }

  // 检查是否已迁移
  if (isMigrationDone()) {
    return [];
  }

  // console.log('[StorageMigration] Starting migration...');

  const results: MigrationResult[] = [];

  for (const config of MIGRATION_CONFIGS) {
    const result = await migrateItem(config);
    results.push(result);

    if (result.success) {
      // console.log(`[StorageMigration] Migrated: ${result.key}`);
    } else {
      console.warn(`[StorageMigration] Failed: ${result.key} - ${result.error}`);
    }
  }

  // 统计结果
  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  // console.log(
  //   `[StorageMigration] Migration complete: ${successCount} success, ${failCount} failed`
  // );

  // 只有全部成功才标记迁移完成
  if (failCount === 0) {
    markMigrationDone();
  }

  return results;
}

/**
 * 重置迁移状态（用于调试）
 */
function resetMigration(): void {
  try {
    localStorage.removeItem(LS_KEYS.LS_TO_IDB_MIGRATION_DONE);
    // console.log('[StorageMigration] Migration status reset');
  } catch (error) {
    console.error('[StorageMigration] Failed to reset migration status:', error);
  }
}

/**
 * 存储迁移服务
 */
export const storageMigrationService = {
  /** 检查迁移是否已完成 */
  isMigrationDone,
  /** 执行迁移 */
  runMigration,
  /** 重置迁移状态（用于调试） */
  resetMigration,
  /** 迁移配置列表 */
  MIGRATION_CONFIGS,
};

// 导出调试接口
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__storageMigration = {
    run: runMigration,
    reset: resetMigration,
    isDone: isMigrationDone,
    configs: MIGRATION_CONFIGS,
  };
}

export default storageMigrationService;
