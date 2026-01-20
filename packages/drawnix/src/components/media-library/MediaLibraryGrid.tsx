/**
 * Media Library Grid
 * 素材库网格视图组件 - 使用虚拟滚动优化大数据量性能
 */

import { useMemo, useState, useCallback, useRef, useEffect, useTransition } from 'react';
import { Loading, Input, Button, Checkbox, Popconfirm, Tooltip } from 'tdesign-react';
import { 
  Upload as UploadIcon, 
  Search, 
  Trash2, 
  CheckSquare, 
  XSquare, 
  HardDrive,
  Layers,
  Image as ImageIcon,
  Video as VideoIcon,
  Globe,
  User,
  Sparkles,
  Clock,
  Calendar,
  SortAsc,
  ArrowDownWideNarrow,
  Minus,
  Plus
} from 'lucide-react';
import { useAssets } from '../../contexts/AssetContext';
import { filterAssets, formatFileSize } from '../../utils/asset-utils';
import { VirtualAssetGrid } from './VirtualAssetGrid';
import { MediaLibraryEmpty } from './MediaLibraryEmpty';
import { ViewModeToggle } from './ViewModeToggle';
import type { MediaLibraryGridProps, ViewMode, SortOption } from '../../types/asset.types';
import { AssetType, AssetSource } from '../../types/asset.types';
import { useDrawnix } from '../../hooks/use-drawnix';
import { removeElementsByAssetIds, removeElementsByAssetUrl, isCacheUrl, countElementsByAssetUrl } from '../../utils/asset-cleanup';
import './MediaLibraryGrid.scss';
import './VirtualAssetGrid.scss';

// 视图切换防抖时间
const VIEW_MODE_DEBOUNCE_MS = 150;

// localStorage keys
const VIEW_MODE_STORAGE_KEY = 'media-library-view-mode';
const GRID_SIZE_STORAGE_KEY = 'media-library-grid-size';

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

// 从 localStorage 读取网格尺寸
const getStoredGridSize = (): number => {
  try {
    const stored = localStorage.getItem(GRID_SIZE_STORAGE_KEY);
    if (stored) {
      const val = parseInt(stored, 10);
      if (!isNaN(val) && val >= 80 && val <= 300) {
        return val;
      }
    }
  } catch {
    // localStorage 不可用时忽略
  }
  return 180;
};

// 类型过滤选项
const TYPE_OPTIONS = [
  { value: 'ALL', label: '全部类型', icon: <Layers size={14} /> },
  { value: AssetType.IMAGE, label: '图片', icon: <ImageIcon size={14} /> },
  { value: AssetType.VIDEO, label: '视频', icon: <VideoIcon size={14} /> },
];

// 来源过滤选项
const SOURCE_OPTIONS = [
  { value: 'ALL', label: '全部来源', icon: <Globe size={14} /> },
  { value: AssetSource.LOCAL, label: '本地上传', icon: <User size={14} /> },
  { value: AssetSource.AI_GENERATED, label: 'AI生成', icon: <Sparkles size={14} /> },
];

// 排序选项
const SORT_OPTIONS: { value: SortOption; label: string; icon: React.ReactNode }[] = [
  { value: 'DATE_DESC', label: '最新优先', icon: <Clock size={14} /> },
  { value: 'DATE_ASC', label: '最旧优先', icon: <Calendar size={14} /> },
  { value: 'NAME_ASC', label: '名称 A-Z', icon: <SortAsc size={14} /> },
  { value: 'SIZE_DESC', label: '大小优先', icon: <ArrowDownWideNarrow size={14} /> },
];

export function MediaLibraryGrid({
  filterType,
  selectedAssetId,
  onSelectAsset,
  onDoubleClick,
  onFileUpload,
  onUploadClick,
  storageStatus,
}: MediaLibraryGridProps) {
  const { assets, filters, loading, setFilters, removeAssets } = useAssets();
  const { board } = useDrawnix();
  const [isDragging, setIsDragging] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [gridSize, setGridSize] = useState<number>(getStoredGridSize); // 从缓存恢复网格尺寸

  // 监听网格尺寸变化并缓存
  useEffect(() => {
    localStorage.setItem(GRID_SIZE_STORAGE_KEY, gridSize.toString());
  }, [gridSize]);

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

    // 根据模式自动调整滑块位置并同步缓存
    let newSize = gridSize;
    if (mode === 'grid') newSize = 180;
    else if (mode === 'compact') newSize = 80;
    
    setGridSize(newSize);
    localStorage.setItem(GRID_SIZE_STORAGE_KEY, newSize.toString());

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

  // 批量删除处理（同时删除画布上使用这些素材的元素）
  const handleBatchDelete = useCallback(async () => {
    const idsToDelete = Array.from(selectedAssetIds);
    try {
      // 删除画布上使用这些素材的元素
      if (board) {
        // 分离缓存类型素材和普通素材
        const cacheAssets = filteredResult.assets.filter(
          a => selectedAssetIds.has(a.id) && isCacheUrl(a.url)
        );
        const normalAssetIds = idsToDelete.filter(
          id => !cacheAssets.some(a => a.id === id)
        );
        
        // 缓存类型素材使用 URL 匹配删除
        for (const asset of cacheAssets) {
          removeElementsByAssetUrl(board, asset.url);
        }
        
        // 普通素材使用 ID 匹配删除
        if (normalAssetIds.length > 0) {
          removeElementsByAssetIds(board, normalAssetIds);
        }
      }
      
      // 然后删除素材本身
      await removeAssets(idsToDelete);
      setSelectedAssetIds(new Set()); // 清空选择
      setIsSelectionMode(false); // 退出选择模式
    } catch (error) {
      console.error('[MediaLibraryGrid] Batch delete failed:', error);
    }
  }, [selectedAssetIds, removeAssets, board, filteredResult.assets]);
  
  // 计算批量删除时会影响的画布元素数量
  const batchDeleteWarningInfo = useMemo(() => {
    if (!board || selectedAssetIds.size === 0) {
      return { hasCacheAssets: false, affectedCount: 0 };
    }
    
    let affectedCount = 0;
    const cacheAssets = filteredResult.assets.filter(
      a => selectedAssetIds.has(a.id) && isCacheUrl(a.url)
    );
    
    for (const asset of cacheAssets) {
      affectedCount += countElementsByAssetUrl(board, asset.url);
    }
    
    return { hasCacheAssets: cacheAssets.length > 0, affectedCount };
  }, [board, selectedAssetIds, filteredResult.assets]);

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
        <div className="media-library-grid__header-top">
          <Input
            value={filters.searchQuery}
            onChange={(value) => setFilters({ searchQuery: value as string })}
            placeholder="搜索素材..."
            prefixIcon={<Search size={16} />}
            clearable
            data-track="grid_search_input"
            className="media-library-grid__search"
          />
          <div className="media-library-grid__header-right">
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
                  content={
                    <div>
                      <p>确定要删除选中的 {selectedAssetIds.size} 个素材吗？</p>
                      {batchDeleteWarningInfo.hasCacheAssets && batchDeleteWarningInfo.affectedCount > 0 && (
                        <p style={{ marginTop: '8px', color: 'var(--td-error-color)' }}>
                          ⚠️ 画布中有 <strong>{batchDeleteWarningInfo.affectedCount}</strong> 个元素正在使用这些素材，删除后将被一并移除！
                        </p>
                      )}
                    </div>
                  }
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
                    删除
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
        {!isSelectionMode && (
          <div className="media-library-grid__header-bottom">
            <div className="media-library-grid__filter-group">
              <div className="media-library-grid__filter-item">
                <span className="media-library-grid__filter-item-label">类型</span>
                <div className="media-library-grid__filter-item-options">
                  {TYPE_OPTIONS.map(opt => (
                    <Tooltip key={opt.value} content={opt.label} placement="top" showArrow={false}>
                      <div
                        className={`media-library-grid__filter-item-option ${ (filters.activeType || 'ALL') === opt.value ? 'media-library-grid__filter-item-option--active' : ''}`}
                        onClick={() => setFilters({ activeType: opt.value === 'ALL' ? undefined : opt.value as AssetType })}
                      >
                        {opt.icon}
                      </div>
                    </Tooltip>
                  ))}
                </div>
              </div>

              <div className="media-library-grid__filter-item">
                <span className="media-library-grid__filter-item-label">来源</span>
                <div className="media-library-grid__filter-item-options">
                  {SOURCE_OPTIONS.map(opt => (
                    <Tooltip key={opt.value} content={opt.label} placement="top" showArrow={false}>
                      <div
                        key={opt.value}
                        className={`media-library-grid__filter-item-option ${ (filters.activeSource || 'ALL') === opt.value ? 'media-library-grid__filter-item-option--active' : ''}`}
                        onClick={() => setFilters({ activeSource: opt.value === 'ALL' ? undefined : opt.value as AssetSource })}
                      >
                        {opt.icon}
                      </div>
                    </Tooltip>
                  ))}
                </div>
              </div>

              <div className="media-library-grid__filter-item">
                <span className="media-library-grid__filter-item-label">排序</span>
                <div className="media-library-grid__filter-item-options">
                  {SORT_OPTIONS.map(opt => (
                    <Tooltip key={opt.value} content={opt.label} placement="top" showArrow={false}>
                      <div
                        key={opt.value}
                        className={`media-library-grid__filter-item-option ${ (filters.sortBy || 'DATE_DESC') === opt.value ? 'media-library-grid__filter-item-option--active' : ''}`}
                        onClick={() => setFilters({ sortBy: opt.value as SortOption })}
                      >
                        {opt.icon}
                      </div>
                    </Tooltip>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
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
              gridSize={gridSize}
              selectedAssetId={selectedAssetId}
              selectedAssetIds={selectedAssetIds}
              isSelectionMode={isSelectionMode}
              onSelectAsset={isSelectionMode ? toggleAssetSelection : onSelectAsset}
              onDoubleClick={onDoubleClick}
            />
          </div>

          <div className="media-library-grid__footer">
            <div className="media-library-grid__footer-left">
              {storageStatus ? (
                <div className="media-library-grid__footer-storage">
                  <HardDrive size={14} />
                  <span>已用 {formatFileSize(storageStatus.quota.usage)}</span>
                </div>
              ) : (
                <div className="media-library-grid__footer-storage">
                  <HardDrive size={14} />
                  <span>正在获取存储状态...</span>
                </div>
              )}
              <span className="media-library-grid__footer-count">共 {filteredResult.count} 个素材</span>
              {!isSelectionMode && <span className="media-library-grid__footer-hint">双击插入</span>}
            </div>
            
            <div className="media-library-grid__footer-right">
              {viewMode !== 'list' && (
                <div className="media-library-grid__zoom-control">
                  <Minus size={14} onClick={() => setGridSize(prev => Math.max(80, prev - 20))} />
                  <input
                    type="range"
                    min="80"
                    max="300"
                    step="10"
                    value={gridSize}
                    onChange={(e) => setGridSize(Number(e.target.value))}
                    className="media-library-grid__zoom-slider"
                    data-track="grid_zoom_slider"
                  />
                  <Plus size={14} onClick={() => setGridSize(prev => Math.min(300, prev + 20))} />
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
