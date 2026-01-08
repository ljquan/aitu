/**
 * Asset Context
 * 素材Context - 状态管理
 *
 * 素材库数据来源：
 * 1. 本地上传的素材：存储在 IndexedDB 中
 * 2. AI 生成的素材：直接从任务队列获取已完成的任务
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
import { taskQueueService } from '../services/task-queue-service';
import { getStorageStatus } from '../utils/storage-quota';
import { getAssetSizeFromCache } from '../hooks/useAssetSize';
import type {
  Asset,
  AssetContextValue,
  AssetType,
  AssetSource,
  FilterState,
  StorageStatus,
} from '../types/asset.types';
import { AssetType as AssetTypeEnum, AssetSource as AssetSourceEnum, DEFAULT_FILTER_STATE } from '../types/asset.types';
import { TaskStatus, TaskType } from '../types/task.types';

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
   * Convert completed task to Asset
   * 将已完成的任务转换为素材
   */
  const taskToAsset = useCallback((task: any): Asset => {
    return {
      id: task.id,
      type: task.type === TaskType.IMAGE ? AssetTypeEnum.IMAGE : AssetTypeEnum.VIDEO,
      source: AssetSourceEnum.AI_GENERATED,
      url: task.result.url,
      name: task.params.prompt?.substring(0, 30) || 'AI生成',
      mimeType: task.result.format === 'mp4'
        ? 'video/mp4'
        : task.result.format === 'webm'
        ? 'video/webm'
        : `image/${task.result.format || 'png'}`,
      createdAt: task.completedAt || task.createdAt,
      size: task.result.size,
      prompt: task.params.prompt,
      modelName: task.params.model,
    };
  }, []);

  /**
   * Load Assets
   * 加载所有素材
   * 合并本地上传的素材和任务队列中已完成的 AI 生成任务
   */
  const loadAssets = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. 加载本地上传的素材（只包含 LOCAL 来源）
      const localAssets = await assetStorageService.getAllAssets();

      // 2. 从任务队列获取已完成的 AI 生成任务
      const completedTasks = taskQueueService.getTasksByStatus(TaskStatus.COMPLETED);
      const aiAssets = completedTasks
        .filter(task =>
          (task.type === TaskType.IMAGE || task.type === TaskType.VIDEO) &&
          task.result?.url
        )
        .map(taskToAsset);

      // 3. 合并两个来源的素材，按创建时间倒序排列
      const allAssets = [...localAssets, ...aiAssets].sort(
        (a, b) => b.createdAt - a.createdAt
      );

      setAssets(allAssets);

      // 4. 异步填充缺失的文件大小（从缓存获取）
      const assetsNeedingSize = allAssets.filter(a => !a.size || a.size === 0);
      if (assetsNeedingSize.length > 0) {
        // 并行获取所有缺失的文件大小
        const sizePromises = assetsNeedingSize.map(async (asset) => {
          const size = await getAssetSizeFromCache(asset.url);
          return { id: asset.id, size };
        });

        const sizeResults = await Promise.all(sizePromises);

        // 更新有新大小的素材
        const sizeMap = new Map(
          sizeResults
            .filter(r => r.size !== null && r.size > 0)
            .map(r => [r.id, r.size as number])
        );

        if (sizeMap.size > 0) {
          setAssets(prev =>
            prev.map(asset =>
              sizeMap.has(asset.id)
                ? { ...asset, size: sizeMap.get(asset.id) }
                : asset
            )
          );
        }
      }
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
  }, [taskToAsset]);

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
   * 本地素材：从 IndexedDB 删除
   * AI 生成素材：从任务队列删除
   */
  const removeAsset = useCallback(async (id: string): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      // 查找素材来源
      const asset = assets.find(a => a.id === id);

      if (asset?.source === AssetSourceEnum.AI_GENERATED) {
        // AI 生成的素材：从任务队列删除
        taskQueueService.deleteTask(id);
      } else {
        // 本地上传的素材：从 IndexedDB 删除
        await assetStorageService.removeAsset(id);
      }

      // 更新状态
      setAssets((prev) => prev.filter((a) => a.id !== id));

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
  }, [assets, checkStorageQuota]);

  /**
   * Remove Multiple Assets (Batch Delete)
   * 批量删除素材 - 区分本地素材和 AI 生成素材
   */
  const removeAssets = useCallback(async (ids: string[]): Promise<void> => {
    if (ids.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      const successIds: string[] = [];
      const errors: { id: string; error: any }[] = [];

      // 区分本地素材和 AI 生成素材
      const localIds: string[] = [];
      const aiIds: string[] = [];

      for (const id of ids) {
        const asset = assets.find(a => a.id === id);
        if (asset?.source === AssetSourceEnum.AI_GENERATED) {
          aiIds.push(id);
        } else {
          localIds.push(id);
        }
      }

      // 删除 AI 生成的素材（从任务队列）
      for (const id of aiIds) {
        try {
          taskQueueService.deleteTask(id);
          successIds.push(id);
        } catch (err) {
          console.error(`Failed to remove AI asset ${id}:`, err);
          errors.push({ id, error: err });
        }
      }

      // 并行删除本地素材
      if (localIds.length > 0) {
        const deleteResults = await Promise.allSettled(
          localIds.map(id => assetStorageService.removeAsset(id))
        );

        deleteResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            successIds.push(localIds[index]);
          } else {
            console.error(`Failed to remove asset ${localIds[index]}:`, result.reason);
            errors.push({ id: localIds[index], error: result.reason });
          }
        });
      }

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
  }, [assets, selectedAssetId, checkStorageQuota]);

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
