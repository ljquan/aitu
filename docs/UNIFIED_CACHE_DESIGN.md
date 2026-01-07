# 统一图片缓存方案设计文档

## 文档信息

- **创建日期**: 2026-01-07
- **版本**: 1.0
- **状态**: 实现中

## 背景

当前项目中存在三个独立的缓存系统：
1. Service Worker 的 Cache API（`drawnix-images`）
2. 应用层的 Media Cache Service（`drawnix-media-cache` IndexedDB）
3. 应用层的 URL Cache Service（`aitu-url-cache` IndexedDB）

这种分散的缓存架构导致了以下问题：
- 缓存逻辑不统一，维护困难
- Service Worker 缓存没有任务元数据（模型、提示词、参数）
- 无法根据缓存时间智能决策传 URL 还是 base64
- 缺少缓存满时的用户友好提示

## 设计目标

1. **统一缓存管理**：一个服务协调 SW 和应用层缓存
2. **完整元数据存储**：记录缓存时间、生成参数、模型信息
3. **智能图片传递**：调用 AI 接口时，1天内用 URL，超过1天用 base64
4. **用户可控清理**：缓存满时提示打开素材库手动删除
5. **向下兼容**：从旧数据库迁移数据

## 架构设计

### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                      浏览器主线程                              │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Unified Cache Manager (统一缓存管理器)                │   │
│  │                                                        │   │
│  │  - 协调 SW 和 IndexedDB                               │   │
│  │  - 处理元数据存储                                      │   │
│  │  - 智能图片传递逻辑                                    │   │
│  │  - 缓存满检测和提示                                    │   │
│  └──────────────────────────────────────────────────────┘   │
│                          ↕ (postMessage)                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         IndexedDB: drawnix-unified-cache              │   │
│  │                                                        │   │
│  │  存储结构：                                             │   │
│  │  - url (主键)                                          │   │
│  │  - type, mimeType, size                               │   │
│  │  - cachedAt, lastUsed                                 │   │
│  │  - metadata: { taskId, prompt, model, params }        │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                             ↕ (fetch intercept)
┌─────────────────────────────────────────────────────────────┐
│                    Service Worker 线程                        │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  图片请求拦截器                                         │   │
│  │                                                        │   │
│  │  1. 拦截图片请求                                        │   │
│  │  2. 检查 Cache API                                     │   │
│  │     ↓ 命中 → 直接返回                                  │   │
│  │     ↓ 未命中 → 从网络获取                              │   │
│  │  3. 存入 Cache API                                     │   │
│  │  4. 通知主线程更新 IndexedDB 元数据                    │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         Cache API: drawnix-images                      │   │
│  │  (快速响应，不存元数据)                                 │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 数据库结构

#### IndexedDB: `drawnix-unified-cache`

```typescript
interface CachedMedia {
  url: string;              // 主键
  type: 'image' | 'video';
  mimeType: string;
  size: number;             // 字节数
  cachedAt: number;         // 缓存时间戳
  lastUsed: number;         // 最后使用时间戳
  metadata: {
    taskId?: string;        // 任务ID
    prompt?: string;        // 生成提示词
    model?: string;         // 使用的模型
    params?: any;           // 生成参数
    [key: string]: any;     // 扩展字段
  };
}
```

**索引**：
- `url` (主键)
- `cachedAt` (用于按时间排序)
- `lastUsed` (用于 LRU 清理)

### 核心流程

#### 1. 图片生成并插入画布

```
任务完成 → 获得图片 URL
  ↓
插入画布（使用原始 URL，不变更现有逻辑）
  ↓
浏览器发起图片请求
  ↓
SW 拦截请求
  ↓
检查 Cache API
  ├─ 命中 → 立即返回缓存
  └─ 未命中
     ↓
     从网络获取图片
     ↓
     存入 Cache API
     ↓
     postMessage 通知主线程
     {
       type: 'IMAGE_CACHED',
       url: '...',
       size: 12345,
       mimeType: 'image/png'
     }
     ↓
主线程收到消息
  ↓
存入 IndexedDB (包含元数据)
```

#### 2. 调用 AI 接口传递图片

```
需要传图片给 AI 接口
  ↓
调用 UnifiedCacheManager.getImageForAI(url)
  ↓
查询 IndexedDB 获取 cachedAt
  ↓
计算 age = Date.now() - cachedAt
  ↓
age < 24小时？
  ├─ 是 → 返回 { type: 'url', value: originalUrl }
  └─ 否
     ↓
     从 Cache API 获取 blob（通过 fetch）
     ↓
     压缩图片（如果需要）
     ↓
     转换为 base64
     ↓
     返回 { type: 'base64', value: base64Data }
```

#### 3. 缓存满处理

```
Cache API 或 IndexedDB 写入失败
  ↓
捕获 QuotaExceededError
  ↓
触发 onQuotaExceeded 回调
  ↓
显示 TDesign Dialog:
"缓存空间已满，是否打开素材库清理缓存？"
[取消] [打开素材库]
  ↓
用户点击"打开素材库"
  ↓
打开媒体库面板（显示所有缓存项）
  ↓
用户选择并删除缓存项
  ↓
删除流程：
  1. 从 IndexedDB 删除记录
  2. postMessage 通知 SW 删除 Cache API 条目
  3. 刷新缓存列表
```

## API 设计

### UnifiedCacheService

```typescript
class UnifiedCacheService {
  /**
   * 注册图片元数据（任务完成时调用）
   */
  async registerImageMetadata(
    url: string,
    metadata: {
      taskId: string;
      prompt?: string;
      model?: string;
      params?: any;
    }
  ): Promise<void>;

  /**
   * 获取适合传给 AI 的图片数据
   * 自动决策返回 URL 或 base64
   */
  async getImageForAI(
    url: string,
    options?: {
      maxAge?: number;        // 默认 24 小时
      maxSize?: number;       // 最大文件大小（超过则压缩）
      quality?: number;       // 压缩质量 0-1
    }
  ): Promise<{
    type: 'url' | 'base64';
    value: string;
  }>;

  /**
   * 获取缓存信息
   */
  async getCacheInfo(url: string): Promise<{
    isCached: boolean;
    cachedAt?: number;
    age?: number;
    size?: number;
    metadata?: any;
  }>;

  /**
   * 手动缓存图片
   */
  async cacheImage(
    url: string,
    metadata?: any
  ): Promise<boolean>;

  /**
   * 删除缓存
   */
  async deleteCache(url: string): Promise<void>;

  /**
   * 批量删除缓存
   */
  async deleteCacheBatch(urls: string[]): Promise<number>;

  /**
   * 获取所有缓存项元数据
   */
  async getAllCacheMetadata(): Promise<CachedMedia[]>;

  /**
   * 获取存储使用情况
   */
  async getStorageUsage(): Promise<{
    used: number;
    quota: number;
    percentage: number;
  }>;

  /**
   * 清空所有缓存
   */
  async clearAllCache(): Promise<void>;

  /**
   * 监听缓存满事件
   */
  onQuotaExceeded(callback: () => void): () => void;

  /**
   * 订阅缓存变化
   */
  subscribe(callback: () => void): () => void;
}
```

### Service Worker 消息协议

#### 主线程 → SW

```typescript
// 删除缓存请求
{
  type: 'DELETE_CACHE',
  url: string
}

// 批量删除缓存请求
{
  type: 'DELETE_CACHE_BATCH',
  urls: string[]
}

// 清空所有缓存
{
  type: 'CLEAR_ALL_CACHE'
}
```

#### SW → 主线程

```typescript
// 图片已缓存通知
{
  type: 'IMAGE_CACHED',
  url: string,
  size: number,
  mimeType: string,
  timestamp: number
}

// 缓存已删除通知
{
  type: 'CACHE_DELETED',
  url: string
}

// 缓存空间不足警告
{
  type: 'QUOTA_WARNING',
  usage: number,
  quota: number
}
```

## 数据迁移方案

### 迁移步骤

1. **检测旧数据库**
   - 检查 `aitu-media-cache` 是否存在
   - 检查 `aitu-url-cache` 是否存在

2. **创建新数据库**
   - 打开 `drawnix-unified-cache`
   - 创建 object store 和索引

3. **迁移 Media Cache 数据**
   ```typescript
   // 从 aitu-media-cache.media 读取
   oldRecord = {
     url, originalUrl, taskId, prompt,
     blob, type, mimeType, size, cachedAt
   }

   // 转换为新格式
   newRecord = {
     url: oldRecord.originalUrl || oldRecord.url,
     type: oldRecord.type,
     mimeType: oldRecord.mimeType,
     size: oldRecord.size,
     cachedAt: oldRecord.cachedAt || Date.now(),
     lastUsed: Date.now(),
     metadata: {
       taskId: oldRecord.taskId,
       prompt: oldRecord.prompt
     }
   }
   ```

4. **迁移 URL Cache 数据**
   ```typescript
   // 从 aitu-url-cache.media-cache 读取
   oldRecord = {
     url, type, data (base64), blob, mimeType, size, cachedAt
   }

   // 转换为新格式（不迁移 blob，让 SW 重新缓存）
   newRecord = {
     url: oldRecord.url,
     type: oldRecord.type,
     mimeType: oldRecord.mimeType,
     size: oldRecord.size,
     cachedAt: oldRecord.cachedAt || Date.now(),
     lastUsed: Date.now(),
     metadata: {}
   }
   ```

5. **删除旧数据库**
   ```typescript
   indexedDB.deleteDatabase('aitu-media-cache');
   indexedDB.deleteDatabase('aitu-url-cache');
   ```

6. **记录迁移状态**
   - localStorage 设置标记：`drawnix_cache_migrated: 'true'`

### 迁移触发时机

- 应用启动时自动检测并迁移
- 迁移过程显示进度提示（可选）
- 迁移完成后发送通知

## 实现计划

### Phase 1: 基础服务实现（核心）

- [x] 创建设计文档
- [ ] 实现 `UnifiedCacheService` 类
- [ ] 实现 IndexedDB 操作
- [ ] 实现与 SW 的通信协议
- [ ] 实现数据迁移逻辑

### Phase 2: Service Worker 集成

- [ ] 修改 SW 图片缓存逻辑
- [ ] 添加缓存通知消息
- [ ] 实现 SW 端的缓存删除响应

### Phase 3: 智能传递逻辑

- [ ] 实现 `getImageForAI()` 方法
- [ ] 添加图片压缩功能
- [ ] 添加缓存时间检测

### Phase 4: UI 集成

- [ ] 更新 TaskItem 使用新服务
- [ ] 实现缓存满提示 Dialog
- [ ] 更新媒体库显示缓存信息
- [ ] 添加缓存管理 UI

### Phase 5: 测试与优化

- [ ] 单元测试
- [ ] 集成测试
- [ ] 性能优化
- [ ] 文档完善

## 注意事项

1. **缓存策略**
   - Service Worker 的 Cache API 用于快速响应（不存元数据）
   - IndexedDB 用于元数据管理和查询
   - 不在 IndexedDB 中存储 blob，避免双重存储

2. **性能考虑**
   - SW 缓存命中后立即返回，不阻塞
   - 元数据更新使用异步消息，不影响图片加载速度
   - 批量操作使用事务优化

3. **兼容性**
   - 保持现有插入画布逻辑不变
   - 渐进式迁移，旧代码依然可用
   - 提供降级方案（如 SW 不可用）

4. **安全性**
   - 验证 URL 来源
   - 限制缓存大小
   - 清理过期缓存

## 参考资料

- [Service Worker API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [IndexedDB API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [Cache API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Cache)
- [Storage API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API)

## 更新日志

- 2026-01-07: 初始版本，完成架构设计
