/**
 * 图片编辑器组件
 * 支持裁剪、滤镜调整功能
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Crop,
  Sliders,
  Check,
  RotateCcw,
  Replace,
  ImagePlus,
  Download,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react';
import { Tooltip, MessagePlugin } from 'tdesign-react';
import { Z_INDEX } from '../../constants/z-index';
import {
  ImageEditorProps,
  EditMode,
  CropArea,
  FilterType,
  FilterParams,
  SaveAction,
  DEFAULT_FILTER_PARAMS,
  ASPECT_RATIO_PRESETS,
  FILTER_PRESETS,
} from './types';
import { CropPanel } from './CropPanel';
import { FilterPanel } from './FilterPanel';
import './ImageEditor.scss';

export const ImageEditor: React.FC<ImageEditorProps> = ({
  visible,
  imageUrl,
  onClose,
  onSave,
  onOverwrite,
  onInsert,
  showOverwrite = false,
}) => {
  // 编辑模式
  const [mode, setMode] = useState<EditMode>('crop');

  // 裁剪状态
  const [cropArea, setCropArea] = useState<CropArea | null>(null);
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);

  // 滤镜状态
  const [filterType, setFilterType] = useState<FilterType>('none');
  const [filterParams, setFilterParams] = useState<FilterParams>(DEFAULT_FILTER_PARAMS);

  // 变换状态
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);

  // 图片原始尺寸
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });

  // 缩放状态
  const [zoom, setZoom] = useState(1);
  const MIN_ZOOM = 0.1;
  const MAX_ZOOM = 5;
  const ZOOM_STEP = 0.1;

  // 拖拽平移状态
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // 保存选项弹窗
  const [showSaveOptions, setShowSaveOptions] = useState(false);
  const [pendingImageUrl, setPendingImageUrl] = useState<string | null>(null);

  // refs
  const imageRef = useRef<HTMLImageElement | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // 加载图片
  useEffect(() => {
    if (!visible || !imageUrl) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageRef.current = img;
      setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      MessagePlugin.error('图片加载失败');
    };
    img.src = imageUrl;

    return () => {
      imageRef.current = null;
    };
  }, [visible, imageUrl]);

  // 获取当前滤镜 CSS
  const getFilterCSS = useCallback(() => {
    if (filterType !== 'none') {
      const preset = FILTER_PRESETS.find((p) => p.type === filterType);
      if (preset) return preset.filter;
    }

    // 使用自定义参数
    const parts: string[] = [];
    if (filterParams.brightness !== 100) {
      parts.push(`brightness(${filterParams.brightness}%)`);
    }
    if (filterParams.contrast !== 100) {
      parts.push(`contrast(${filterParams.contrast}%)`);
    }
    if (filterParams.saturate !== 100) {
      parts.push(`saturate(${filterParams.saturate}%)`);
    }
    if (filterParams.blur > 0) {
      parts.push(`blur(${filterParams.blur}px)`);
    }
    if (filterParams.grayscale > 0) {
      parts.push(`grayscale(${filterParams.grayscale}%)`);
    }
    if (filterParams.sepia > 0) {
      parts.push(`sepia(${filterParams.sepia}%)`);
    }
    if (filterParams.hueRotate !== 0) {
      parts.push(`hue-rotate(${filterParams.hueRotate}deg)`);
    }
    if (filterParams.invert > 0) {
      parts.push(`invert(${filterParams.invert}%)`);
    }

    return parts.length > 0 ? parts.join(' ') : 'none';
  }, [filterType, filterParams]);

  // 获取变换 CSS
  const getTransformCSS = useCallback(() => {
    const transforms: string[] = [];
    if (rotation !== 0) {
      transforms.push(`rotate(${rotation}deg)`);
    }
    if (flipH) {
      transforms.push('scaleX(-1)');
    }
    if (flipV) {
      transforms.push('scaleY(-1)');
    }
    return transforms.length > 0 ? transforms.join(' ') : 'none';
  }, [rotation, flipH, flipV]);

  // 重置所有编辑
  const handleReset = useCallback(() => {
    setCropArea(null);
    setAspectRatio(null);
    setFilterType('none');
    setFilterParams(DEFAULT_FILTER_PARAMS);
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
  }, []);

  // 应用编辑并保存
  const handleSave = useCallback(async () => {
    const img = imageRef.current;
    if (!img) {
      MessagePlugin.error('图片未加载');
      return;
    }

    const loadingInstance = MessagePlugin.loading('正在处理图片...', 0);

    try {
      // 创建临时 canvas
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('无法创建 Canvas 上下文');
      }

      // 计算最终尺寸
      let finalWidth = img.naturalWidth;
      let finalHeight = img.naturalHeight;
      let sourceX = 0;
      let sourceY = 0;
      let sourceWidth = img.naturalWidth;
      let sourceHeight = img.naturalHeight;

      // 应用裁剪
      if (cropArea) {
        sourceX = cropArea.x;
        sourceY = cropArea.y;
        sourceWidth = cropArea.width;
        sourceHeight = cropArea.height;
        finalWidth = cropArea.width;
        finalHeight = cropArea.height;
      }

      // 处理旋转（90度的倍数会交换宽高）
      const normalizedRotation = ((rotation % 360) + 360) % 360;
      if (normalizedRotation === 90 || normalizedRotation === 270) {
        [finalWidth, finalHeight] = [finalHeight, finalWidth];
      }

      canvas.width = finalWidth;
      canvas.height = finalHeight;

      // 应用变换
      ctx.save();
      ctx.translate(finalWidth / 2, finalHeight / 2);

      if (rotation !== 0) {
        ctx.rotate((rotation * Math.PI) / 180);
      }
      if (flipH) {
        ctx.scale(-1, 1);
      }
      if (flipV) {
        ctx.scale(1, -1);
      }

      // 计算绘制位置（考虑旋转后的尺寸交换）
      let drawWidth = sourceWidth;
      let drawHeight = sourceHeight;
      if (normalizedRotation === 90 || normalizedRotation === 270) {
        [drawWidth, drawHeight] = [drawHeight, drawWidth];
      }

      // 应用滤镜
      const filterCSS = getFilterCSS();
      if (filterCSS !== 'none') {
        ctx.filter = filterCSS;
      }

      // 绘制图片
      ctx.drawImage(
        img,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        -drawWidth / 2,
        -drawHeight / 2,
        drawWidth,
        drawHeight
      );

      ctx.restore();

      // 转换为 data URL
      const editedImageUrl = canvas.toDataURL('image/png');

      MessagePlugin.close(loadingInstance);

      // 显示保存选项
      setPendingImageUrl(editedImageUrl);
      setShowSaveOptions(true);
    } catch (error) {
      MessagePlugin.close(loadingInstance);
      MessagePlugin.error(
        error instanceof Error ? error.message : '图片处理失败'
      );
    }
  }, [cropArea, rotation, flipH, flipV, getFilterCSS]);

  // 下载图片
  const downloadImage = useCallback((dataUrl: string) => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `edited-image-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  // 处理保存操作
  const handleSaveAction = useCallback(
    (action: SaveAction) => {
      if (!pendingImageUrl) return;

      switch (action) {
        case 'overwrite':
          if (onOverwrite) {
            onOverwrite(pendingImageUrl);
            MessagePlugin.success('已覆盖原图');
          } else if (onSave) {
            // 如果没有 onOverwrite 但有 onSave，使用 onSave
            onSave(pendingImageUrl);
            MessagePlugin.success('已保存');
          }
          break;
        case 'insert':
          if (onInsert) {
            onInsert(pendingImageUrl);
            MessagePlugin.success('已插入到画布');
          }
          break;
        case 'download':
          downloadImage(pendingImageUrl);
          MessagePlugin.success('已开始下载');
          break;
      }

      setShowSaveOptions(false);
      setPendingImageUrl(null);
      onClose();
    },
    [pendingImageUrl, onOverwrite, onInsert, onSave, onClose, downloadImage]
  );

  // 取消保存选项
  const handleCancelSaveOptions = useCallback(() => {
    setShowSaveOptions(false);
    setPendingImageUrl(null);
  }, []);

  // 处理裁剪比例变化
  const handleAspectRatioChange = useCallback((ratio: number | null) => {
    setAspectRatio(ratio);
    // 重置裁剪区域以适应新比例
    setCropArea(null);
  }, []);

  // 处理滤镜预设选择
  const handleFilterPresetSelect = useCallback((type: FilterType) => {
    setFilterType(type);
    // 重置自定义参数
    setFilterParams(DEFAULT_FILTER_PARAMS);
  }, []);

  // 处理滤镜参数变化
  const handleFilterParamChange = useCallback(
    (param: keyof FilterParams, value: number) => {
      setFilterType('none'); // 切换到自定义模式
      setFilterParams((prev) => ({ ...prev, [param]: value }));
    },
    []
  );

  // 处理旋转
  const handleRotate = useCallback((delta: number) => {
    setRotation((prev) => prev + delta);
  }, []);

  // 处理翻转
  const handleFlipH = useCallback(() => {
    setFlipH((prev) => !prev);
  }, []);

  const handleFlipV = useCallback(() => {
    setFlipV((prev) => !prev);
  }, []);

  // 缩放处理
  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + ZOOM_STEP, MAX_ZOOM));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - ZOOM_STEP, MIN_ZOOM));
  }, []);

  const handleZoomReset = useCallback(() => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  // 滚轮缩放处理
  const handleWheel = useCallback((e: React.WheelEvent) => {
    // 阻止默认滚动行为
    e.preventDefault();
    
    // 根据 deltaY 计算缩放增量
    // 触控板的 deltaY 值较小（通常 1-10），鼠标滚轮较大（通常 100-120）
    // 使用灵敏度系数让缩放更平滑可控
    const sensitivity = 0.002; // 缩放灵敏度
    const delta = -e.deltaY * sensitivity;
    
    setZoom((prev) => {
      const newZoom = prev + delta;
      return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
    });
  }, []);

  // 拖拽平移处理
  const handlePanStart = useCallback((e: React.MouseEvent) => {
    // 只有按住空格键或中键时才启动拖拽，或者直接拖拽预览区域背景
    // 这里使用左键直接拖拽（在非裁剪区域）
    if (e.button !== 0) return; // 只响应左键
    
    // 检查是否点击在裁剪区域内（裁剪区域有自己的拖拽逻辑）
    const target = e.target as HTMLElement;
    if (target.closest('.crop-canvas__crop-area') || target.closest('.crop-canvas__handle')) {
      return;
    }
    
    setIsPanning(true);
    setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  }, [panOffset]);

  const handlePanMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    
    setPanOffset({
      x: e.clientX - panStart.x,
      y: e.clientY - panStart.y,
    });
  }, [isPanning, panStart]);

  const handlePanEnd = useCallback(() => {
    setIsPanning(false);
  }, []);

  // 全局鼠标事件监听（处理鼠标移出预览区域的情况）
  useEffect(() => {
    if (!isPanning) return;

    const handleMouseMove = (e: MouseEvent) => {
      setPanOffset({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    };

    const handleMouseUp = () => {
      setIsPanning(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isPanning, panStart]);

  // 重置缩放和平移当切换模式或重置编辑时
  useEffect(() => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  }, [mode]);

  if (!visible) {
    return null;
  }

  const filterCSS = getFilterCSS();
  const transformCSS = getTransformCSS();

  const content = (
    <div className="image-editor" style={{ zIndex: Z_INDEX.DIALOG_AI_IMAGE }}>
      <div className="image-editor__backdrop" onClick={onClose} />

      <div className="image-editor__container">
        {/* 头部工具栏 */}
        <div className="image-editor__header">
          <div className="image-editor__title">编辑图片</div>
          <div className="image-editor__actions">
            <Tooltip content="重置" theme="light" placement="bottom">
              <button
                type="button"
                className="image-editor__btn"
                onClick={handleReset}
              >
                <RotateCcw size={18} />
              </button>
            </Tooltip>
            <Tooltip content="取消" theme="light" placement="bottom">
              <button
                type="button"
                className="image-editor__btn"
                onClick={onClose}
              >
                <X size={18} />
              </button>
            </Tooltip>
            <Tooltip content="保存" theme="light" placement="bottom">
              <button
                type="button"
                className="image-editor__btn image-editor__btn--primary"
                onClick={handleSave}
              >
                <Check size={18} />
              </button>
            </Tooltip>
          </div>
        </div>

        {/* 主内容区 */}
        <div className="image-editor__main">
          {/* 左侧工具面板 */}
          <div className="image-editor__sidebar">
            {/* 模式切换 */}
            <div className="image-editor__mode-tabs">
              <button
                type="button"
                className={`image-editor__mode-tab ${mode === 'crop' ? 'active' : ''}`}
                onClick={() => setMode('crop')}
              >
                <Crop size={16} />
                <span>裁剪</span>
              </button>
              <button
                type="button"
                className={`image-editor__mode-tab ${mode === 'filter' ? 'active' : ''}`}
                onClick={() => setMode('filter')}
              >
                <Sliders size={16} />
                <span>滤镜</span>
              </button>
            </div>

            {/* 工具面板内容 */}
            <div className="image-editor__panel">
              {mode === 'crop' ? (
                <CropPanel
                  aspectRatio={aspectRatio}
                  presets={ASPECT_RATIO_PRESETS}
                  onAspectRatioChange={handleAspectRatioChange}
                  rotation={rotation}
                  flipH={flipH}
                  flipV={flipV}
                  onRotate={handleRotate}
                  onFlipH={handleFlipH}
                  onFlipV={handleFlipV}
                />
              ) : (
                <FilterPanel
                  filterType={filterType}
                  filterParams={filterParams}
                  presets={FILTER_PRESETS}
                  imageUrl={imageUrl}
                  onPresetSelect={handleFilterPresetSelect}
                  onParamChange={handleFilterParamChange}
                />
              )}
            </div>
          </div>

          {/* 预览区域 */}
          <div 
            className="image-editor__preview"
            ref={previewRef}
            onWheel={handleWheel}
            onMouseDown={handlePanStart}
            onMouseMove={handlePanMove}
            onMouseUp={handlePanEnd}
            onMouseLeave={handlePanEnd}
            style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
          >
            <div 
              className="image-editor__canvas-wrapper"
              style={{
                transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
              }}
            >
              {mode === 'crop' ? (
                <CropCanvas
                  imageUrl={imageUrl}
                  imageSize={imageSize}
                  cropArea={cropArea}
                  aspectRatio={aspectRatio}
                  rotation={rotation}
                  flipH={flipH}
                  flipV={flipV}
                  zoom={zoom}
                  onCropChange={setCropArea}
                />
              ) : (
                <div
                  className="image-editor__filter-preview"
                  style={{
                    filter: filterCSS,
                    transform: `${transformCSS} scale(${zoom})`.trim(),
                  }}
                >
                  <img src={imageUrl} alt="Preview" draggable={false} />
                </div>
              )}
            </div>
            
            {/* 缩放控制栏 */}
            <div className="image-editor__zoom-controls">
              <Tooltip content="缩小" theme="light" placement="top">
                <button
                  type="button"
                  className="image-editor__zoom-btn"
                  onClick={handleZoomOut}
                  disabled={zoom <= MIN_ZOOM}
                >
                  <ZoomOut size={16} />
                </button>
              </Tooltip>
              <span className="image-editor__zoom-value">{Math.round(zoom * 100)}%</span>
              <Tooltip content="放大" theme="light" placement="top">
                <button
                  type="button"
                  className="image-editor__zoom-btn"
                  onClick={handleZoomIn}
                  disabled={zoom >= MAX_ZOOM}
                >
                  <ZoomIn size={16} />
                </button>
              </Tooltip>
              <Tooltip content="重置缩放" theme="light" placement="top">
                <button
                  type="button"
                  className="image-editor__zoom-btn"
                  onClick={handleZoomReset}
                >
                  <Maximize2 size={16} />
                </button>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>

      {/* 保存选项弹窗 */}
      {showSaveOptions && (
        <div className="image-editor__save-options">
          <div
            className="image-editor__save-options-backdrop"
            onClick={handleCancelSaveOptions}
          />
          <div className="image-editor__save-options-panel">
            <div className="image-editor__save-options-title">保存方式</div>
            <div className="image-editor__save-options-list">
              {/* 仅当有 onSave 且没有 onOverwrite/onInsert 时显示保存选项 */}
              {onSave && !onOverwrite && !onInsert && (
                <button
                  type="button"
                  className="image-editor__save-option"
                  onClick={() => handleSaveAction('overwrite')}
                >
                  <Check size={20} />
                  <div className="image-editor__save-option-content">
                    <span className="image-editor__save-option-label">
                      保存更改
                    </span>
                    <span className="image-editor__save-option-desc">
                      应用编辑并保存
                    </span>
                  </div>
                </button>
              )}
              {showOverwrite && onOverwrite && (
                <button
                  type="button"
                  className="image-editor__save-option"
                  onClick={() => handleSaveAction('overwrite')}
                >
                  <Replace size={20} />
                  <div className="image-editor__save-option-content">
                    <span className="image-editor__save-option-label">
                      覆盖原图
                    </span>
                    <span className="image-editor__save-option-desc">
                      替换画布上的原始图片
                    </span>
                  </div>
                </button>
              )}
              {onInsert && (
                <button
                  type="button"
                  className="image-editor__save-option"
                  onClick={() => handleSaveAction('insert')}
                >
                  <ImagePlus size={20} />
                  <div className="image-editor__save-option-content">
                    <span className="image-editor__save-option-label">
                      插入画布
                    </span>
                    <span className="image-editor__save-option-desc">
                      作为新图片添加到画布
                    </span>
                  </div>
                </button>
              )}
              <button
                type="button"
                className="image-editor__save-option"
                onClick={() => handleSaveAction('download')}
              >
                <Download size={20} />
                <div className="image-editor__save-option-content">
                  <span className="image-editor__save-option-label">
                    下载到本地
                  </span>
                  <span className="image-editor__save-option-desc">
                    保存为 PNG 文件
                  </span>
                </div>
              </button>
            </div>
            <button
              type="button"
              className="image-editor__save-options-cancel"
              onClick={handleCancelSaveOptions}
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(content, document.body);
};

/**
 * 裁剪画布组件
 */
interface CropCanvasProps {
  imageUrl: string;
  imageSize: { width: number; height: number };
  cropArea: CropArea | null;
  aspectRatio: number | null;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  zoom: number;
  onCropChange: (area: CropArea | null) => void;
}

const CropCanvas: React.FC<CropCanvasProps> = ({
  imageUrl,
  imageSize,
  cropArea,
  aspectRatio,
  rotation,
  flipH,
  flipV,
  zoom,
  onCropChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragType, setDragType] = useState<'move' | 'resize' | null>(null);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [initialCrop, setInitialCrop] = useState<CropArea | null>(null);

  // 计算显示比例
  const [displayScale, setDisplayScale] = useState(1);

  useEffect(() => {
    if (!containerRef.current || imageSize.width === 0) return;

    const container = containerRef.current;
    const containerWidth = container.clientWidth - 40;
    const containerHeight = container.clientHeight - 40;

    const scaleX = containerWidth / imageSize.width;
    const scaleY = containerHeight / imageSize.height;
    setDisplayScale(Math.min(scaleX, scaleY, 1));
  }, [imageSize]);

  // 初始化裁剪区域
  useEffect(() => {
    if (!cropArea && imageSize.width > 0) {
      let newCrop: CropArea;
      if (aspectRatio) {
        // 根据比例计算初始裁剪区域
        const imgRatio = imageSize.width / imageSize.height;
        if (imgRatio > aspectRatio) {
          const cropHeight = imageSize.height;
          const cropWidth = cropHeight * aspectRatio;
          newCrop = {
            x: (imageSize.width - cropWidth) / 2,
            y: 0,
            width: cropWidth,
            height: cropHeight,
          };
        } else {
          const cropWidth = imageSize.width;
          const cropHeight = cropWidth / aspectRatio;
          newCrop = {
            x: 0,
            y: (imageSize.height - cropHeight) / 2,
            width: cropWidth,
            height: cropHeight,
          };
        }
      } else {
        // 默认使用整张图片
        newCrop = {
          x: 0,
          y: 0,
          width: imageSize.width,
          height: imageSize.height,
        };
      }
      onCropChange(newCrop);
    }
  }, [aspectRatio, imageSize, cropArea, onCropChange]);

  // 处理鼠标按下
  const handleMouseDown = useCallback(
    (e: React.MouseEvent, type: 'move' | 'resize', handle?: string) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
      setDragType(type);
      setResizeHandle(handle || null);
      setDragStart({ x: e.clientX, y: e.clientY });
      setInitialCrop(cropArea);
    },
    [cropArea]
  );

  // 处理鼠标移动
  useEffect(() => {
    if (!isDragging || !initialCrop) return;

    const handleMouseMove = (e: MouseEvent) => {
      // 计算基础 delta
      let deltaX = (e.clientX - dragStart.x) / displayScale / zoom;
      let deltaY = (e.clientY - dragStart.y) / displayScale / zoom;
      
      // 翻转后需要反转 delta 方向
      // 因为视觉上鼠标移动方向和实际坐标变化方向相反
      if (flipH) {
        deltaX = -deltaX;
      }
      if (flipV) {
        deltaY = -deltaY;
      }

      let newCrop = { ...initialCrop };

      if (dragType === 'move') {
        newCrop.x = Math.max(
          0,
          Math.min(imageSize.width - initialCrop.width, initialCrop.x + deltaX)
        );
        newCrop.y = Math.max(
          0,
          Math.min(imageSize.height - initialCrop.height, initialCrop.y + deltaY)
        );
      } else if (dragType === 'resize' && resizeHandle) {
        // 处理调整大小
        const minSize = 50;
        switch (resizeHandle) {
          case 'nw':
            newCrop.x = Math.max(0, initialCrop.x + deltaX);
            newCrop.y = Math.max(0, initialCrop.y + deltaY);
            newCrop.width = Math.max(minSize, initialCrop.width - deltaX);
            newCrop.height = Math.max(minSize, initialCrop.height - deltaY);
            break;
          case 'ne':
            newCrop.y = Math.max(0, initialCrop.y + deltaY);
            newCrop.width = Math.max(minSize, initialCrop.width + deltaX);
            newCrop.height = Math.max(minSize, initialCrop.height - deltaY);
            break;
          case 'sw':
            newCrop.x = Math.max(0, initialCrop.x + deltaX);
            newCrop.width = Math.max(minSize, initialCrop.width - deltaX);
            newCrop.height = Math.max(minSize, initialCrop.height + deltaY);
            break;
          case 'se':
            newCrop.width = Math.max(minSize, initialCrop.width + deltaX);
            newCrop.height = Math.max(minSize, initialCrop.height + deltaY);
            break;
          case 'n':
            newCrop.y = Math.max(0, initialCrop.y + deltaY);
            newCrop.height = Math.max(minSize, initialCrop.height - deltaY);
            break;
          case 's':
            newCrop.height = Math.max(minSize, initialCrop.height + deltaY);
            break;
          case 'w':
            newCrop.x = Math.max(0, initialCrop.x + deltaX);
            newCrop.width = Math.max(minSize, initialCrop.width - deltaX);
            break;
          case 'e':
            newCrop.width = Math.max(minSize, initialCrop.width + deltaX);
            break;
        }

        // 如果有固定比例，调整高度以匹配
        if (aspectRatio) {
          if (['e', 'w', 'ne', 'nw', 'se', 'sw'].includes(resizeHandle)) {
            newCrop.height = newCrop.width / aspectRatio;
          } else if (['n', 's'].includes(resizeHandle)) {
            newCrop.width = newCrop.height * aspectRatio;
          }
        }

        // 限制在图片范围内
        newCrop.width = Math.min(newCrop.width, imageSize.width - newCrop.x);
        newCrop.height = Math.min(newCrop.height, imageSize.height - newCrop.y);
      }

      onCropChange(newCrop);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setDragType(null);
      setResizeHandle(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    isDragging,
    dragType,
    resizeHandle,
    dragStart,
    initialCrop,
    displayScale,
    zoom,
    flipH,
    flipV,
    imageSize,
    aspectRatio,
    onCropChange,
  ]);

  // 应用缩放后的显示尺寸
  const displayWidth = imageSize.width * displayScale * zoom;
  const displayHeight = imageSize.height * displayScale * zoom;

  const transformStyle = {
    transform: `rotate(${rotation}deg) ${flipH ? 'scaleX(-1)' : ''} ${flipV ? 'scaleY(-1)' : ''}`.trim(),
  };

  // 根据翻转状态计算正确的 cursor 样式
  // 翻转后控制点的视觉位置改变，cursor 方向需要相应调整
  const getCursorForHandle = (handle: string): string => {
    // 定义 cursor 映射
    const cursorMap: Record<string, string> = {
      nw: 'nw-resize',
      ne: 'ne-resize',
      sw: 'sw-resize',
      se: 'se-resize',
      n: 'n-resize',
      s: 's-resize',
      w: 'w-resize',
      e: 'e-resize',
    };
    
    let adjustedHandle = handle;
    
    // 水平翻转：左右互换
    if (flipH) {
      if (adjustedHandle.includes('w')) {
        adjustedHandle = adjustedHandle.replace('w', 'e');
      } else if (adjustedHandle.includes('e')) {
        adjustedHandle = adjustedHandle.replace('e', 'w');
      }
    }
    
    // 垂直翻转：上下互换
    if (flipV) {
      if (adjustedHandle.includes('n')) {
        adjustedHandle = adjustedHandle.replace('n', 's');
      } else if (adjustedHandle.includes('s')) {
        adjustedHandle = adjustedHandle.replace('s', 'n');
      }
    }
    
    return cursorMap[adjustedHandle] || 'pointer';
  };

  return (
    <div ref={containerRef} className="crop-canvas">
      <div
        className="crop-canvas__image-container"
        style={{
          width: displayWidth,
          height: displayHeight,
          ...transformStyle,
        }}
      >
        <img src={imageUrl} alt="Crop" draggable={false} />

        {/* 裁剪遮罩 */}
        {cropArea && (
          <>
            <div className="crop-canvas__overlay" />
            <div
              className="crop-canvas__crop-area"
              style={{
                left: cropArea.x * displayScale * zoom,
                top: cropArea.y * displayScale * zoom,
                width: cropArea.width * displayScale * zoom,
                height: cropArea.height * displayScale * zoom,
              }}
              onMouseDown={(e) => handleMouseDown(e, 'move')}
            >
              {/* 裁剪框内的图片 */}
              <div
                className="crop-canvas__crop-image"
                style={{
                  backgroundImage: `url(${imageUrl})`,
                  backgroundPosition: `-${cropArea.x * displayScale * zoom}px -${cropArea.y * displayScale * zoom}px`,
                  backgroundSize: `${displayWidth}px ${displayHeight}px`,
                }}
              />

              {/* 网格线 */}
              <div className="crop-canvas__grid">
                <div className="crop-canvas__grid-line crop-canvas__grid-line--h1" />
                <div className="crop-canvas__grid-line crop-canvas__grid-line--h2" />
                <div className="crop-canvas__grid-line crop-canvas__grid-line--v1" />
                <div className="crop-canvas__grid-line crop-canvas__grid-line--v2" />
              </div>

              {/* 调整手柄 */}
              <div
                className="crop-canvas__handle crop-canvas__handle--nw"
                style={{ cursor: getCursorForHandle('nw') }}
                onMouseDown={(e) => handleMouseDown(e, 'resize', 'nw')}
              />
              <div
                className="crop-canvas__handle crop-canvas__handle--ne"
                style={{ cursor: getCursorForHandle('ne') }}
                onMouseDown={(e) => handleMouseDown(e, 'resize', 'ne')}
              />
              <div
                className="crop-canvas__handle crop-canvas__handle--sw"
                style={{ cursor: getCursorForHandle('sw') }}
                onMouseDown={(e) => handleMouseDown(e, 'resize', 'sw')}
              />
              <div
                className="crop-canvas__handle crop-canvas__handle--se"
                style={{ cursor: getCursorForHandle('se') }}
                onMouseDown={(e) => handleMouseDown(e, 'resize', 'se')}
              />
              <div
                className="crop-canvas__handle crop-canvas__handle--n"
                style={{ cursor: getCursorForHandle('n') }}
                onMouseDown={(e) => handleMouseDown(e, 'resize', 'n')}
              />
              <div
                className="crop-canvas__handle crop-canvas__handle--s"
                style={{ cursor: getCursorForHandle('s') }}
                onMouseDown={(e) => handleMouseDown(e, 'resize', 's')}
              />
              <div
                className="crop-canvas__handle crop-canvas__handle--w"
                style={{ cursor: getCursorForHandle('w') }}
                onMouseDown={(e) => handleMouseDown(e, 'resize', 'w')}
              />
              <div
                className="crop-canvas__handle crop-canvas__handle--e"
                style={{ cursor: getCursorForHandle('e') }}
                onMouseDown={(e) => handleMouseDown(e, 'resize', 'e')}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ImageEditor;
