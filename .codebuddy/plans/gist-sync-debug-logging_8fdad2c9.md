---
name: gist-sync-debug-logging
overview: 在 Gist 上传下载相关代码中添加详细日志，定位远程数据无法恢复到本地的问题。重点关注数据下载、解析、应用到本地存储以及工作区刷新等关键环节。
todos:
  - id: add-pull-logs
    content: 在 sync-engine.ts 的 pullFromRemote() 中添加远程文件下载、解析和验证的详细日志
    status: completed
  - id: add-deserialize-logs
    content: 在 data-serializer.ts 的 deserializeFromGistFilesWithDecryption() 中添加解密后数据验证日志
    status: completed
  - id: add-apply-logs
    content: 在 data-serializer.ts 的 applySyncData() 中添加画板保存前后的验证日志
    status: completed
  - id: add-workspace-logs
    content: 在 workspace-service.ts 的 reload() 和 switchBoard() 中添加状态验证日志
    status: completed
  - id: add-context-logs
    content: 在 GitHubSyncContext.tsx 的 handleBoardSwitchAfterSync() 中添加切换决策日志
    status: completed
---

## 用户需求

用户报告 Gist 云同步功能中，远程数据无法正确恢复到本地，需要添加详细日志以定位问题。

## 产品概述

在 opentu 白板应用的 GitHub Gist 同步功能中，当用户执行"以远程为准同步"（pullFromRemote）操作时，远程数据未能正确恢复到本地。需要在关键流程节点添加调试日志来追踪数据流向，定位问题根源。

## 核心功能

1. 在 `pullFromRemote()` 流程中添加远程文件内容读取后的详细验证日志
2. 在 `deserializeFromGistFilesWithDecryption()` 解密后添加数据验证日志
3. 在 `applySyncData()` 中为每个画板保存前后添加详细状态日志
4. 在 `workspaceService.reload()` 调用后验证工作区状态
5. 在 `switchBoard()` 流程中添加详细的切换逻辑日志
6. 在 `handleBoardSwitchAfterSync()` 中添加画板切换决策日志

## 技术栈

- 语言：TypeScript
- 框架：React + RxJS
- 存储：IndexedDB (via localforage)
- 现有日志格式：`console.log('[ModuleName] message:', data)`

## 实现方案

### 日志策略

在关键流程节点添加结构化的调试日志，遵循项目现有的日志格式 `[ModuleName]`，确保日志内容包含：

1. 操作阶段标识（START/END/STEP）
2. 关键数据的摘要信息（数量、ID、状态）
3. 数据验证结果（是否符合预期）

### 关键日志位置

#### 1. sync-engine.ts - pullFromRemote() 流程

- 远程文件下载后：记录每个文件的大小和内容类型
- manifest 解析后：验证 boards 字段结构
- 画板下载后：验证每个画板文件内容是否完整
- applySyncData 调用前：记录传入的完整数据结构

#### 2. data-serializer.ts - deserializeFromGistFilesWithDecryption()

- 解密前：记录加密数据的格式信息
- 解密后：验证 JSON 解析结果的完整性
- boards 解析后：逐个记录每个画板的关键字段

#### 3. data-serializer.ts - applySyncData()

- 保存前：记录将要保存的画板详细信息
- 保存后：立即验证数据是否成功写入 IndexedDB
- reload 后：验证内存中的数据状态

#### 4. workspace-service.ts - switchBoard()

- 切换前：记录当前状态和目标画板
- 加载画板时：记录从存储加载的数据
- 切换后：验证切换结果

#### 5. GitHubSyncContext.tsx - handleBoardSwitchAfterSync()

- 记录同步结果中的 remoteCurrentBoardId
- 记录画板切换决策逻辑
- 验证最终切换结果

### 日志格式规范

```typescript
// 流程开始
console.log('[ModuleName] ========== funcName START ==========');

// 关键步骤
console.log('[ModuleName] funcName: step description', {
  key1: value1,
  key2: value2,
});

// 数据验证
console.log('[ModuleName] funcName: VERIFY result', {
  expected: xxx,
  actual: yyy,
  match: xxx === yyy,
});

// 流程结束
console.log('[ModuleName] ========== funcName END ==========');
```

## 目录结构

```
packages/drawnix/src/
├── services/
│   └── github-sync/
│       ├── sync-engine.ts        # [MODIFY] 添加 pullFromRemote 流程日志
│       └── data-serializer.ts    # [MODIFY] 添加解密和数据应用日志
├── services/
│   └── workspace-service.ts      # [MODIFY] 添加 switchBoard 和 reload 日志
└── contexts/
    └── GitHubSyncContext.tsx     # [MODIFY] 添加画板切换决策日志
```