/**
 * Media Library Modal
 * 素材库弹窗容器组件
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { Dialog, MessagePlugin, Drawer } from 'tdesign-react';
import { Grid } from 'lucide-react';
import { useAssets } from '../../contexts/AssetContext';
import { MediaLibraryGrid } from './MediaLibraryGrid';
import { MediaLibrarySidebar } from './MediaLibrarySidebar';
import { MediaLibraryInspector } from './MediaLibraryInspector';
import type {
  MediaLibraryModalProps,
  Asset,
} from '../../types/asset.types';
import { AssetType, AssetSource, SelectionMode } from '../../types/asset.types';
import { downloadFile } from '../../utils/download-utils';
import './MediaLibraryModal.scss';

export function MediaLibraryModal({
  isOpen,
  onClose,
  mode = SelectionMode.BROWSE,
  filterType,
  onSelect,
  selectButtonText,
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
  const [showMobileInspector, setShowMobileInspector] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
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

  // 检测移动端
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 处理资产选择
  const handleSelectAsset = useCallback(
    (id: string) => {
      setLocalSelectedAssetId(id);
      setSelectedAssetId(id);

      // 在移动端，点击素材时打开抽屉
      if (isMobile) {
        setShowMobileInspector(true);
      }
    },
    [setSelectedAssetId, isMobile],
  );

  // 关闭移动端检查器
  const handleCloseMobileInspector = useCallback(() => {
    setShowMobileInspector(false);
  }, []);

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
      console.log('[MediaLibrary] handleFileUpload called with files:', files);
      if (!files || files.length === 0) {
        console.log('[MediaLibrary] No files provided');
        return;
      }

      // 验证文件
      const validFiles: File[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        console.log(`[MediaLibrary] Processing file ${i + 1}:`, {
          name: file.name,
          type: file.type,
          size: file.size,
        });

        // 检查文件类型
        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');

        if (!isImage && !isVideo) {
          console.warn(`[MediaLibrary] Invalid file type: ${file.type}`);
          MessagePlugin.warning(`文件 "${file.name}" 不是有效的图片或视频格式`);
          continue;
        }

        // 检查文件大小 (最大 100MB)
        const maxSize = 100 * 1024 * 1024;
        if (file.size > maxSize) {
          console.warn(`[MediaLibrary] File too large: ${file.size} bytes`);
          MessagePlugin.warning(`文件 "${file.name}" 超过 100MB 限制`);
          continue;
        }

        console.log(`[MediaLibrary] File validation passed:`, {
          isImage,
          isVideo,
          type: isImage ? 'IMAGE' : 'VIDEO',
        });
        validFiles.push(file);
      }

      if (validFiles.length === 0) {
        console.log('[MediaLibrary] No valid files to upload');
        return;
      }

      console.log(`[MediaLibrary] Uploading ${validFiles.length} valid file(s)`);

      // 上传文件
      try {
        for (const file of validFiles) {
          const isImage = file.type.startsWith('image/');
          const type = isImage ? AssetType.IMAGE : AssetType.VIDEO;
          console.log(`[MediaLibrary] Calling addAsset for:`, {
            fileName: file.name,
            type,
            source: AssetSource.LOCAL,
          });

          const asset = await addAsset(file, type, AssetSource.LOCAL);
          console.log(`[MediaLibrary] Asset added successfully:`, asset);
        }

        MessagePlugin.success(`成功上传 ${validFiles.length} 个文件`);
        console.log('[MediaLibrary] All files uploaded successfully');

        // 重新加载资产列表
        console.log('[MediaLibrary] Reloading assets...');
        await loadAssets();
        console.log('[MediaLibrary] Assets reloaded');
      } catch (error) {
        console.error('[MediaLibrary] File upload error:', error);
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

        {/* 右侧详情面板 - 仅桌面端显示 */}
        {!isMobile && (
          <div className="media-library-layout__inspector">
            <MediaLibraryInspector
              asset={selectedAsset}
              onRename={renameAsset}
              onDelete={removeAsset}
              onDownload={(asset) => {
                downloadFile(asset.url, asset.name);
              }}
              onSelect={showSelectButton ? handleUseAsset : undefined}
              showSelectButton={showSelectButton}
              selectButtonText={selectButtonText}
            />
          </div>
        )}
      </div>

      {/* 移动端详情抽屉 */}
      {isMobile && (
        <Drawer
          visible={showMobileInspector}
          onClose={handleCloseMobileInspector}
          header="素材详情"
          placement="bottom"
          size="70vh"
          destroyOnClose
          className="media-library-mobile-drawer"
        >
          <MediaLibraryInspector
            asset={selectedAsset}
            onRename={renameAsset}
            onDelete={removeAsset}
            onDownload={(asset) => {
              downloadFile(asset.url, asset.name);
            }}
            onSelect={showSelectButton ? handleUseAsset : undefined}
            showSelectButton={showSelectButton}
            selectButtonText={selectButtonText}
          />
        </Drawer>
      )}
    </Dialog>
  );
}
