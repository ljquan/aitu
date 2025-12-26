/**
 * Asset List Item
 * 素材列表项组件 - 用于列表视图模式
 */

import { memo, useCallback } from 'react';
import { Image as ImageIcon, Video as VideoIcon } from 'lucide-react';
import { Checkbox } from 'tdesign-react';
import { formatDate, formatFileSize } from '../../utils/asset-utils';
import type { AssetListItemProps } from '../../types/asset.types';
import './AssetListItem.scss';

export const AssetListItem = memo<AssetListItemProps>(
  ({ asset, isSelected, onSelect, onDoubleClick, isInSelectionMode }) => {
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

    return (
      <div
        className={`asset-list-item ${isSelected ? 'asset-list-item--selected' : ''} ${isInSelectionMode ? 'asset-list-item--selection-mode' : ''}`}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        role="button"
        tabIndex={0}
        data-track="asset_list_item_click"
      >
        {/* 选择模式复选框 */}
        {isInSelectionMode && (
          <div className="asset-list-item__checkbox" onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={isSelected}
              onChange={handleCheckboxChange}
              data-track="asset_list_item_checkbox"
            />
          </div>
        )}

        {/* 缩略图 */}
        <div className="asset-list-item__thumbnail">
          {asset.type === 'IMAGE' ? (
            <img
              src={asset.url}
              alt={asset.name}
              className="asset-list-item__image"
              loading="lazy"
            />
          ) : (
            <video
              src={asset.url}
              className="asset-list-item__video"
              muted
              preload="metadata"
            />
          )}
        </div>

        {/* 信息 */}
        <div className="asset-list-item__info">
          <div className="asset-list-item__name" title={asset.name}>
            {asset.name}
          </div>
          <div className="asset-list-item__meta">
            <span className="asset-list-item__type">
              {asset.type === 'IMAGE' ? <ImageIcon size={12} /> : <VideoIcon size={12} />}
              {asset.type === 'IMAGE' ? '图片' : '视频'}
            </span>
            {asset.size && (
              <span className="asset-list-item__size">{formatFileSize(asset.size)}</span>
            )}
            <span className="asset-list-item__date">{formatDate(asset.createdAt)}</span>
          </div>
        </div>

        {/* AI 标识 */}
        {asset.source === 'AI_GENERATED' && (
          <div className="asset-list-item__ai-badge">AI</div>
        )}
      </div>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.asset.id === nextProps.asset.id &&
      prevProps.isSelected === nextProps.isSelected &&
      prevProps.isInSelectionMode === nextProps.isInSelectionMode
    );
  },
);

AssetListItem.displayName = 'AssetListItem';
