/**
 * Asset Item
 * 统一素材项组件 - 支持网格、紧凑、列表三种视图模式
 * 切换视图模式时组件不销毁，只更新样式，避免图片重新加载
 */

import { memo, useCallback } from 'react';
import { Image as ImageIcon, Video as VideoIcon } from 'lucide-react';
import { Checkbox } from 'tdesign-react';
import { formatDate, formatFileSize } from '../../utils/asset-utils';
import { useAssetSize } from '../../hooks/useAssetSize';
import { LazyImage } from '../lazy-image';
import type { Asset, ViewMode } from '../../types/asset.types';
import './AssetItem.scss';

export interface AssetItemProps {
  asset: Asset;
  viewMode: ViewMode;
  isSelected: boolean;
  onSelect: (assetId: string) => void;
  onDoubleClick?: (asset: Asset) => void;
  isInSelectionMode?: boolean;
}

export const AssetItem = memo<AssetItemProps>(
  ({ asset, viewMode, isSelected, onSelect, onDoubleClick, isInSelectionMode }) => {
    // 获取实际文件大小（支持从缓存获取）
    const displaySize = useAssetSize(asset.id, asset.url, asset.size);

    const handleClick = useCallback(() => {
      onSelect(asset.id);
    }, [asset.id, onSelect]);

    const handleDoubleClick = useCallback(() => {
      if (onDoubleClick && !isInSelectionMode) {
        onDoubleClick(asset);
      }
    }, [asset, onDoubleClick, isInSelectionMode]);

    const handleCheckboxChange = useCallback(() => {
      onSelect(asset.id);
    }, [asset.id, onSelect]);

    const handleCheckboxClick = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
    }, []);

    const itemClassName = [
      'asset-item',
      `asset-item--${viewMode}`,
      isSelected ? 'asset-item--selected' : '',
      isInSelectionMode ? 'asset-item--selection-mode' : '',
    ].filter(Boolean).join(' ');

    const isListMode = viewMode === 'list';
    const isCompactMode = viewMode === 'compact';

    return (
      <div
        className={itemClassName}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        role="button"
        tabIndex={0}
        data-track={`asset_item_click_${viewMode}`}
      >
        {/* 列表模式：左侧复选框 */}
        {isListMode && isInSelectionMode && (
          <div className="asset-item__checkbox asset-item__checkbox--left" onClick={handleCheckboxClick}>
            <Checkbox
              checked={isSelected}
              onChange={handleCheckboxChange}
              data-track="asset_item_checkbox"
            />
          </div>
        )}

        {/* 缩略图容器 - 所有模式共享，切换时不销毁 */}
        <div className="asset-item__thumbnail">
          {asset.type === 'IMAGE' ? (
            <LazyImage
              src={asset.url}
              alt={asset.name}
              className="asset-item__image"
              rootMargin="100px"
            />
          ) : (
            <video
              src={asset.url}
              className="asset-item__video"
              muted
              preload="metadata"
            />
          )}

          {/* 网格/紧凑模式：徽章 */}
          {!isListMode && !isCompactMode && (
            <div className="asset-item__badges">
              <div className="asset-item__type-badge">
                {asset.type === 'IMAGE' ? <ImageIcon /> : <VideoIcon />}
              </div>
              {asset.source === 'AI_GENERATED' && (
                <div className="asset-item__ai-badge">AI</div>
              )}
            </div>
          )}

          {/* 网格模式：选择复选框 */}
          {!isListMode && isInSelectionMode && (
            <div className="asset-item__checkbox asset-item__checkbox--overlay" onClick={handleCheckboxClick}>
              <Checkbox
                checked={isSelected}
                onChange={handleCheckboxChange}
                data-track="asset_item_checkbox"
              />
            </div>
          )}

          {/* 网格模式：渐变遮罩和名称 */}
          {!isListMode && !isCompactMode && (
            <>
              <div className="asset-item__overlay" />
              <div className="asset-item__name-overlay" title={asset.name}>
                {asset.name}
              </div>
            </>
          )}
        </div>

        {/* 列表模式：信息区域 */}
        {isListMode && (
          <div className="asset-item__info">
            <div className="asset-item__name" title={asset.name}>
              {asset.name}
            </div>
            <div className="asset-item__meta">
              <span className="asset-item__type">
                {asset.type === 'IMAGE' ? <ImageIcon size={12} /> : <VideoIcon size={12} />}
                {asset.type === 'IMAGE' ? '图片' : '视频'}
              </span>
              {displaySize && (
                <span className="asset-item__size">{formatFileSize(displaySize)}</span>
              )}
              <span className="asset-item__date">{formatDate(asset.createdAt)}</span>
            </div>
          </div>
        )}

        {/* 列表模式：AI 标识 */}
        {isListMode && asset.source === 'AI_GENERATED' && (
          <div className="asset-item__ai-badge asset-item__ai-badge--list">AI</div>
        )}
      </div>
    );
  },
  (prevProps, nextProps) => {
    // 自定义比较函数：只有关键属性变化时才重新渲染
    return (
      prevProps.asset.id === nextProps.asset.id &&
      prevProps.viewMode === nextProps.viewMode &&
      prevProps.isSelected === nextProps.isSelected &&
      prevProps.isInSelectionMode === nextProps.isInSelectionMode
    );
  },
);

AssetItem.displayName = 'AssetItem';
