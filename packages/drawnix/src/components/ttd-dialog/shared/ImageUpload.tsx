import React, { useState, useMemo, useEffect } from 'react';
import { Button, MessagePlugin } from 'tdesign-react';
import {
  ImageUploadIcon,
  MediaLibraryIcon,
} from '../../icons';
import { MediaLibraryModal } from '../../media-library/MediaLibraryModal';
import type { Asset } from '../../../types/asset.types';
import { SelectionMode, AssetType, AssetSource } from '../../../types/asset.types';
import { useAssets } from '../../../contexts/AssetContext';
import { compressImageBlob, getCompressionStrategy } from '../../../utils/image-compression-core';

export interface ImageFile {
  file?: File;
  url?: string;
  name: string;
}

interface ImageUploadProps {
  images: ImageFile[];
  onImagesChange: (images: ImageFile[]) => void;
  language: 'zh' | 'en';
  disabled?: boolean;
  multiple?: boolean;
  label?: string;
  icon?: string;
  onError?: (error: string | null) => void;
  headerRight?: React.ReactNode;
}

export const ImageUpload: React.FC<ImageUploadProps> = ({
  images,
  onImagesChange,
  language,
  disabled = false,
  multiple = true,
  label,
  icon = '📷',
  onError,
  headerRight
}) => {
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const { addAsset } = useAssets();

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const fileArray = Array.from(files);
      const formatValidFiles = fileArray.filter(file => file.type.startsWith('image/'));
      const sizeValidFiles = formatValidFiles.filter(file => file.size <= 25 * 1024 * 1024);

      if (sizeValidFiles.length === 0) {
        onError?.(
          language === 'zh'
            ? '部分文件格式不支持或超过25MB限制'
            : 'Some files are not supported or exceed 25MB limit'
        );
        event.target.value = '';
        return;
      }

      // Process files with compression if needed
      const newImages: Array<{ file: Blob; name: string }> = [];

      for (const file of sizeValidFiles) {
        try {
          let fileToAdd: Blob = file;

          // Compress if file is 10-25MB
          if (file.size > 10 * 1024 * 1024) {
            const strategy = getCompressionStrategy(file.size / (1024 * 1024));
            const msgId = MessagePlugin.loading({
              content: language === 'zh'
                ? `正在压缩图片 (${(file.size / 1024 / 1024).toFixed(1)}MB)...`
                : `Compressing image (${(file.size / 1024 / 1024).toFixed(1)}MB)...`,
              duration: 0,
              placement: 'top',
            });

            try {
              fileToAdd = await compressImageBlob(file, strategy.targetSizeMB);
              MessagePlugin.close(msgId);
              MessagePlugin.success({
                content: language === 'zh'
                  ? `压缩完成: ${(file.size / 1024 / 1024).toFixed(1)}MB → ${(fileToAdd.size / 1024 / 1024).toFixed(1)}MB`
                  : `Compressed: ${(file.size / 1024 / 1024).toFixed(1)}MB → ${(fileToAdd.size / 1024 / 1024).toFixed(1)}MB`,
                duration: 2,
              });
            } catch (compressionErr) {
              MessagePlugin.close(msgId);
              console.error('[ImageUpload] Compression failed:', compressionErr);
              onError?.(language === 'zh' ? '图片压缩失败' : 'Image compression failed');
              continue;
            }
          }

          newImages.push({ file: fileToAdd, name: file.name });
        } catch (err) {
          console.error('[ImageUpload] Error processing file:', err);
          onError?.(language === 'zh' ? '处理图片失败' : 'Failed to process image');
          continue;
        }
      }

      if (newImages.length === 0) {
        event.target.value = '';
        return;
      }

      // Add files to asset library (async, don't block UI)
      newImages.forEach(({ file, name }) => {
        addAsset(file as File, AssetType.IMAGE, AssetSource.LOCAL, name).catch((err) => {
          console.warn('[ImageUpload] Failed to add asset to library:', err);
        });
      });

      if (multiple) {
        onImagesChange([...images, ...newImages]);
      } else {
        onImagesChange(newImages.slice(0, 1));
      }

      if (newImages.length !== sizeValidFiles.length) {
        onError?.(
          language === 'zh'
            ? '部分文件格式不支持或超过25MB限制'
            : 'Some files are not supported or exceed 25MB limit'
        );
      } else {
        onError?.(null);
      }
    }
    event.target.value = '';
  };

  const removeImage = (index: number) => {
    onImagesChange(images.filter((_, i) => i !== index));
  };

  // 创建并缓存图片预览 URL（防止渲染时重复创建导致内存泄漏）
  const imageSrcMap = useMemo(() => {
    const map = new Map<number, string>();
    images.forEach((image, index) => {
      if (image.file) {
        map.set(index, URL.createObjectURL(image.file));
      } else if (image.url) {
        map.set(index, image.url);
      }
    });
    return map;
  }, [images]);

  // 清理 Blob URL 防止内存泄漏
  useEffect(() => {
    return () => {
      imageSrcMap.forEach((url, index) => {
        // 只 revoke 由 File 创建的 Blob URL
        if (images[index]?.file) {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, [imageSrcMap, images]);

  const getImageSrc = (index: number) => {
    return imageSrcMap.get(index) || '';
  };

  const handleMediaLibrarySelect = async (asset: Asset) => {
    // Need to fetch the actual blob data from the blob URL
    // and convert it to base64 data URL for API compatibility
    try {
      const response = await fetch(asset.url);
      const blob = await response.blob();

      // Convert blob to base64 data URL
      const reader = new FileReader();
      reader.onload = () => {
        const newImage: ImageFile = {
          url: reader.result as string, // base64 data URL
          name: asset.name
        };

        if (multiple) {
          onImagesChange([...images, newImage]);
        } else {
          onImagesChange([newImage]);
        }

        setShowMediaLibrary(false);
        onError?.(null);
      };
      reader.readAsDataURL(blob);
    } catch (error) {
      console.error('[ImageUpload] Failed to convert asset to base64:', error);
      onError?.(language === 'zh' ? '加载图片失败' : 'Failed to load image');
      setShowMediaLibrary(false);
    }
  };

  const defaultLabel = language === 'zh' 
    ? `${multiple ? '参考图片' : '源图片'} (可选)` 
    : `${multiple ? 'Reference Images' : 'Source Image'} (Optional)`;

  return (
    <div className="form-field">
      <div className="form-label-row">
        <label className="form-label">
          {label || defaultLabel}
        </label>
        {headerRight && <div className="form-label-right">{headerRight}</div>}
      </div>
      <div className="unified-image-area">
        <div className="images-grid">
          {images.length === 0 ? (
            <div className="add-more-item">
              <input
                type="file"
                id="image-upload"
                multiple={multiple}
                accept="image/*"
                onChange={handleImageUpload}
                className="upload-input"
                disabled={disabled}
                style={{ display: 'none' }}
              />
              <div className="add-more-buttons">
                <Button
                  variant="outline"
                  icon={<ImageUploadIcon size={18} />}
                  onClick={() => document.getElementById('image-upload')?.click()}
                  disabled={disabled}
                  data-track="image_upload_select_from_local"
                  className="add-more-btn"
                >
                  {language === 'zh' ? '本地' : 'Local'}
                </Button>
                  <Button
                    variant="outline"
                    icon={<MediaLibraryIcon size={18} />}
                    onClick={() => setShowMediaLibrary(true)}
                    disabled={disabled}
                    data-track="image_upload_select_from_library"
                    className="add-more-btn"
                  >
                    {language === 'zh' ? '素材库' : 'Library'}
                  </Button>
              </div>
            </div>
          ) : (
            <>
              {images.map((image, index) => {
              const src = getImageSrc(index);
              return (
                <div key={index} className="uploaded-image-item" data-tooltip={src}>
                  <div 
                    className="uploaded-image-preview-container"
                    onMouseEnter={(e) => {
                      const tooltip = e.currentTarget.querySelector('.image-hover-tooltip') as HTMLElement;
                      if (tooltip) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        tooltip.style.left = rect.left + rect.width / 2 + 'px';
                        tooltip.style.top = rect.top - 10 + 'px';
                        tooltip.style.opacity = '1';
                        tooltip.style.visibility = 'visible';
                      }
                    }}
                    onMouseLeave={(e) => {
                      const tooltip = e.currentTarget.querySelector('.image-hover-tooltip') as HTMLElement;
                      if (tooltip) {
                        tooltip.style.opacity = '0';
                        tooltip.style.visibility = 'hidden';
                      }
                    }}
                  >
                    <img
                      src={src}
                      alt={`Upload ${index + 1}`}
                      className="uploaded-image-preview"
                    />
                    <div className="image-hover-tooltip">
                      <img src={src} alt="Large preview" />
                    </div>
                  </div>
                  <button
                    type="button"
                    data-track="ai_click_image_remove"
                    onClick={() => removeImage(index)}
                    className="remove-image-btn"
                    disabled={disabled}
                  >
                    ×
                  </button>
                  <div className="image-info">
                    <span className="image-name">{image.name}</span>
                  </div>
                </div>
              );
            })}
            {multiple && (
              <div className="add-more-item">
                <input
                  type="file"
                  id="image-upload-more"
                  multiple
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="upload-input"
                  disabled={disabled}
                  style={{ display: 'none' }}
                />
                <div className="add-more-buttons">
                  <Button
                    variant="outline"
                    icon={<ImageUploadIcon size={18} />}
                    onClick={() => document.getElementById('image-upload-more')?.click()}
                    disabled={disabled}
                    data-track="image_upload_select_from_local_more"
                    className="add-more-btn"
                  >
                    {language === 'zh' ? '本地' : 'Local'}
                  </Button>
                  <Button
                    variant="outline"
                    icon={<MediaLibraryIcon size={18} />}
                    onClick={() => setShowMediaLibrary(true)}
                    disabled={disabled}
                    data-track="image_upload_select_from_library_more"
                    className="add-more-btn"
                  >
                    {language === 'zh' ? '素材库' : 'Library'}
                  </Button>
                </div>
              </div>
            )}
            {!multiple && (
              <div className="add-more-item">
                <input
                  type="file"
                  id="image-replace"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="upload-input"
                  disabled={disabled}
                  style={{ display: 'none' }}
                />
                <div className="add-more-buttons">
                  <Button
                    variant="outline"
                    icon={<ImageUploadIcon size={18} />}
                    onClick={() => document.getElementById('image-replace')?.click()}
                    disabled={disabled}
                    data-track="image_upload_replace_from_local"
                    className="add-more-btn"
                  >
                    {language === 'zh' ? '本地' : 'Local'}
                  </Button>
                  <Button
                    variant="outline"
                    icon={<MediaLibraryIcon size={18} />}
                    onClick={() => setShowMediaLibrary(true)}
                    disabled={disabled}
                    data-track="image_upload_replace_from_library"
                    className="add-more-btn"
                  >
                    {language === 'zh' ? '素材库' : 'Library'}
                  </Button>
                </div>
              </div>
            )}
            </>
          )}
        </div>
      </div>

      {/* Media Library Modal */}
      <MediaLibraryModal
        isOpen={showMediaLibrary}
        onClose={() => setShowMediaLibrary(false)}
        mode={SelectionMode.SELECT}
        filterType={AssetType.IMAGE}
        onSelect={handleMediaLibrarySelect}
      />
    </div>
  );
};