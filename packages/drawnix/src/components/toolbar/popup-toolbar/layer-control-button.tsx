/**
 * 图层控制按钮组件
 * Layer Control Button Component
 */

import React, { useState, useCallback, useMemo } from 'react';
import classNames from 'classnames';
import { ToolButton } from '../../tool-button';
import { Popover, PopoverContent, PopoverTrigger } from '../../popover/popover';
import { Island } from '../../island';
import { ATTACHED_ELEMENT_CLASS_NAME, PlaitBoard, getSelectedElements } from '@plait/core';
import { useI18n } from '../../../i18n';
import { LayerTransforms } from '../../../transforms/text-effects';
import { LayerIcon, BringToFrontIcon, BringForwardIcon, SendBackwardIcon, SendToBackIcon } from '../../icons';
import './layer-control-button.scss';

export interface PopupLayerControlButtonProps {
  board: PlaitBoard;
  title: string;
}

export const PopupLayerControlButton: React.FC<PopupLayerControlButtonProps> = ({
  board,
  title,
}) => {
  const { language } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const container = PlaitBoard.getBoardContainer(board);

  // 获取图层信息
  const layerInfo = useMemo(() => {
    const selectedElements = getSelectedElements(board);
    if (selectedElements.length === 0) return null;

    const element = selectedElements[0];
    return LayerTransforms.getLayerInfo(board, element.id);
  }, [board]);

  // 图层操作
  const handleBringToFront = useCallback(() => {
    LayerTransforms.bringToFront(board);
    setIsOpen(false);
  }, [board]);

  const handleBringForward = useCallback(() => {
    LayerTransforms.bringForward(board);
    setIsOpen(false);
  }, [board]);

  const handleSendBackward = useCallback(() => {
    LayerTransforms.sendBackward(board);
    setIsOpen(false);
  }, [board]);

  const handleSendToBack = useCallback(() => {
    LayerTransforms.sendToBack(board);
    setIsOpen(false);
  }, [board]);

  const canMoveUp = layerInfo?.canMoveUp ?? false;
  const canMoveDown = layerInfo?.canMoveDown ?? false;

  return (
    <Popover
      sideOffset={12}
      open={isOpen}
      onOpenChange={setIsOpen}
      placement="top"
    >
      <PopoverTrigger asChild>
        <ToolButton
          className={classNames('property-button', 'layer-control-button')}
          selected={isOpen}
          visible={true}
          icon={LayerIcon}
          type="button"
          title={title}
          aria-label={title}
          onPointerUp={() => setIsOpen(!isOpen)}
        />
      </PopoverTrigger>
      <PopoverContent container={container}>
        <Island padding={4} className={classNames(ATTACHED_ELEMENT_CLASS_NAME, 'layer-control-panel')}>
          <div className="layer-panel-header">
            <span className="panel-title">
              {language === 'zh' ? '图层顺序' : 'Layer Order'}
            </span>
            {layerInfo && (
              <span className="layer-info">
                {layerInfo.index + 1} / {layerInfo.total}
              </span>
            )}
          </div>
          
          <div className="layer-actions">
            <button
              className={classNames('layer-action-btn', { disabled: !canMoveUp })}
              onClick={handleBringToFront}
              disabled={!canMoveUp}
              title={language === 'zh' ? '置顶' : 'Bring to Front'}
            >
              {BringToFrontIcon}
              <span>{language === 'zh' ? '置顶' : 'Front'}</span>
            </button>
            
            <button
              className={classNames('layer-action-btn', { disabled: !canMoveUp })}
              onClick={handleBringForward}
              disabled={!canMoveUp}
              title={language === 'zh' ? '上移一层' : 'Bring Forward'}
            >
              {BringForwardIcon}
              <span>{language === 'zh' ? '上移' : 'Forward'}</span>
            </button>
            
            <button
              className={classNames('layer-action-btn', { disabled: !canMoveDown })}
              onClick={handleSendBackward}
              disabled={!canMoveDown}
              title={language === 'zh' ? '下移一层' : 'Send Backward'}
            >
              {SendBackwardIcon}
              <span>{language === 'zh' ? '下移' : 'Backward'}</span>
            </button>
            
            <button
              className={classNames('layer-action-btn', { disabled: !canMoveDown })}
              onClick={handleSendToBack}
              disabled={!canMoveDown}
              title={language === 'zh' ? '置底' : 'Send to Back'}
            >
              {SendToBackIcon}
              <span>{language === 'zh' ? '置底' : 'Back'}</span>
            </button>
          </div>

          {/* 图层可视化指示 */}
          {layerInfo && (
            <div className="layer-visual">
              <div className="layer-stack">
                {Array.from({ length: Math.min(layerInfo.total, 5) }).map((_, i) => {
                  const isCurrentLayer = i === Math.min(layerInfo.index, 4);
                  const layerIndex = layerInfo.total - 1 - i;
                  return (
                    <div
                      key={i}
                      className={classNames('layer-item', {
                        'layer-item--current': isCurrentLayer,
                        'layer-item--above': layerIndex > layerInfo.index,
                        'layer-item--below': layerIndex < layerInfo.index,
                      })}
                      style={{
                        transform: `translateY(${i * 4}px)`,
                        zIndex: 10 - i,
                      }}
                    />
                  );
                })}
              </div>
              <div className="layer-label">
                {language === 'zh' 
                  ? `第 ${layerInfo.index + 1} 层（共 ${layerInfo.total} 层）`
                  : `Layer ${layerInfo.index + 1} of ${layerInfo.total}`
                }
              </div>
            </div>
          )}
        </Island>
      </PopoverContent>
    </Popover>
  );
};

export default PopupLayerControlButton;
