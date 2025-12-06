/**
 * ProjectDrawer Component
 *
 * Left-side drawer for workspace management.
 * Displays folder tree with boards (simplified from project/branch structure).
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Button, Input, Dropdown, Dialog, MessagePlugin } from 'tdesign-react';
import {
  AddIcon,
  FolderAddIcon,
  ChevronRightIcon,
  SearchIcon,
  MoreIcon,
  FolderIcon,
  FolderOpenIcon,
  DeleteIcon,
  EditIcon,
  CloseIcon,
  LayoutIcon
} from 'tdesign-icons-react';
import { useWorkspace } from '../../hooks/useWorkspace';
import {
  TreeNode,
  FolderTreeNode,
  BoardTreeNode,
  Board,
  WORKSPACE_DEFAULTS,
} from '../../types/workspace.types';
import './project-drawer.scss';

export interface ProjectDrawerProps {
  /** Whether the drawer is open */
  isOpen?: boolean;
  /** Called when drawer open state changes */
  onOpenChange?: (open: boolean) => void;
  /** Called when board data should be saved before switching */
  onBeforeSwitch?: () => Promise<void>;
  /** Called after board is switched */
  onBoardSwitch?: (board: Board) => void;
}

export const ProjectDrawer: React.FC<ProjectDrawerProps> = ({
  isOpen = false,
  onOpenChange,
  onBeforeSwitch,
  onBoardSwitch,
}) => {
  const {
    isLoading,
    tree,
    currentBoard,
    workspaceState,
    createFolder,
    renameFolder,
    deleteFolder,
    toggleFolderExpanded,
    createBoard,
    renameBoard,
    deleteBoard,
    switchBoard,
  } = useWorkspace();

  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'folder' | 'board';
    id: string;
    name: string;
  } | null>(null);

  // Auto-select text when input is focused
  const handleInputFocus = useCallback((value: string, context: { e: React.FocusEvent<HTMLInputElement> }) => {
    const input = context.e.target as HTMLInputElement;
    if (input && input.select) {
      input.select();
    }
  }, []);

  // Handle close
  const handleClose = useCallback(() => {
    onOpenChange?.(false);
  }, [onOpenChange]);

  // Handle creating new board
  const handleCreateBoard = useCallback(async (folderId?: string) => {
    const board = await createBoard({
      name: WORKSPACE_DEFAULTS.DEFAULT_BOARD_NAME,
      folderId: folderId || null,
    });
    if (board) {
      setEditingId(board.id);
      setEditingName(board.name);
      MessagePlugin.success('画板已创建');
    }
  }, [createBoard]);

  // Handle creating new folder
  const handleCreateFolder = useCallback(async (parentId?: string) => {
    const folder = await createFolder({
      name: WORKSPACE_DEFAULTS.DEFAULT_FOLDER_NAME,
      parentId: parentId || null,
    });
    if (folder) {
      setEditingId(folder.id);
      setEditingName(folder.name);
    }
  }, [createFolder]);

  // Handle rename submit
  const handleRenameSubmit = useCallback(
    async (type: 'folder' | 'board', id: string) => {
      if (!editingName.trim()) {
        setEditingId(null);
        return;
      }

      let success = false;
      if (type === 'folder') {
        success = await renameFolder(id, editingName.trim());
      } else if (type === 'board') {
        success = await renameBoard(id, editingName.trim());
      }

      if (success) {
        setEditingId(null);
      }
    },
    [editingName, renameFolder, renameBoard]
  );

  // Handle delete
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;

    let success = false;
    if (deleteTarget.type === 'folder') {
      success = await deleteFolder(deleteTarget.id);
    } else if (deleteTarget.type === 'board') {
      success = await deleteBoard(deleteTarget.id);
    }

    if (success) {
      MessagePlugin.success('删除成功');
    }
    setShowDeleteDialog(false);
    setDeleteTarget(null);
  }, [deleteTarget, deleteFolder, deleteBoard]);

  // Handle board click
  const handleBoardClick = useCallback(
    async (board: Board) => {
      if (board.id === currentBoard?.id) return;

      // Save current before switching
      if (onBeforeSwitch) {
        await onBeforeSwitch();
      }

      const switched = await switchBoard(board.id);
      if (switched && onBoardSwitch) {
        onBoardSwitch(switched);
      }
    },
    [currentBoard, onBeforeSwitch, onBoardSwitch, switchBoard]
  );

  // Render folder node
  const renderFolderNode = (node: FolderTreeNode, level: number = 0): React.ReactNode => {
    const { data: folder, children } = node;
    const isExpanded = folder.isExpanded;
    const isEditing = editingId === folder.id;
    const paddingLeft = level * 16 + 8;

    return (
      <div key={folder.id} className="project-drawer-node">
        <div
          className="project-drawer-node__row project-drawer-node__row--folder"
          style={{ paddingLeft }}
          onClick={() => toggleFolderExpanded(folder.id)}
        >
          <span className="project-drawer-node__expand" onClick={(e) => {
            e.stopPropagation();
            toggleFolderExpanded(folder.id);
          }}>
             <ChevronRightIcon style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
          </span>

          <span className="project-drawer-node__icon">
            {isExpanded ? <FolderOpenIcon /> : <FolderIcon />}
          </span>

          {isEditing ? (
            <Input
              value={editingName}
              size="small"
              autofocus
              onFocus={handleInputFocus}
              onClick={(e: { e: React.MouseEvent }) => e.e.stopPropagation()}
              onChange={(value) => setEditingName(value)}
              onBlur={() => handleRenameSubmit('folder', folder.id)}
              onKeydown={(value: string, context: { e: React.KeyboardEvent }) => {
                if (context.e.key === 'Enter') {
                  handleRenameSubmit('folder', folder.id);
                } else if (context.e.key === 'Escape') {
                  setEditingId(null);
                }
              }}
            />
          ) : (
            <span className="project-drawer-node__label">{folder.name}</span>
          )}

          <div className="project-drawer-node__actions" onClick={(e) => e.stopPropagation()}>
            <Dropdown
              options={[
                { content: '新建画板', value: 'new-board', prefixIcon: <AddIcon /> },
                { content: '新建文件夹', value: 'new-folder', prefixIcon: <FolderAddIcon /> },
                { content: '重命名', value: 'rename', prefixIcon: <EditIcon /> },
                { content: '删除', value: 'delete', prefixIcon: <DeleteIcon /> },
              ]}
              onClick={(data) => {
                if (data.value === 'new-board') {
                  handleCreateBoard(folder.id);
                } else if (data.value === 'new-folder') {
                  handleCreateFolder(folder.id);
                } else if (data.value === 'rename') {
                  setEditingId(folder.id);
                  setEditingName(folder.name);
                } else if (data.value === 'delete') {
                  setDeleteTarget({ type: 'folder', id: folder.id, name: folder.name });
                  setShowDeleteDialog(true);
                }
              }}
            >
              <Button variant="text" size="small" icon={<MoreIcon />} />
            </Dropdown>
          </div>
        </div>

        {isExpanded && children && children.length > 0 && (
          <div className="project-drawer-node__children">
            {children.map((child) =>
              child.type === 'folder'
                ? renderFolderNode(child as FolderTreeNode, level + 1)
                : renderBoardNode(child as BoardTreeNode, level + 1)
            )}
          </div>
        )}
      </div>
    );
  };

  // Render board node
  const renderBoardNode = (node: BoardTreeNode, level: number = 0): React.ReactNode => {
    const { data: board } = node;
    const isActive = board.id === currentBoard?.id;
    const isEditing = editingId === board.id;
    const paddingLeft = level * 16 + 8;

    return (
      <div key={board.id} className="project-drawer-node">
        <div
          className={`project-drawer-node__row ${
            isActive ? 'project-drawer-node__row--active' : ''
          }`}
          style={{ paddingLeft }}
          onClick={() => handleBoardClick(board)}
        >
          <span className="project-drawer-node__expand"></span>

          <span className="project-drawer-node__icon">
            <LayoutIcon />
          </span>

          {isEditing ? (
            <Input
              value={editingName}
              size="small"
              autofocus
              onFocus={handleInputFocus}
              onClick={(e: { e: React.MouseEvent }) => e.e.stopPropagation()}
              onChange={(value) => setEditingName(value)}
              onBlur={() => handleRenameSubmit('board', board.id)}
              onKeydown={(value: string, context: { e: React.KeyboardEvent }) => {
                if (context.e.key === 'Enter') {
                  handleRenameSubmit('board', board.id);
                } else if (context.e.key === 'Escape') {
                  setEditingId(null);
                }
              }}
            />
          ) : (
            <span className="project-drawer-node__label">{board.name}</span>
          )}

          <div className="project-drawer-node__actions" onClick={(e) => e.stopPropagation()}>
            <Dropdown
              options={[
                { content: '重命名', value: 'rename', prefixIcon: <EditIcon /> },
                { content: '删除', value: 'delete', prefixIcon: <DeleteIcon /> },
              ]}
              onClick={(data) => {
                if (data.value === 'rename') {
                  setEditingId(board.id);
                  setEditingName(board.name);
                } else if (data.value === 'delete') {
                  setDeleteTarget({ type: 'board', id: board.id, name: board.name });
                  setShowDeleteDialog(true);
                }
              }}
            >
              <Button variant="text" size="small" icon={<MoreIcon />} />
            </Dropdown>
          </div>
        </div>
      </div>
    );
  };

  // Filter tree based on search query
  const filteredTree = useMemo(() => {
    if (!searchQuery.trim()) return tree;

    const query = searchQuery.toLowerCase().trim();

    const filterNode = (node: TreeNode): TreeNode | null => {
      if (node.type === 'board') {
        const board = (node as BoardTreeNode).data;
        return board.name.toLowerCase().includes(query) ? node : null;
      }

      if (node.type === 'folder') {
        const folderNode = node as FolderTreeNode;
        const folder = folderNode.data;

        // Filter children recursively
        const filteredChildren = folderNode.children
          ? folderNode.children
              .map(filterNode)
              .filter((n): n is TreeNode => n !== null)
          : [];

        // Show folder if it matches OR has matching children
        const folderMatches = folder.name.toLowerCase().includes(query);
        if (folderMatches || filteredChildren.length > 0) {
          return {
            ...folderNode,
            children: filteredChildren,
          };
        }

        return null;
      }

      return null;
    };

    return tree
      .map(filterNode)
      .filter((n): n is TreeNode => n !== null);
  }, [tree, searchQuery]);

  return (
    <>
      <div className={`project-drawer ${isOpen ? 'project-drawer--open' : ''}`}>
        {/* Header */}
        <div className="project-drawer__header">
          <div className="project-drawer__header-left">
            <h3 className="project-drawer__title">工作区</h3>
          </div>
          <div className="project-drawer__actions">
            <Button
              variant="text"
              size="small"
              icon={<AddIcon />}
              onClick={() => handleCreateBoard()}
              title="新建画板"
            />
            <Button
              variant="text"
              size="small"
              icon={<FolderAddIcon />}
              onClick={() => handleCreateFolder()}
              title="新建文件夹"
            />
            <Button
              variant="text"
              size="small"
              icon={<CloseIcon />}
              onClick={handleClose}
            />
          </div>
        </div>

        {/* Search */}
        <div className="project-drawer__search">
          <Input
            placeholder="搜索..."
            value={searchQuery}
            onChange={setSearchQuery}
            prefixIcon={<SearchIcon />}
            size="small"
          />
        </div>

        {/* Content */}
        <div className="project-drawer__content">
          {isLoading ? (
            <div className="project-drawer__loading">加载中...</div>
          ) : filteredTree.length === 0 ? (
            <div className="project-drawer__empty">
              <p>暂无画板</p>
              <Button size="small" onClick={() => handleCreateBoard()}>
                创建第一个画板
              </Button>
            </div>
          ) : (
            <div className="project-drawer__tree">
              {filteredTree.map((node) =>
                node.type === 'folder'
                  ? renderFolderNode(node as FolderTreeNode)
                  : renderBoardNode(node as BoardTreeNode)
              )}
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog
        visible={showDeleteDialog}
        header="确认删除"
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDelete}
        confirmBtn="删除"
        cancelBtn="取消"
      >
        <p>
          确定要删除 {deleteTarget?.type === 'folder' ? '文件夹' : '画板'} "
          {deleteTarget?.name}" 吗？
          {deleteTarget?.type === 'folder' && (
            <span style={{ color: 'var(--td-warning-color)' }}>
              <br />
              注意：文件夹内的所有内容将被移动到根目录。
            </span>
          )}
        </p>
      </Dialog>
    </>
  );
};
