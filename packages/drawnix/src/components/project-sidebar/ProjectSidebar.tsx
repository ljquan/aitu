/**
 * ProjectSidebar Component
 *
 * Main sidebar component for workspace navigation.
 * Displays folder tree with projects and branches.
 */

import React, { useState, useCallback } from 'react';
import { Button, Input, Dropdown, Dialog, MessagePlugin, Tooltip } from 'tdesign-react';
import {
  AddIcon,
  FolderAddIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  SearchIcon,
  MoreIcon,
  FolderIcon,
  FolderOpenIcon,
  FileIcon,
  DeleteIcon,
  EditIcon,
  FileCopyIcon
} from 'tdesign-icons-react';
import { useWorkspace } from '../../hooks/useWorkspace';
import {
  TreeNode,
  FolderTreeNode,
  ProjectTreeNode,
  Branch,
  WORKSPACE_DEFAULTS,
} from '../../types/workspace.types';
import './project-sidebar.scss';

export interface ProjectSidebarProps {
  /** Called when board data should be saved before switching */
  onBeforeSwitch?: () => Promise<void>;
  /** Called after branch is switched */
  onBranchSwitch?: (branch: Branch) => void;
}

export const ProjectSidebar: React.FC<ProjectSidebarProps> = ({
  onBeforeSwitch,
  onBranchSwitch,
}) => {
  const {
    isLoading,
    tree,
    currentBranch,
    workspaceState,
    createFolder,
    renameFolder,
    deleteFolder,
    toggleFolderExpanded,
    createProject,
    renameProject,
    deleteProject,
    toggleProjectExpanded,
    createBranch,
    renameBranch,
    deleteBranch,
    switchBranch,
    setSidebarCollapsed,
  } = useWorkspace();

  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'folder' | 'project' | 'branch';
    id: string;
    name: string;
  } | null>(null);

  // Handle creating new project
  const handleCreateProject = useCallback(async () => {
    const project = await createProject({
      name: WORKSPACE_DEFAULTS.DEFAULT_PROJECT_NAME,
    });
    if (project) {
      setEditingId(project.id);
      setEditingName(project.name);
      MessagePlugin.success('项目已创建');
    }
  }, [createProject]);

  // Handle creating new folder
  const handleCreateFolder = useCallback(async () => {
    const folder = await createFolder({
      name: WORKSPACE_DEFAULTS.DEFAULT_FOLDER_NAME,
    });
    if (folder) {
      setEditingId(folder.id);
      setEditingName(folder.name);
    }
  }, [createFolder]);

  // Handle rename submit
  const handleRenameSubmit = useCallback(
    async (type: 'folder' | 'project' | 'branch', id: string) => {
      if (!editingName.trim()) {
        setEditingId(null);
        return;
      }

      let success = false;
      if (type === 'folder') {
        success = await renameFolder(id, editingName.trim());
      } else if (type === 'project') {
        success = await renameProject(id, editingName.trim());
      } else if (type === 'branch') {
        success = await renameBranch(id, editingName.trim());
      }

      if (success) {
        setEditingId(null);
      }
    },
    [editingName, renameFolder, renameProject, renameBranch]
  );

  // Handle delete
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;

    let success = false;
    if (deleteTarget.type === 'folder') {
      success = await deleteFolder(deleteTarget.id);
    } else if (deleteTarget.type === 'project') {
      success = await deleteProject(deleteTarget.id);
    } else if (deleteTarget.type === 'branch') {
      success = await deleteBranch(deleteTarget.id);
    }

    if (success) {
      MessagePlugin.success('删除成功');
    }
    setShowDeleteDialog(false);
    setDeleteTarget(null);
  }, [deleteTarget, deleteFolder, deleteProject, deleteBranch]);

  // Handle branch click
  const handleBranchClick = useCallback(
    async (branch: Branch) => {
      if (branch.id === currentBranch?.id) return;

      // Save current before switching
      if (onBeforeSwitch) {
        await onBeforeSwitch();
      }

      const switched = await switchBranch(branch.id);
      if (switched && onBranchSwitch) {
        onBranchSwitch(switched);
      }
    },
    [currentBranch, onBeforeSwitch, onBranchSwitch, switchBranch]
  );

  // Handle create branch
  const handleCreateBranch = useCallback(
    async (projectId: string, fromBranchId?: string) => {
      const branch = await createBranch({
        projectId,
        name: '新分支',
        fromBranchId,
      });
      if (branch) {
        setEditingId(branch.id);
        setEditingName(branch.name);
      }
    },
    [createBranch]
  );

  // Render folder node
  const renderFolderNode = (node: FolderTreeNode, level: number = 0) => {
    const { data: folder, children } = node;
    const isExpanded = folder.isExpanded;
    const isEditing = editingId === folder.id;
    const paddingLeft = level * 16 + 8;

    return (
      <div key={folder.id} className="sidebar-node">
        <div
          className="sidebar-node__row sidebar-node__row--folder"
          style={{ paddingLeft }}
          onClick={() => toggleFolderExpanded(folder.id)}
        >
          <span className="sidebar-node__expand" onClick={(e) => {
            e.stopPropagation();
            toggleFolderExpanded(folder.id);
          }}>
             <ChevronRightIcon style={{ transform: isExpanded ? 'rotate(90deg)' : 'none' }} />
          </span>
          
          <span className="sidebar-node__icon">
            {isExpanded ? <FolderOpenIcon /> : <FolderIcon />}
          </span>

          {isEditing ? (
            <Input
              size="small"
              value={editingName}
              onChange={(v) => setEditingName(v as string)}
              onBlur={() => handleRenameSubmit('folder', folder.id)}
              onEnter={() => handleRenameSubmit('folder', folder.id)}
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="sidebar-node__name">{folder.name}</span>
          )}

          <Dropdown
            options={[
              { content: '新建项目', value: 'new-project', prefixIcon: <FileIcon /> },
              { content: '新建子文件夹', value: 'new-folder', prefixIcon: <FolderAddIcon /> },
              { content: '重命名', value: 'rename', prefixIcon: <EditIcon /> },
              {
                content: '删除',
                value: 'delete',
                prefixIcon: <DeleteIcon />,
                theme: 'error' as const,
              },
            ]}
            onClick={({ value }) => {
              if (value === 'new-project') {
                createProject({ name: '未命名项目', folderId: folder.id });
              } else if (value === 'new-folder') {
                createFolder({ name: '新建文件夹', parentId: folder.id });
              } else if (value === 'rename') {
                setEditingId(folder.id);
                setEditingName(folder.name);
              } else if (value === 'delete') {
                setDeleteTarget({ type: 'folder', id: folder.id, name: folder.name });
                setShowDeleteDialog(true);
              }
            }}
            trigger="click"
          >
            <button
              className="sidebar-node__more"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreIcon />
            </button>
          </Dropdown>
        </div>

        {isExpanded && children.length > 0 && (
          <div className="sidebar-node__children">
            {children.map((child) =>
              child.type === 'folder'
                ? renderFolderNode(child as FolderTreeNode, level + 1)
                : renderProjectNode(child as ProjectTreeNode, level + 1)
            )}
          </div>
        )}
      </div>
    );
  };

  // Render project node
  const renderProjectNode = (node: ProjectTreeNode, level: number = 0) => {
    const { data: project, branches } = node;
    const isExpanded = project.isExpanded;
    const isEditing = editingId === project.id;
    const isActive = currentBranch?.projectId === project.id;
    const paddingLeft = level * 16 + 8;

    return (
      <div key={project.id} className="sidebar-node">
        <div
          className={`sidebar-node__row sidebar-node__row--project ${isActive ? 'sidebar-node__row--active' : ''}`}
          style={{ paddingLeft }}
          onClick={() => toggleProjectExpanded(project.id)}
        >
          <span className="sidebar-node__expand" onClick={(e) => {
            e.stopPropagation();
            toggleProjectExpanded(project.id);
          }}>
            <ChevronRightIcon style={{ transform: isExpanded ? 'rotate(90deg)' : 'none' }} />
          </span>
          <span className="sidebar-node__icon">
            <FileIcon />
          </span>

          {isEditing ? (
            <Input
              size="small"
              value={editingName}
              onChange={(v) => setEditingName(v as string)}
              onBlur={() => handleRenameSubmit('project', project.id)}
              onEnter={() => handleRenameSubmit('project', project.id)}
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="sidebar-node__name">{project.name}</span>
          )}

          <Dropdown
            options={[
              { content: '新建分支', value: 'new-branch', prefixIcon: <AddIcon /> },
              { content: '重命名', value: 'rename', prefixIcon: <EditIcon /> },
              {
                content: '删除',
                value: 'delete',
                prefixIcon: <DeleteIcon />,
                theme: 'error' as const,
              },
            ]}
            onClick={({ value }) => {
              if (value === 'new-branch') {
                handleCreateBranch(project.id, project.defaultBranchId);
              } else if (value === 'rename') {
                setEditingId(project.id);
                setEditingName(project.name);
              } else if (value === 'delete') {
                setDeleteTarget({ type: 'project', id: project.id, name: project.name });
                setShowDeleteDialog(true);
              }
            }}
            trigger="click"
          >
            <button
              className="sidebar-node__more"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreIcon />
            </button>
          </Dropdown>
        </div>

        {isExpanded && branches.length > 0 && (
          <div className="sidebar-node__children">
            {branches.map((branch) => renderBranchNode(branch, project.id, level + 1))}
          </div>
        )}
      </div>
    );
  };

  // Render branch node
  const renderBranchNode = (branch: Branch, projectId: string, level: number) => {
    const isEditing = editingId === branch.id;
    const isActive = currentBranch?.id === branch.id;
    // Align indentation with other nodes (icon width + padding)
    const paddingLeft = level * 16 + 24;

    return (
      <div key={branch.id} className="sidebar-node">
        <div
          className={`sidebar-node__row sidebar-node__row--branch ${isActive ? 'sidebar-node__row--current' : ''}`}
          style={{ paddingLeft }}
          onClick={() => handleBranchClick(branch)}
        >
          <span className="sidebar-node__icon">
             <FileIcon />
          </span>

          {isEditing ? (
            <Input
              size="small"
              value={editingName}
              onChange={(v) => setEditingName(v as string)}
              onBlur={() => handleRenameSubmit('branch', branch.id)}
              onEnter={() => handleRenameSubmit('branch', branch.id)}
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="sidebar-node__name">{branch.name}</span>
          )}

          <Dropdown
            options={[
              { content: '复制分支', value: 'copy', prefixIcon: <FileCopyIcon /> },
              { content: '重命名', value: 'rename', prefixIcon: <EditIcon /> },
              {
                content: '删除',
                value: 'delete',
                prefixIcon: <DeleteIcon />,
                theme: 'error' as const,
              },
            ]}
            onClick={({ value }) => {
              if (value === 'copy') {
                handleCreateBranch(projectId, branch.id);
              } else if (value === 'rename') {
                setEditingId(branch.id);
                setEditingName(branch.name);
              } else if (value === 'delete') {
                setDeleteTarget({ type: 'branch', id: branch.id, name: branch.name });
                setShowDeleteDialog(true);
              }
            }}
            trigger="click"
          >
            <button
              className="sidebar-node__more"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreIcon />
            </button>
          </Dropdown>
        </div>
      </div>
    );
  };

  return (
    <div
      className={`project-sidebar ${workspaceState.sidebarCollapsed ? 'project-sidebar--collapsed' : ''}`}
      style={{ width: workspaceState.sidebarCollapsed ? 0 : workspaceState.sidebarWidth }}
    >
      {/* Collapsed Trigger Button (Visible when collapsed) */}
      <div className="project-sidebar__expand-trigger" onClick={() => setSidebarCollapsed(false)}>
         <ChevronLeftIcon />
      </div>

      <div className="project-sidebar__content">
        {/* Header */}
        <div className="project-sidebar__header">
          <span className="project-sidebar__title">画板空间</span>
          <div className="project-sidebar__actions">
            <Tooltip content="新建文件夹">
              <Button
                variant="text"
                shape="square"
                size="small"
                icon={<FolderAddIcon />}
                onClick={handleCreateFolder}
              />
            </Tooltip>
            <Tooltip content="新建项目">
              <Button
                variant="text"
                shape="square"
                size="small"
                icon={<AddIcon />}
                onClick={handleCreateProject}
              />
            </Tooltip>
            <Tooltip content="收起侧边栏">
              <Button
                variant="text"
                shape="square"
                size="small"
                icon={<ChevronRightIcon />}
                onClick={() => setSidebarCollapsed(true)}
              />
            </Tooltip>
          </div>
        </div>

        {/* Search */}
        <div className="project-sidebar__search">
          <Input
            prefixIcon={<SearchIcon />}
            placeholder="搜索项目..."
            value={searchQuery}
            onChange={(v) => setSearchQuery(v as string)}
            clearable
          />
        </div>

        {/* Tree */}
        <div className="project-sidebar__tree">
          {isLoading ? (
            <div className="project-sidebar__loading">加载中...</div>
          ) : tree.length === 0 ? (
            <div className="project-sidebar__empty">
              <p>暂无项目</p>
              <Button size="small" icon={<AddIcon />} onClick={handleCreateProject}>
                创建第一个画板
              </Button>
            </div>
          ) : (
            tree.map((node) =>
              node.type === 'folder'
                ? renderFolderNode(node as FolderTreeNode)
                : renderProjectNode(node as ProjectTreeNode)
            )
          )}
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog
        visible={showDeleteDialog}
        header="确认删除"
        body={`确定要删除「${deleteTarget?.name}」吗？此操作无法撤销。`}
        confirmBtn={{ content: '删除', theme: 'danger' }}
        cancelBtn="取消"
        onConfirm={handleDelete}
        onClose={() => setShowDeleteDialog(false)}
        onCancel={() => setShowDeleteDialog(false)}
      />
    </div>
  );
};
