/**
 * 更多工具按钮组件
 * hover 时显示 Popover 面板，展示收起的工具按钮
 * 支持直接点击使用功能、hover显示popup选项、右键添加到工具栏
 */

import React, { useState, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ToolButton } from '../tool-button';
import {
  MoreIcon,
  HandIcon,
  SelectionIcon,
  MindIcon,
  TextIcon,
  FeltTipPenIcon,
  StraightArrowLineIcon,
  ShapeIcon,
  ImageUploadIcon,
  MediaLibraryIcon,
  AIImageIcon,
  AIVideoIcon,
  ThemeIcon,
  MermaidLogoIcon,
  MarkdownLogoIcon,
  UndoIcon,
  RedoIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '../icons';
import { Popover, PopoverContent, PopoverTrigger } from '../popover/popover';
import { Z_INDEX } from '../../constants/z-index';
import { useI18n, Translations } from '../../i18n';
import { useToolbarConfig } from '../../hooks/use-toolbar-config';
import { ToolbarButtonConfig } from '../../types/toolbar-config.types';
import {
  PlaitBoard,
  BoardTransforms,
  PlaitPointerType,
} from '@plait/core';
import { useBoard } from '@plait-board/react-board';
import { MindPointerType } from '@plait/mind';
import { ArrowLineShape, BasicShapes, DrawPointerType } from '@plait/draw';
import { BoardCreationMode, setCreationMode } from '@plait/common';
import { FreehandShape } from '../../plugins/freehand/type';
import { PenShape } from '../../plugins/pen/type';
import { finishPenOnToolSwitch } from '../../plugins/pen/with-pen-create';
import {
  DrawnixPointerType,
  DialogType,
  useDrawnix,
  useSetPointer,
} from '../../hooks/use-drawnix';
import { addImage } from '../../utils/image';
import { FreehandPanel, FREEHANDS } from './freehand-panel/freehand-panel';
import { ShapePicker } from '../shape-picker';
import { ArrowPicker } from '../arrow-picker';
import Menu from '../menu/menu';
import MenuItem from '../menu/menu-item';
import Stack from '../stack';
import { THEME_OPTIONS, CheckIcon, isBasicPointer, EmptyIcon } from './toolbar-shared';

interface MoreToolsButtonProps {
  /** 是否嵌入模式 */
  embedded?: boolean;
}

/**
 * 按钮元数据映射
 */
interface ButtonMeta {
  icon: React.ReactNode;
  titleKey: string;
  pointer?: DrawnixPointerType;
  hasPopup?: boolean; // 是否有popup选项
  popupKey?: string;
}

const BUTTON_META_MAP: Record<string, ButtonMeta> = {
  'hand': { icon: <HandIcon />, titleKey: 'toolbar.hand', pointer: PlaitPointerType.hand },
  'selection': { icon: <SelectionIcon />, titleKey: 'toolbar.selection', pointer: PlaitPointerType.selection },
  'mind': { icon: <MindIcon />, titleKey: 'toolbar.mind', pointer: MindPointerType.mind },
  'text': { icon: <TextIcon />, titleKey: 'toolbar.text', pointer: BasicShapes.text },
  'freehand': { icon: <FeltTipPenIcon />, titleKey: 'toolbar.pen', pointer: FreehandShape.feltTipPen, hasPopup: true, popupKey: 'freehand' },
  'arrow': { icon: <StraightArrowLineIcon />, titleKey: 'toolbar.arrow', pointer: ArrowLineShape.straight, hasPopup: true, popupKey: 'arrow' },
  'shape': { icon: <ShapeIcon />, titleKey: 'toolbar.shape', pointer: BasicShapes.rectangle, hasPopup: true, popupKey: 'shape' },
  'image': { icon: <ImageUploadIcon size={24} />, titleKey: 'toolbar.image' },
  'media-library': { icon: <MediaLibraryIcon size={24} />, titleKey: 'toolbar.mediaLibrary' },
  'ai-image': { icon: <AIImageIcon />, titleKey: 'toolbar.aiImage' },
  'ai-video': { icon: <AIVideoIcon />, titleKey: 'toolbar.aiVideo' },
  'theme': { icon: <ThemeIcon />, titleKey: 'toolbar.theme', hasPopup: true, popupKey: 'theme' },
  'mermaid-to-drawnix': { icon: <MermaidLogoIcon />, titleKey: 'extraTools.mermaidToDrawnix' },
  'markdown-to-drawnix': { icon: <MarkdownLogoIcon />, titleKey: 'extraTools.markdownToDrawnix' },
  // 操作类按钮
  'undo': { icon: <UndoIcon />, titleKey: 'general.undo' },
  'redo': { icon: <RedoIcon />, titleKey: 'general.redo' },
  // zoom 使用特殊渲染，不在这里配置
};

export const MoreToolsButton: React.FC<MoreToolsButtonProps> = ({
  embedded = false,
}) => {
  const { t } = useI18n();
  const board = useBoard();
  const container = PlaitBoard.getBoardContainer(board);
  const { hiddenButtons, showButton } = useToolbarConfig();
  
  const [isOpen, setIsOpen] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const leaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 清除所有定时器
  const clearAllTimeouts = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
  }, []);

  // 鼠标进入按钮
  const handleMouseEnter = useCallback(() => {
    clearAllTimeouts();
    setIsHovering(true);
    
    // 延迟打开，避免误触
    hoverTimeoutRef.current = setTimeout(() => {
      setIsOpen(true);
    }, 200);
  }, [clearAllTimeouts]);

  // 鼠标离开按钮
  const handleMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    
    // 延迟关闭，允许鼠标移动到 Popover
    leaveTimeoutRef.current = setTimeout(() => {
      setIsHovering(false);
      setIsOpen(false);
    }, 150);
  }, []);

  // 鼠标进入 Popover 内容区
  const handlePopoverMouseEnter = useCallback(() => {
    clearAllTimeouts();
    setIsHovering(true);
  }, [clearAllTimeouts]);

  // 鼠标离开 Popover 内容区
  const handlePopoverMouseLeave = useCallback(() => {
    leaveTimeoutRef.current = setTimeout(() => {
      setIsHovering(false);
      setIsOpen(false);
    }, 150);
  }, []);

  // 更多按钮始终显示（不管有没有隐藏的按钮）
  // 这样用户可以通过它来管理工具栏配置

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isHovering) {
          setIsOpen(false);
        }
      }}
      placement={embedded ? 'right-start' : 'bottom'}
      sideOffset={12}
    >
      <PopoverTrigger asChild>
        <div
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <ToolButton
            type="icon"
            icon={<MoreIcon />}
            title={isOpen ? undefined : t('toolbar.more')}
            tooltipPlacement={embedded ? 'right' : 'bottom'}
            aria-label={t('toolbar.more')}
            selected={isOpen}
            visible={true}
            data-track="toolbar_click_more"
          />
        </div>
      </PopoverTrigger>
      <PopoverContent
        container={container}
        style={{ zIndex: Z_INDEX.POPOVER }}
        onMouseEnter={handlePopoverMouseEnter}
        onMouseLeave={handlePopoverMouseLeave}
      >
        <MoreToolsPanel
          hiddenButtons={hiddenButtons}
          showButton={showButton}
        />
      </PopoverContent>
    </Popover>
  );
};

/**
 * 更多工具面板内容
 */
interface MoreToolsPanelProps {
  hiddenButtons: ToolbarButtonConfig[];
  showButton: (buttonId: string) => void;
}

const MoreToolsPanel: React.FC<MoreToolsPanelProps> = ({
  hiddenButtons,
  showButton,
}) => {
  const { t } = useI18n();
  const board = useBoard();
  const container = PlaitBoard.getBoardContainer(board);
  const { openDialog } = useDrawnix();
  const setPointer = useSetPointer();

  // Popup 状态
  const [openPopup, setOpenPopup] = useState<string | null>(null);
  const [hoverPopup, setHoverPopup] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<Record<string, NodeJS.Timeout | null>>({});

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{
    buttonId: string;
    x: number;
    y: number;
  } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // 最后使用的 freehand 按钮
  const [lastFreehandPointer, setLastFreehandPointer] = useState<DrawnixPointerType>(FreehandShape.feltTipPen);

  // 关闭所有 popup
  const resetAllPopups = useCallback(() => {
    setOpenPopup(null);
    setHoverPopup(null);
    Object.values(hoverTimeoutRef.current).forEach(timeout => {
      if (timeout) clearTimeout(timeout);
    });
  }, []);

  // 点击固定 popup（不会因 hover 离开而关闭）
  const showPopup = useCallback((popupKey: string) => {
    // 清除所有 hover 定时器
    Object.values(hoverTimeoutRef.current).forEach(timeout => {
      if (timeout) clearTimeout(timeout);
    });
    
    // 如果是 hover 触发的 popup，点击后固定它（变成非 hover 状态）
    if (hoverPopup === popupKey) {
      setHoverPopup(null);
      // popup 保持打开，但不再是 hover 触发的
      return;
    }
    
    // 如果已经是固定状态（非 hover），再次点击关闭
    if (openPopup === popupKey && !hoverPopup) {
      setOpenPopup(null);
    } else {
      // 打开新的 popup（固定状态）
      setHoverPopup(null);
      setOpenPopup(popupKey);
    }
  }, [openPopup, hoverPopup]);

  // Hover 进入时显示 Popup（只有当没有点击打开的 popup 时才生效）
  const handleMouseEnter = useCallback((popupKey: string) => {
    // 如果当前有点击打开的 popup（非 hover 触发），不处理 hover
    if (openPopup && !hoverPopup) {
      return;
    }

    if (hoverTimeoutRef.current[popupKey]) {
      clearTimeout(hoverTimeoutRef.current[popupKey]!);
    }
    
    // 清除其他 popup 的定时器
    Object.entries(hoverTimeoutRef.current).forEach(([key, timeout]) => {
      if (key !== popupKey && timeout) {
        clearTimeout(timeout);
        hoverTimeoutRef.current[key] = null;
      }
    });
    
    // 如果有其他 hover popup 显示，立即切换
    if (hoverPopup && hoverPopup !== popupKey) {
      setOpenPopup(popupKey);
      setHoverPopup(popupKey);
    } else if (!openPopup) {
      hoverTimeoutRef.current[popupKey] = setTimeout(() => {
        setOpenPopup(popupKey);
        setHoverPopup(popupKey);
      }, 300);
    }
  }, [hoverPopup, openPopup]);

  // Hover 离开时隐藏 Popup（只有 hover 触发的才会关闭）
  const handleMouseLeave = useCallback((popupKey: string) => {
    if (hoverTimeoutRef.current[popupKey]) {
      clearTimeout(hoverTimeoutRef.current[popupKey]!);
      hoverTimeoutRef.current[popupKey] = null;
    }

    // 只有 hover 触发的 popup 才会因为鼠标离开而关闭
    if (hoverPopup === popupKey) {
      hoverTimeoutRef.current[popupKey] = setTimeout(() => {
        setOpenPopup(null);
        setHoverPopup(null);
      }, 400); // 增加延迟，给用户足够时间移动到 popup
    }
  }, [hoverPopup]);

  // Popup 内容区域的 hover 事件
  const handlePopupMouseEnter = useCallback((popupKey: string) => {
    if (hoverTimeoutRef.current[popupKey]) {
      clearTimeout(hoverTimeoutRef.current[popupKey]!);
      hoverTimeoutRef.current[popupKey] = null;
    }
  }, []);

  const handlePopupMouseLeave = useCallback((popupKey: string) => {
    // 只有 hover 触发的 popup 才会因为鼠标离开而关闭
    if (hoverPopup === popupKey) {
      setOpenPopup(null);
      setHoverPopup(null);
    }
  }, [hoverPopup]);

  // 指针操作
  const onPointerDown = useCallback((pointer: DrawnixPointerType) => {
    // 切换工具前，结束钢笔绘制
    finishPenOnToolSwitch(board);
    setCreationMode(board, BoardCreationMode.dnd);
    BoardTransforms.updatePointerType(board, pointer);
    setPointer(pointer);
  }, [board, setPointer]);

  const onPointerUp = useCallback(() => {
    setCreationMode(board, BoardCreationMode.drawing);
  }, [board]);

  // 处理按钮点击 - 对于有 popup 的按钮，点击打开/关闭 popup
  const handleButtonClick = useCallback((buttonId: string) => {
    const meta = BUTTON_META_MAP[buttonId];
    if (!meta) return;

    // 如果有 popup，点击切换 popup 显示状态
    if (meta.hasPopup && meta.popupKey) {
      showPopup(meta.popupKey);
      return;
    }

    resetAllPopups();
    
    // 切换工具前，结束钢笔绘制
    finishPenOnToolSwitch(board);

    // 指针类按钮
    if (meta.pointer) {
      if (!isBasicPointer(meta.pointer)) {
        onPointerDown(meta.pointer);
        onPointerUp();
      } else {
        BoardTransforms.updatePointerType(board, meta.pointer);
        setPointer(meta.pointer);
      }
    }

    // 特殊按钮处理
    switch (buttonId) {
      case 'image':
        addImage(board);
        break;
      case 'ai-image':
        openDialog(DialogType.aiImageGeneration);
        break;
      case 'ai-video':
        openDialog(DialogType.aiVideoGeneration);
        break;
      case 'mermaid-to-drawnix':
        openDialog(DialogType.mermaidToDrawnix);
        break;
      case 'markdown-to-drawnix':
        openDialog(DialogType.markdownToDrawnix);
        break;
      case 'undo':
        board.undo();
        break;
      case 'redo':
        board.redo();
        break;
    }
  }, [board, openDialog, onPointerDown, onPointerUp, resetAllPopups, setPointer, showPopup]);

  // 处理右键菜单
  const handleContextMenu = useCallback((e: React.MouseEvent, buttonId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ buttonId, x: e.clientX, y: e.clientY });
  }, []);

  // 关闭右键菜单
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // 添加到工具栏
  const handleAddToToolbar = useCallback(() => {
    if (contextMenu) {
      showButton(contextMenu.buttonId);
      closeContextMenu();
    }
  }, [contextMenu, showButton, closeContextMenu]);

  // 点击外部关闭右键菜单
  React.useEffect(() => {
    if (!contextMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        closeContextMenu();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeContextMenu();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu, closeContextMenu]);

  // 获取 popup 内容
  const getPopupContent = useCallback((popupKey: string) => {
    switch (popupKey) {
      case 'freehand':
        return (
          <FreehandPanel
            onPointerUp={(pointer: DrawnixPointerType) => {
              resetAllPopups();
              setPointer(pointer);
              setLastFreehandPointer(pointer);
            }}
          />
        );
      case 'shape':
        return (
          <ShapePicker
            onPointerUp={(pointer: DrawPointerType) => {
              resetAllPopups();
              setPointer(pointer);
            }}
          />
        );
      case 'arrow':
        return (
          <ArrowPicker
            onPointerUp={(pointer: DrawPointerType) => {
              resetAllPopups();
              setPointer(pointer);
            }}
          />
        );
      case 'theme':
        return (
          <Menu>
            {THEME_OPTIONS.map((option) => {
              const isSelected = board.theme.themeColorMode === option.value;
              return (
                <MenuItem
                  key={option.value}
                  icon={isSelected ? CheckIcon : EmptyIcon}
                  data-track={`toolbar_click_theme_${option.value}`}
                  onSelect={() => {
                    BoardTransforms.updateThemeColor(board, option.value);
                    resetAllPopups();
                  }}
                  aria-label={t(option.labelKey)}
                  selected={isSelected}
                >
                  {t(option.labelKey)}
                </MenuItem>
              );
            })}
          </Menu>
        );
      default:
        return null;
    }
  }, [board, resetAllPopups, setPointer, t]);

  // 获取 freehand 按钮的图标
  const getFreehandIcon = useMemo(() => {
    const freehand = FREEHANDS.find(f => f.pointer === lastFreehandPointer);
    // freehand?.icon 已经是 JSX 元素，直接返回即可
    return freehand?.icon || <FeltTipPenIcon />;
  }, [lastFreehandPointer]);

  // zoom 菜单状态
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);

  // 渲染 zoom 工具栏（横向展示）
  const renderZoomToolbar = useCallback(() => {
    return (
      <div
        key="zoom"
        className="more-tools-panel__zoom-row"
        onContextMenu={(e) => handleContextMenu(e, 'zoom')}
      >
        <Stack.Row gap={1}>
          <ToolButton
            type="button"
            icon={<ZoomOutIcon />}
            visible={true}
            title={t('zoom.out')}
            tooltipPlacement="top"
            aria-label={t('zoom.out')}
            data-track="toolbar_click_zoom_out"
            onPointerUp={() => {
              BoardTransforms.updateZoom(board, board.viewport.zoom - 0.1);
            }}
            className="zoom-out-button"
          />
          <Popover
            sideOffset={12}
            open={zoomMenuOpen}
            onOpenChange={(open) => {
              setZoomMenuOpen(open);
            }}
            placement="right-start"
          >
            <PopoverTrigger asChild>
              <div
                title={t('zoom.fit')}
                aria-label={t('zoom.fit')}
                data-track="toolbar_click_zoom_menu"
                className={`zoom-menu-trigger ${zoomMenuOpen ? 'active' : ''}`}
                onPointerUp={() => {
                  setZoomMenuOpen(!zoomMenuOpen);
                }}
              >
                {Number(((board?.viewport?.zoom || 1) * 100).toFixed(0))}%
              </div>
            </PopoverTrigger>
            <PopoverContent container={container} style={{ zIndex: Z_INDEX.POPOVER + 1 }}>
              <Menu
                onSelect={() => {
                  setZoomMenuOpen(false);
                }}
              >
                <MenuItem
                  data-track="toolbar_click_zoom_fit"
                  onSelect={() => {
                    BoardTransforms.fitViewport(board);
                  }}
                  aria-label={t('zoom.fit')}
                  shortcut={`Cmd+Shift+=`}
                >{t('zoom.fit')}</MenuItem>
                <MenuItem
                  data-track="toolbar_click_zoom_100"
                  onSelect={() => {
                    BoardTransforms.updateZoom(board, 1);
                  }}
                  aria-label={t('zoom.100')}
                  shortcut={`Cmd+0`}
                >{t('zoom.100')}</MenuItem>
              </Menu>
            </PopoverContent>
          </Popover>
          <ToolButton
            type="button"
            icon={<ZoomInIcon />}
            visible={true}
            title={t('zoom.in')}
            tooltipPlacement="top"
            aria-label={t('zoom.in')}
            data-track="toolbar_click_zoom_in"
            onPointerUp={() => {
              BoardTransforms.updateZoom(board, board.viewport.zoom + 0.1);
            }}
            className="zoom-in-button"
          />
        </Stack.Row>
      </div>
    );
  }, [board, container, handleContextMenu, t, zoomMenuOpen]);

  // 渲染单个按钮
  const renderButton = useCallback((buttonId: string) => {
    // zoom 使用特殊渲染
    if (buttonId === 'zoom') {
      return renderZoomToolbar();
    }

    const meta = BUTTON_META_MAP[buttonId];
    if (!meta) return null;

    const title = t(meta.titleKey as keyof Translations);
    const icon = buttonId === 'freehand' ? getFreehandIcon : meta.icon;
    const isUndoDisabled = buttonId === 'undo' && (board.history?.undos?.length ?? 0) <= 0;
    const isRedoDisabled = buttonId === 'redo' && (board.history?.redos?.length ?? 0) <= 0;
    const isDisabled = isUndoDisabled || isRedoDisabled;

    // 有 popup 的按钮
    if (meta.hasPopup && meta.popupKey) {
      const popupKey = meta.popupKey;
      return (
        <div
          key={buttonId}
          className="more-tools-panel__item"
          onContextMenu={(e) => handleContextMenu(e, buttonId)}
        >
          <Popover
            open={openPopup === popupKey}
            sideOffset={2}
            onOpenChange={(open) => {
              if (!open) {
                resetAllPopups();
              }
            }}
            placement="right-start"
          >
            <PopoverTrigger asChild>
              <div
                onMouseEnter={() => handleMouseEnter(popupKey)}
                onMouseLeave={() => handleMouseLeave(popupKey)}
              >
                <ToolButton
                  type="icon"
                  icon={icon}
                  title={title}
                  tooltipPlacement="left"
                  aria-label={title}
                  visible={true}
                  selected={openPopup === popupKey}
                  data-track={`toolbar_click_${buttonId}`}
                  onPointerUp={() => handleButtonClick(buttonId)}
                />
              </div>
            </PopoverTrigger>
            <PopoverContent
              container={container}
              style={{ zIndex: Z_INDEX.POPOVER + 1 }}
              onMouseEnter={() => handlePopupMouseEnter(popupKey)}
              onMouseLeave={() => handlePopupMouseLeave(popupKey)}
            >
              {getPopupContent(popupKey)}
            </PopoverContent>
          </Popover>
        </div>
      );
    }

    // 普通按钮
    return (
      <div
        key={buttonId}
        className="more-tools-panel__item"
        onContextMenu={(e) => handleContextMenu(e, buttonId)}
      >
        <ToolButton
          type="icon"
          icon={icon}
          title={title}
          tooltipPlacement="right"
          aria-label={title}
          visible={true}
          selected={false}
          disabled={isDisabled}
          data-track={`toolbar_click_${buttonId}`}
          onPointerUp={() => handleButtonClick(buttonId)}
        />
      </div>
    );
  }, [
    t,
    board,
    container,
    openPopup,
    getFreehandIcon,
    handleButtonClick,
    handleContextMenu,
    handleMouseEnter,
    handleMouseLeave,
    handlePopupMouseEnter,
    handlePopupMouseLeave,
    getPopupContent,
    resetAllPopups,
    renderZoomToolbar,
  ]);

  if (hiddenButtons.length === 0) {
    return (
      <div className="more-tools-panel">
        <div className="more-tools-panel__header">
          <span className="more-tools-panel__title">{t('toolbar.moreTools')}</span>
        </div>
        <div className="more-tools-panel__empty">
          <span className="more-tools-panel__empty-text">{t('toolbar.allToolsVisible')}</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="more-tools-panel">
        <div className="more-tools-panel__header">
          <span className="more-tools-panel__title">{t('toolbar.moreTools')}</span>
        </div>
        <div className="more-tools-panel__content">
          {hiddenButtons.map((button) => renderButton(button.id))}
        </div>
        <div className="more-tools-panel__footer">
          <span className="more-tools-panel__hint">{t('toolbar.rightClickToAdd')}</span>
        </div>
      </div>
      {/* 右键菜单 */}
      {contextMenu && createPortal(
        <div
          ref={contextMenuRef}
          className="toolbar-context-menu"
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 10000,
          }}
        >
          <Menu>
            <MenuItem onSelect={handleAddToToolbar}>
              {t('toolbar.addToToolbar')}
            </MenuItem>
          </Menu>
        </div>,
        document.body
      )}
    </>
  );
};

export default MoreToolsButton;
