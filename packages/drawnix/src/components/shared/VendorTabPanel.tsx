/**
 * VendorTabPanel - 厂商标签面板
 *
 * 左右分栏布局：左侧厂商标签栏（固定宽度），右侧内容区（children）
 * 用于 ModelDropdown、ModelSelector 等组件的厂商分类展示
 */

import React, { useCallback } from 'react';
import { ModelVendor, VENDOR_NAMES } from '../../constants/model-config';
import './vendor-tab-panel.scss';

export interface VendorTab {
  vendor: ModelVendor;
  count: number;
}

export interface VendorTabPanelProps {
  /** 厂商标签列表 */
  tabs: VendorTab[];
  /** 当前激活的厂商 */
  activeVendor: ModelVendor | null;
  /** 切换厂商回调 */
  onVendorChange: (vendor: ModelVendor) => void;
  /** 搜索关键词（非空时标签无激活态，点击清除搜索并切换） */
  searchQuery?: string;
  /** 右侧内容 */
  children: React.ReactNode;
  /** 紧凑模式（标签宽度缩小） */
  compact?: boolean;
}

export const VendorTabPanel: React.FC<VendorTabPanelProps> = ({
  tabs,
  activeVendor,
  onVendorChange,
  searchQuery,
  children,
  compact = false,
}) => {
  const isSearching = !!searchQuery?.trim();

  const handleTabClick = useCallback(
    (vendor: ModelVendor) => {
      onVendorChange(vendor);
    },
    [onVendorChange]
  );

  return (
    <div className={`vendor-tab-panel ${compact ? 'vendor-tab-panel--compact' : ''}`}>
      <div className="vendor-tab-panel__tabs">
        {tabs.map(({ vendor, count }) => {
          const isActive = !isSearching && activeVendor === vendor;
          return (
            <button
              key={vendor}
              className={`vendor-tab-panel__tab ${isActive ? 'vendor-tab-panel__tab--active' : ''}`}
              onClick={() => handleTabClick(vendor)}
              type="button"
            >
              {VENDOR_NAMES[vendor]}
              <span className="vendor-tab-panel__tab-count">{count}</span>
            </button>
          );
        })}
      </div>
      <div className="vendor-tab-panel__content">
        {children}
      </div>
    </div>
  );
};
