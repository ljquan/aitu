# 资源清理功能

## 概述

当本地上传的图片/视频资源（使用虚拟URL）缓存被删除或丢失时，系统会自动检测并从画布中删除对应的元素，避免显示加载失败的图片。同时，在素材库中删除资源时，也会自动删除画布上使用该资源的所有元素。

## 功能特性

### 1. 自动删除失效图片

- **触发条件**: 当画布上的图片元素加载失败时
- **适用范围**: 仅处理虚拟URL图片（`/asset-library/` 和 `/__aitu_cache__/` 开头的URL）
- **行为**: 自动从画布中删除对应的图片元素
- **日志**: 在控制台输出删除操作的日志信息

### 2. 素材库删除联动

- **触发条件**: 在素材库中删除本地上传的图片或视频
- **适用范围**: 删除单个素材或批量删除素材
- **行为**: 自动删除画布上所有使用该素材的元素
- **日志**: 在控制台输出删除的元素数量

### 3. 手动批量清理

- **入口**: 应用菜单 → "清理无效资源"
- **功能**: 扫描画布上所有图片元素，检查虚拟URL资源是否可用
- **行为**: 批量删除所有无效的图片元素
- **反馈**: 在控制台输出清理结果

## 技术实现

### 核心文件

- `packages/drawnix/src/utils/asset-cleanup.ts` - 资源清理工具函数
- `packages/drawnix/src/plugins/components/image.tsx` - 图片组件，处理加载失败事件
- `packages/drawnix/src/components/media-library/MediaLibraryModal.tsx` - 素材库弹窗，处理删除联动
- `packages/drawnix/src/components/media-library/MediaLibraryGrid.tsx` - 素材库网格，处理批量删除联动
- `packages/drawnix/src/components/toolbar/app-toolbar/app-menu-items.tsx` - 菜单项组件

### 主要函数

#### `isVirtualUrl(url: string): boolean`
检查URL是否为虚拟URL（素材库本地URL）

#### `extractAssetIdFromUrl(url: string): string | null`
从虚拟URL中提取素材ID

#### `handleVirtualUrlImageError(board, element, imageUrl): void`
处理虚拟URL图片加载失败，自动删除对应元素

#### `removeElementsByAssetId(board, assetId): number`
根据素材ID删除画布上使用该素材的所有元素

#### `removeElementsByAssetIds(board, assetIds): number`
根据多个素材ID批量删除画布上使用这些素材的所有元素

#### `cleanupMissingAssets(board): Promise<number>`
扫描并清理画布上所有无效的虚拟URL资源

## 使用场景

1. **Service Worker缓存清理**: 当浏览器缓存被清理后，虚拟URL资源不可用
2. **存储空间不足**: IndexedDB或Cache API存储空间不足导致资源丢失
3. **素材库删除**: 用户在素材库中删除素材时，自动清理画布上的引用
4. **手动清理**: 用户主动清理无效资源以优化画布性能

## 日志示例

```
[Image] Virtual URL asset not found, removing element: /asset-library/87501b99-6c6d-4053-8b38-37bfaabce9a3.png
[AssetCleanup] Successfully removed element: element-id-123
[MediaLibrary] Removed 2 canvas elements using asset: 87501b99-6c6d-4053-8b38-37bfaabce9a3
[MediaLibraryGrid] Removed 5 canvas elements using 3 assets
[AssetCleanup] Removed 3 elements with missing assets
```

## 注意事项

- 只处理虚拟URL资源，不影响外部URL图片/视频
- 删除操作不可撤销，建议用户定期保存项目
- 智能拆图功能继续使用base64格式，不受此功能影响
- 素材库删除会同步删除画布上的引用，用户需注意