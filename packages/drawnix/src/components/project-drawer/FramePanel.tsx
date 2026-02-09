/**
 * FramePanel Component
 *
 * 在项目抽屉中展示当前画布的 Frame 列表
 * 支持点击聚焦到对应 Frame 视图
 */

import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import classNames from 'classnames';
import { Input, Button, MessagePlugin, Tooltip } from 'tdesign-react';
import { SearchIcon, EditIcon, DeleteIcon, ViewListIcon, AddIcon, PlayCircleIcon } from 'tdesign-icons-react';
import {
  PlaitBoard,
  BoardTransforms,
  RectangleClient,
  Transforms,
  clearSelectedElement,
  addSelectedElement,
  getSelectedElements,
} from '@plait/core';
import { PlaitFrame, isFrameElement } from '../../types/frame.types';
import { FrameTransforms } from '../../plugins/with-frame';
import { useDrawnix } from '../../hooks/use-drawnix';
import { useDragSort } from '../../hooks/use-drag-sort';
import { AddFrameDialog } from './AddFrameDialog';
import { FrameSlideshow } from './FrameSlideshow';

interface FrameInfo {
  frame: PlaitFrame;
  childCount: number;
  width: number;
  height: number;
}

export const FramePanel: React.FC = () => {
  const { board } = useDrawnix();
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
  const [addDialogVisible, setAddDialogVisible] = useState(false);
  const [slideshowVisible, setSlideshowVisible] = useState(false);
  const [slideshowInitialFrameId, setSlideshowInitialFrameId] = useState<string | undefined>();
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    frame: PlaitFrame;
  } | null>(null);

  // 收集画布中的所有 Frame 及其信息
  const frames: FrameInfo[] = useMemo(() => {
    if (!board || !board.children) return [];

    const result: FrameInfo[] = [];
    for (const element of board.children) {
      if (isFrameElement(element)) {
        const frame = element as PlaitFrame;
        const rect = RectangleClient.getRectangleByPoints(frame.points);
        const children = FrameTransforms.getFrameChildren(board, frame);
        result.push({
          frame,
          childCount: children.length,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      }
    }
    return result;
  }, [board, board?.children]);

  // 过滤 Frame
  const filteredFrames = useMemo(() => {
    if (!searchQuery.trim()) return frames;
    const query = searchQuery.toLowerCase().trim();
    return frames.filter((f) =>
      f.frame.name.toLowerCase().includes(query)
    );
  }, [frames, searchQuery]);

  const frameIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    frames.forEach((item, index) => {
      map.set(item.frame.id, index);
    });
    return map;
  }, [frames]);

  // 点击 Frame：选中并聚焦视图
  const handleFrameClick = useCallback(
    (frame: PlaitFrame) => {
      if (!board) return;

      setSelectedFrameId(frame.id);

      // 选中该 Frame
      clearSelectedElement(board);
      const element = board.children.find((el) => el.id === frame.id);
      if (element) {
        addSelectedElement(board, element);
      }

      // 计算 Frame 矩形
      const rect = RectangleClient.getRectangleByPoints(frame.points);
      const padding = 80;

      // 获取视口尺寸
      const container = PlaitBoard.getBoardContainer(board);
      const viewportWidth = container.clientWidth;
      const viewportHeight = container.clientHeight;

      // 计算缩放比例，让 Frame 适应视口
      const scaleX = viewportWidth / (rect.width + padding * 2);
      const scaleY = viewportHeight / (rect.height + padding * 2);
      const zoom = Math.min(scaleX, scaleY, 2);

      // 计算 Frame 中心点
      const centerX = rect.x + rect.width / 2;
      const centerY = rect.y + rect.height / 2;

      // 计算 origination：使 Frame 中心对齐视口中心
      const origination: [number, number] = [
        centerX - viewportWidth / 2 / zoom,
        centerY - viewportHeight / 2 / zoom,
      ];

      BoardTransforms.updateViewport(board, origination, zoom);
    },
    [board]
  );

  // 开始重命名
  const handleStartRename = useCallback(
    (frame: PlaitFrame, e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingId(frame.id);
      setEditingName(frame.name);
    },
    []
  );

  // 完成重命名
  const handleFinishRename = useCallback(
    (frame: PlaitFrame) => {
      if (!board) return;
      const newName = editingName.trim();
      if (newName && newName !== frame.name) {
        FrameTransforms.renameFrame(board, frame, newName);
      }
      setEditingId(null);
      setEditingName('');
    },
    [board, editingName]
  );

  // 删除 Frame
  const handleDelete = useCallback(
    (frame: PlaitFrame, e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (!board) return;
      const index = board.children.findIndex((el) => el.id === frame.id);
      if (index !== -1) {
        // 先解绑所有子元素
        const children = FrameTransforms.getFrameChildren(board, frame);
        for (const child of children) {
          FrameTransforms.unbindFromFrame(board, child);
        }
        // 删除 Frame
        Transforms.removeNode(board, [index]);
        MessagePlugin.success('已删除 Frame');
      }
    },
    [board]
  );

  const reorderFrames = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (!board) return;

      const framePositions: number[] = [];
      const orderedFrames: PlaitFrame[] = [];

      board.children.forEach((element, index) => {
        if (isFrameElement(element)) {
          framePositions.push(index);
          orderedFrames.push(element as PlaitFrame);
        }
      });

      if (framePositions.length <= 1) return;

      const nextFrames = [...orderedFrames];
      const [moved] = nextFrames.splice(fromIndex, 1);
      nextFrames.splice(toIndex, 0, moved);

      for (let i = framePositions.length - 1; i >= 0; i -= 1) {
        Transforms.removeNode(board, [framePositions[i]]);
      }

      for (let i = 0; i < framePositions.length; i += 1) {
        Transforms.insertNode(board, nextFrames[i], [framePositions[i]]);
      }
    },
    [board]
  );

  const { getDragProps } = useDragSort({
    items: frames,
    getId: (item) => item.frame.id,
    onReorder: reorderFrames,
    enabled: !searchQuery.trim(),
  });

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  useEffect(() => {
    if (contextMenu?.visible) {
      const handleClick = () => closeContextMenu();
      document.addEventListener('click', handleClick);
      document.addEventListener('contextmenu', handleClick);
      return () => {
        document.removeEventListener('click', handleClick);
        document.removeEventListener('contextmenu', handleClick);
      };
    }
  }, [contextMenu?.visible, closeContextMenu]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, frame: PlaitFrame) => {
      e.preventDefault();
      e.stopPropagation();
      setSelectedFrameId(frame.id);
      setContextMenu({
        visible: true,
        x: e.clientX,
        y: e.clientY,
        frame,
      });
    },
    []
  );

  const handleContextMenuAction = useCallback(
    (action: 'rename' | 'delete') => {
      if (!contextMenu) return;
      const frame = contextMenu.frame;
      if (action === 'rename') {
        setEditingId(frame.id);
        setEditingName(frame.name);
      }
      if (action === 'delete') {
        handleDelete(frame);
      }
      closeContextMenu();
    },
    [contextMenu, handleDelete, closeContextMenu]
  );

  if (!board) {
    return (
      <div className="frame-panel__empty">
        <p>画布未初始化</p>
      </div>
    );
  }

  return (
    <div className="frame-panel">
      {/* 搜索 */}
      <div className="frame-panel__filter">
        <Input
          placeholder="搜索 Frame..."
          value={searchQuery}
          onChange={setSearchQuery}
          prefixIcon={<SearchIcon />}
          size="small"
        />
      </div>

      {/* 操作栏 */}
      <div className="frame-panel__actions">
        <Button
          variant="outline"
          size="small"
          icon={<AddIcon />}
          onClick={() => setAddDialogVisible(true)}
        >
          添加 Frame
        </Button>
        <Tooltip content={frames.length === 0 ? '没有 Frame 可播放' : '全屏播放所有 Frame'} theme="light">
          <Button
            variant="outline"
            size="small"
            icon={<PlayCircleIcon />}
            disabled={frames.length === 0}
            onClick={() => {
              // 检测画布当前选中的 Frame，作为幻灯片起始页
              const selected = getSelectedElements(board);
              const selectedFrame = selected.find((el) => isFrameElement(el));
              setSlideshowInitialFrameId(selectedFrame?.id);
              setSlideshowVisible(true);
            }}
          >
            幻灯片播放
          </Button>
        </Tooltip>
      </div>

      {/* Frame 列表 */}
      {filteredFrames.length === 0 ? (
        <div className="frame-panel__empty">
          <ViewListIcon style={{ fontSize: 32, color: 'var(--td-text-color-placeholder)' }} />
          <p>{frames.length === 0 ? '当前画布没有 Frame' : '未找到匹配的 Frame'}</p>
          {frames.length === 0 && (
            <p className="frame-panel__empty-hint">
              使用工具栏的 Frame 工具 (F) 创建
            </p>
          )}
        </div>
      ) : (
        <div className="frame-panel__list">
          {filteredFrames.map((info) => (
            (() => {
              const index = frameIndexMap.get(info.frame.id) ?? 0;
              const dragProps = getDragProps(info.frame.id, index);
              return (
            <div
              key={info.frame.id}
              className={classNames('frame-panel__item', {
                'frame-panel__item--active': selectedFrameId === info.frame.id,
                'frame-panel__item--dragging': dragProps['data-dragging'],
                'frame-panel__item--drag-over': dragProps['data-drag-over'],
                'frame-panel__item--drag-before': dragProps['data-drag-position'] === 'before',
                'frame-panel__item--drag-after': dragProps['data-drag-position'] === 'after',
              })}
              onClick={() => handleFrameClick(info.frame)}
              onContextMenu={(e) => handleContextMenu(e, info.frame)}
              {...dragProps}
            >
              <div className="frame-panel__item-icon">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect
                    x="1.5"
                    y="1.5"
                    width="13"
                    height="13"
                    rx="2"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeDasharray="3 2"
                    fill="none"
                  />
                </svg>
              </div>

              <div className="frame-panel__item-content">
                {editingId === info.frame.id ? (
                  <Input
                    value={editingName}
                    onChange={setEditingName}
                    size="small"
                    autofocus
                    onBlur={() => handleFinishRename(info.frame)}
                    onEnter={() => handleFinishRename(info.frame)}
                    onClick={(context: { e: React.MouseEvent }) => context.e.stopPropagation()}
                  />
                ) : (
                  <>
                    <span className="frame-panel__item-name">
                      {info.frame.name}
                    </span>
                    <span className="frame-panel__item-meta">
                      {info.width} × {info.height}
                      {info.childCount > 0 && ` · ${info.childCount} 个元素`}
                    </span>
                  </>
                )}
              </div>

              <div className="frame-panel__item-actions">
                <Button
                  variant="text"
                  size="small"
                  shape="square"
                  icon={<EditIcon />}
                  onClick={(e) => handleStartRename(info.frame, e as unknown as React.MouseEvent)}
                  title="重命名"
                />
                <Button
                  variant="text"
                  size="small"
                  shape="square"
                  theme="danger"
                  icon={<DeleteIcon />}
                  onClick={(e) => handleDelete(info.frame, e as unknown as React.MouseEvent)}
                  title="删除"
                />
              </div>
            </div>
              );
            })()
          ))}
        </div>
      )}

      {contextMenu?.visible && createPortal(
        <div
          className="project-drawer-context-menu"
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 10000,
          }}
        >
          <div className="project-drawer-context-menu__item" onClick={() => handleContextMenuAction('rename')}>
            <EditIcon />
            <span>重命名</span>
          </div>
          <div className="project-drawer-context-menu__divider" />
          <div className="project-drawer-context-menu__item project-drawer-context-menu__item--danger" onClick={() => handleContextMenuAction('delete')}>
            <DeleteIcon />
            <span>删除</span>
          </div>
        </div>,
        document.body
      )}

      {/* 添加 Frame 弹窗 */}
      <AddFrameDialog
        visible={addDialogVisible}
        board={board}
        onClose={() => setAddDialogVisible(false)}
      />

      {/* 幻灯片播放 */}
      <FrameSlideshow
        visible={slideshowVisible}
        board={board}
        initialFrameId={slideshowInitialFrameId}
        onClose={() => {
          setSlideshowVisible(false);
          setSlideshowInitialFrameId(undefined);
        }}
      />
    </div>
  );
};
