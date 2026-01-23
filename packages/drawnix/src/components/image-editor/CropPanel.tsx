/**
 * 裁剪面板组件
 */

import React from 'react';
import { RotateCcw, RotateCw, FlipHorizontal, FlipVertical } from 'lucide-react';
import { Tooltip } from 'tdesign-react';
import { AspectRatioPreset } from './types';

interface CropPanelProps {
  aspectRatio: number | null;
  presets: AspectRatioPreset[];
  onAspectRatioChange: (ratio: number | null) => void;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  onRotate: (delta: number) => void;
  onFlipH: () => void;
  onFlipV: () => void;
}

export const CropPanel: React.FC<CropPanelProps> = ({
  aspectRatio,
  presets,
  onAspectRatioChange,
  rotation,
  flipH,
  flipV,
  onRotate,
  onFlipH,
  onFlipV,
}) => {
  return (
    <div className="crop-panel">
      {/* 裁剪比例 */}
      <div className="crop-panel__section">
        <div className="crop-panel__section-title">裁剪比例</div>
        <div className="crop-panel__ratio-grid">
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className={`crop-panel__ratio-btn ${
                aspectRatio === preset.value ? 'active' : ''
              }`}
              onClick={() => onAspectRatioChange(preset.value)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* 旋转和翻转 */}
      <div className="crop-panel__section">
        <div className="crop-panel__section-title">旋转和翻转</div>
        <div className="crop-panel__transform-row">
          <Tooltip content="向左旋转 90°" theme="light" placement="top">
            <button
              type="button"
              className="crop-panel__transform-btn"
              onClick={() => onRotate(-90)}
            >
              <RotateCcw size={18} />
            </button>
          </Tooltip>
          <Tooltip content="向右旋转 90°" theme="light" placement="top">
            <button
              type="button"
              className="crop-panel__transform-btn"
              onClick={() => onRotate(90)}
            >
              <RotateCw size={18} />
            </button>
          </Tooltip>
          <Tooltip content="水平翻转" theme="light" placement="top">
            <button
              type="button"
              className={`crop-panel__transform-btn ${flipH ? 'active' : ''}`}
              onClick={onFlipH}
            >
              <FlipHorizontal size={18} />
            </button>
          </Tooltip>
          <Tooltip content="垂直翻转" theme="light" placement="top">
            <button
              type="button"
              className={`crop-panel__transform-btn ${flipV ? 'active' : ''}`}
              onClick={onFlipV}
            >
              <FlipVertical size={18} />
            </button>
          </Tooltip>
        </div>
        {rotation !== 0 && (
          <div className="crop-panel__rotation-info">
            当前旋转: {rotation}°
          </div>
        )}
      </div>

      {/* 使用提示 */}
      <div className="crop-panel__tips">
        <p>拖动裁剪框调整位置</p>
        <p>拖动边角调整大小</p>
      </div>
    </div>
  );
};

export default CropPanel;
