/**
 * MultiImageUpload Component
 *
 * Supports uploading multiple images for video generation.
 * Handles different upload modes: reference, frames (首帧/尾帧), components.
 */

import React, { useCallback, useState } from 'react';
import ReactDOM from 'react-dom';
import { Upload, Button, MessagePlugin } from 'tdesign-react';
import { AddIcon, DeleteIcon } from 'tdesign-icons-react';
import {
  ImageUploadIcon,
  MediaLibraryIcon,
} from '../../icons';
import type { UploadedVideoImage, ImageUploadConfig } from '../../../types/video.types';
import { MediaLibraryModal } from '../../media-library/MediaLibraryModal';
import { SelectionMode, AssetType, AssetSource } from '../../../types/asset.types';
import type { Asset } from '../../../types/asset.types';
import { useAssets } from '../../../contexts/AssetContext';
import { compressImageBlob, getCompressionStrategy } from '../../../utils/image-compression-core';
import './MultiImageUpload.scss';

interface MultiImageUploadProps {
  config: ImageUploadConfig;
  images: UploadedVideoImage[];
  onImagesChange: (images: UploadedVideoImage[]) => void;
  disabled?: boolean;
}

export const MultiImageUpload: React.FC<MultiImageUploadProps> = ({
  config,
  images,
  onImagesChange,
  disabled = false,
}) => {
  const { maxCount, labels = ['参考图'] } = config;
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [currentSlot, setCurrentSlot] = useState<number>(0);
  const [hoveredImage, setHoveredImage] = useState<{ url: string; x: number; y: number } | null>(null);
  const { addAsset } = useAssets();

  // Handle image hover for preview
  const handleImageMouseEnter = useCallback((url: string, e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const topY = rect.top - 10;
    setHoveredImage({ url, x: centerX, y: topY });
  }, []);

  const handleImageMouseLeave = useCallback(() => {
    setHoveredImage(null);
  }, []);

  // Handle file upload for a specific slot
  const handleUpload = useCallback(async (slot: number, file: File) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      MessagePlugin.error('请上传图片文件');
      return;
    }

    // Validate file size (max 25MB)
    if (file.size > 25 * 1024 * 1024) {
      MessagePlugin.error('图片大小不能超过 25MB');
      return;
    }

    let fileToProcess = file;

    // Compress if file is 10-25MB
    if (file.size > 10 * 1024 * 1024) {
      const strategy = getCompressionStrategy(file.size / (1024 * 1024));
      const msgId = MessagePlugin.loading({
        content: `正在压缩图片 (${(file.size / 1024 / 1024).toFixed(1)}MB)...`,
        duration: 0,
        placement: 'top',
      });

      try {
        fileToProcess = (await compressImageBlob(file, strategy.targetSizeMB)) as File;
        MessagePlugin.close(msgId);
        MessagePlugin.success({
          content: `压缩完成: ${(file.size / 1024 / 1024).toFixed(1)}MB → ${(fileToProcess.size / 1024 / 1024).toFixed(1)}MB`,
          duration: 2,
        });
      } catch (compressionErr) {
        MessagePlugin.close(msgId);
        console.error('[MultiImageUpload] Compression failed:', compressionErr);
        MessagePlugin.error('图片压缩失败');
        return;
      }
    }

    // Add to asset library (async, don't block UI)
    addAsset(fileToProcess, AssetType.IMAGE, AssetSource.LOCAL, file.name).catch((err) => {
      console.warn('[MultiImageUpload] Failed to add asset to library:', err);
    });

    // Convert to base64
    const reader = new FileReader();
    reader.onload = () => {
      const newImage: UploadedVideoImage = {
        slot,
        slotLabel: labels[slot] || `图片${slot + 1}`,
        url: reader.result as string,
        name: file.name,
        file: fileToProcess,
      };

      // Update images array
      const newImages = [...images];
      const existingIndex = newImages.findIndex(img => img.slot === slot);
      if (existingIndex >= 0) {
        newImages[existingIndex] = newImage;
      } else {
        newImages.push(newImage);
      }
      // Sort by slot
      newImages.sort((a, b) => a.slot - b.slot);
      onImagesChange(newImages);
    };
    reader.readAsDataURL(fileToProcess);
  }, [images, labels, onImagesChange, addAsset]);

  // Handle image removal
  const handleRemove = useCallback((slot: number) => {
    const newImages = images.filter(img => img.slot !== slot);
    onImagesChange(newImages);
  }, [images, onImagesChange]);

  // Handle media library selection
  const handleMediaLibrarySelect = useCallback(async (asset: Asset) => {
    // Need to fetch the actual blob data from the blob URL
    // and convert it to base64 data URL for API compatibility
    try {
      const response = await fetch(asset.url);
      const blob = await response.blob();

      // Convert blob to base64 data URL
      const reader = new FileReader();
      reader.onload = () => {
        const newImage: UploadedVideoImage = {
          slot: currentSlot,
          slotLabel: labels[currentSlot] || `图片${currentSlot + 1}`,
          url: reader.result as string, // base64 data URL
          name: asset.name,
        };

        // Update images array
        const newImages = [...images];
        const existingIndex = newImages.findIndex(img => img.slot === currentSlot);
        if (existingIndex >= 0) {
          newImages[existingIndex] = newImage;
        } else {
          newImages.push(newImage);
        }
        // Sort by slot
        newImages.sort((a, b) => a.slot - b.slot);
        onImagesChange(newImages);

        setShowMediaLibrary(false);
      };
      reader.readAsDataURL(blob);
    } catch (error) {
      console.error('[MultiImageUpload] Failed to convert asset to base64:', error);
      MessagePlugin.error('加载图片失败');
      setShowMediaLibrary(false);
    }
  }, [currentSlot, images, labels, onImagesChange]);

  // Open media library for a specific slot
  const openMediaLibrary = useCallback((slot: number) => {
    setCurrentSlot(slot);
    setShowMediaLibrary(true);
  }, []);

  // Get image for a specific slot
  const getImageForSlot = (slot: number): UploadedVideoImage | undefined => {
    return images.find(img => img.slot === slot);
  };

  // Render single upload slot
  const renderUploadSlot = (slot: number) => {
    const image = getImageForSlot(slot);
    const label = labels[slot] || `图片${slot + 1}`;

    return (
      <div key={slot} className="multi-image-upload__slot">
        <div className="multi-image-upload__slot-label">{label}</div>
        {image ? (
          <div
            className="multi-image-upload__preview"
            onMouseEnter={(e) => handleImageMouseEnter(image.url, e)}
            onMouseLeave={handleImageMouseLeave}
          >
            <img
              src={image.url}
              alt={image.name}
              className="multi-image-upload__image"
            />
            <div className="multi-image-upload__overlay">
              <Button
                theme="danger"
                variant="text"
                size="small"
                icon={<DeleteIcon />}
                data-track="ai_click_image_remove"
                onClick={() => handleRemove(slot)}
                disabled={disabled}
              />
            </div>
          </div>
        ) : (
          <div className="multi-image-upload__placeholder-container">
            <Upload
              theme="custom"
              accept="image/*"
              autoUpload={false}
              disabled={disabled}
              onChange={(files) => {
                if (files && files.length > 0) {
                  const file = files[0];
                  if (file.raw) {
                    handleUpload(slot, file.raw);
                  }
                }
              }}
            >
              <div className="multi-image-upload__placeholder">
                <ImageUploadIcon size={24} className="multi-image-upload__add-icon" />
                <span className="multi-image-upload__add-text">上传{label}</span>
              </div>
            </Upload>
            <Button
              variant="text"
              size="small"
              icon={<MediaLibraryIcon size={16} />}
              onClick={() => openMediaLibrary(slot)}
              disabled={disabled}
              data-track="ai_video_select_from_library"
              className="multi-image-upload__library-btn"
            >
              从素材库选择
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Hover preview - large image (rendered to body via portal) */}
      {hoveredImage && ReactDOM.createPortal(
        <div
          className="multi-image-upload__hover-preview"
          style={{
            left: `${hoveredImage.x}px`,
            top: `${hoveredImage.y}px`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <img src={hoveredImage.url} alt="Preview" />
        </div>,
        document.body
      )}

      <div className="multi-image-upload">
        <div className="multi-image-upload__header">
          <span className="multi-image-upload__title">
            {config.mode === 'frames' ? '首尾帧图片' : '参考图片'}
          </span>
          <span className="multi-image-upload__hint">
            {config.mode === 'frames'
              ? '可上传首帧和尾帧图片（可选）'
              : `最多上传 ${maxCount} 张参考图（可选）`}
          </span>
        </div>
        <div className="multi-image-upload__slots">
          {Array.from({ length: maxCount }, (_, i) => renderUploadSlot(i))}
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
    </>
  );
};

export default MultiImageUpload;
