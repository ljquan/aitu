/**
 * View Mode Toggle
 * 视图模式切换组件
 */

import { memo, useCallback } from 'react';
import { Tooltip } from 'tdesign-react';
import { Grid3X3, LayoutGrid, List } from 'lucide-react';
import type { ViewMode } from '../../types/asset.types';
import './ViewModeToggle.scss';

interface ViewModeToggleProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

const VIEW_MODE_CONFIG: {
  mode: ViewMode;
  icon: React.ReactNode;
  label: string;
}[] = [
  { mode: 'grid', icon: <LayoutGrid size={16} />, label: '默认网格' },
  { mode: 'compact', icon: <Grid3X3 size={16} />, label: '紧凑网格' },
  { mode: 'list', icon: <List size={16} />, label: '列表视图' },
];

export const ViewModeToggle = memo<ViewModeToggleProps>(
  ({ viewMode, onViewModeChange }) => {
    const handleModeChange = useCallback(
      (mode: ViewMode) => {
        if (mode !== viewMode) {
          onViewModeChange(mode);
        }
      },
      [viewMode, onViewModeChange]
    );

    return (
      <div className="view-mode-toggle">
        {VIEW_MODE_CONFIG.map(({ mode, icon, label }) => (
          <Tooltip key={mode} content={label} theme="light">
            <button
              className={`view-mode-toggle__btn ${viewMode === mode ? 'view-mode-toggle__btn--active' : ''}`}
              onClick={() => handleModeChange(mode)}
              data-track={`view_mode_${mode}`}
              aria-label={label}
            >
              {icon}
            </button>
          </Tooltip>
        ))}
      </div>
    );
  }
);

ViewModeToggle.displayName = 'ViewModeToggle';
