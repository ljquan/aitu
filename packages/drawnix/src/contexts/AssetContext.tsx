/**
 * Asset Context
 * 素材Context - 状态管理
 *
 * 素材库数据来源：
 * 1. 本地上传的素材：存储在 IndexedDB (aitu-assets) 中
 * 2. AI 生成的素材：直接从任务队列获取已完成的任务
 * 3. 缓存中的素材：从 drawnix-unified-cache 获取，去重后合并展示
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
import { taskQueueService } from '../services/task-queue';
import { unifiedCacheService } from '../services/unified-cache-service';
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
import { AssetContext } from './asset-context-instance';


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
   * 从文件名中提取时间戳
   */
  const extractTimestampFromFilename = useCallback((filename: string): number => {
    // 尝试从文件名中提取时间戳（格式：xxx-1234567890123.ext 或 xxx-1234567890123-xxx.ext）
    const timestampMatch = filename.match(/[-_](\d{13})(?:[-_.]|$)/);
    if (timestampMatch) {
      return parseInt(timestampMatch[1], 10);
    }
    // 尝试匹配 10 位时间戳（秒级）
    const shortTimestampMatch = filename.match(/[-_](\d{10})(?:[-_.]|$)/);
    if (shortTimestampMatch) {
      return parseInt(shortTimestampMatch[1], 10) * 1000;
    }
    return Date.now();
  }, []);

  /**
   * 从 Cache Storage 和 IndexedDB 同步获取本地缓存的媒体资源
   * 1. 从 Cache Storage 获取所有有效的 URL
   * 2. 从 IndexedDB (unified-cache) 获取元数据
   * 3. 过滤掉 IndexedDB 中无效的（Cache Storage 中没有的）
   * 4. 为 Cache Storage 中有但 IndexedDB 中没有的创建元数据
   */
  const getAssetsFromCacheStorage = useCallback(async (): Promise<Asset[]> => {
    if (typeof caches === 'undefined') return [];
    
    try {
      const cache = await caches.open('drawnix-images');
      const requests = await cache.keys();
      
      // 1. 收集 Cache Storage 中有效的 URL 及其信息
      const cacheStorageMap = new Map<string, {
        pathname: string;
        isVideo: boolean;
        size: number;
        mimeType: string;
        cachedAt: number;
        filename: string;
      }>();
      
      for (const request of requests) {
        const url = new URL(request.url);
        const pathname = url.pathname;
        
        // 处理 /__aitu_cache__/ 和 /asset-library/ 前缀的资源
        const isAituCache = pathname.startsWith('/__aitu_cache__/');
        const isAssetLibrary = pathname.startsWith('/asset-library/');
        
        if (!isAituCache && !isAssetLibrary) continue;
        
        // 判断媒体类型
        const isVideo = pathname.includes('/video/') || 
                        /\.(mp4|webm|mov)$/i.test(pathname);
        const isImage = pathname.includes('/image/') || 
                        /\.(jpg|jpeg|png|gif|webp)$/i.test(pathname);
        
        if (!isVideo && !isImage) continue;
        
        // 获取响应以读取大小和时间
        const response = await cache.match(request);
        if (!response) continue;
        
        const size = parseInt(response.headers.get('Content-Length') || response.headers.get('sw-image-size') || '0', 10);
        const mimeType = response.headers.get('Content-Type') || 
                        (isVideo ? 'video/mp4' : 'image/png');
        const filename = pathname.split('/').pop() || '';
        
        // 从响应头获取缓存时间戳
        const cacheDate = response.headers.get('sw-cache-date');
        const cachedAt = cacheDate 
          ? parseInt(cacheDate, 10) 
          : extractTimestampFromFilename(filename);
        
        cacheStorageMap.set(pathname, {
          pathname,
          isVideo,
          size,
          mimeType,
          cachedAt,
          filename,
        });
      }
      
      // 2. 从 IndexedDB 获取元数据
      const cachedMediaList = await unifiedCacheService.getAllCachedMedia();
      const indexedDBMap = new Map<string, typeof cachedMediaList[0]>();
      for (const item of cachedMediaList) {
        // 统一使用 pathname 作为 key
        const pathname = item.url.startsWith('/') ? item.url : new URL(item.url).pathname;
        indexedDBMap.set(pathname, item);
      }
      
      const assets: Asset[] = [];
      
      // 3. 遍历 Cache Storage，构建素材列表
      for (const [pathname, cacheInfo] of cacheStorageMap) {
        const indexedDBItem = indexedDBMap.get(pathname);
        
        if (indexedDBItem) {
          // IndexedDB 中有元数据，使用它
          assets.push({
            id: `unified-cache-${cacheInfo.filename}`,
            type: cacheInfo.isVideo ? AssetTypeEnum.VIDEO : AssetTypeEnum.IMAGE,
            source: AssetSourceEnum.LOCAL,
            url: pathname,
            name: indexedDBItem.metadata?.name || cacheInfo.filename,
            mimeType: indexedDBItem.mimeType || cacheInfo.mimeType,
            createdAt: indexedDBItem.cachedAt || cacheInfo.cachedAt,
            size: indexedDBItem.size || cacheInfo.size,
          });
        } else {
          // Cache Storage 中有但 IndexedDB 中没有，创建元数据
          await unifiedCacheService.createCachedMediaMetadata(
            pathname,
            cacheInfo.isVideo ? 'video' : 'image',
            cacheInfo.mimeType,
            cacheInfo.size,
            cacheInfo.cachedAt,
            { name: cacheInfo.filename }
          );
          
          assets.push({
            id: `unified-cache-${cacheInfo.filename}`,
            type: cacheInfo.isVideo ? AssetTypeEnum.VIDEO : AssetTypeEnum.IMAGE,
            source: AssetSourceEnum.LOCAL,
            url: pathname,
            name: cacheInfo.filename,
            mimeType: cacheInfo.mimeType,
            createdAt: cacheInfo.cachedAt,
            size: cacheInfo.size,
          });
        }
      }
      
      return assets;
    } catch (error) {
      console.error('[AssetContext] Failed to get assets from Cache Storage:', error);
      return [];
    }
  }, [extractTimestampFromFilename]);

  /**
   * Load Assets
   * 加载所有素材
   * 合并本地上传的素材、任务队列中已完成的 AI 生成任务、以及 Cache Storage 中的媒体
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

      // 3. 从 Cache Storage 获取媒体（优先级最低，用于补充）
      const cacheStorageAssets = await getAssetsFromCacheStorage();
      
      // 4. 收集已有素材的 URL 用于去重（提取路径部分进行比较）
      const extractPath = (url: string): string => {
        // 如果是完整 URL，提取 pathname
        if (url.startsWith('http')) {
          try {
            return new URL(url).pathname;
          } catch {
            return url;
          }
        }
        return url;
      };
      
      const existingUrls = new Set<string>([
        ...localAssets.map(a => extractPath(a.url)),
        ...aiAssets.map(a => extractPath(a.url)),
      ]);
      
      // 5. 过滤掉已存在的 Cache Storage 素材
      const uniqueCacheAssets = cacheStorageAssets.filter(
        asset => !existingUrls.has(extractPath(asset.url))
      );

      // 6. 合并三个来源的素材，按创建时间倒序排列
      const allAssets = [...localAssets, ...aiAssets, ...uniqueCacheAssets].sort(
        (a, b) => b.createdAt - a.createdAt
      );

      setAssets(allAssets);

      // 7. 异步填充缺失的文件大小（从缓存获取）
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
  }, [taskToAsset, getAssetsFromCacheStorage]);

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
      // console.log('[AssetContext] addAsset called with:', {
      //   fileName: file instanceof File ? file.name : 'Blob',
      //   type,
      //   source,
      //   name,
      //   fileSize: file.size,
      //   fileType: file.type,
      // });

      setLoading(true);
      setError(null);

      try {
        // 生成默认名称
        const assetName =
          name ||
          (file instanceof File ? file.name : `asset-${Date.now()}`);

        const mimeType =
          file instanceof File ? file.type : 'application/octet-stream';

        // console.log('[AssetContext] Calling assetStorageService.addAsset...');
        const asset = await assetStorageService.addAsset({
          type,
          source,
          name: assetName,
          blob: file,
          mimeType,
        });

        // console.log('[AssetContext] Asset added to storage:', asset);

        // 更新状态
        setAssets((prev) => [asset, ...prev]); // 新素材排在最前面
        // console.log('[AssetContext] Assets state updated');

        // 检查存储配额
        // console.log('[AssetContext] Checking storage quota...');
        await checkStorageQuota();

        MessagePlugin.success({
          content: '素材添加成功',
          duration: 2000,
        });

        // console.log('[AssetContext] addAsset completed successfully');
        return asset;
      } catch (err: any) {
        console.error('[AssetContext] Failed to add asset:', err);
        // console.error('[AssetContext] Error name:', err.name);
        // console.error('[AssetContext] Error message:', err.message);
        // console.error('[AssetContext] Error stack:', err.stack);
        setError(err.message);

        if (err.name === 'QuotaExceededError') {
          MessagePlugin.error({
            content: '本地存储空间不足，请删除一些旧素材',
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
          content: `本地存储空间已使用 ${status.quota.percentUsed.toFixed(1)}%，即将达到上限。请删除一些旧素材。`,
          duration: 5000,
        });
      } else if (status.isNearLimit) {
        MessagePlugin.info({
          content: `本地存储空间已使用 ${status.quota.percentUsed.toFixed(1)}%，接近上限。`,
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
   * 缓存素材：从 unified-cache 删除
   */
  const removeAsset = useCallback(async (id: string): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      // 查找素材来源
      const asset = assets.find(a => a.id === id);

      if (id.startsWith('cache-')) {
        // 缓存素材：从 unified-cache 删除
        const url = id.replace('cache-', '');
        await unifiedCacheService.deleteCache(url);
      } else if (asset?.source === AssetSourceEnum.AI_GENERATED) {
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
   * 批量删除素材 - 区分本地素材、AI 生成素材和缓存素材
   */
  const removeAssets = useCallback(async (ids: string[]): Promise<void> => {
    if (ids.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      const successIds: string[] = [];
      const errors: { id: string; error: any }[] = [];

      // 区分本地素材、AI 生成素材和缓存素材
      const localIds: string[] = [];
      const aiIds: string[] = [];
      const cacheIds: string[] = [];

      for (const id of ids) {
        if (id.startsWith('cache-')) {
          cacheIds.push(id);
        } else {
          const asset = assets.find(a => a.id === id);
          if (asset?.source === AssetSourceEnum.AI_GENERATED) {
            aiIds.push(id);
          } else {
            localIds.push(id);
          }
        }
      }

      // 删除缓存素材（从 unified-cache）
      for (const id of cacheIds) {
        try {
          const url = id.replace('cache-', '');
          await unifiedCacheService.deleteCache(url);
          successIds.push(id);
        } catch (err) {
          console.error(`Failed to remove cache asset ${id}:`, err);
          errors.push({ id, error: err });
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
   * 支持两种来源的素材：
   * - unified-cache-* ID：使用 unifiedCacheService 更新元数据
   * - 其他 ID：使用 assetStorageService 更新
   */
  const renameAsset = useCallback(
    async (id: string, newName: string): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        // 根据 ID 前缀判断使用哪个服务
        if (id.startsWith('unified-cache-')) {
          // 从 unified-cache 获取的素材
          const asset = assets.find(a => a.id === id);
          if (asset) {
            const success = await unifiedCacheService.updateCachedMedia(asset.url, {
              metadata: { name: newName }
            });
            if (!success) {
              throw new Error('更新缓存元数据失败');
            }
          }
        } else {
          // 从 assetStorageService 获取的素材
          await assetStorageService.renameAsset(id, newName);
        }

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
    [assets],
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
