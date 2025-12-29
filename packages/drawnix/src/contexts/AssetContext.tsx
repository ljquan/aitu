/**
 * Asset Context
 * 素材Context - 状态管理
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  ReactNode,
  useEffect,
} from 'react';
import { MessagePlugin } from 'tdesign-react';
import { assetStorageService } from '../services/asset-storage-service';
import { getStorageStatus } from '../utils/storage-quota';
import type {
  Asset,
  AssetContextValue,
  AssetType,
  AssetSource,
  FilterState,
  StorageStatus,
} from '../types/asset.types';
import { DEFAULT_FILTER_STATE } from '../types/asset.types';

// 创建Context
const AssetContext = createContext<AssetContextValue | null>(null);

/**
 * Asset Provider Props
 */
interface AssetProviderProps {
  children: ReactNode;
}

/**
 * Asset Provider Component
 * 素材Provider组件
 */
export function AssetProvider({ children }: AssetProviderProps) {
  // 核心数据
  const [assets, setAssets] = useState<Asset[]>([]);

  // UI状态
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 筛选和排序
  const [filters, setFiltersState] = useState<FilterState>(DEFAULT_FILTER_STATE);

  // 选择
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  // 存储状态
  const [storageStatus, setStorageStatus] = useState<StorageStatus | null>(null);

  /**
   * Initialize service on mount
   * 组件挂载时初始化服务
   */
  useEffect(() => {
    const initService = async () => {
      try {
        await assetStorageService.initialize();
      } catch (err: any) {
        console.error('Failed to initialize asset storage service:', err);
        setError(err.message);
      }
    };

    initService();

    // Cleanup on unmount
    return () => {
      assetStorageService.cleanup();
    };
  }, []);

  /**
   * Load Assets
   * 加载所有素材
   */
  const loadAssets = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const loaded = await assetStorageService.getAllAssets();
      setAssets(loaded);
    } catch (err: any) {
      console.error('Failed to load assets:', err);
      setError(err.message);
      MessagePlugin.error({
        content: '加载素材失败，请刷新页面重试',
        duration: 3000,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Add Asset
   * 添加新素材
   */
  const addAsset = useCallback(
    async (
      file: File | Blob,
      type: AssetType,
      source: AssetSource,
      name?: string,
    ): Promise<Asset> => {
      console.log('[AssetContext] addAsset called with:', {
        fileName: file instanceof File ? file.name : 'Blob',
        type,
        source,
        name,
        fileSize: file.size,
        fileType: file.type,
      });

      setLoading(true);
      setError(null);

      try {
        // 生成默认名称
        const assetName =
          name ||
          (file instanceof File ? file.name : `asset-${Date.now()}`);

        const mimeType =
          file instanceof File ? file.type : 'application/octet-stream';

        console.log('[AssetContext] Calling assetStorageService.addAsset...');
        const asset = await assetStorageService.addAsset({
          type,
          source,
          name: assetName,
          blob: file,
          mimeType,
        });

        console.log('[AssetContext] Asset added to storage:', asset);

        // 更新状态
        setAssets((prev) => [asset, ...prev]); // 新素材排在最前面
        console.log('[AssetContext] Assets state updated');

        // 检查存储配额
        console.log('[AssetContext] Checking storage quota...');
        await checkStorageQuota();

        MessagePlugin.success({
          content: '素材添加成功',
          duration: 2000,
        });

        console.log('[AssetContext] addAsset completed successfully');
        return asset;
      } catch (err: any) {
        console.error('[AssetContext] Failed to add asset:', err);
        console.error('[AssetContext] Error name:', err.name);
        console.error('[AssetContext] Error message:', err.message);
        console.error('[AssetContext] Error stack:', err.stack);
        setError(err.message);

        if (err.name === 'QuotaExceededError') {
          MessagePlugin.error({
            content: '存储空间不足，请删除一些旧素材',
            duration: 5000,
          });
        } else if (err.name === 'ValidationError') {
          MessagePlugin.error({
            content: err.message,
            duration: 3000,
          });
        } else {
          MessagePlugin.error({
            content: '添加素材失败',
            duration: 3000,
          });
        }

        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  /**
   * Check Storage Quota
   * 检查存储配额
   */
  const checkStorageQuota = useCallback(async () => {
    try {
      const status = await getStorageStatus();
      setStorageStatus(status);

      // 如果接近限制，显示警告
      if (status.isCritical) {
        MessagePlugin.warning({
          content: `存储空间已使用 ${status.quota.percentUsed.toFixed(1)}%，即将达到上限。请删除一些旧素材。`,
          duration: 5000,
        });
      } else if (status.isNearLimit) {
        MessagePlugin.info({
          content: `存储空间已使用 ${status.quota.percentUsed.toFixed(1)}%，接近上限。`,
          duration: 3000,
        });
      }
    } catch (err: any) {
      console.error('Failed to check storage quota:', err);
    }
  }, []);

  /**
   * Remove Asset
   * 删除素材
   */
  const removeAsset = useCallback(async (id: string): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      await assetStorageService.removeAsset(id);

      // 更新状态
      setAssets((prev) => prev.filter((asset) => asset.id !== id));

      // 如果删除的是当前选中的素材，清除选中状态
      setSelectedAssetId((prev) => (prev === id ? null : prev));

      // 检查存储配额
      await checkStorageQuota();

      MessagePlugin.success({
        content: '素材删除成功',
        duration: 2000,
      });
    } catch (err: any) {
      console.error('Failed to remove asset:', err);
      setError(err.message);

      if (err.name === 'NotFoundError') {
        MessagePlugin.warning({
          content: '素材未找到，可能已被删除',
          duration: 3000,
        });
      } else {
        MessagePlugin.error({
          content: '删除素材失败',
          duration: 3000,
        });
      }

      throw err;
    } finally {
      setLoading(false);
    }
  }, [checkStorageQuota]);

  /**
   * Remove Multiple Assets (Batch Delete)
   * 批量删除素材 - 使用并行删除优化性能
   */
  const removeAssets = useCallback(async (ids: string[]): Promise<void> => {
    if (ids.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      // 并行删除所有素材
      const deleteResults = await Promise.allSettled(
        ids.map(id => assetStorageService.removeAsset(id))
      );

      // 统计成功和失败的结果
      const successIds: string[] = [];
      const errors: { id: string; error: any }[] = [];

      deleteResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          successIds.push(ids[index]);
        } else {
          console.error(`Failed to remove asset ${ids[index]}:`, result.reason);
          errors.push({ id: ids[index], error: result.reason });
        }
      });

      // 更新状态 - 只移除成功删除的素材
      setAssets((prev) => prev.filter((asset) => !successIds.includes(asset.id)));

      // 如果删除的包含当前选中的素材,清除选中状态
      if (selectedAssetId && successIds.includes(selectedAssetId)) {
        setSelectedAssetId(null);
      }

      // 检查存储配额
      await checkStorageQuota();

      // 显示结果消息
      if (errors.length === 0) {
        MessagePlugin.success({
          content: `成功删除 ${successIds.length} 个素材`,
          duration: 2000,
        });
      } else {
        MessagePlugin.warning({
          content: `删除了 ${successIds.length} 个素材，${errors.length} 个失败`,
          duration: 3000,
        });
      }
    } catch (err: any) {
      console.error('Batch remove assets error:', err);
      setError(err.message);
      MessagePlugin.error({
        content: '批量删除失败',
        duration: 3000,
      });
      throw err;
    } finally {
      setLoading(false);
    }
  }, [selectedAssetId, checkStorageQuota]);

  /**
   * Rename Asset
   * 重命名素材
   */
  const renameAsset = useCallback(
    async (id: string, newName: string): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        await assetStorageService.renameAsset(id, newName);

        // 更新状态
        setAssets((prev) =>
          prev.map((asset) =>
            asset.id === id ? { ...asset, name: newName } : asset,
          ),
        );

        MessagePlugin.success({
          content: '重命名成功',
          duration: 2000,
        });
      } catch (err: any) {
        console.error('Failed to rename asset:', err);
        setError(err.message);

        if (err.name === 'NotFoundError') {
          MessagePlugin.warning({
            content: '素材未找到，可能已被删除',
            duration: 3000,
          });
        } else if (err.name === 'ValidationError') {
          MessagePlugin.error({
            content: err.message,
            duration: 3000,
          });
        } else {
          MessagePlugin.error({
            content: '重命名失败',
            duration: 3000,
          });
        }

        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  /**
   * Set Filters
   * 设置筛选条件
   */
  const setFilters = useCallback((newFilters: Partial<FilterState>) => {
    setFiltersState((prev) => ({
      ...prev,
      ...newFilters,
    }));
  }, []);

  // Context value
  const value = useMemo<AssetContextValue>(
    () => ({
      // State
      assets,
      loading,
      error,
      filters,
      selectedAssetId,
      storageStatus,

      // Actions
      loadAssets,
      addAsset,
      removeAsset,
      removeAssets,
      renameAsset,
      setFilters,
      setSelectedAssetId,
      checkStorageQuota,
    }),
    [
      assets,
      loading,
      error,
      filters,
      selectedAssetId,
      storageStatus,
      loadAssets,
      addAsset,
      removeAsset,
      removeAssets,
      renameAsset,
      setFilters,
      checkStorageQuota,
    ],
  );

  return <AssetContext.Provider value={value}>{children}</AssetContext.Provider>;
}

/**
 * Use Assets Hook
 * 使用素材Context的Hook
 */
export function useAssets(): AssetContextValue {
  const context = useContext(AssetContext);

  if (!context) {
    throw new Error('useAssets must be used within AssetProvider');
  }

  return context;
}
