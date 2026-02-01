/**
 * Unified Asset Domain Model
 *
 * This module re-exports asset types from the existing types file
 * and provides additional domain-specific utilities.
 *
 * The existing asset.types.ts already has well-defined types,
 * so we primarily re-export and add domain layer integration.
 */

// Re-export all types from the existing asset types
export {
  AssetType,
  AssetSource,
  SelectionMode,
  DEFAULT_FILTER_STATE,
  createAsset,
  storedAssetToAsset,
  assetToStoredAsset,
} from '../../types/asset.types';

export type {
  Asset,
  StoredAsset,
  LegacyStoredAsset,
  AddAssetData,
  AssetTypeFilter,
  AssetSourceFilter,
  SortOption,
  ViewMode,
  FilterState,
  MediaLibraryConfig,
  StorageQuota,
  StorageStatus,
  StorageStats,
  AssetContextState,
  AssetContextActions,
  AssetContextValue,
  FilteredAssetsResult,
  MediaLibraryModalProps,
  AssetGridItemProps,
  AssetListItemProps,
  MediaLibrarySidebarProps,
  MediaLibraryInspectorProps,
  MediaLibraryGridProps,
  MediaLibraryStorageBarProps,
} from '../../types/asset.types';

// ============================================================================
// Domain-Specific Extensions
// ============================================================================

/**
 * Asset event types for the domain event bus
 */
export type AssetEventType =
  | 'asset:imported'
  | 'asset:updated'
  | 'asset:deleted'
  | 'asset:batchDeleted'
  | 'asset:renamed';

/**
 * Asset filter for domain queries
 */
export interface AssetDomainFilter {
  /** Filter by asset type */
  type?: 'IMAGE' | 'VIDEO';
  /** Filter by source */
  source?: 'LOCAL' | 'AI_GENERATED';
  /** Search query */
  searchQuery?: string;
  /** Filter by creation time (start) */
  createdAfter?: number;
  /** Filter by creation time (end) */
  createdBefore?: number;
}

/**
 * Asset pagination parameters
 */
export interface AssetPaginationParams {
  /** Offset for pagination */
  offset: number;
  /** Limit per page */
  limit: number;
  /** Sort order */
  sortBy?: 'DATE_DESC' | 'DATE_ASC' | 'NAME_ASC' | 'NAME_DESC' | 'SIZE_ASC' | 'SIZE_DESC';
}

/**
 * Asset batch operation result
 */
export interface AssetBatchResult {
  /** Successfully processed asset IDs */
  successIds: string[];
  /** Failed asset IDs with errors */
  failedIds: Array<{ id: string; error: string }>;
  /** Total processed count */
  totalProcessed: number;
}
