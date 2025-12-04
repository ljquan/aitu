/**
 * ProjectManager Component
 *
 * Main project management page that displays project list,
 * handles project creation, deletion, and opening.
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Button,
  Input,
  Select,
  Loading,
  Dialog,
  MessagePlugin,
  Empty,
} from 'tdesign-react';
import {
  AddIcon,
  SearchIcon,
  ViewListIcon,
  ViewModuleIcon,
  RefreshIcon,
} from 'tdesign-icons-react';
import { ProjectCard } from './ProjectCard';
import { CreateProjectDialog } from './CreateProjectDialog';
import { useProjectManager } from '../../hooks/useProjectManager';
import { ProjectMetadata, ProjectSortBy } from '../../types/project.types';
import './project-manager.scss';

export interface ProjectManagerProps {
  /** Called when a project is opened */
  onOpenProject?: (project: ProjectMetadata) => void;
}

type ViewMode = 'grid' | 'list';

const SORT_OPTIONS = [
  { label: '最近修改', value: 'updatedAt' },
  { label: '最近访问', value: 'accessedAt' },
  { label: '创建时间', value: 'createdAt' },
  { label: '名称', value: 'name' },
  { label: '大小', value: 'size' },
];

/**
 * ProjectManager component
 */
export const ProjectManager: React.FC<ProjectManagerProps> = ({
  onOpenProject,
}) => {
  const {
    projects,
    isLoading,
    error,
    sortBy,
    setSort,
    setFilter,
    createProject,
    deleteProject,
    renameProject,
    duplicateProject,
    toggleStar,
    toggleArchive,
    refreshProjects,
  } = useProjectManager();

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<ProjectMetadata | null>(
    null
  );
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [projectToRename, setProjectToRename] = useState<ProjectMetadata | null>(
    null
  );
  const [newName, setNewName] = useState('');

  // Filter projects by search query
  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) {
      return projects;
    }
    const query = searchQuery.toLowerCase();
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query)
    );
  }, [projects, searchQuery]);

  // Handle search
  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);

  // Handle sort change
  const handleSortChange = useCallback(
    (value: string) => {
      setSort(value as ProjectSortBy, 'desc');
    },
    [setSort]
  );

  // Handle project click
  const handleProjectClick = useCallback((project: ProjectMetadata) => {
    setSelectedProjectId(project.id);
  }, []);

  // Handle project double-click (open)
  const handleProjectDoubleClick = useCallback(
    (project: ProjectMetadata) => {
      onOpenProject?.(project);
    },
    [onOpenProject]
  );

  // Handle create project
  const handleCreateProject = useCallback(
    async (name: string, description?: string) => {
      const project = await createProject({ name, description });
      if (project) {
        onOpenProject?.({
          id: project.id,
          name: project.name,
          description: project.description,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          accessedAt: project.accessedAt,
          size: project.size,
          elementCount: project.elementCount,
          tags: project.tags,
          isStarred: project.isStarred,
          isArchived: project.isArchived,
        });
      }
    },
    [createProject, onOpenProject]
  );

  // Handle delete
  const handleDeleteClick = useCallback((project: ProjectMetadata) => {
    setProjectToDelete(project);
    setShowDeleteDialog(true);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!projectToDelete) return;

    const success = await deleteProject(projectToDelete.id);
    if (success) {
      MessagePlugin.success('项目已删除');
      if (selectedProjectId === projectToDelete.id) {
        setSelectedProjectId(null);
      }
    }
    setShowDeleteDialog(false);
    setProjectToDelete(null);
  }, [projectToDelete, deleteProject, selectedProjectId]);

  // Handle rename
  const handleRenameClick = useCallback((project: ProjectMetadata) => {
    setProjectToRename(project);
    setNewName(project.name);
    setShowRenameDialog(true);
  }, []);

  const handleConfirmRename = useCallback(async () => {
    if (!projectToRename || !newName.trim()) return;

    const success = await renameProject(projectToRename.id, newName.trim());
    if (success) {
      MessagePlugin.success('重命名成功');
    }
    setShowRenameDialog(false);
    setProjectToRename(null);
    setNewName('');
  }, [projectToRename, newName, renameProject]);

  // Handle duplicate
  const handleDuplicateClick = useCallback(
    async (project: ProjectMetadata) => {
      const duplicated = await duplicateProject(project.id);
      if (duplicated) {
        MessagePlugin.success('项目已复制');
      }
    },
    [duplicateProject]
  );

  // Handle star toggle
  const handleToggleStar = useCallback(
    async (project: ProjectMetadata) => {
      await toggleStar(project.id);
    },
    [toggleStar]
  );

  // Handle archive toggle
  const handleToggleArchive = useCallback(
    async (project: ProjectMetadata) => {
      await toggleArchive(project.id);
      MessagePlugin.success(project.isArchived ? '已取消归档' : '已归档');
    },
    [toggleArchive]
  );

  if (isLoading) {
    return (
      <div className="project-manager project-manager--loading">
        <Loading text="加载中..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="project-manager project-manager--error">
        <Empty description={error} />
        <Button onClick={refreshProjects}>重试</Button>
      </div>
    );
  }

  return (
    <div className="project-manager">
      {/* Header */}
      <header className="project-manager__header">
        <div className="project-manager__title">
          <h1>我的项目</h1>
          <span className="project-manager__count">{projects.length} 个项目</span>
        </div>

        <div className="project-manager__actions">
          <Button
            theme="primary"
            icon={<AddIcon />}
            onClick={() => setShowCreateDialog(true)}
          >
            新建项目
          </Button>
        </div>
      </header>

      {/* Toolbar */}
      <div className="project-manager__toolbar">
        <div className="project-manager__search">
          <Input
            prefixIcon={<SearchIcon />}
            placeholder="搜索项目..."
            value={searchQuery}
            onChange={(value) => handleSearch(value as string)}
            clearable
          />
        </div>

        <div className="project-manager__filters">
          <Select
            value={sortBy}
            onChange={(value) => handleSortChange(value as string)}
            options={SORT_OPTIONS}
            style={{ width: 140 }}
          />

          <div className="project-manager__view-toggle">
            <Button
              variant={viewMode === 'grid' ? 'base' : 'outline'}
              shape="square"
              icon={<ViewModuleIcon />}
              onClick={() => setViewMode('grid')}
            />
            <Button
              variant={viewMode === 'list' ? 'base' : 'outline'}
              shape="square"
              icon={<ViewListIcon />}
              onClick={() => setViewMode('list')}
            />
          </div>

          <Button
            variant="outline"
            shape="square"
            icon={<RefreshIcon />}
            onClick={refreshProjects}
          />
        </div>
      </div>

      {/* Project list */}
      <div
        className={`project-manager__content ${viewMode === 'list' ? 'project-manager__content--list' : ''}`}
      >
        {filteredProjects.length === 0 ? (
          <Empty
            description={
              searchQuery ? '没有找到匹配的项目' : '还没有项目，点击"新建项目"开始创作'
            }
          />
        ) : (
          <div
            className={`project-manager__grid ${viewMode === 'list' ? 'project-manager__grid--list' : ''}`}
          >
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                isSelected={selectedProjectId === project.id}
                onClick={handleProjectClick}
                onDoubleClick={handleProjectDoubleClick}
                onToggleStar={handleToggleStar}
                onRename={handleRenameClick}
                onDuplicate={handleDuplicateClick}
                onArchive={handleToggleArchive}
                onDelete={handleDeleteClick}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create project dialog */}
      <CreateProjectDialog
        visible={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreate={handleCreateProject}
      />

      {/* Delete confirmation dialog */}
      <Dialog
        visible={showDeleteDialog}
        header="删除项目"
        body={`确定要删除项目「${projectToDelete?.name}」吗？此操作无法撤销。`}
        confirmBtn={{ content: '删除', theme: 'danger' }}
        cancelBtn="取消"
        onConfirm={handleConfirmDelete}
        onClose={() => setShowDeleteDialog(false)}
        onCancel={() => setShowDeleteDialog(false)}
      />

      {/* Rename dialog */}
      <Dialog
        visible={showRenameDialog}
        header="重命名项目"
        confirmBtn="确定"
        cancelBtn="取消"
        onConfirm={handleConfirmRename}
        onClose={() => setShowRenameDialog(false)}
        onCancel={() => setShowRenameDialog(false)}
      >
        <Input
          value={newName}
          onChange={(value) => setNewName(value as string)}
          placeholder="请输入新的项目名称"
          autoFocus
        />
      </Dialog>
    </div>
  );
};
