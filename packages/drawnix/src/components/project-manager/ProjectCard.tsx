/**
 * ProjectCard Component
 *
 * Displays a single project as a card in the project list.
 * Shows thumbnail, name, last modified time, and action buttons.
 */

import React, { useCallback } from 'react';
import { Dropdown, Tooltip } from 'tdesign-react';
import {
  Icon,
  StarIcon,
  StarFilledIcon,
  MoreIcon,
  DeleteIcon,
  EditIcon,
  FileCopyIcon,
  FolderBlockedIcon,
} from 'tdesign-icons-react';
import { ProjectMetadata } from '../../types/project.types';
import './project-card.scss';

export interface ProjectCardProps {
  /** Project metadata */
  project: ProjectMetadata;
  /** Whether this project is selected */
  isSelected?: boolean;
  /** Called when card is clicked */
  onClick?: (project: ProjectMetadata) => void;
  /** Called when card is double-clicked (open project) */
  onDoubleClick?: (project: ProjectMetadata) => void;
  /** Called when star button is clicked */
  onToggleStar?: (project: ProjectMetadata) => void;
  /** Called when rename is selected */
  onRename?: (project: ProjectMetadata) => void;
  /** Called when duplicate is selected */
  onDuplicate?: (project: ProjectMetadata) => void;
  /** Called when archive is selected */
  onArchive?: (project: ProjectMetadata) => void;
  /** Called when delete is selected */
  onDelete?: (project: ProjectMetadata) => void;
}

/**
 * Formats a timestamp to relative time string
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 30) {
    return new Date(timestamp).toLocaleDateString('zh-CN');
  } else if (days > 0) {
    return `${days}天前`;
  } else if (hours > 0) {
    return `${hours}小时前`;
  } else if (minutes > 0) {
    return `${minutes}分钟前`;
  } else {
    return '刚刚';
  }
}

/**
 * Formats file size to human readable string
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

/**
 * ProjectCard component
 */
export const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  isSelected = false,
  onClick,
  onDoubleClick,
  onToggleStar,
  onRename,
  onDuplicate,
  onArchive,
  onDelete,
}) => {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onClick?.(project);
    },
    [onClick, project]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDoubleClick?.(project);
    },
    [onDoubleClick, project]
  );

  const handleStarClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleStar?.(project);
    },
    [onToggleStar, project]
  );

  const handleMenuClick = useCallback(
    (data: { value: string }) => {
      switch (data.value) {
        case 'rename':
          onRename?.(project);
          break;
        case 'duplicate':
          onDuplicate?.(project);
          break;
        case 'archive':
          onArchive?.(project);
          break;
        case 'delete':
          onDelete?.(project);
          break;
      }
    },
    [project, onRename, onDuplicate, onArchive, onDelete]
  );

  const dropdownOptions = [
    {
      content: '重命名',
      value: 'rename',
      prefixIcon: <EditIcon />,
    },
    {
      content: '复制',
      value: 'duplicate',
      prefixIcon: <FileCopyIcon />,
    },
    {
      content: project.isArchived ? '取消归档' : '归档',
      value: 'archive',
      prefixIcon: <FolderBlockedIcon />,
    },
    {
      content: '删除',
      value: 'delete',
      prefixIcon: <DeleteIcon />,
      theme: 'error' as const,
    },
  ];

  return (
    <div
      className={`project-card ${isSelected ? 'project-card--selected' : ''}`}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      {/* Thumbnail */}
      <div className="project-card__thumbnail">
        {project.thumbnail ? (
          <img src={project.thumbnail} alt={project.name} />
        ) : (
          <div className="project-card__thumbnail-placeholder">
            <Icon name="file" size="48px" />
          </div>
        )}

        {/* Star button overlay */}
        <Tooltip content={project.isStarred ? '取消收藏' : '收藏'} theme="light">
          <button
            className={`project-card__star ${project.isStarred ? 'project-card__star--active' : ''}`}
            onClick={handleStarClick}
          >
            {project.isStarred ? <StarFilledIcon /> : <StarIcon />}
          </button>
        </Tooltip>

        {/* Archived badge */}
        {project.isArchived && (
          <div className="project-card__badge project-card__badge--archived">
            已归档
          </div>
        )}
      </div>

      {/* Info section */}
      <div className="project-card__info">
        <div className="project-card__header">
          <h3 className="project-card__name" title={project.name}>
            {project.name}
          </h3>

          {/* More actions dropdown */}
          <Dropdown
            options={dropdownOptions}
            onClick={handleMenuClick}
            trigger="click"
            placement="bottom-right"
          >
            <button
              className="project-card__more"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreIcon />
            </button>
          </Dropdown>
        </div>

        <div className="project-card__meta">
          <span className="project-card__time">
            {formatRelativeTime(project.updatedAt)}
          </span>
          <span className="project-card__separator">·</span>
          <span className="project-card__size">{formatFileSize(project.size)}</span>
          <span className="project-card__separator">·</span>
          <span className="project-card__count">{project.elementCount} 个元素</span>
        </div>

        {/* Tags */}
        {project.tags && project.tags.length > 0 && (
          <div className="project-card__tags">
            {project.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="project-card__tag">
                {tag}
              </span>
            ))}
            {project.tags.length > 3 && (
              <span className="project-card__tag project-card__tag--more">
                +{project.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
