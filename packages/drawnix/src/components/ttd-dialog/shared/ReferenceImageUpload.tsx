/**
 * ReferenceImageUpload Component
 *
 * A unified reference image upload component for AI image/video generation dialogs.
 * Supports:
 * - Local file upload
 * - Media library selection
 * - Clipboard paste (Ctrl+V / Cmd+V)
 * - Drag and drop
 */

import React, { useCallback, useState, useRef, useEffect } from 'react';
import { Button, MessagePlugin } from 'tdesign-react';
import { HardDrive, FolderOpen, X } from 'lucide-react';
import { MediaLibraryModal } from '../../media-library/MediaLibraryModal';
import type { Asset } from '../../../types/asset.types';
import { SelectionMode, AssetType, AssetSource } from '../../../types/asset.types';
import { useAssets } from '../../../contexts/AssetContext';
import './ReferenceImageUpload.scss';

export interface ReferenceImage {
  url: string;
  name: string;
  file?: File;
}

interface ReferenceImageUploadProps {
  /** Current images */
  images: ReferenceImage[];
  /** Callback when images change */
  onImagesChange: (images: ReferenceImage[]) => void;
  /** Language for i18n */
  language?: 'zh' | 'en';
  /** Whether the component is disabled */
  disabled?: boolean;
  /** Whether to allow multiple images */
  multiple?: boolean;
  /** Maximum number of images (only applies when multiple is true) */
  maxCount?: number;
  /** Label for the upload area */
  label?: string;
  /** Optional slot labels for multi-slot mode (e.g., ['首帧', '尾帧']) */
  slotLabels?: string[];
  /** Error callback */
  onError?: (error: string | null) => void;
}

export const ReferenceImageUpload: React.FC<ReferenceImageUploadProps> = ({
  images,
  onImagesChange,
  language = 'zh',
  disabled = false,
  multiple = true,
  maxCount = 10,
  label,
  slotLabels,
  onError,
}) => {
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [currentSlot, setCurrentSlot] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addAsset } = useAssets();

  const i18n = {
    zh: {
      local: '本地',
      library: '素材库',
      dragHint: '拖拽图片到此处',
      pasteHint: '或 Ctrl+V 粘贴',
      invalidFile: '请上传图片文件',
      fileTooLarge: '图片大小不能超过 10MB',
      someFilesInvalid: '部分文件格式不支持或超过10MB限制',
      loadFailed: '加载图片失败',
      maxCountReached: '最多上传 {count} 张图片',
    },
    en: {
      local: 'Local',
      library: 'Library',
      dragHint: 'Drop images here',
      pasteHint: 'or Ctrl+V to paste',
      invalidFile: 'Please upload image files',
      fileTooLarge: 'Image size cannot exceed 10MB',
      someFilesInvalid: 'Some files are not supported or exceed 10MB limit',
      loadFailed: 'Failed to load image',
      maxCountReached: 'Maximum {count} images allowed',
    },
  };

  const t = i18n[language];

  // Validate file
  const validateFile = useCallback((file: File): boolean => {
    if (!file.type.startsWith('image/')) {
      MessagePlugin.error(t.invalidFile);
      return false;
    }
    if (file.size > 10 * 1024 * 1024) {
      MessagePlugin.error(t.fileTooLarge);
      return false;
    }
    return true;
  }, [t]);

  // Convert file to base64 and create ReferenceImage
  const fileToReferenceImage = useCallback((file: File): Promise<ReferenceImage> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          url: reader.result as string,
          name: file.name,
          file,
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }, []);

  // Handle file upload
  const handleFiles = useCallback(async (files: FileList | File[], targetSlot?: number) => {
    const fileArray = Array.from(files);
    const validFiles = fileArray.filter(validateFile);

    if (validFiles.length === 0) return;

    // Check max count
    if (multiple && images.length + validFiles.length > maxCount) {
      MessagePlugin.warning(t.maxCountReached.replace('{count}', String(maxCount)));
      validFiles.splice(maxCount - images.length);
    }

    // Add to asset library (async, don't block UI)
    validFiles.forEach(file => {
      addAsset(file, AssetType.IMAGE, AssetSource.LOCAL, file.name).catch((err) => {
        console.warn('[ReferenceImageUpload] Failed to add asset to library:', err);
      });
    });

    try {
      const newImages = await Promise.all(validFiles.map(fileToReferenceImage));

      if (slotLabels && targetSlot !== undefined) {
        // Slot mode: replace image at specific slot
        const updatedImages = [...images];
        updatedImages[targetSlot] = newImages[0];
        onImagesChange(updatedImages.filter(Boolean));
      } else if (multiple) {
        onImagesChange([...images, ...newImages]);
      } else {
        onImagesChange(newImages.slice(0, 1));
      }

      onError?.(null);
    } catch (error) {
      console.error('[ReferenceImageUpload] Failed to process files:', error);
      onError?.(t.loadFailed);
    }
  }, [images, multiple, maxCount, slotLabels, validateFile, fileToReferenceImage, addAsset, onImagesChange, onError, t]);

  // Handle file input change
  const handleFileInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      handleFiles(files, slotLabels ? currentSlot : undefined);
    }
    event.target.value = '';
  }, [handleFiles, slotLabels, currentSlot]);

  // Handle media library selection
  const handleMediaLibrarySelect = useCallback(async (asset: Asset) => {
    try {
      const response = await fetch(asset.url);
      const blob = await response.blob();

      const reader = new FileReader();
      reader.onload = () => {
        const newImage: ReferenceImage = {
          url: reader.result as string,
          name: asset.name,
        };

        if (slotLabels) {
          // Slot mode: replace image at specific slot
          const updatedImages = [...images];
          updatedImages[currentSlot] = newImage;
          onImagesChange(updatedImages.filter(Boolean));
        } else if (multiple) {
          if (images.length >= maxCount) {
            MessagePlugin.warning(t.maxCountReached.replace('{count}', String(maxCount)));
            return;
          }
          onImagesChange([...images, newImage]);
        } else {
          onImagesChange([newImage]);
        }

        setShowMediaLibrary(false);
        onError?.(null);
      };
      reader.readAsDataURL(blob);
    } catch (error) {
      console.error('[ReferenceImageUpload] Failed to convert asset to base64:', error);
      onError?.(t.loadFailed);
      setShowMediaLibrary(false);
    }
  }, [images, multiple, maxCount, slotLabels, currentSlot, onImagesChange, onError, t]);

  // Handle drag events
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set dragging to false if we're leaving the container
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const { clientX, clientY } = e;
      if (
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom
      ) {
        setIsDragging(false);
      }
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetSlot?: number) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFiles(files, targetSlot);
    }
  }, [disabled, handleFiles]);

  // Handle paste events
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (disabled) return;

      // Check if the container or its children are focused
      const activeElement = document.activeElement;
      const container = containerRef.current;
      if (!container) return;

      // Only handle paste if focus is within the container or on the document body
      // (to allow paste when no specific element is focused)
      const isContainerFocused = container.contains(activeElement) ||
        activeElement === document.body ||
        activeElement?.tagName === 'BODY';

      if (!isContainerFocused) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            imageFiles.push(file);
          }
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        handleFiles(imageFiles);
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, [disabled, handleFiles]);

  // Remove image
  const handleRemove = useCallback((index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    onImagesChange(newImages);
  }, [images, onImagesChange]);

  // Open file dialog
  const openFileDialog = useCallback((slot?: number) => {
    if (slot !== undefined) {
      setCurrentSlot(slot);
    }
    fileInputRef.current?.click();
  }, []);

  // Open media library
  const openMediaLibrary = useCallback((slot?: number) => {
    if (slot !== undefined) {
      setCurrentSlot(slot);
    }
    setShowMediaLibrary(true);
  }, []);

  // Render upload placeholder
  const renderUploadPlaceholder = (slot?: number) => (
    <div
      className={`reference-image-upload__placeholder ${isDragging ? 'reference-image-upload__placeholder--dragging' : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={(e) => handleDrop(e, slot)}
    >
      <div className="reference-image-upload__buttons">
        <Button
          variant="outline"
          icon={<HardDrive size={16} />}
          onClick={() => openFileDialog(slot)}
          disabled={disabled}
          data-track="reference_image_upload_local"
          className="reference-image-upload__btn"
        >
          {t.local}
        </Button>
        <Button
          variant="outline"
          icon={<FolderOpen size={16} />}
          onClick={() => openMediaLibrary(slot)}
          disabled={disabled}
          data-track="reference_image_upload_library"
          className="reference-image-upload__btn"
        >
          {t.library}
        </Button>
      </div>
    </div>
  );

  // Render image preview
  const renderImagePreview = (image: ReferenceImage, index: number) => (
    <div key={index} className="reference-image-upload__preview">
      <img
        src={image.url}
        alt={image.name}
        className="reference-image-upload__image"
      />
      <button
        type="button"
        className="reference-image-upload__remove"
        onClick={() => handleRemove(index)}
        disabled={disabled}
        data-track="reference_image_upload_remove"
      >
        <X size={14} />
      </button>
      {slotLabels && slotLabels[index] && (
        <div className="reference-image-upload__slot-label">
          {slotLabels[index]}
        </div>
      )}
    </div>
  );

  // Render slot mode (for video generation with specific slots like 首帧/尾帧)
  const renderSlotMode = () => {
    if (!slotLabels) return null;

    return (
      <div className="reference-image-upload__slots">
        {slotLabels.map((slotLabel, index) => {
          const image = images[index];
          return (
            <div key={index} className="reference-image-upload__slot">
              <div className="reference-image-upload__slot-title">{slotLabel}</div>
              {image ? (
                renderImagePreview(image, index)
              ) : (
                <div
                  className={`reference-image-upload__slot-placeholder ${isDragging ? 'reference-image-upload__slot-placeholder--dragging' : ''}`}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, index)}
                >
                  <div className="reference-image-upload__slot-buttons">
                    <Button
                      variant="outline"
                      icon={<HardDrive size={16} />}
                      onClick={() => openFileDialog(index)}
                      disabled={disabled}
                      data-track="reference_image_upload_slot_local"
                      className="reference-image-upload__slot-btn"
                    >
                      {t.local}
                    </Button>
                    <Button
                      variant="outline"
                      icon={<FolderOpen size={16} />}
                      onClick={() => openMediaLibrary(index)}
                      disabled={disabled}
                      data-track="reference_image_upload_slot_library"
                      className="reference-image-upload__slot-btn"
                    >
                      {t.library}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // Render grid mode (for multiple images without specific slots)
  const renderGridMode = () => {
    const showAddMore = multiple && images.length < maxCount;

    return (
      <div className="reference-image-upload__grid">
        {images.map((image, index) => renderImagePreview(image, index))}
        {showAddMore && renderUploadPlaceholder()}
        {images.length === 0 && !showAddMore && renderUploadPlaceholder()}
      </div>
    );
  };

  // Render single mode
  const renderSingleMode = () => {
    if (images.length > 0) {
      return (
        <div className="reference-image-upload__single">
          {renderImagePreview(images[0], 0)}
          <div className="reference-image-upload__replace">
            {renderUploadPlaceholder()}
          </div>
        </div>
      );
    }
    return renderUploadPlaceholder();
  };

  return (
    <div
      ref={containerRef}
      className={`reference-image-upload ${disabled ? 'reference-image-upload--disabled' : ''}`}
      tabIndex={0}
    >
      {label && (
        <div className="reference-image-upload__label">{label}</div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple={multiple && !slotLabels}
        onChange={handleFileInputChange}
        className="reference-image-upload__input"
        disabled={disabled}
      />

      {slotLabels ? renderSlotMode() : (multiple ? renderGridMode() : renderSingleMode())}

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

export default ReferenceImageUpload;
