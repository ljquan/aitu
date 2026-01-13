/**
 * Cache Quota Provider
 *
 * Global provider that monitors cache quota and shows dialog when storage is full
 * Prompts user to open media library for manual cleanup
 */

import React, { useEffect, useState, useCallback } from 'react';
import { DialogPlugin } from 'tdesign-react';
import { useCacheQuotaMonitor } from '../../hooks/useUnifiedCache';

export interface CacheQuotaProviderProps {
  children: React.ReactNode;
  /** Callback to open media library */
  onOpenMediaLibrary?: () => void;
}

/**
 * CacheQuotaProvider component
 * Monitors cache quota and shows dialog when storage is full
 */
export const CacheQuotaProvider: React.FC<CacheQuotaProviderProps> = ({
  children,
  onOpenMediaLibrary,
}) => {
  const [dialogVisible, setDialogVisible] = useState(false);

  const handleQuotaExceeded = useCallback(() => {
    // Only show dialog if not already visible
    if (!dialogVisible) {
      setDialogVisible(true);

      const dialog = DialogPlugin.confirm({
        header: '缓存空间已满',
        body: '图片缓存空间已满，无法继续缓存新图片。是否打开素材库清理缓存？',
        theme: 'warning',
        confirmBtn: '打开素材库',
        cancelBtn: '稍后处理',
        onConfirm: () => {
          setDialogVisible(false);
          onOpenMediaLibrary?.();
          dialog.hide();
        },
        onCancel: () => {
          setDialogVisible(false);
          dialog.hide();
        },
        onClose: () => {
          setDialogVisible(false);
        },
      });
    }
  }, [dialogVisible, onOpenMediaLibrary]);

  // Monitor quota
  useCacheQuotaMonitor(handleQuotaExceeded);

  return <>{children}</>;
};
