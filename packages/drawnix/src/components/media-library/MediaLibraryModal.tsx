/**
 * Media Library Modal
 * 素材库弹窗容器组件
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { Dialog, MessagePlugin } from 'tdesign-react';
import { Grid } from 'lucide-react';
import { useAssets } from '../../contexts/AssetContext';
import { MediaLibraryGrid } from './MediaLibraryGrid';
import { MediaLibrarySidebar } from './MediaLibrarySidebar';
import { MediaLibraryInspector } from './MediaLibraryInspector';
import type {
  MediaLibraryModalProps,
  Asset,
} from '../../types/asset.types';
import { AssetType, AssetSource } from '../../types/asset.types';
import './MediaLibraryModal.scss';

export function MediaLibraryModal({
  isOpen,
  onClose,
  mode = 'BROWSE',
  filterType,
  onSelect,
}: MediaLibraryModalProps) {
  const {
    assets,
    loading,
    loadAssets,
    addAsset,
    filters,
    setFilters,
    selectedAssetId,
    setSelectedAssetId,
    storageStatus,
    checkStorageQuota,
    renameAsset,
    removeAsset,
  } = useAssets();

  const [localSelectedAssetId, setLocalSelectedAssetId] = useState<string | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 加载素材和检查配额
  useEffect(() => {
    if (isOpen) {
      loadAssets();
      checkStorageQuota();
    }
  }, [isOpen, loadAssets, checkStorageQuota]);

  // 应用filterType（如果提供）
  useEffect(() => {
    if (isOpen && filterType) {
      setFilters({ activeType: filterType });
    }
  }, [isOpen, filterType, setFilters]);

  // 同步选中状态
  useEffect(() => {
    if (isOpen) {
      setLocalSelectedAssetId(selectedAssetId);
    }
  }, [isOpen, selectedAssetId]);

  // 处理资产选择
  const handleSelectAsset = useCallback(
    (id: string) => {
      setLocalSelectedAssetId(id);
      setSelectedAssetId(id);
    },
    [setSelectedAssetId],
  );

  // 处理双击选择
  const handleDoubleClick = useCallback(
    (asset: Asset) => {
      if (onSelect) {
        onSelect(asset);
        onClose();
      }
    },
    [onSelect, onClose],
  );

  // 处理"使用到画板"按钮点击
  const handleUseAsset = useCallback(
    (asset: Asset) => {
      if (onSelect) {
        onSelect(asset);
        onClose();
      }
    },
    [onSelect, onClose],
  );

  // 处理文件上传
  const handleFileUpload = useCallback(
    async (files: FileList) => {
      if (!files || files.length === 0) return;

      // 验证文件
      const validFiles: File[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // 检查文件类型
        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');

        if (!isImage && !isVideo) {
          MessagePlugin.warning(`文件 "${file.name}" 不是有效的图片或视频格式`);
          continue;
        }

        // 检查文件大小 (最大 100MB)
        const maxSize = 100 * 1024 * 1024;
        if (file.size > maxSize) {
          MessagePlugin.warning(`文件 "${file.name}" 超过 100MB 限制`);
          continue;
        }

        validFiles.push(file);
      }

      if (validFiles.length === 0) {
        return;
      }

      // 上传文件
      try {
        for (const file of validFiles) {
          const isImage = file.type.startsWith('image/');
          const type = isImage ? AssetType.IMAGE : AssetType.VIDEO;
          await addAsset(file, type, AssetSource.LOCAL);
        }

        MessagePlugin.success(`成功上传 ${validFiles.length} 个文件`);

        // 重新加载资产列表
        await loadAssets();
      } catch (error) {
        console.error('File upload error:', error);
        // 错误信息已经在 AssetContext 中处理
      }
    },
    [addAsset, loadAssets],
  );

  // 打开文件选择器
  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // 文件输入变化
  const handleFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files) {
        handleFileUpload(files);
      }
      // 清空input值，允许重复上传同一文件
      event.target.value = '';
    },
    [handleFileUpload],
  );

  // 获取当前选中的资产
  const selectedAsset =
    assets.find((a) => a.id === localSelectedAssetId) || null;

  // 显示选择按钮的条件：SELECT模式且有onSelect回调
  const showSelectButton = mode === 'SELECT' && !!onSelect;

  return (
    <Dialog
      visible={isOpen}
      onClose={onClose}
      header={
        <div className="media-library-modal__header">
          <div className="media-library-modal__header-title">
            <div className="media-library-modal__header-title-icon">
              <Grid size={16} />
            </div>
            <span>素材库</span>
          </div>
        </div>
      }
      width="80vw"
      attach="body"
      placement="center"
      destroyOnClose
      className="media-library-modal"
      footer={null}
    >
      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />

      <div className="media-library-layout">
        {/* 左侧筛选侧边栏 */}
        <div className="media-library-layout__sidebar">
          <MediaLibrarySidebar
            filters={filters}
            assetCount={assets.length}
            storageStatus={storageStatus}
            onFilterChange={setFilters}
          />
        </div>

        {/* 中间网格区域 */}
        <div className="media-library-layout__main">
          <MediaLibraryGrid
            filterType={filterType}
            selectedAssetId={localSelectedAssetId}
            onSelectAsset={handleSelectAsset}
            onDoubleClick={handleDoubleClick}
            onFileUpload={handleFileUpload}
            onUploadClick={handleUploadClick}
          />
        </div>

        {/* 右侧详情面板 */}
        <div className="media-library-layout__inspector">
          <MediaLibraryInspector
            asset={selectedAsset}
            onRename={renameAsset}
            onDelete={removeAsset}
            onDownload={(asset) => {
              // 下载功能在 asset-utils.ts 中实现
              const link = document.createElement('a');
              link.href = asset.url;
              link.download = asset.name;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }}
            onSelect={showSelectButton ? handleUseAsset : undefined}
            showSelectButton={showSelectButton}
          />
        </div>
      </div>
    </Dialog>
  );
}
