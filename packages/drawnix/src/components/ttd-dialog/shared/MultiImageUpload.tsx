/**
 * MultiImageUpload Component
 *
 * Supports uploading multiple images for video generation.
 * Handles different upload modes: reference, frames (首帧/尾帧), components.
 */

import React, { useCallback } from 'react';
import { Upload, Button, MessagePlugin } from 'tdesign-react';
import { AddIcon, DeleteIcon } from 'tdesign-icons-react';
import type { UploadedVideoImage, ImageUploadConfig } from '../../../types/video.types';
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

  // Handle file upload for a specific slot
  const handleUpload = useCallback(async (slot: number, file: File) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      MessagePlugin.error('请上传图片文件');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      MessagePlugin.error('图片大小不能超过 10MB');
      return;
    }

    // Convert to base64
    const reader = new FileReader();
    reader.onload = () => {
      const newImage: UploadedVideoImage = {
        slot,
        slotLabel: labels[slot] || `图片${slot + 1}`,
        url: reader.result as string,
        name: file.name,
        file,
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
    reader.readAsDataURL(file);
  }, [images, labels, onImagesChange]);

  // Handle image removal
  const handleRemove = useCallback((slot: number) => {
    const newImages = images.filter(img => img.slot !== slot);
    onImagesChange(newImages);
  }, [images, onImagesChange]);

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
          <div className="multi-image-upload__preview">
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
              <AddIcon className="multi-image-upload__add-icon" />
              <span className="multi-image-upload__add-text">上传{label}</span>
            </div>
          </Upload>
        )}
      </div>
    );
  };

  return (
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
    </div>
  );
};

export default MultiImageUpload;
