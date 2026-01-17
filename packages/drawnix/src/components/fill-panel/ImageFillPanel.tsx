/**
 * 图片填充面板组件
 * Image Fill Panel Component
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import classNames from 'classnames';
import { debounce } from '@aitu/utils';
import { useI18n } from '../../i18n';
import { MessagePlugin } from 'tdesign-react';
import { Image, Upload, Grid, ChevronDown, ChevronUp } from 'lucide-react';
import type { ImageFillConfig, ImageFillMode } from '../../types/fill.types';
import { DEFAULT_IMAGE_FILL } from '../../types/fill.types';
import { MediaLibraryModal } from '../media-library/MediaLibraryModal';
import { AssetType, SelectionMode } from '../../types/asset.types';
import type { Asset } from '../../types/asset.types';
import './image-fill-panel.scss';

export interface ImageFillPanelProps {
  value?: ImageFillConfig;
  onChange?: (config: ImageFillConfig) => void;
  /** 请求打开素材库的回调（用于将 Modal 渲染到 Popover 外部） */
  onOpenMediaLibrary?: () => void;
  /** 是否由外部控制素材库状态 */
  externalMediaLibraryControl?: boolean;
}

const FILL_MODES: { value: ImageFillMode; labelZh: string; labelEn: string; icon: string }[] = [
  { value: 'stretch', labelZh: '拉伸', labelEn: 'Stretch', icon: '⬌' },
  { value: 'tile', labelZh: '平铺', labelEn: 'Tile', icon: '⊞' },
  { value: 'fit', labelZh: '适应', labelEn: 'Fit', icon: '⊡' },
];

export const ImageFillPanel: React.FC<ImageFillPanelProps> = ({ 
  value, 
  onChange,
  onOpenMediaLibrary,
  externalMediaLibraryControl = false,
}) => {
  const { language } = useI18n();
  const [config, setConfig] = useState<ImageFillConfig>(value || DEFAULT_IMAGE_FILL);
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 同步外部 value 到内部 config 状态
  useEffect(() => {
    if (value) {
      setConfig(value);
    }
  }, [value]);

  // 更新配置
  const updateConfig = useCallback(
    (updates: Partial<ImageFillConfig>) => {
      const newConfig = { ...config, ...updates };
      setConfig(newConfig);
      onChange?.(newConfig);
    },
    [config, onChange]
  );

  // 防抖版本的 onChange，用于滑块拖动时减少更新频率
  // 注意：只防抖外部回调，内部状态立即更新以保持 UI 响应
  const debouncedOnChange = useMemo(
    () => debounce((newConfig: ImageFillConfig) => {
      onChange?.(newConfig);
    }, 16), // 16ms 防抖（约一帧），平衡实时性和性能
    [onChange]
  );

  // 滑块专用的更新函数：立即更新 UI，防抖触发外部回调
  const updateConfigDebounced = useCallback(
    (updates: Partial<ImageFillConfig>) => {
      const newConfig = { ...config, ...updates };
      setConfig(newConfig);
      debouncedOnChange(newConfig);
    },
    [config, debouncedOnChange]
  );

  // 处理从素材库选择
  const handleSelectFromLibrary = useCallback(
    (asset: Asset) => {
      updateConfig({ imageUrl: asset.url });
      setShowMediaLibrary(false);
    },
    [updateConfig]
  );

  // 处理文件上传
  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      // 验证文件类型
      if (!file.type.startsWith('image/')) {
        MessagePlugin.warning(language === 'zh' ? '请选择图片文件' : 'Please select an image file');
        return;
      }

      // 验证文件大小 (最大 10MB)
      if (file.size > 10 * 1024 * 1024) {
        MessagePlugin.warning(
          language === 'zh' ? '图片大小不能超过 10MB' : 'Image size cannot exceed 10MB'
        );
        return;
      }

      // 转换为 base64
      const reader = new FileReader();
      reader.onload = (e) => {
        const imageUrl = e.target?.result as string;
        updateConfig({ imageUrl });
      };
      reader.readAsDataURL(file);

      // 清空 input
      event.target.value = '';
    },
    [language, updateConfig]
  );

  // 打开文件选择器
  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // 打开素材库的处理函数
  const handleOpenMediaLibrary = useCallback(() => {
    if (externalMediaLibraryControl && onOpenMediaLibrary) {
      // 使用外部控制时，调用外部回调
      onOpenMediaLibrary();
    } else {
      // 内部控制
      setShowMediaLibrary(true);
    }
  }, [externalMediaLibraryControl, onOpenMediaLibrary]);

  // 渲染图片预览或占位符
  const renderImagePreview = () => {
    if (config.imageUrl) {
      return (
        <div className="ifp-image-preview">
          <img src={config.imageUrl} alt="Fill preview" />
          <button
            className="ifp-image-remove"
            onClick={() => updateConfig({ imageUrl: '' })}
            title={language === 'zh' ? '移除图片' : 'Remove image'}
          >
            ×
          </button>
        </div>
      );
    }

    return (
      <div className="ifp-image-placeholder">
        <Image size={32} className="ifp-placeholder-icon" />
        <span className="ifp-placeholder-text">
          {language === 'zh' ? '选择图片' : 'Select Image'}
        </span>
      </div>
    );
  };

  return (
    <div className="image-fill-panel">
      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileUpload}
      />

      {/* 图片选择区域 */}
      <div className="ifp-image-section">
        <div className="ifp-image-container" onClick={() => !config.imageUrl && handleOpenMediaLibrary()}>
          {renderImagePreview()}
        </div>

        <div className="ifp-image-actions">
          <button className="ifp-action-btn ifp-action-btn--primary" onClick={handleOpenMediaLibrary}>
            <Grid size={14} />
            <span>{language === 'zh' ? '素材库' : 'Library'}</span>
          </button>
          <button className="ifp-action-btn" onClick={handleUploadClick}>
            <Upload size={14} />
            <span>{language === 'zh' ? '上传' : 'Upload'}</span>
          </button>
        </div>
      </div>

      {/* 只有选择了图片才显示后续选项 */}
      {config.imageUrl && (
        <>
          {/* 平铺模式 */}
          <div className="ifp-control-section">
            <div className="ifp-section-title">
              {language === 'zh' ? '平铺模式' : 'Fill Mode'}
            </div>
            <div className="ifp-mode-buttons">
              {FILL_MODES.map((mode) => (
                <button
                  key={mode.value}
                  className={classNames('ifp-mode-btn', { active: config.mode === mode.value })}
                  onClick={() => updateConfig({ mode: mode.value })}
                  title={language === 'zh' ? mode.labelZh : mode.labelEn}
                >
                  <span className="ifp-mode-icon">{mode.icon}</span>
                  <span className="ifp-mode-label">
                    {language === 'zh' ? mode.labelZh : mode.labelEn}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* 高级参数折叠面板 */}
          <div className="ifp-advanced-section">
            <button
              className="ifp-advanced-toggle"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <span>{language === 'zh' ? '高级设置' : 'Advanced'}</span>
              {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showAdvanced && (
              <div className="ifp-advanced-content">
                {/* 缩放 */}
                <div className="ifp-control-row">
                  <label className="ifp-control-label">
                    {language === 'zh' ? '缩放' : 'Scale'}
                  </label>
                  <div className="ifp-control-input">
                    <input
                      type="range"
                      min={50}
                      max={200}
                      value={(config.scale ?? 1) * 100}
                      onChange={(e) => updateConfigDebounced({ scale: Number(e.target.value) / 100 })}
                      className="ifp-slider"
                    />
                    <span className="ifp-control-value">
                      {Math.round((config.scale ?? 1) * 100)}%
                    </span>
                  </div>
                </div>

                {/* X 偏移 */}
                <div className="ifp-control-row">
                  <label className="ifp-control-label">
                    {language === 'zh' ? 'X 偏移' : 'Offset X'}
                  </label>
                  <div className="ifp-control-input">
                    <input
                      type="range"
                      min={-100}
                      max={100}
                      value={(config.offsetX ?? 0) * 100}
                      onChange={(e) => updateConfigDebounced({ offsetX: Number(e.target.value) / 100 })}
                      className="ifp-slider"
                    />
                    <span className="ifp-control-value">
                      {Math.round((config.offsetX ?? 0) * 100)}%
                    </span>
                  </div>
                </div>

                {/* Y 偏移 */}
                <div className="ifp-control-row">
                  <label className="ifp-control-label">
                    {language === 'zh' ? 'Y 偏移' : 'Offset Y'}
                  </label>
                  <div className="ifp-control-input">
                    <input
                      type="range"
                      min={-100}
                      max={100}
                      value={(config.offsetY ?? 0) * 100}
                      onChange={(e) => updateConfigDebounced({ offsetY: Number(e.target.value) / 100 })}
                      className="ifp-slider"
                    />
                    <span className="ifp-control-value">
                      {Math.round((config.offsetY ?? 0) * 100)}%
                    </span>
                  </div>
                </div>

                {/* 旋转 */}
                <div className="ifp-control-row">
                  <label className="ifp-control-label">
                    {language === 'zh' ? '旋转' : 'Rotation'}
                  </label>
                  <div className="ifp-control-input">
                    <input
                      type="range"
                      min={0}
                      max={360}
                      value={config.rotation ?? 0}
                      onChange={(e) => updateConfigDebounced({ rotation: Number(e.target.value) })}
                      className="ifp-slider"
                    />
                    <span className="ifp-control-value">{config.rotation ?? 0}°</span>
                  </div>
                </div>

                {/* 重置按钮 */}
                <button
                  className="ifp-reset-btn"
                  onClick={() =>
                    updateConfig({
                      scale: 1,
                      offsetX: 0,
                      offsetY: 0,
                      rotation: 0,
                    })
                  }
                >
                  {language === 'zh' ? '重置' : 'Reset'}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* 素材库弹窗 - 仅在内部控制时渲染 */}
      {!externalMediaLibraryControl && (
        <MediaLibraryModal
          isOpen={showMediaLibrary}
          onClose={() => setShowMediaLibrary(false)}
          mode={SelectionMode.SELECT}
          filterType={AssetType.IMAGE}
          onSelect={handleSelectFromLibrary}
          selectButtonText={language === 'zh' ? '使用此图片' : 'Use this image'}
        />
      )}
    </div>
  );
};

export default ImageFillPanel;
