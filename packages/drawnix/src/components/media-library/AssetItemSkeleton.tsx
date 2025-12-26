/**
 * Asset Item Skeleton
 * 素材项骨架屏组件 - 用于视图切换时的占位
 */

import { memo } from 'react';
import type { ViewMode } from '../../types/asset.types';
import './AssetItemSkeleton.scss';

interface AssetItemSkeletonProps {
  viewMode: ViewMode;
}

export const AssetItemSkeleton = memo<AssetItemSkeletonProps>(({ viewMode }) => {
  const isListMode = viewMode === 'list';

  return (
    <div className={`asset-item-skeleton asset-item-skeleton--${viewMode}`}>
      <div className="asset-item-skeleton__thumbnail">
        <div className="asset-item-skeleton__shimmer" />
      </div>
      {isListMode && (
        <div className="asset-item-skeleton__info">
          <div className="asset-item-skeleton__name" />
          <div className="asset-item-skeleton__meta" />
        </div>
      )}
    </div>
  );
});

AssetItemSkeleton.displayName = 'AssetItemSkeleton';

/**
 * 生成骨架屏列表
 */
export function renderSkeletons(viewMode: ViewMode, count: number) {
  return Array.from({ length: count }, (_, index) => (
    <AssetItemSkeleton key={`skeleton-${index}`} viewMode={viewMode} />
  ));
}
