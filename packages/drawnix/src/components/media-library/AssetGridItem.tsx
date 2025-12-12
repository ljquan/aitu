/**
 * Asset Grid Item
 * 素材网格项组件
 */

import { memo, useCallback } from 'react';
import { Image as ImageIcon, Video as VideoIcon } from 'lucide-react';
import { Checkbox } from 'tdesign-react';
import type { AssetGridItemProps } from '../../types/asset.types';
import './AssetGridItem.scss';

export const AssetGridItem = memo<AssetGridItemProps>(
  ({ asset, isSelected, onSelect, onDoubleClick, isInSelectionMode }) => {
    const handleClick = useCallback(() => {
      onSelect(asset.id);
    }, [asset.id, onSelect]);

    const handleDoubleClick = useCallback(() => {
      if (onDoubleClick && !isInSelectionMode) {
        onDoubleClick(asset);
      }
    }, [asset, onDoubleClick, isInSelectionMode]);

    const handleCheckboxChange = useCallback((checked: boolean) => {
      onSelect(asset.id);
    }, [asset.id, onSelect]);

    return (
      <div
        className={`asset-grid-item ${isSelected ? 'asset-grid-item--selected' : ''} ${isInSelectionMode ? 'asset-grid-item--selection-mode' : ''}`}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        role="button"
        tabIndex={0}
        data-track="asset_grid_item_click"
      >
        {/* 缩略图 */}
        <div className="asset-grid-item__thumbnail">
          {asset.type === 'IMAGE' ? (
            <img
              src={asset.url}
              alt={asset.name}
              className="asset-grid-item__image"
              loading="lazy"
            />
          ) : (
            <video
              src={asset.url}
              className="asset-grid-item__video"
              muted
              preload="metadata"
            />
          )}

          {/* Badges */}
          <div className="asset-grid-item__badges">
            {/* 类型标识 */}
            <div className="asset-grid-item__type-badge">
              {asset.type === 'IMAGE' ? (
                <ImageIcon />
              ) : (
                <VideoIcon />
              )}
            </div>

            {/* AI标识 */}
            {asset.source === 'AI_GENERATED' && (
              <div className="asset-grid-item__ai-badge">AI</div>
            )}
          </div>

          {/* 选择模式复选框 */}
          {isInSelectionMode && (
            <div className="asset-grid-item__checkbox" onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={isSelected}
                onChange={handleCheckboxChange}
                data-track="asset_grid_item_checkbox"
              />
            </div>
          )}

          {/* Gradient overlay */}
          <div className="asset-grid-item__overlay" />

          {/* 名称 (on hover/select) */}
          <div className="asset-grid-item__name" title={asset.name}>
            {asset.name}
          </div>
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    // 自定义比较函数：只有ID、选中状态或选择模式变化时才重新渲染
    return (
      prevProps.asset.id === nextProps.asset.id &&
      prevProps.isSelected === nextProps.isSelected &&
      prevProps.isInSelectionMode === nextProps.isInSelectionMode
    );
  },
);

AssetGridItem.displayName = 'AssetGridItem';
