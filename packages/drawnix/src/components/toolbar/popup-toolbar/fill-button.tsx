import React, { useState, useCallback, useMemo, lazy, Suspense } from 'react';
import { ToolButton } from '../../tool-button';
import classNames from 'classnames';
import { ATTACHED_ELEMENT_CLASS_NAME } from '@plait/core';
import { Island } from '../../island';
import {
  hexAlphaToOpacity,
  isFullyTransparent,
  removeHexAlpha,
} from '@aitu/utils';
import { BackgroundColorIcon } from '../../icons';
import { Popover, PopoverContent, PopoverTrigger } from '../../popover/popover';
import {
  setFillColor,
  setFillColorOpacity,
  setGradientFill,
  setImageFill,
  setFillType,
} from '../../../transforms/property';
import { FillPanel } from '../../fill-panel';
import type {
  FillConfig,
  FillType,
  GradientFillConfig,
  ImageFillConfig,
} from '../../../types/fill.types';
import { isSolidFill, isFillConfig } from '../../../types/fill.types';
import { AssetType, SelectionMode } from '../../../types/asset.types';
import type { Asset } from '../../../types/asset.types';
import { useI18n } from '../../../i18n';

// 懒加载 MediaLibraryModal
const MediaLibraryModal = lazy(() => import('../../media-library').then(module => ({ default: module.MediaLibraryModal })));

export type PopupFillButtonProps = {
  board: PlaitBoard;
  /** 当前填充值（支持旧的 string 格式和新的 FillConfig 格式） */
  currentColor: string | FillConfig | undefined;
  title: string;
  children?: React.ReactNode;
};

export const PopupFillButton: React.FC<PopupFillButtonProps> = ({
  board,
  currentColor,
  title,
  children,
}) => {
  const { language } = useI18n();
  const [isFillPropertyOpen, setIsFillPropertyOpen] = useState(false);
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);

  // 计算显示的颜色和透明度
  const { hexColor, opacity } = useMemo(() => {
    if (!currentColor) {
      return { hexColor: undefined, opacity: 100 };
    }

    // 纯色字符串
    if (isSolidFill(currentColor)) {
      const hex = removeHexAlpha(currentColor);
      const op = hexAlphaToOpacity(currentColor);
      return { hexColor: hex, opacity: op };
    }

    // FillConfig 对象
    if (isFillConfig(currentColor)) {
      switch (currentColor.type) {
        case 'solid':
          if (currentColor.solid) {
            const hex = removeHexAlpha(currentColor.solid.color);
            const op = hexAlphaToOpacity(currentColor.solid.color);
            return { hexColor: hex, opacity: op };
          }
          break;
        case 'gradient':
          // 渐变显示第一个色标的颜色
          if (currentColor.gradient?.stops[0]) {
            return {
              hexColor: currentColor.gradient.stops[0].color,
              opacity: 100,
            };
          }
          break;
        case 'image':
          // 图片填充显示特殊标识
          return { hexColor: '#888888', opacity: 100 };
      }
    }

    return { hexColor: undefined, opacity: 100 };
  }, [currentColor]);

  const icon =
    !hexColor || isFullyTransparent(opacity) ? BackgroundColorIcon : undefined;

  // 处理纯色变更
  const handleSolidChange = useCallback(
    (color: string) => {
      setFillColor(board, color);
    },
    [board]
  );

  // 处理透明度变更
  const handleOpacityChange = useCallback(
    (opacity: number) => {
      setFillColorOpacity(board, opacity);
    },
    [board]
  );

  // 处理渐变变更
  const handleGradientChange = useCallback(
    (config: GradientFillConfig) => {
      setGradientFill(board, config);
    },
    [board]
  );

  // 处理图片填充变更
  const handleImageChange = useCallback(
    (config: ImageFillConfig) => {
      setImageFill(board, config);
    },
    [board]
  );

  // 处理填充类型切换
  const handleFillTypeChange = useCallback(
    (type: FillType) => {
      setFillType(board, type);
    },
    [board]
  );

  // 关闭面板
  const handleClose = useCallback(() => {
    setIsFillPropertyOpen(false);
  }, []);

  // 打开素材库（在 Popover 外部渲染）
  const handleOpenMediaLibrary = useCallback(() => {
    setShowMediaLibrary(true);
  }, []);

  // 处理素材库选择图片
  const handleSelectFromLibrary = useCallback(
    (asset: Asset) => {
      // 设置图片填充
      setImageFill(board, {
        imageUrl: asset.url,
        mode: 'stretch',
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        rotation: 0,
      });
      setShowMediaLibrary(false);
    },
    [board]
  );

  return (
    <Popover
      sideOffset={12}
      crossAxisOffset={40}
      open={isFillPropertyOpen}
      onOpenChange={(open) => {
        // 如果素材库打开，不允许关闭填充面板
        if (!open && showMediaLibrary) {
          return;
        }
        setIsFillPropertyOpen(open);
      }}
      placement={'left'}
    >
      <PopoverTrigger asChild>
        <ToolButton
          className={classNames(`property-button`)}
          visible={true}
          icon={icon}
          type="button"
          title={title}
          aria-label={title}
          onPointerUp={() => {
            setIsFillPropertyOpen(!isFillPropertyOpen);
          }}
        >
          {!icon && children}
        </ToolButton>
      </PopoverTrigger>
      {/* 不传递 container，让 FloatingPortal 渲染到 body，确保 AssetProvider 上下文可用 */}
      <PopoverContent>
        <Island
          padding={0}
          className={classNames(`${ATTACHED_ELEMENT_CLASS_NAME}`, 'fill-setting')}
        >
          <FillPanel
            value={currentColor}
            onSolidChange={handleSolidChange}
            onOpacityChange={handleOpacityChange}
            onGradientChange={handleGradientChange}
            onImageChange={handleImageChange}
            onFillTypeChange={handleFillTypeChange}
            showClose={true}
            onClose={handleClose}
            onOpenMediaLibrary={handleOpenMediaLibrary}
          />
        </Island>
      </PopoverContent>

      {/* 素材库弹窗 - 渲染在 Popover 外部，避免 Popover 关闭时被卸载 */}
      {showMediaLibrary && (
        <Suspense fallback={null}>
          <MediaLibraryModal
            isOpen={showMediaLibrary}
            onClose={() => setShowMediaLibrary(false)}
            mode={SelectionMode.SELECT}
            filterType={AssetType.IMAGE}
            onSelect={handleSelectFromLibrary}
            selectButtonText={language === 'zh' ? '使用此图片' : 'Use this image'}
          />
        </Suspense>
      )}
    </Popover>
  );
};
