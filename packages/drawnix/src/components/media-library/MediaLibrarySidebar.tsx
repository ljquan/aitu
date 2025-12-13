/**
 * Media Library Sidebar
 * 素材库筛选侧边栏组件
 */

import { Button } from 'tdesign-react';
import {
  Grid,
  Image as ImageIcon,
  Video as VideoIcon,
  HardDrive,
  Cpu,
  Layers,
} from 'lucide-react';
import { AssetType } from '../../types/asset.types';
import { MediaLibraryStorageBar } from './MediaLibraryStorageBar';
import type { MediaLibrarySidebarProps } from '../../types/asset.types';
import './MediaLibrarySidebar.scss';

export function MediaLibrarySidebar({
  filters,
  assetCount,
  storageStatus,
  onFilterChange,
}: MediaLibrarySidebarProps) {
  return (
    <div className="media-library-sidebar">
      {/* 类型筛选 */}
      <div className="media-library-sidebar__section">
        <h3 className="media-library-sidebar__title">类型</h3>
        <div className="media-library-sidebar__buttons">
          <Button
            variant={filters.activeType === 'ALL' ? 'base' : 'outline'}
            onClick={() => onFilterChange({ activeType: 'ALL' })}
            block
            theme="default"
            data-track="sidebar_filter_type_all"
          >
            <Grid size={16} />
            <span>全部素材</span>
          </Button>
          <Button
            variant={filters.activeType === AssetType.IMAGE ? 'base' : 'outline'}
            onClick={() => onFilterChange({ activeType: AssetType.IMAGE })}
            block
            theme="default"
            data-track="sidebar_filter_type_image"
          >
            <ImageIcon size={16} />
            <span>图片</span>
          </Button>
          <Button
            variant={filters.activeType === AssetType.VIDEO ? 'base' : 'outline'}
            onClick={() => onFilterChange({ activeType: AssetType.VIDEO })}
            block
            theme="default"
            data-track="sidebar_filter_type_video"
          >
            <VideoIcon size={16} />
            <span>视频</span>
          </Button>
        </div>
      </div>

      {/* 来源筛选 */}
      <div className="media-library-sidebar__section">
        <h3 className="media-library-sidebar__title">来源</h3>
        <div className="media-library-sidebar__buttons">
          <Button
            variant={filters.activeSource === 'ALL' ? 'base' : 'outline'}
            onClick={() => onFilterChange({ activeSource: 'ALL' })}
            block
            theme="default"
            data-track="sidebar_filter_source_all"
          >
            <Layers size={16} />
            <span>全部来源</span>
          </Button>
          <Button
            variant={filters.activeSource === 'LOCAL' ? 'base' : 'outline'}
            onClick={() => onFilterChange({ activeSource: 'LOCAL' })}
            block
            theme="default"
            data-track="sidebar_filter_source_local"
          >
            <HardDrive size={16} />
            <span>本地上传</span>
          </Button>
          <Button
            variant={filters.activeSource === 'AI' ? 'base' : 'outline'}
            onClick={() => onFilterChange({ activeSource: 'AI' })}
            block
            theme="default"
            data-track="sidebar_filter_source_ai"
          >
            <Cpu size={16} />
            <span>AI生成</span>
          </Button>
        </div>
      </div>

      {/* 排序选项 */}
      <div className="media-library-sidebar__section">
        <h3 className="media-library-sidebar__title">排序</h3>
        <div className="media-library-sidebar__buttons">
          <Button
            variant={filters.sortBy === 'DATE_DESC' ? 'base' : 'outline'}
            onClick={() => onFilterChange({ sortBy: 'DATE_DESC' })}
            block
            size="small"
            theme="default"
            data-track="sidebar_sort_date_desc"
          >
            最新优先
          </Button>
          <Button
            variant={filters.sortBy === 'DATE_ASC' ? 'base' : 'outline'}
            onClick={() => onFilterChange({ sortBy: 'DATE_ASC' })}
            block
            size="small"
            theme="default"
            data-track="sidebar_sort_date_asc"
          >
            最旧优先
          </Button>
          <Button
            variant={filters.sortBy === 'NAME_ASC' ? 'base' : 'outline'}
            onClick={() => onFilterChange({ sortBy: 'NAME_ASC' })}
            block
            size="small"
            theme="default"
            data-track="sidebar_sort_name_asc"
          >
            名称排序
          </Button>
        </div>
      </div>

      {/* 存储状态 */}
      <div className="media-library-sidebar__section media-library-sidebar__section--storage">
        <MediaLibraryStorageBar
          assetCount={assetCount}
          storageStatus={storageStatus}
        />
      </div>
    </div>
  );
}
