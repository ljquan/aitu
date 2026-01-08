/**
 * Media Library Grid
 * 素材库网格视图组件 - 使用虚拟滚动优化大数据量性能
 */

import { useMemo, useState, useCallback, useRef, useEffect, useTransition } from 'react';
import { Loading, Input, Button, Checkbox, Popconfirm } from 'tdesign-react';
import { Upload as UploadIcon, Search, Trash2, CheckSquare, XSquare } from 'lucide-react';
import { useAssets } from '../../contexts/AssetContext';
import { filterAssets } from '../../utils/asset-utils';
import { VirtualAssetGrid } from './VirtualAssetGrid';
import { MediaLibraryEmpty } from './MediaLibraryEmpty';
import { ViewModeToggle } from './ViewModeToggle';
import type { MediaLibraryGridProps, ViewMode } from '../../types/asset.types';
import './MediaLibraryGrid.scss';
import './VirtualAssetGrid.scss';

// 视图切换防抖时间
const VIEW_MODE_DEBOUNCE_MS = 150;

// localStorage key
const VIEW_MODE_STORAGE_KEY = 'media-library-view-mode';

// 从 localStorage 读取视图模式
const getStoredViewMode = (): ViewMode => {
  try {
    const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (stored === 'grid' || stored === 'compact' || stored === 'list') {
      return stored;
    }
  } catch {
    // localStorage 不可用时忽略
  }
  return 'grid';
};

export function MediaLibraryGrid({
  filterType,
  selectedAssetId,
  onSelectAsset,
  onDoubleClick,
  onFileUpload,
  onUploadClick,
}: MediaLibraryGridProps) {
  const { assets, filters, loading, setFilters, removeAssets } = useAssets();
  const [isDragging, setIsDragging] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());

  // 视图模式状态 - 使用两个状态实现平滑过渡，从 localStorage 恢复
  const [viewMode, setViewMode] = useState<ViewMode>(getStoredViewMode);
  const [pendingViewMode, setPendingViewMode] = useState<ViewMode>(getStoredViewMode);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isPending, startTransition] = useTransition();
  const viewModeDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // 应用筛选和排序
  const filteredResult = useMemo(() => {
    const result = filterAssets(assets, filters);
    return result;
  }, [assets, filters]);

  // 视图模式切换处理 - 带防抖和过渡动画，并持久化到 localStorage
  const handleViewModeChange = useCallback((mode: ViewMode) => {
    // 如果相同模式，不处理
    if (mode === viewMode) return;

    // 清除之前的防抖定时器
    if (viewModeDebounceRef.current) {
      clearTimeout(viewModeDebounceRef.current);
    }

    // 立即更新按钮状态
    setPendingViewMode(mode);

    // 显示过渡状态
    setIsTransitioning(true);

    // 保存到 localStorage
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {
      // localStorage 不可用时忽略
    }

    // 防抖处理实际的视图切换
    viewModeDebounceRef.current = setTimeout(() => {
      // 使用 startTransition 降低优先级，让 UI 保持响应
      startTransition(() => {
        setViewMode(mode);
        // 延迟关闭过渡状态，让动画完成
        setTimeout(() => {
          setIsTransitioning(false);
        }, 100);
      });
    }, VIEW_MODE_DEBOUNCE_MS);
  }, [viewMode]);

  // 清理防抖定时器
  useEffect(() => {
    return () => {
      if (viewModeDebounceRef.current) {
        clearTimeout(viewModeDebounceRef.current);
      }
    };
  }, []);

  // 全选逻辑
  const isAllSelected = useMemo(() => {
    if (filteredResult.assets.length === 0) return false;
    return filteredResult.assets.every(asset => selectedAssetIds.has(asset.id));
  }, [filteredResult.assets, selectedAssetIds]);

  const isPartialSelected = useMemo(() => {
    if (filteredResult.assets.length === 0) return false;
    const selectedCount = filteredResult.assets.filter(asset => selectedAssetIds.has(asset.id)).length;
    return selectedCount > 0 && selectedCount < filteredResult.assets.length;
  }, [filteredResult.assets, selectedAssetIds]);

  // 拖放事件处理
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files && files.length > 0 && onFileUpload) {
        onFileUpload(files);
      }
    },
    [onFileUpload],
  );

  // 批量选择处理
  const toggleSelectionMode = useCallback(() => {
    setIsSelectionMode(prev => !prev);
    setSelectedAssetIds(new Set()); // 清空选择
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (isAllSelected) {
      setSelectedAssetIds(new Set());
    } else {
      setSelectedAssetIds(new Set(filteredResult.assets.map(asset => asset.id)));
    }
  }, [isAllSelected, filteredResult.assets]);

  const toggleAssetSelection = useCallback((assetId: string) => {
    setSelectedAssetIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(assetId)) {
        newSet.delete(assetId);
      } else {
        newSet.add(assetId);
      }
      return newSet;
    });
  }, []);

  // 批量删除处理
  const handleBatchDelete = useCallback(async () => {
    const idsToDelete = Array.from(selectedAssetIds);
    try {
      await removeAssets(idsToDelete);
      setSelectedAssetIds(new Set()); // 清空选择
      setIsSelectionMode(false); // 退出选择模式
    } catch (error) {
      console.error('[MediaLibraryGrid] Batch delete failed:', error);
    }
  }, [selectedAssetIds, removeAssets]);

  if (loading && assets.length === 0) {
    return (
      <div className="media-library-grid__loading">
        <Loading size="large" text="加载素材中..." />
      </div>
    );
  }

  return (
    <div
      className={`media-library-grid ${isDragging ? 'media-library-grid--dragging' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="media-library-grid__header">
        <Input
          value={filters.searchQuery}
          onChange={(value) => setFilters({ searchQuery: value as string })}
          placeholder="搜索素材名称..."
          prefixIcon={<Search size={16} />}
          clearable
          data-track="grid_search_input"
          className="media-library-grid__search"
        />
        <div className="media-library-grid__header-actions">
          {isSelectionMode ? (
            <>
              <Checkbox
                checked={isAllSelected}
                indeterminate={isPartialSelected}
                onChange={toggleSelectAll}
                data-track="grid_select_all"
              >
                全选
              </Checkbox>
              <span className="media-library-grid__selection-count">
                已选 {selectedAssetIds.size} 个
              </span>
              <Popconfirm
                content={`确定要删除选中的 ${selectedAssetIds.size} 个素材吗？`}
                onConfirm={handleBatchDelete}
                theme="warning"
              >
                <Button
                  variant="base"
                  theme="danger"
                  size="small"
                  icon={<Trash2 size={16} />}
                  disabled={selectedAssetIds.size === 0}
                  data-track="grid_batch_delete"
                >
                  删除选中
                </Button>
              </Popconfirm>
              <Button
                variant="outline"
                size="small"
                icon={<XSquare size={16} />}
                onClick={toggleSelectionMode}
                data-track="grid_cancel_selection"
              >
                取消
              </Button>
            </>
          ) : (
            <>
              <ViewModeToggle viewMode={pendingViewMode} onViewModeChange={handleViewModeChange} />
              <span className="media-library-grid__count">
                共 {filteredResult.count} 个素材
              </span>
              <Button
                variant="outline"
                size="small"
                icon={<CheckSquare size={16} />}
                onClick={toggleSelectionMode}
                data-track="grid_toggle_selection_mode"
              >
                批量选择
              </Button>
              <Button
                variant="base"
                theme="primary"
                size="small"
                icon={<UploadIcon size={16} />}
                onClick={onUploadClick}
                data-track="grid_upload_click"
              >
                上传
              </Button>
            </>
          )}
        </div>
      </div>

      {isDragging && (
        <div className="media-library-grid__drop-overlay">
          <div className="media-library-grid__drop-message">
            <div className="media-library-grid__drop-message-icon">
              <UploadIcon size={32} />
            </div>
            <h3 className="media-library-grid__drop-message-title">拖放文件到这里</h3>
            <p className="media-library-grid__drop-message-description">支持 JPG、PNG、MP4 格式</p>
          </div>
        </div>
      )}

      {filteredResult.isEmpty ? (
        <MediaLibraryEmpty />
      ) : (
        <>
          {/* 虚拟滚动网格 - 只渲染可见区域的元素 */}
          <div className={`media-library-grid__container ${isTransitioning || isPending ? 'media-library-grid__container--transitioning' : ''}`}>
            <VirtualAssetGrid
              assets={filteredResult.assets}
              viewMode={viewMode}
              selectedAssetId={selectedAssetId}
              selectedAssetIds={selectedAssetIds}
              isSelectionMode={isSelectionMode}
              onSelectAsset={isSelectionMode ? toggleAssetSelection : onSelectAsset}
              onDoubleClick={onDoubleClick}
            />
          </div>

          <div className="media-library-grid__footer">
            <span>共 {filteredResult.count} 个素材</span>
            {!isSelectionMode && <span className="media-library-grid__footer-hint">双击插入</span>}
          </div>
        </>
      )}
    </div>
  );
}
