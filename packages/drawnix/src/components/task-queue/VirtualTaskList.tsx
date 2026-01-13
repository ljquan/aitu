/**
 * VirtualTaskList Component
 *
 * A virtualized task list component that only renders visible items.
 * Uses @tanstack/react-virtual for efficient rendering of large lists.
 */

import React, { useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Task } from '../../types/task.types';
import { TaskItem } from './TaskItem';

// Empty set singleton to avoid creating new objects on each render
const EMPTY_SET = new Set<string>();

// Estimated height for task items
const TASK_ITEM_HEIGHT = 200;
const TASK_ITEM_GAP = 16;
const OVERSCAN_COUNT = 3;

export interface VirtualTaskListProps {
  tasks: Task[];
  selectionMode?: boolean;
  selectedTaskIds?: Set<string>;
  onSelectionChange?: (taskId: string, selected: boolean) => void;
  onRetry?: (taskId: string) => void;
  onDelete?: (taskId: string) => void;
  onDownload?: (taskId: string) => void;
  onInsert?: (taskId: string) => void;
  onEdit?: (taskId: string) => void;
  onPreviewOpen?: (taskId: string) => void;
  onExtractCharacter?: (taskId: string) => void;
  className?: string;
  emptyContent?: React.ReactNode;
}

// Threshold for enabling virtualization
const VIRTUALIZATION_THRESHOLD = 20;

/**
 * VirtualTaskList component with optional virtualization
 * Uses simple rendering for small lists, virtualization for large lists
 */
export const VirtualTaskList: React.FC<VirtualTaskListProps> = ({
  tasks,
  selectionMode = false,
  selectedTaskIds,
  onSelectionChange,
  onRetry,
  onDelete,
  onDownload,
  onInsert,
  onEdit,
  onPreviewOpen,
  onExtractCharacter,
  className = '',
  emptyContent,
}) => {
  const stableSelectedTaskIds = selectedTaskIds ?? EMPTY_SET;
  const parentRef = useRef<HTMLDivElement>(null);
  
  // Memoize task IDs for stable key generation
  const taskIds = useMemo(() => tasks.map(t => t.id), [tasks]);

  // Only use virtualization for large lists
  const useVirtualization = tasks.length > VIRTUALIZATION_THRESHOLD;

  // Create virtualizer only when needed
  const virtualizer = useVirtualizer({
    count: useVirtualization ? tasks.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => TASK_ITEM_HEIGHT + TASK_ITEM_GAP,
    overscan: OVERSCAN_COUNT,
    enabled: useVirtualization,
  });

  // Handle empty state
  if (tasks.length === 0) {
    return (
      <div className={`virtual-task-list virtual-task-list--empty ${className}`}>
        {emptyContent}
      </div>
    );
  }

  // Simple rendering for small lists
  if (!useVirtualization) {
    return (
      <div className={`virtual-task-list ${className}`}>
        {tasks.map((task) => (
          <TaskItem
            key={task.id}
            task={task}
            selectionMode={selectionMode}
            isSelected={stableSelectedTaskIds.has(task.id)}
            onSelectionChange={onSelectionChange}
            onRetry={onRetry}
            onDelete={onDelete}
            onDownload={onDownload}
            onInsert={onInsert}
            onEdit={onEdit}
            onPreviewOpen={() => onPreviewOpen?.(task.id)}
            onExtractCharacter={onExtractCharacter}
          />
        ))}
      </div>
    );
  }

  // Virtualized rendering for large lists
  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className={`virtual-task-list ${className}`}
      style={{
        height: '100%',
        overflow: 'auto',
      }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualItem) => {
          const task = tasks[virtualItem.index];
          if (!task) return null;

          return (
            <div
              key={task.id}
              data-index={virtualItem.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
                paddingBottom: `${TASK_ITEM_GAP}px`,
              }}
            >
              <TaskItem
                task={task}
                selectionMode={selectionMode}
                isSelected={stableSelectedTaskIds.has(task.id)}
                onSelectionChange={onSelectionChange}
                onRetry={onRetry}
                onDelete={onDelete}
                onDownload={onDownload}
                onInsert={onInsert}
                onEdit={onEdit}
                onPreviewOpen={() => onPreviewOpen?.(task.id)}
                onExtractCharacter={onExtractCharacter}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default VirtualTaskList;
