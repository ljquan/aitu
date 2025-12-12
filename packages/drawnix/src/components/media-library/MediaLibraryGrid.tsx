/**
 * Media Library Grid
 * 素材库网格视图组件
 */

import { useMemo, useState, useCallback } from 'react';
import { Loading, Input, Button } from 'tdesign-react';
import { Upload as UploadIcon, Search } from 'lucide-react';
import { useAssets } from '../../contexts/AssetContext';
import { filterAssets } from '../../utils/asset-utils';
import { AssetGridItem } from './AssetGridItem';
import { MediaLibraryEmpty } from './MediaLibraryEmpty';
import type { MediaLibraryGridProps } from '../../types/asset.types';
import './MediaLibraryGrid.scss';

export function MediaLibraryGrid({
  filterType,
  selectedAssetId,
  onSelectAsset,
  onDoubleClick,
  onFileUpload,
  onUploadClick,
}: MediaLibraryGridProps) {
  const { assets, filters, loading, setFilters } = useAssets();
  const [isDragging, setIsDragging] = useState(false);

  // 应用筛选和排序
  const filteredResult = useMemo(() => {
    const mergedFilters = filterType
      ? { ...filters, activeType: filterType }
      : filters;
    return filterAssets(assets, mergedFilters);
  }, [assets, filters, filterType]);

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
          <span className="media-library-grid__count">
            共 {filteredResult.count} 个素材
          </span>
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
          <div className="media-library-grid__container">
            {filteredResult.assets.map((asset) => (
              <AssetGridItem
                key={asset.id}
                asset={asset}
                isSelected={selectedAssetId === asset.id}
                onSelect={onSelectAsset}
                onDoubleClick={onDoubleClick}
              />
            ))}
          </div>

          <div className="media-library-grid__footer">
            <span>显示 {filteredResult.count} 个素材</span>
            <span className="media-library-grid__footer-hint">双击选择</span>
          </div>
        </>
      )}
    </div>
  );
}
