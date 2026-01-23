# 内存优化分析与修复方案

## 问题分析

基于 `/sw-debug.html` 的内存日志分析，发现以下问题：

### 内存使用情况

| 指标 | 值 | 问题 |
|------|-----|------|
| 已使用内存 | 3.3-4.3 GB | 🔴 极高 |
| 内存上限 | 4 GB | 接近/超过上限 |
| 使用率 | 77-101% | 🔴 危险区域 |
| 图片数量 | 30 | 可能过多 |
| 视频数量 | 1 | - |
| Plait 元素 | 80 | 正常 |

### 关键发现

1. **启动时就有 ~3.5GB 内存** - 说明不是运行时泄漏，而是初始加载问题
2. **长任务期间内存飙升到 4.3GB** - 超过了 4GB 限制
3. **刷新后内存不降反升** - 每次刷新内存都在增长

## 问题根源

### 1. 高分辨率图片解码 (主要问题)

**问题描述**：
- 30 张图片在画布上全部解码到内存中
- 一张 4K 图片 (4096x2160) 解码后约 35MB
- 30 张高分辨率图片可能占用 300-1000MB

**代码位置**：
- `packages/drawnix/src/plugins/with-image.tsx`
- Plait 框架内部的图片渲染

### 2. 聊天附件 Base64 存储 (中等问题)

**问题描述**：
- 聊天消息的附件以 base64 字符串形式存储在 IndexedDB
- 一张 2MB 的图片转为 base64 后约 2.6MB
- 大量附件累积会占用大量存储和内存

**代码位置**：
```typescript
// packages/drawnix/src/types/chat.types.ts
export interface Attachment {
  data: string;  // Base64 编码，可能非常大
}
```

### 3. 任务数据累积

**问题描述**：
- 已完成的任务永久保存在 IndexedDB
- 任务结果包含 URL 引用，但工作流数据可能较大

**代码位置**：
- `apps/web/src/sw/task-queue/storage.ts`

### 4. 视频解码缓冲区

**问题描述**：
- 视频元素的解码缓冲区占用内存
- 即使视频暂停，缓冲区也可能保留

## 已实施的修复

### 1. 内存监控服务

添加了 `memory-monitor-service.ts`：

```typescript
// packages/drawnix/src/services/memory-monitor-service.ts

// 功能：
// - 周期性检查内存使用（每 30 秒）
// - 在内存压力过大时触发清理（75% 阈值）
// - 支持注册自定义清理处理器
// - 提供内存统计 API

// 使用：
import { memoryMonitorService } from './services/memory-monitor-service';

// 获取内存状态
const stats = memoryMonitorService.getMemoryStats();
console.log(stats?.formatted.used); // "3.2 GB"

// 手动触发清理
await memoryMonitorService.triggerCleanup();
```

### 2. 自动启动内存监控

在 `apps/web/src/main.tsx` 中添加了自动启动：

```typescript
import { memoryMonitorService } from '../../../packages/drawnix/src/services/memory-monitor-service';

// 延迟 5 秒启动，避免影响首屏加载
setTimeout(() => {
  memoryMonitorService.start();
  memoryMonitorService.logMemoryStatus();
}, 5000);
```

### 3. 离屏图片自动卸载

内存监控服务包含了离屏图片清理逻辑：

```typescript
// 找到离屏图片并暂时移除 src
const isOffscreen = 
  rect.bottom < -500 || 
  rect.top > window.innerHeight + 500;

if (isOffscreen) {
  img.setAttribute('data-lazy-src', src);
  img.removeAttribute('src');
}
```

## 建议的进一步优化

### 优先级 1：图片懒加载优化

**目标**：只解码视口内的图片

**方案**：
1. 在 Plait 的图片渲染中使用 `loading="lazy"` 和 `decoding="async"`
2. 对离屏图片使用占位符而不是实际图片

**修改位置**：
- `packages/drawnix/src/plugins/with-image.tsx`

### 优先级 2：聊天附件外部化存储

**目标**：减少 IndexedDB 中的 base64 数据

**方案**：
1. 将附件 Blob 存储到 Cache API
2. 在 IndexedDB 中只存储虚拟 URL 引用
3. 需要时从 Cache API 获取

**修改位置**：
- `packages/drawnix/src/services/chat-storage-service.ts`
- `packages/drawnix/src/types/chat.types.ts`

### 优先级 3：图片尺寸限制

**目标**：限制画布上图片的最大解码尺寸

**方案**：
1. 在插入图片时检查尺寸
2. 对超大图片自动缩放
3. 提供高清预览选项

### 优先级 4：定期内存报告

**目标**：帮助用户了解内存使用情况

**方案**：
1. 在设置页面显示内存使用统计
2. 在内存压力时显示警告
3. 提供手动清理选项

## 用户操作建议

如果遇到内存问题，可以：

1. **减少画布上的图片数量** - 将不需要的图片移到其他画板
2. **使用较低分辨率的图片** - 特别是在移动设备上
3. **定期刷新页面** - 释放累积的内存
4. **清理聊天历史** - 删除包含大量附件的旧会话
5. **关闭其他标签页** - 释放浏览器资源

## 调试方法

### 使用 SW Debug 面板

访问 `/sw-debug.html` 查看：
- 内存使用趋势
- 长任务监控
- 内存快照

### 使用 Chrome DevTools

1. **Memory 面板**：
   - 拍摄堆快照分析内存分布
   - 查看哪些对象占用最多内存

2. **Performance 面板**：
   - 记录性能profile
   - 分析长任务和内存增长

### 控制台命令

```javascript
// 获取内存状态
memoryMonitorService.logMemoryStatus();

// 手动触发清理
await memoryMonitorService.triggerCleanup(true);

// 获取详细统计
const stats = memoryMonitorService.getMemoryStats();
console.table(stats);
```

## 相关文件

- `packages/drawnix/src/services/memory-monitor-service.ts` - 内存监控服务
- `apps/web/src/main.tsx` - 内存监控初始化
- `packages/drawnix/src/components/lazy-image/LazyImage.tsx` - 懒加载图片组件
- `packages/drawnix/src/hooks/useImageLazyLoad.ts` - 图片懒加载 Hook
