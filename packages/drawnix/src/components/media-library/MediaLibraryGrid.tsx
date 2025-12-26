/**
 * Media Library Grid
 * 素材库网格视图组件
 */

import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Loading, Input, Button, Checkbox, Popconfirm } from 'tdesign-react';
import { Upload as UploadIcon, Search, Trash2, CheckSquare, XSquare } from 'lucide-react';
import { useAssets } from '../../contexts/AssetContext';
import { filterAssets } from '../../utils/asset-utils';
import { AssetGridItem } from './AssetGridItem';
import { AssetListItem } from './AssetListItem';
import { MediaLibraryEmpty } from './MediaLibraryEmpty';
import { ViewModeToggle } from './ViewModeToggle';
import type { MediaLibraryGridProps, ViewMode } from '../../types/asset.types';
import './MediaLibraryGrid.scss';

// 每页显示数量 - 根据视图模式调整
const PAGE_SIZE_MAP: Record<ViewMode, number> = {
  grid: 24,
  compact: 48, // 紧凑模式显示更多
  list: 20,
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
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  // 分页状态
  const pageSize = PAGE_SIZE_MAP[viewMode];
  const [displayCount, setDisplayCount] = useState(pageSize);
  const containerRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // 应用筛选和排序
  const filteredResult = useMemo(() => {
    const result = filterAssets(assets, filters);
    return result;
  }, [assets, filters]);

  // 分页显示的资产
  const displayedAssets = useMemo(() => {
    return filteredResult.assets.slice(0, displayCount);
  }, [filteredResult.assets, displayCount]);

  // 是否还有更多数据
  const hasMore = displayCount < filteredResult.assets.length;

  // 重置分页（当筛选条件或视图模式变化时）
  useEffect(() => {
    setDisplayCount(pageSize);
  }, [filters, pageSize]);

  // 加载更多
  const loadMore = useCallback(() => {
    if (hasMore) {
      setDisplayCount((prev) => prev + pageSize);
    }
  }, [hasMore, pageSize]);

  // 视图模式切换处理
  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
  }, []);

  // IntersectionObserver 实现滚动加载
  useEffect(() => {
    const loadMoreElement = loadMoreRef.current;
    if (!loadMoreElement) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasMore && !loading) {
          loadMore();
        }
      },
      {
        root: containerRef.current,
        rootMargin: '100px',
        threshold: 0.1,
      }
    );

    observer.observe(loadMoreElement);

    return () => {
      observer.disconnect();
    };
  }, [hasMore, loading, loadMore]);

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
              <ViewModeToggle viewMode={viewMode} onViewModeChange={handleViewModeChange} />
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
          <div
            className={`media-library-grid__container media-library-grid__container--${viewMode}`}
            ref={containerRef}
          >
            {viewMode === 'list' ? (
              // 列表视图
              displayedAssets.map((asset) => (
                <AssetListItem
                  key={asset.id}
                  asset={asset}
                  isSelected={isSelectionMode ? selectedAssetIds.has(asset.id) : selectedAssetId === asset.id}
                  onSelect={isSelectionMode ? toggleAssetSelection : onSelectAsset}
                  onDoubleClick={onDoubleClick}
                  isInSelectionMode={isSelectionMode}
                />
              ))
            ) : (
              // 网格视图（默认和紧凑）
              displayedAssets.map((asset) => (
                <AssetGridItem
                  key={asset.id}
                  asset={asset}
                  isSelected={isSelectionMode ? selectedAssetIds.has(asset.id) : selectedAssetId === asset.id}
                  onSelect={isSelectionMode ? toggleAssetSelection : onSelectAsset}
                  onDoubleClick={onDoubleClick}
                  isInSelectionMode={isSelectionMode}
                  viewMode={viewMode}
                />
              ))
            )}
            {/* 加载更多触发器 */}
            {hasMore && (
              <div ref={loadMoreRef} className="media-library-grid__load-more">
                <Loading size="small" text="加载更多..." />
              </div>
            )}
          </div>

          <div className="media-library-grid__footer">
            <span>显示 {displayedAssets.length} / {filteredResult.count} 个素材</span>
            {!isSelectionMode && <span className="media-library-grid__footer-hint">双击选择</span>}
          </div>
        </>
      )}
    </div>
  );
}
