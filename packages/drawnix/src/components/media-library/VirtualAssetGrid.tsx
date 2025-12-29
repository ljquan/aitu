/**
 * Virtual Asset Grid
 * 虚拟滚动网格组件 - 使用 @tanstack/react-virtual 实现窗口式渲染
 * 只渲染可见区域的元素，大幅提升大数据量场景的性能
 */

import { useRef, useMemo, useCallback, useState, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AssetItem } from './AssetItem';
import type { Asset, ViewMode } from '../../types/asset.types';

// 视图模式配置
const VIEW_CONFIG: Record<ViewMode, {
  columns: number;
  gap: number;
  itemHeight: number;
  padding: number;
}> = {
  grid: {
    columns: 5,
    gap: 16,
    itemHeight: 200, // 正方形 + 一些额外空间
    padding: 20,
  },
  compact: {
    columns: 9,
    gap: 4,
    itemHeight: 80,
    padding: 12,
  },
  list: {
    columns: 1,
    gap: 8,
    itemHeight: 68, // 48px 缩略图 + padding
    padding: 16,
  },
};

// 响应式列数配置
const getResponsiveColumns = (viewMode: ViewMode, containerWidth: number): number => {
  if (viewMode === 'list') return 1;

  if (viewMode === 'compact') {
    if (containerWidth >= 1920) return 10;
    if (containerWidth >= 1280) return 8;
    if (containerWidth >= 768) return 7;
    if (containerWidth >= 480) return 6;
    return 5;
  }

  // grid mode - 增加列数让图片更紧凑
  if (containerWidth >= 1920) return 6;
  if (containerWidth >= 1280) return 5;
  if (containerWidth >= 768) return 4;
  return 3;
};

interface VirtualAssetGridProps {
  assets: Asset[];
  viewMode: ViewMode;
  selectedAssetId?: string;
  selectedAssetIds: Set<string>;
  isSelectionMode: boolean;
  onSelectAsset: (assetId: string) => void;
  onDoubleClick?: (asset: Asset) => void;
}

export function VirtualAssetGrid({
  assets,
  viewMode,
  selectedAssetId,
  selectedAssetIds,
  isSelectionMode,
  onSelectAsset,
  onDoubleClick,
}: VirtualAssetGridProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const config = VIEW_CONFIG[viewMode];
  const [containerWidth, setContainerWidth] = useState(800);

  // 监听容器尺寸变化
  useEffect(() => {
    const container = parentRef.current;
    if (!container) return;

    const updateWidth = () => {
      setContainerWidth(container.clientWidth);
    };

    // 初始化
    updateWidth();

    // 监听 resize
    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // 计算响应式列数
  const columns = useMemo(() => {
    return getResponsiveColumns(viewMode, containerWidth);
  }, [viewMode, containerWidth]);

  // 计算每个 item 的尺寸
  const itemSize = useMemo(() => {
    if (viewMode === 'list') {
      return { width: containerWidth - config.padding * 2, height: config.itemHeight };
    }
    // 网格模式：正方形
    const availableWidth = containerWidth - config.padding * 2 - config.gap * (columns - 1);
    const width = Math.floor(availableWidth / columns);
    return { width, height: width }; // 正方形
  }, [viewMode, containerWidth, columns, config]);

  // 计算行数
  const rowCount = useMemo(() => {
    return Math.ceil(assets.length / columns);
  }, [assets.length, columns]);

  // 计算行高（包含 gap）
  const getRowHeight = useCallback(() => {
    return itemSize.height + config.gap;
  }, [itemSize.height, config.gap]);

  // 虚拟化器
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: getRowHeight,
    overscan: 3, // 预渲染上下各3行
  });

  // 渲染单行
  const renderRow = useCallback((rowIndex: number) => {
    const startIndex = rowIndex * columns;
    const rowAssets = assets.slice(startIndex, startIndex + columns);

    return rowAssets.map((asset) => (
      <div
        key={asset.id}
        style={{
          width: itemSize.width,
          height: itemSize.height,
        }}
      >
        <AssetItem
          asset={asset}
          viewMode={viewMode}
          isSelected={isSelectionMode ? selectedAssetIds.has(asset.id) : selectedAssetId === asset.id}
          onSelect={onSelectAsset}
          onDoubleClick={onDoubleClick}
          isInSelectionMode={isSelectionMode}
        />
      </div>
    ));
  }, [assets, columns, viewMode, selectedAssetId, selectedAssetIds, isSelectionMode, onSelectAsset, onDoubleClick, itemSize]);

  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className={`virtual-asset-grid virtual-asset-grid--${viewMode}`}
      style={{
        height: '100%',
        overflow: 'auto',
        contain: 'strict',
      }}
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualRow) => (
          <div
            key={virtualRow.key}
            className={`virtual-asset-grid__row virtual-asset-grid__row--${viewMode}`}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${itemSize.height}px`,
              transform: `translateY(${virtualRow.start}px)`,
              display: viewMode === 'list' ? 'block' : 'flex',
              gap: `${config.gap}px`,
              padding: `0 ${config.padding}px`,
            }}
          >
            {renderRow(virtualRow.index)}
          </div>
        ))}
      </div>
    </div>
  );
}
