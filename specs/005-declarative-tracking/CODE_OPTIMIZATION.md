# 代码优化清单

**Date**: 2025-12-05
**Purpose**: 检查并优化声明式埋点系统的代码质量

## 问题与修复

### ✅ 1. 删除未使用的导入

**文件**: `packages/drawnix/src/components/toolbar/app-toolbar/app-menu-items.tsx`

**问题**: 导入了 `MenuItemLink` 但从未使用

**修复**:
```diff
- import MenuItemLink from '../../menu/menu-item-link';
```

**影响**: 无，纯清理未使用的导入

---

### ⚠️ 2. 未集成的离线缓存功能

**文件**: `packages/drawnix/src/services/tracking/tracking-service.ts`

**问题**: `storageService` 被初始化但从未使用

```typescript
// Line 42: 初始化了但从未调用
private storageService: TrackingStorageService;

// Line 69: 只在构造函数中创建实例
this.storageService = new TrackingStorageService(this.config.cacheConfig);
```

**分析**:
- `TrackingStorageService` 类已完整实现（包含单元测试）
- 功能：缓存失败的事件到 IndexedDB（最多 100 个，保留 1 小时）
- 问题：未集成到实际的上报流程中
- `BatchService` 的失败处理只是重新入队，没有持久化缓存

**两种选择**:

#### 选项 A: 删除未使用的代码（推荐，符合用户要求）

**优点**:
- 代码更简洁
- 移除未使用的依赖
- 减少包体积

**缺点**:
- 失去离线缓存能力
- 需要删除相关代码和测试

**需要删除的文件**:
- `tracking-storage-service.ts` (174 行)
- `__tests__/tracking-storage-service.test.ts` (210 行)
- `tracking-service.ts` 中的 storageService 相关代码

#### 选项 B: 集成离线缓存功能

**优点**:
- 完整实现规范中的功能
- 提供真正的离线支持

**缺点**:
- 需要额外开发工作
- 需要更多测试
- 增加复杂度

**集成方案**:
```typescript
// 在 BatchService 中集成
private async flush(): Promise<void> {
  // ... existing code ...

  try {
    const results = await umamiAdapter.trackBatch(eventsToUpload);

    const failures = results.filter(r => !r.success);
    if (failures.length > 0) {
      // 新增：缓存失败的事件到 IndexedDB
      const failedEvents = eventsToUpload.filter((_, index) => !results[index].success);

      for (const event of failedEvents) {
        await this.storageService.cacheEvent(
          event,
          results.find(r => !r.success)?.error?.message || 'Unknown error'
        );
      }
    }
  } catch (error) {
    // 新增：缓存所有事件
    for (const event of eventsToUpload) {
      await this.storageService.cacheEvent(event, error.message);
    }
  }
}

// 新增：启动时恢复缓存的事件
async initialize(): Promise<void> {
  const cachedEvents = await this.storageService.getRetryableEvents(3);
  for (const cached of cachedEvents) {
    this.enqueue(cached.event);
  }
}
```

---

### 推荐方案

考虑到用户要求"去掉没用到的代码"，**推荐选择选项 A：删除未使用的代码**。

**理由**:
1. 当前实现已经有重试机制（requeueFailedEvents）
2. 离线缓存是"锦上添花"的功能，不是核心需求
3. IndexedDB 缓存会增加复杂度和调试难度
4. 批量上报已经大幅减少了网络请求失败的可能性

**后续**:
如果未来需要离线缓存，可以参考已删除的代码重新实现。

---

## 代码质量检查

### ✅ 已通过的检查

1. **TypeScript 类型检查**
   ```bash
   npx nx typecheck drawnix
   ```
   - 结果：✅ 无 data-track 相关类型错误
   - 其他错误都是预存在的（lodash, is-hotkey 等类型定义缺失）

2. **代码规范**
   - ✅ 所有文件 < 500 行
   - ✅ 使用 data-track 标准属性
   - ✅ 命名规范统一（snake_case 事件名）

3. **功能完整性**
   - ✅ 30 个工具栏按钮已添加埋点
   - ✅ 事件捕获正常工作
   - ✅ 批量上报正常工作
   - ✅ 防抖机制正常工作

### 未发现的问题

- ❌ 无重复代码
- ❌ 无死代码（除了 storageService）
- ❌ 无未使用的函数
- ❌ 无循环依赖

---

## 性能优化建议

### 1. 事件委托优化

**当前**: 每次点击都遍历 DOM 树寻找 `[data-track]` 元素

**优化**: 已经使用 `Element.closest()` 这是最优方案

### 2. WeakMap 防抖

**当前**: 使用 WeakMap 存储防抖状态

**优化**: 已经是最优方案，自动垃圾回收

### 3. 批量上报

**当前**: 10 个事件 OR 5 秒触发上报

**优化**: 已经是合理配置

---

## 文档更新

### ✅ 已更新

1. **CLAUDE.md**
   - ✅ 添加 Analytics & Tracking 章节
   - ✅ 说明双重埋点方式
   - ✅ 提供代码示例
   - ✅ 列出事件命名规范

2. **TOOLBAR_TRACKING.md**
   - ✅ 更新为 data-track 实现
   - ✅ 列出所有 30 个事件

3. **SIMPLIFICATION.md**
   - ✅ 记录从 track 到 data-track 的简化过程

### 需要更新

1. **INTEGRATION.md**
   - ⚠️ 移除"离线缓存支持"描述（如果删除 storageService）
   - ⚠️ 或明确标注为"计划中的功能"

2. **quickstart.md**
   - ⚠️ 确认示例代码使用 data-track

---

## 执行计划

### 立即执行（推荐）

1. ✅ 删除 `MenuItemLink` 未使用导入
2. ⏳ 删除未集成的 storageService 代码
3. ⏳ 更新文档，移除离线缓存相关描述
4. ⏳ 提交优化代码

### 未来优化（可选）

1. 如需离线缓存，重新集成 TrackingStorageService
2. 考虑为手动埋点也提供批量上报
3. 统一元数据注入策略

---

## 总结

**当前状态**:
- ✅ 核心功能完整且正常工作
- ✅ 代码质量良好
- ⚠️ 存在未使用的 storageService 代码

**推荐操作**:
删除未使用的离线缓存代码，保持代码简洁。如果未来需要，可以参考删除的代码重新实现。

**优化后的效果**:
- 代码更简洁
- 无未使用的依赖
- 减少约 400 行未使用代码
- 降低维护成本
