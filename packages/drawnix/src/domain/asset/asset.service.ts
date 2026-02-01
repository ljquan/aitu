/**
 * Asset Service
 *
 * Business logic layer for asset management.
 * Provides a unified interface to access assets from multiple sources:
 * - Local uploads (from assetStorageService)
 * - AI-generated content (from completed tasks)
 * - Cached media (from unifiedCacheService)
 *
 * This service provides:
 * - Unified asset listing with deduplication
 * - Filtering and pagination
 * - Domain event publishing
 */

import { Subject, Observable, Subscription } from 'rxjs';
import type {
  Asset,
  StoredAsset,
  AddAssetData,
  FilterState,
  StorageQuota,
  StorageStats,
  AssetDomainFilter,
  AssetPaginationParams,
  AssetBatchResult,
} from './asset.model';
import {
  AssetType,
  AssetSource,
  DEFAULT_FILTER_STATE,
} from './asset.model';
import { assetStorageService } from '../../services/asset-storage-service';
import { taskService } from '../task/task.service';
import { domainEventBus } from '../shared/event-bus';

// ============================================================================
// Types
// ============================================================================

/**
 * Asset event for internal use
 */
interface AssetEvent {
  type: 'imported' | 'updated' | 'deleted' | 'batchDeleted';
  assetId?: string;
  assetIds?: string[];
  asset?: Asset;
  timestamp: number;
}

// ============================================================================
// Asset Service Implementation
// ============================================================================

/**
 * Asset Service
 *
 * Provides high-level asset management operations.
 */
class AssetService {
  private static instance: AssetService;
  
  /** Event subject for asset updates */
  private events$ = new Subject<AssetEvent>();
  
  /** Cached assets from local storage */
  private cachedAssets: Asset[] = [];
  
  /** Last load timestamp */
  private lastLoadTime = 0;
  
  /** Cache TTL in milliseconds (30 seconds) */
  private cacheTTL = 30000;
  
  /** Initialization state */
  private initialized = false;

  private constructor() {}

  static getInstance(): AssetService {
    if (!AssetService.instance) {
      AssetService.instance = new AssetService();
    }
    return AssetService.instance;
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Initialize the asset service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    await assetStorageService.initialize();
    this.initialized = true;
  }

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  // ============================================================================
  // Asset Operations
  // ============================================================================

  /**
   * Load all assets from all sources
   * Combines local uploads and AI-generated assets
   */
  async loadAssets(forceRefresh = false): Promise<Asset[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Check cache validity
    const now = Date.now();
    if (!forceRefresh && this.cachedAssets.length > 0 && (now - this.lastLoadTime) < this.cacheTTL) {
      return this.cachedAssets;
    }

    // Load from local storage
    const localAssets = await assetStorageService.getAllAssets();
    
    // Load from completed tasks (AI-generated)
    const aiAssets = await this.loadAIGeneratedAssets();
    
    // Merge and deduplicate by URL
    const assetMap = new Map<string, Asset>();
    
    // Local assets have priority
    for (const asset of localAssets) {
      assetMap.set(asset.url, asset);
    }
    
    // Add AI assets if not already present
    for (const asset of aiAssets) {
      if (!assetMap.has(asset.url)) {
        assetMap.set(asset.url, asset);
      }
    }
    
    this.cachedAssets = Array.from(assetMap.values());
    this.lastLoadTime = now;
    
    return this.cachedAssets;
  }

  /**
   * Get filtered assets
   */
  async getFilteredAssets(filter: Partial<FilterState>): Promise<Asset[]> {
    const assets = await this.loadAssets();
    const mergedFilter = { ...DEFAULT_FILTER_STATE, ...filter };
    
    return this.applyFilter(assets, mergedFilter);
  }

  /**
   * Get asset by ID
   */
  async getAssetById(id: string): Promise<Asset | null> {
    // Check cache first
    const cached = this.cachedAssets.find(a => a.id === id);
    if (cached) return cached;
    
    // Try local storage
    return assetStorageService.getAssetById(id);
  }

  /**
   * Add a new asset
   */
  async addAsset(data: AddAssetData): Promise<Asset> {
    if (!this.initialized) {
      await this.initialize();
    }

    const asset = await assetStorageService.addAsset(data);
    
    // Update cache
    this.cachedAssets.push(asset);
    
    // Emit event
    this.emitEvent('imported', asset);
    
    // Publish to domain event bus
    domainEventBus.publish({
      type: 'asset:imported',
      assetId: asset.id,
      assetType: asset.type === AssetType.IMAGE ? 'image' : 'video',
      url: asset.url,
      timestamp: Date.now(),
    });
    
    return asset;
  }

  /**
   * Add asset from file
   */
  async addAssetFromFile(
    file: File | Blob,
    type: AssetType,
    source: AssetSource,
    name?: string
  ): Promise<Asset> {
    const fileName = name || (file instanceof File ? file.name : `asset_${Date.now()}`);
    const mimeType = file.type || 'application/octet-stream';
    
    return this.addAsset({
      type,
      source,
      name: fileName,
      blob: file,
      mimeType,
    });
  }

  /**
   * Rename an asset
   */
  async renameAsset(id: string, newName: string): Promise<void> {
    await assetStorageService.renameAsset(id, newName);
    
    // Update cache
    const cachedIndex = this.cachedAssets.findIndex(a => a.id === id);
    if (cachedIndex !== -1) {
      this.cachedAssets[cachedIndex] = {
        ...this.cachedAssets[cachedIndex],
        name: newName,
      };
    }
    
    this.emitEvent('updated', undefined, id);
  }

  /**
   * Remove an asset
   */
  async removeAsset(id: string): Promise<void> {
    await assetStorageService.removeAsset(id);
    
    // Update cache
    this.cachedAssets = this.cachedAssets.filter(a => a.id !== id);
    
    // Emit event
    this.emitEvent('deleted', undefined, id);
    
    // Publish to domain event bus
    domainEventBus.publish({
      type: 'asset:deleted',
      assetId: id,
      timestamp: Date.now(),
    });
  }

  /**
   * Remove multiple assets
   */
  async removeAssets(ids: string[]): Promise<AssetBatchResult> {
    const successIds: string[] = [];
    const failedIds: Array<{ id: string; error: string }> = [];
    
    for (const id of ids) {
      try {
        await assetStorageService.removeAsset(id);
        successIds.push(id);
        this.cachedAssets = this.cachedAssets.filter(a => a.id !== id);
      } catch (error) {
        failedIds.push({
          id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
    
    if (successIds.length > 0) {
      this.events$.next({
        type: 'batchDeleted',
        assetIds: successIds,
        timestamp: Date.now(),
      });
    }
    
    return {
      successIds,
      failedIds,
      totalProcessed: ids.length,
    };
  }

  /**
   * Clear all assets
   */
  async clearAll(): Promise<void> {
    await assetStorageService.clearAll();
    this.cachedAssets = [];
    this.lastLoadTime = 0;
  }

  // ============================================================================
  // Storage Management
  // ============================================================================

  /**
   * Check storage quota
   */
  async checkQuota(): Promise<StorageQuota> {
    return assetStorageService.checkQuota();
  }

  /**
   * Check if can add asset with given size
   */
  async canAddAsset(blobSize: number): Promise<boolean> {
    return assetStorageService.canAddAsset(blobSize);
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<StorageStats> {
    return assetStorageService.getStorageStats();
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Store base64 data as asset
   */
  async storeBase64AsAsset(
    base64DataUrl: string,
    filename?: string
  ): Promise<{ virtualUrl: string; assetId: string }> {
    return assetStorageService.storeBase64AsAsset(base64DataUrl, filename);
  }

  /**
   * Invalidate cache (force refresh on next load)
   */
  invalidateCache(): void {
    this.lastLoadTime = 0;
  }

  // ============================================================================
  // Observable
  // ============================================================================

  /**
   * Observe asset events
   */
  observe(): Observable<AssetEvent> {
    return this.events$.asObservable();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Load AI-generated assets from completed tasks
   */
  private async loadAIGeneratedAssets(): Promise<Asset[]> {
    const completedTasks = taskService.getTasksByStatus('completed');
    const assets: Asset[] = [];
    
    for (const task of completedTasks) {
      if (!task.result?.url) continue;
      
      const asset: Asset = {
        id: task.id,
        type: task.type === 'video' ? AssetType.VIDEO : AssetType.IMAGE,
        source: AssetSource.AI_GENERATED,
        url: task.result.url,
        name: task.params.prompt?.substring(0, 50) || `AI_${task.type}_${task.id}`,
        mimeType: task.type === 'video' ? 'video/mp4' : 'image/png',
        createdAt: task.completedAt || task.createdAt,
        size: task.result.size,
        prompt: task.params.prompt,
        modelName: task.params.model,
        thumbnail: task.result.thumbnailUrl,
      };
      
      assets.push(asset);
    }
    
    return assets;
  }

  /**
   * Apply filter to assets
   */
  private applyFilter(assets: Asset[], filter: FilterState): Asset[] {
    let result = [...assets];
    
    // Filter by type
    if (filter.activeType !== 'ALL') {
      result = result.filter(a => a.type === filter.activeType);
    }
    
    // Filter by source
    if (filter.activeSource !== 'ALL') {
      result = result.filter(a => a.source === filter.activeSource);
    }
    
    // Filter by search query
    if (filter.searchQuery) {
      const query = filter.searchQuery.toLowerCase();
      result = result.filter(a => 
        a.name.toLowerCase().includes(query) ||
        a.prompt?.toLowerCase().includes(query)
      );
    }
    
    // Sort
    result = this.sortAssets(result, filter.sortBy);
    
    return result;
  }

  /**
   * Sort assets
   */
  private sortAssets(assets: Asset[], sortBy: string): Asset[] {
    return [...assets].sort((a, b) => {
      switch (sortBy) {
        case 'DATE_DESC':
          return b.createdAt - a.createdAt;
        case 'DATE_ASC':
          return a.createdAt - b.createdAt;
        case 'NAME_ASC':
          return a.name.localeCompare(b.name);
        case 'NAME_DESC':
          return b.name.localeCompare(a.name);
        case 'SIZE_ASC':
          return (a.size || 0) - (b.size || 0);
        case 'SIZE_DESC':
          return (b.size || 0) - (a.size || 0);
        default:
          return b.createdAt - a.createdAt;
      }
    });
  }

  private emitEvent(type: AssetEvent['type'], asset?: Asset, assetId?: string): void {
    this.events$.next({
      type,
      assetId,
      asset,
      timestamp: Date.now(),
    });
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.events$.complete();
    assetStorageService.cleanup();
  }
}

// Export singleton instance
export const assetService = AssetService.getInstance();
