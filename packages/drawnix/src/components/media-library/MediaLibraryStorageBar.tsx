/**
 * Media Library Storage Bar
 * 素材库存储空间进度条组件
 */

import { Progress } from 'tdesign-react';
import { HardDrive, AlertCircle } from 'lucide-react';
import { formatStorageSize } from '../../utils/storage-quota';
import type { MediaLibraryStorageBarProps } from '../../types/asset.types';
import './MediaLibraryStorageBar.scss';

export function MediaLibraryStorageBar({
  assetCount,
  storageStatus,
}: MediaLibraryStorageBarProps) {
  if (!storageStatus || storageStatus.quota.quota === 0) {
    return (
      <div className="storage-bar">
        <div className="storage-bar__header">
          <HardDrive size={16} />
          <span className="storage-bar__title">存储空间</span>
        </div>
        <div className="storage-bar__info">
          <span className="storage-bar__count">{assetCount} 个素材</span>
        </div>
      </div>
    );
  }

  const { quota, percentUsed } = storageStatus.quota;
  const { isNearLimit, isCritical } = storageStatus;

  // 确定进度条主题
  let theme: 'success' | 'warning' | 'error' = 'success';
  if (isCritical) {
    theme = 'error';
  } else if (isNearLimit) {
    theme = 'warning';
  }

  return (
    <div className="storage-bar">
      <div className="storage-bar__header">
        <HardDrive size={16} />
        <span className="storage-bar__title">存储空间</span>
      </div>

      <div className="storage-bar__info">
        <span className="storage-bar__count">{assetCount} 个素材</span>
        <span className="storage-bar__percentage">
          {percentUsed.toFixed(1)}%
        </span>
      </div>

      <Progress
        percentage={percentUsed}
        theme={theme}
        size="small"
        strokeWidth={6}
      />

      <div className="storage-bar__size">
        <span>{formatStorageSize(quota.usage)}</span>
        <span className="storage-bar__separator">/</span>
        <span>{formatStorageSize(quota.quota)}</span>
      </div>

      {(isNearLimit || isCritical) && (
        <div
          className={`storage-bar__warning ${isCritical ? 'storage-bar__warning--critical' : ''}`}
        >
          <AlertCircle size={14} />
          <span>
            {isCritical
              ? '存储空间即将用完，请清理旧素材'
              : '存储空间接近上限'}
          </span>
        </div>
      )}
    </div>
  );
}
