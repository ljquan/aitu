/**
 * AddFrameDialog Component
 *
 * 添加 Frame 弹窗：预设尺寸选择 + 自定义宽高输入
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Dialog, Button, InputNumber } from 'tdesign-react';
import { AddIcon } from 'tdesign-icons-react';
import { PlaitBoard, RectangleClient, Point, addSelectedElement, clearSelectedElement, BoardTransforms } from '@plait/core';
import { PRESET_SIZES, PresetSize } from '../../constants/frame-presets';
import { FrameTransforms } from '../../plugins/with-frame';
import { PlaitFrame, isFrameElement } from '../../types/frame.types';

interface AddFrameDialogProps {
  visible: boolean;
  board: PlaitBoard;
  onClose: () => void;
  onFrameAdded?: (frame: PlaitFrame) => void;
}

const FRAME_GAP = 60;

/**
 * 计算新 Frame 的插入位置
 * 横屏（宽>高）放在最右侧 Frame 的右边，竖屏放在最下方 Frame 的下面
 */
function calcNewFramePosition(
  board: PlaitBoard,
  width: number,
  height: number
): Point {
  const existingFrames: RectangleClient[] = [];
  for (const el of board.children) {
    if (isFrameElement(el)) {
      existingFrames.push(RectangleClient.getRectangleByPoints(el.points));
    }
  }

  if (existingFrames.length === 0) {
    const container = PlaitBoard.getBoardContainer(board);
    const vw = container.clientWidth;
    const vh = container.clientHeight;
    const zoom = board.viewport?.zoom ?? 1;
    const orig = board.viewport?.origination;
    const ox = orig ? orig[0] : 0;
    const oy = orig ? orig[1] : 0;
    const cx = ox + vw / 2 / zoom;
    const cy = oy + vh / 2 / zoom;
    return [cx - width / 2, cy - height / 2];
  }

  const isLandscape = width >= height;

  if (isLandscape) {
    let maxRight = -Infinity;
    let refY = 0;
    for (const r of existingFrames) {
      const right = r.x + r.width;
      if (right > maxRight) {
        maxRight = right;
        refY = r.y;
      }
    }
    return [maxRight + FRAME_GAP, refY];
  } else {
    let maxBottom = -Infinity;
    let refX = 0;
    for (const r of existingFrames) {
      const bottom = r.y + r.height;
      if (bottom > maxBottom) {
        maxBottom = bottom;
        refX = r.x;
      }
    }
    return [refX, maxBottom + FRAME_GAP];
  }
}

export const AddFrameDialog: React.FC<AddFrameDialogProps> = ({
  visible,
  board,
  onClose,
  onFrameAdded,
}) => {
  const [selectedPreset, setSelectedPreset] = useState<PresetSize | null>(null);
  const [customWidth, setCustomWidth] = useState<number>(1920);
  const [customHeight, setCustomHeight] = useState<number>(1080);

  const finalWidth = selectedPreset ? selectedPreset.width : customWidth;
  const finalHeight = selectedPreset ? selectedPreset.height : customHeight;

  const addFrame = useCallback(
    (w: number, h: number) => {
      if (!board) return;
      if (w <= 0 || h <= 0) return;

      const topLeft = calcNewFramePosition(board, w, h);
      const points: [Point, Point] = [topLeft, [topLeft[0] + w, topLeft[1] + h]];
      const frame = FrameTransforms.insertFrame(board, points);

      // 选中并聚焦
      clearSelectedElement(board);
      const el = board.children.find((c) => c.id === frame.id);
      if (el) addSelectedElement(board, el);

      const container = PlaitBoard.getBoardContainer(board);
      const vw = container.clientWidth;
      const vh = container.clientHeight;
      const padding = 80;
      const scaleX = vw / (w + padding * 2);
      const scaleY = vh / (h + padding * 2);
      const zoom = Math.min(scaleX, scaleY, 2);
      const cx = topLeft[0] + w / 2;
      const cy = topLeft[1] + h / 2;
      const origination: [number, number] = [
        cx - vw / 2 / zoom,
        cy - vh / 2 / zoom,
      ];
      BoardTransforms.updateViewport(board, origination, zoom);

      onFrameAdded?.(frame);
      onClose();
    },
    [board, onFrameAdded, onClose]
  );

  const handlePresetClick = useCallback(
    (preset: PresetSize) => {
      addFrame(preset.width, preset.height);
    },
    [addFrame]
  );

  const handleCustomAdd = useCallback(() => {
    addFrame(customWidth, customHeight);
  }, [addFrame, customWidth, customHeight]);

  const handleCustomChange = useCallback(() => {
    setSelectedPreset(null);
  }, []);

  const presetKey = useMemo(() => {
    if (!selectedPreset) return '';
    return `${selectedPreset.width}x${selectedPreset.height}`;
  }, [selectedPreset]);

  return (
    <Dialog
      header="添加 Frame"
      visible={visible}
      onClose={onClose}
      footer={null}
      width={480}
      destroyOnClose
    >
      <div className="add-frame-dialog">
        <div className="add-frame-dialog__presets">
          {PRESET_SIZES.map((group) => (
            <div key={group.category} className="add-frame-dialog__category">
              <div className="add-frame-dialog__category-label">
                {group.category}
              </div>
              <div className="add-frame-dialog__category-items">
                {group.items.map((preset) => {
                  const key = `${preset.width}x${preset.height}`;
                  const isActive = presetKey === key;
                  return (
                    <button
                      key={key}
                      className={`add-frame-dialog__preset-item${isActive ? ' add-frame-dialog__preset-item--active' : ''}`}
                      onClick={() => handlePresetClick(preset)}
                    >
                      <span className="add-frame-dialog__preset-label">
                        {preset.label}
                      </span>
                      <span className="add-frame-dialog__preset-size">
                        {preset.width} × {preset.height}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="add-frame-dialog__footer">
          <div className="add-frame-dialog__custom-section">
            <span className="add-frame-dialog__custom-label">自定义</span>
            <div className="add-frame-dialog__input-group">
              <span className="add-frame-dialog__input-label">W</span>
              <InputNumber
                value={customWidth}
                onChange={(v) => {
                  setCustomWidth(v as number);
                  handleCustomChange();
                }}
                onEnter={handleCustomAdd}
                min={10}
                max={10000}
                theme="normal"
                size="small"
                style={{ width: 68 }}
              />
            </div>
            <span className="add-frame-dialog__input-sep">×</span>
            <div className="add-frame-dialog__input-group">
              <span className="add-frame-dialog__input-label">H</span>
              <InputNumber
                value={customHeight}
                onChange={(v) => {
                  setCustomHeight(v as number);
                  handleCustomChange();
                }}
                onEnter={handleCustomAdd}
                min={10}
                max={10000}
                theme="normal"
                size="small"
                style={{ width: 68 }}
              />
            </div>
            <Button 
              theme="primary" 
              variant="text" 
              shape="square" 
              size="small"
              icon={<AddIcon />} 
              onClick={handleCustomAdd}
              title="添加自定义尺寸 Frame"
            />
          </div>
          
          <div className="add-frame-dialog__hint">
            <kbd>F</kbd> 直接绘制
          </div>
        </div>
      </div>
    </Dialog>
  );
};
