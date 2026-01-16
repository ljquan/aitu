/**
 * 钢笔设置工具栏
 * 在钢笔工具模式下显示，只显示锚点类型选择
 * 颜色、粗细、线形、圆角等属性在选中钢笔路径后通过 popup-toolbar 设置
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import classNames from 'classnames';
import { useBoard } from '@plait-board/react-board';
import { Island } from '../../island';
import { ToolButton } from '../../tool-button';
import Stack from '../../stack';
import { useDrawnix } from '../../../hooks/use-drawnix';
import {
  getPenSettings,
  setPenDefaultAnchorType,
} from '../../../plugins/pen/pen-settings';
import { PenShape, AnchorType } from '../../../plugins/pen/type';
import { useI18n, Translations } from '../../../i18n';
import { useViewportScale } from '../../../hooks/useViewportScale';
import {
  AnchorCornerIcon,
  AnchorSmoothIcon,
  AnchorSymmetricIcon,
} from '../../icons';
import './pen-settings-toolbar.scss';

// 锚点类型选项
interface AnchorTypeOption {
  icon: React.ReactNode;
  type: AnchorType;
  titleKey: string;
}

const ANCHOR_TYPES: AnchorTypeOption[] = [
  {
    icon: AnchorCornerIcon,
    type: 'corner',
    titleKey: 'toolbar.anchorCorner',
  },
  {
    icon: AnchorSmoothIcon,
    type: 'smooth',
    titleKey: 'toolbar.anchorSmooth',
  },
  {
    icon: AnchorSymmetricIcon,
    type: 'symmetric',
    titleKey: 'toolbar.anchorSymmetric',
  },
];

export const PenSettingsToolbar: React.FC = () => {
  const board = useBoard();
  const { appState } = useDrawnix();
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  
  // 使用 viewport scale hook 确保工具栏保持在视口内且大小不变
  useViewportScale(containerRef, {
    enablePositionTracking: true,
    enableScaleCompensation: true,
  });

  // 从 board 获取当前设置
  const settings = getPenSettings(board);
  const [anchorType, setAnchorType] = useState(settings.defaultAnchorType);

  // 检查是否是钢笔指针（需要同时检查 appState 和 board.pointer）
  // 因为完成钢笔绘制后会通过 BoardTransforms.updatePointerType 更新 board.pointer，
  // 但 appState.pointer 可能没有及时更新
  const isPenPointer = appState.pointer === PenShape.pen && board.pointer === PenShape.pen;

  // 当 board 变化时同步设置
  useEffect(() => {
    const newSettings = getPenSettings(board);
    setAnchorType(newSettings.defaultAnchorType);
  }, [board, appState.pointer, board.pointer]);

  // 处理锚点类型变化
  const handleAnchorTypeChange = useCallback((type: AnchorType) => {
    setAnchorType(type);
    setPenDefaultAnchorType(board, type);
  }, [board]);

  // 只在选择钢笔指针时显示
  if (!isPenPointer) {
    return null;
  }

  return (
    <div className="pen-settings-toolbar">
      <Island
        ref={containerRef}
        padding={1}
      >
        <Stack.Row gap={0} align="center">
          {/* 锚点类型选择 */}
          <div className="pen-anchor-type-picker">
            {ANCHOR_TYPES.map((option) => (
              <ToolButton
                key={option.type}
                className={classNames('pen-anchor-type-button', { active: anchorType === option.type })}
                type="button"
                visible={true}
                icon={option.icon}
                title={t(option.titleKey as keyof Translations)}
                aria-label={t(option.titleKey as keyof Translations)}
                onPointerUp={() => handleAnchorTypeChange(option.type)}
              />
            ))}
          </div>
        </Stack.Row>
      </Island>
    </div>
  );
};

export default PenSettingsToolbar;
