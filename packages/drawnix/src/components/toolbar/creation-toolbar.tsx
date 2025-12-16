import classNames from 'classnames';
import { Z_INDEX } from '../../constants/z-index';
import { Island } from '../island';
import Stack from '../stack';
import { ToolButton } from '../tool-button';
import {
  HandIcon,
  MindIcon,
  SelectionIcon,
  ShapeIcon,
  TextIcon,
  EraseIcon,
  StraightArrowLineIcon,
  FeltTipPenIcon,
  ImageIcon,
  MediaLibraryIcon,
  AIImageIcon,
  AIVideoIcon,
  ExtraToolsIcon,
} from '../icons';
import { useBoard } from '@plait-board/react-board';
import {
  ATTACHED_ELEMENT_CLASS_NAME,
  BoardTransforms,
  PlaitBoard,
  PlaitPointerType,
} from '@plait/core';
import { MindPointerType } from '@plait/mind';
import { BoardCreationMode, setCreationMode } from '@plait/common';
import {
  ArrowLineShape,
  BasicShapes,
  DrawPointerType,
  FlowchartSymbols,
} from '@plait/draw';
import { FreehandPanel , FREEHANDS } from './freehand-panel/freehand-panel';
import { ShapePicker } from '../shape-picker';
import { ArrowPicker } from '../arrow-picker';
import { useState, useCallback } from 'react';
import { MessagePlugin } from 'tdesign-react';
import { MediaLibraryModal } from '../media-library/MediaLibraryModal';
import { SelectionMode, Asset, AssetType } from '../../types/asset.types';
import { insertImageFromUrl } from '../../data/image';
import { insertVideoFromUrl } from '../../data/video';
import { Popover, PopoverContent, PopoverTrigger } from '../popover/popover';
import { FreehandShape } from '../../plugins/freehand/type';
import {
  DrawnixPointerType,
  DialogType,
  useDrawnix,
  useSetPointer,
} from '../../hooks/use-drawnix';
import { ExtraToolsButton } from './extra-tools/extra-tools-button';
import { addImage } from '../../utils/image';
import { useI18n, Translations } from '../../i18n';
import { ToolbarSectionProps } from './toolbar.types';

export enum PopupKey {
  'shape' = 'shape',
  'arrow' = 'arrow',
  'freehand' = 'freehand',
}

type AppToolButtonProps = {
  titleKey?: string;
  name?: string;
  icon: React.ReactNode;
  pointer?: DrawnixPointerType;
  key?: PopupKey | 'image' | 'media-library' | 'ai-image' | 'ai-video' | 'extra-tools';
};

const isBasicPointer = (pointer: string) => {
  return (
    pointer === PlaitPointerType.hand || pointer === PlaitPointerType.selection
  );
};

export const BUTTONS: AppToolButtonProps[] = [
  {
    icon: HandIcon,
    pointer: PlaitPointerType.hand,
    titleKey: 'toolbar.hand',
  },
  {
    icon: SelectionIcon,
    pointer: PlaitPointerType.selection,
    titleKey: 'toolbar.selection',
  },
  {
    icon: MindIcon,
    pointer: MindPointerType.mind,
    titleKey: 'toolbar.mind',
  },
  {
    icon: TextIcon,
    pointer: BasicShapes.text,
    titleKey: 'toolbar.text',
  },
  {
    icon: FeltTipPenIcon,
    pointer: FreehandShape.feltTipPen,
    titleKey: 'toolbar.pen',
    key: PopupKey.freehand,
  },
  {
    icon: StraightArrowLineIcon,
    titleKey: 'toolbar.arrow',
    key: PopupKey.arrow,
    pointer: ArrowLineShape.straight,
  },
  {
    icon: ShapeIcon,
    titleKey: 'toolbar.shape',
    key: PopupKey.shape,
    pointer: BasicShapes.rectangle,
  },
  {
    icon: ImageIcon,
    titleKey: 'toolbar.image',
    key: 'image',
  },
  {
    icon: MediaLibraryIcon,
    titleKey: 'toolbar.mediaLibrary',
    key: 'media-library',
  },
  {
    icon: AIImageIcon,
    titleKey: 'toolbar.aiImage',
    key: 'ai-image',
  },
  {
    icon: AIVideoIcon,
    titleKey: 'toolbar.aiVideo',
    key: 'ai-video',
  },
  {
    icon: ExtraToolsIcon,
    titleKey: 'toolbar.extraTools',
    key: 'extra-tools',
  },
];

// TODO provider by plait/draw
export const isArrowLinePointer = (board: PlaitBoard) => {
  return Object.keys(ArrowLineShape).includes(board.pointer);
};

export const isShapePointer = (board: PlaitBoard) => {
  return (
    Object.keys(BasicShapes).includes(board.pointer) ||
    Object.keys(FlowchartSymbols).includes(board.pointer)
  );
};

export const CreationToolbar: React.FC<ToolbarSectionProps> = ({
  embedded = false,
  iconMode = false
}) => {
  const board = useBoard();
  const { appState, openDialog } = useDrawnix();
  const { t } = useI18n();
  const setPointer = useSetPointer();
  const container = PlaitBoard.getBoardContainer(board);

  // 统一的 Popover 状态管理
  const [openPopovers, setOpenPopovers] = useState<Record<PopupKey, boolean>>({
    [PopupKey.freehand]: false,
    [PopupKey.arrow]: false,
    [PopupKey.shape]: false,
  });

  // 追踪是否是 hover 触发的
  const [hoverPopover, setHoverPopover] = useState<PopupKey | null>(null);
  const hoverTimeoutRef = useState<Record<PopupKey, NodeJS.Timeout | null>>({
    [PopupKey.freehand]: null,
    [PopupKey.arrow]: null,
    [PopupKey.shape]: null,
  })[0];

  const [lastFreehandButton, setLastFreehandButton] =
    useState<AppToolButtonProps>(
      BUTTONS.find((button) => button.key === PopupKey.freehand)!
    );

  // 素材库状态
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false);

  // 打开素材库
  const handleOpenMediaLibrary = useCallback(() => {
    setMediaLibraryOpen(true);
  }, []);

  // 关闭素材库
  const handleCloseMediaLibrary = useCallback(() => {
    setMediaLibraryOpen(false);
  }, []);

  // 插入素材到画板
  const handleInsertAsset = useCallback(async (asset: Asset) => {
    try {
      if (asset.type === AssetType.IMAGE) {
        await insertImageFromUrl(board, asset.url);
      } else if (asset.type === AssetType.VIDEO) {
        await insertVideoFromUrl(board, asset.url);
      }
      MessagePlugin.success('素材已插入到画板');
    } catch (error) {
      console.error('Failed to insert asset:', error);
      MessagePlugin.error('插入素材失败');
    }
  }, [board]);

  // 统一重置所有 Popover
  const resetAllPopovers = () => {
    setOpenPopovers({
      [PopupKey.freehand]: false,
      [PopupKey.arrow]: false,
      [PopupKey.shape]: false,
    });
    setHoverPopover(null);
    // 清除所有定时器
    Object.values(hoverTimeoutRef).forEach(timeout => {
      if (timeout) clearTimeout(timeout);
    });
  };

  // 统一激活指定 Popover (点击触发)
  const showPopover = (key: PopupKey) => {
    // 清除 hover 状态
    setHoverPopover(null);
    Object.values(hoverTimeoutRef).forEach(timeout => {
      if (timeout) clearTimeout(timeout);
    });
    
    setOpenPopovers({
      [PopupKey.freehand]: false,
      [PopupKey.arrow]: false,
      [PopupKey.shape]: false,
      [key]: true,
    });
  };

  // Hover 进入时显示 Popover
  const handleMouseEnter = (key: PopupKey) => {
    // 清除之前的定时器
    if (hoverTimeoutRef[key]) {
      clearTimeout(hoverTimeoutRef[key]!);
    }
    
    // 清除其他所有 Popover 的定时器
    Object.entries(hoverTimeoutRef).forEach(([popupKey, timeout]) => {
      if (popupKey !== key && timeout) {
        clearTimeout(timeout);
        hoverTimeoutRef[popupKey as PopupKey] = null;
      }
    });
    
    // 如果当前有其他 hover 触发的 Popover 正在显示，立即切换
    if (hoverPopover && hoverPopover !== key) {
      setOpenPopovers(prev => ({
        ...prev,
        [hoverPopover]: false,
        [key]: true,
      }));
      setHoverPopover(key);
    } 
    // 如果没有被点击打开，则通过 hover 打开
    else if (!openPopovers[key]) {
      hoverTimeoutRef[key] = setTimeout(() => {
        setOpenPopovers(prev => ({
          ...prev,
          [key]: true,
        }));
        setHoverPopover(key);
      }, 300); // 300ms 延迟，避免误触
    }
  };

  // Hover 离开时隐藏 Popover
  const handleMouseLeave = (key: PopupKey) => {
    // 清除进入的定时器
    if (hoverTimeoutRef[key]) {
      clearTimeout(hoverTimeoutRef[key]!);
      hoverTimeoutRef[key] = null;
    }

    // 只有当是 hover 触发的才自动关闭
    if (hoverPopover === key) {
      hoverTimeoutRef[key] = setTimeout(() => {
        setOpenPopovers(prev => ({
          ...prev,
          [key]: false,
        }));
        setHoverPopover(null);
      }, 200); // 200ms 延迟，允许鼠标移动到 Popover 或其他按钮
    }
  };

  // Popover 内容区域的 hover 事件
  const handlePopoverMouseEnter = (key: PopupKey) => {
    // 清除离开的定时器
    if (hoverTimeoutRef[key]) {
      clearTimeout(hoverTimeoutRef[key]!);
      hoverTimeoutRef[key] = null;
    }
  };

  const handlePopoverMouseLeave = (key: PopupKey) => {
    // 只有当是 hover 触发的才自动关闭
    if (hoverPopover === key) {
      setOpenPopovers(prev => ({
        ...prev,
        [key]: false,
      }));
      setHoverPopover(null);
    }
  };

  const onPointerDown = (pointer: DrawnixPointerType) => {
    setCreationMode(board, BoardCreationMode.dnd);
    BoardTransforms.updatePointerType(board, pointer);
    setPointer(pointer);
  };

  const onPointerUp = () => {
    setCreationMode(board, BoardCreationMode.drawing);
  };

  const hasOpenPopover = () => {
    return Object.values(openPopovers).some(isOpen => isOpen);
  };

  const isChecked = (button: AppToolButtonProps) => {
    return PlaitBoard.isPointer(board, button.pointer) && !hasOpenPopover();
  };

  const checkCurrentPointerIsFreehand = (board: PlaitBoard) => {
    return PlaitBoard.isInPointer(board, [
      FreehandShape.feltTipPen,
      FreehandShape.eraser,
    ]);
  };

  // 统一的按钮点击处理
  const handleButtonClick = (button: AppToolButtonProps) => {
    resetAllPopovers();

    if (button.pointer && !isBasicPointer(button.pointer)) {
      onPointerUp();
    } else if (button.pointer && isBasicPointer(button.pointer)) {
      BoardTransforms.updatePointerType(board, button.pointer);
      setPointer(button.pointer);
    }

    // 特殊按钮处理
    if (button.key === 'image') {
      addImage(board);
    } else if (button.key === 'media-library') {
      handleOpenMediaLibrary();
    } else if (button.key === 'ai-image') {
      openDialog(DialogType.aiImageGeneration);
    } else if (button.key === 'ai-video') {
      openDialog(DialogType.aiVideoGeneration);
    }
  };

  // 渲染带 Popover 的按钮
  const renderPopoverButton = (button: AppToolButtonProps, index: number, popupKey: PopupKey) => {
    // 根据不同的 popupKey 获取对应的内容和选中状态
    const getPopoverContent = () => {
      switch (popupKey) {
        case PopupKey.freehand:
          return (
            <FreehandPanel
              onPointerUp={(pointer: DrawnixPointerType) => {
                resetAllPopovers();
                setPointer(pointer);
                setLastFreehandButton(
                  FREEHANDS.find((btn) => btn.pointer === pointer)!
                );
              }}
            />
          );
        case PopupKey.shape:
          return (
            <ShapePicker
              onPointerUp={(pointer: DrawPointerType) => {
                resetAllPopovers();
                setPointer(pointer);
              }}
            />
          );
        case PopupKey.arrow:
          return (
            <ArrowPicker
              onPointerUp={(pointer: DrawPointerType) => {
                resetAllPopovers();
                setPointer(pointer);
              }}
            />
          );
      }
    };

    const getIsSelected = () => {
      const isPopoverOpen = openPopovers[popupKey];
      const hasOtherPopoverOpen = Object.entries(openPopovers).some(
        ([key, isOpen]) => key !== popupKey && isOpen
      );

      switch (popupKey) {
        case PopupKey.freehand:
          return isPopoverOpen || (checkCurrentPointerIsFreehand(board) && !hasOtherPopoverOpen);
        case PopupKey.shape:
          return isPopoverOpen || (isShapePointer(board) && !PlaitBoard.isPointer(board, BasicShapes.text));
        case PopupKey.arrow:
          return isPopoverOpen || isArrowLinePointer(board);
        default:
          return isPopoverOpen;
      }
    };

    const displayIcon = popupKey === PopupKey.freehand ? lastFreehandButton.icon : button.icon;
    const displayTitle = popupKey === PopupKey.freehand 
      ? (lastFreehandButton.titleKey ? t(lastFreehandButton.titleKey as keyof Translations) : 'Freehand')
      : (button.titleKey ? t(button.titleKey as keyof Translations) : '');

    return (
      <Popover
        key={index}
        open={openPopovers[popupKey]}
        sideOffset={12}
        onOpenChange={(open) => {
          if (!open) {
            resetAllPopovers();
          }
        }}
        placement={embedded ? "right-start" : "bottom"}
      >
        <PopoverTrigger asChild>
          <div
            onMouseEnter={() => handleMouseEnter(popupKey)}
            onMouseLeave={() => handleMouseLeave(popupKey)}
          >
            <ToolButton
              type="icon"
              visible={true}
              selected={getIsSelected()}
              icon={displayIcon}
              title={displayTitle}
              tooltipPlacement="bottom"
              aria-label={displayTitle}
              data-track={`toolbar_click_${popupKey}`}
              onPointerDown={() => {
                showPopover(popupKey);
                if (popupKey === PopupKey.freehand && lastFreehandButton.pointer) {
                  onPointerDown(lastFreehandButton.pointer);
                }
              }}
              onPointerUp={() => {
                if (popupKey === PopupKey.freehand) {
                  onPointerUp();
                }
              }}
            />
          </div>
        </PopoverTrigger>
        <PopoverContent 
          container={container} 
          style={{ zIndex: Z_INDEX.POPOVER }}
          onMouseEnter={() => handlePopoverMouseEnter(popupKey)}
          onMouseLeave={() => handlePopoverMouseLeave(popupKey)}
        >
          {getPopoverContent()}
        </PopoverContent>
      </Popover>
    );
  };

  // 渲染普通按钮
  const renderNormalButton = (button: AppToolButtonProps, index: number) => {
    return (
      <ToolButton
        key={index}
        type="radio"
        icon={button.icon}
        checked={isChecked(button)}
        title={button.titleKey ? t(button.titleKey as keyof Translations) : ''}
        tooltipPlacement={embedded ? 'right' : 'bottom'}
        aria-label={button.titleKey ? t(button.titleKey as keyof Translations) : ''}
        data-track={`toolbar_click_${button.pointer || button.key}`}
        onPointerDown={() => {
          if (button.pointer && !isBasicPointer(button.pointer)) {
            onPointerDown(button.pointer);
          }
        }}
        onPointerUp={() => {
          handleButtonClick(button);
        }}
      />
    );
  };


  const content = (
    <Stack.Row gap={1}>
      {BUTTONS.map((button, index) => {
        // 移动端隐藏手型工具
        if (appState.isMobile && button.pointer === PlaitPointerType.hand) {
          return null;
        }

        // 额外工具按钮
        if (button.key === 'extra-tools') {
          return <ExtraToolsButton key={index} />;
        }

        // 带 Popover 的按钮
        if (button.key && Object.values(PopupKey).includes(button.key as PopupKey)) {
          return renderPopoverButton(button, index, button.key as PopupKey);
        }

        // 普通按钮
        return renderNormalButton(button, index);
      })}
    </Stack.Row>
  );

  // 素材库弹窗
  const mediaLibraryModal = (
    <MediaLibraryModal
      isOpen={mediaLibraryOpen}
      onClose={handleCloseMediaLibrary}
      mode={SelectionMode.SELECT}
      onSelect={handleInsertAsset}
      selectButtonText="插入"
    />
  );

  if (embedded) {
    return (
      <>
        <div className={classNames('draw-toolbar', {
          'draw-toolbar--embedded': embedded,
          'draw-toolbar--icon-only': iconMode,
        })}>
          {content}
        </div>
        {mediaLibraryModal}
      </>
    );
  }


  return (
    <>
      <Island
        padding={1}
        className={classNames('draw-toolbar', ATTACHED_ELEMENT_CLASS_NAME, {
          'draw-toolbar--embedded': embedded,
          'draw-toolbar--icon-only': iconMode,
        })}
      >
        {content}
      </Island>
      {mediaLibraryModal}
    </>
  );
};
