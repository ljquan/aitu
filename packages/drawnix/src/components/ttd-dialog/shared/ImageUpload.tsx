import React, { useState } from 'react';
import { Button } from 'tdesign-react';
import { FolderOpen, HardDrive } from 'lucide-react';
import { MediaLibraryModal } from '../../media-library/MediaLibraryModal';
import type { Asset } from '../../../types/asset.types';
import { SelectionMode, AssetType, AssetSource } from '../../../types/asset.types';
import { useAssets } from '../../../contexts/AssetContext';

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

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const validFiles = Array.from(files).filter(file => 
        file.type.startsWith('image/') && file.size <= 10 * 1024 * 1024
      );
      
      // Add valid files to asset library (async, don't block UI)
      validFiles.forEach(file => {
        addAsset(file, AssetType.IMAGE, AssetSource.LOCAL, file.name).catch((err) => {
          console.warn('[ImageUpload] Failed to add asset to library:', err);
        });
      });
      
      const newImages = validFiles.map(file => ({ file, name: file.name }));
      
      if (multiple) {
        onImagesChange([...images, ...newImages]);
      } else {
        onImagesChange(newImages.slice(0, 1));
      }
      
      if (validFiles.length !== files.length) {
        onError?.(
          language === 'zh' 
            ? '部分文件格式不支持或超过10MB限制' 
            : 'Some files are not supported or exceed 10MB limit'
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

  const getImageSrc = (image: ImageFile) => {
    return image.file ? URL.createObjectURL(image.file) : image.url || '';
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
                  icon={<HardDrive size={18} />}
                  onClick={() => document.getElementById('image-upload')?.click()}
                  disabled={disabled}
                  data-track="image_upload_select_from_local"
                  className="add-more-btn"
                >
                  {language === 'zh' ? '本地' : 'Local'}
                </Button>
                <Button
                  variant="outline"
                  icon={<FolderOpen size={18} />}
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
              const src = getImageSrc(image);
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
                    icon={<HardDrive size={18} />}
                    onClick={() => document.getElementById('image-upload-more')?.click()}
                    disabled={disabled}
                    data-track="image_upload_select_from_local_more"
                    className="add-more-btn"
                  >
                    {language === 'zh' ? '本地' : 'Local'}
                  </Button>
                  <Button
                    variant="outline"
                    icon={<FolderOpen size={18} />}
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
                    icon={<HardDrive size={18} />}
                    onClick={() => document.getElementById('image-replace')?.click()}
                    disabled={disabled}
                    data-track="image_upload_replace_from_local"
                    className="add-more-btn"
                  >
                    {language === 'zh' ? '本地' : 'Local'}
                  </Button>
                  <Button
                    variant="outline"
                    icon={<FolderOpen size={18} />}
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