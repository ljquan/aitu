# 刷新页面元素丢失问题调试方案

## 问题描述
刷新页面后，画布上的元素全部丢失。怀疑 tab 同步没有考虑到画布 ID。

## 潜在问题

### 1. workspace-service 初始化时的空数组问题

**位置**：`packages/drawnix/src/services/workspace-service.ts:111`

```typescript
// 初始化时，this.boards 中的画板 elements 是空数组
this.boards = new Map(boardMetadata.map((b) => [b.id, { ...b, elements: [] } as Board]));
```

**风险**：如果在画板完全加载之前调用 `getCurrentBoard()`，可能返回 elements 为空的画板。

### 2. getCurrentBoard() 的回退逻辑

**位置**：`packages/drawnix/src/services/workspace-service.ts:965-970`

```typescript
getCurrentBoard(): Board | null {
  if (!this.state.currentBoardId) return null;
  // 优先从已加载的画板获取
  return this.loadedBoards.get(this.state.currentBoardId) ||
         this.boards.get(this.state.currentBoardId) || null;
}
```

**风险**：回退到 `this.boards` 时会返回 elements 为空数组的画板。

## 调试步骤

### 步骤 1：添加调试日志

在 `workspace-service.ts` 的关键位置添加日志：

```typescript
// 在 getCurrentBoard() 中
getCurrentBoard(): Board | null {
  if (!this.state.currentBoardId) return null;

  const fromLoaded = this.loadedBoards.get(this.state.currentBoardId);
  const fromBoards = this.boards.get(this.state.currentBoardId);

  console.log('[WorkspaceService] getCurrentBoard:', {
    currentBoardId: this.state.currentBoardId,
    fromLoaded: fromLoaded ? `${fromLoaded.elements?.length || 0} elements` : 'null',
    fromBoards: fromBoards ? `${fromBoards.elements?.length || 0} elements` : 'null',
    returning: fromLoaded || fromBoards || null
  });

  return fromLoaded || fromBoards || null;
}

// 在 saveCurrentBoard() 中
async saveCurrentBoard(data: BoardChangeData): Promise<void> {
  const currentBoardId = this.state.currentBoardId;
  console.log('[WorkspaceService] saveCurrentBoard:', {
    currentBoardId,
    elementsCount: data.children?.length || 0
  });

  if (!currentBoardId) {
    console.warn('[WorkspaceService] No current board to save');
    return;
  }
  await this.saveBoard(currentBoardId, data);
}
```

### 步骤 2：检查 IndexedDB 数据

在浏览器开发者工具中：
1. 打开 Application > IndexedDB > workspace-db
2. 查看 boards 表
3. 找到当前画板的记录
4. 检查 elements 字段是否为空

### 步骤 3：检查 tab 同步时机

在 `app.tsx` 的 `handleTabSyncNeeded` 中添加日志：

```typescript
const handleTabSyncNeeded = useCallback(async () => {
  const workspaceService = WorkspaceService.getInstance();
  const currentBoard = workspaceService.getCurrentBoard();

  console.log('[App] handleTabSyncNeeded:', {
    currentBoard: currentBoard ? {
      id: currentBoard.id,
      name: currentBoard.name,
      elementsCount: currentBoard.elements?.length || 0
    } : null
  });

  if (!currentBoard) {
    return;
  }

  try {
    const updatedBoard = await workspaceService.reloadBoard(currentBoard.id);
    console.log('[App] reloadBoard result:', {
      id: updatedBoard.id,
      elementsCount: updatedBoard.elements?.length || 0
    });

    // ...
  } catch (error) {
    console.error('[App] Failed to sync board data:', error);
    safeReload();
  }
}, []);
```

## 可能的修复方案

### 方案 1：修复 getCurrentBoard() 的回退逻辑

确保 `getCurrentBoard()` 不会返回 elements 为空的画板：

```typescript
getCurrentBoard(): Board | null {
  if (!this.state.currentBoardId) return null;

  // 只从 loadedBoards 获取，如果没有则返回 null
  // 调用方应该使用 switchBoard() 来加载画板
  const board = this.loadedBoards.get(this.state.currentBoardId);

  if (!board) {
    console.warn('[WorkspaceService] getCurrentBoard: board not loaded, use switchBoard() first');
  }

  return board || null;
}
```

### 方案 2：在 app.tsx 初始化时确保画板已加载

确保在设置 `isDataReady` 之前，当前画板已经通过 `switchBoard` 加载：

```typescript
// 在 app.tsx 的初始化代码中
if (targetBoardId) {
  currentBoard = await workspaceService.switchBoard(targetBoardId);
  console.log('[App] Loaded board:', {
    id: currentBoard.id,
    elementsCount: currentBoard.elements?.length || 0
  });
}
```

### 方案 3：tab 同步时检查画板是否已加载

在 `handleTabSyncNeeded` 中，如果 `getCurrentBoard()` 返回的画板 elements 为空，先调用 `switchBoard` 加载：

```typescript
const handleTabSyncNeeded = useCallback(async () => {
  const workspaceService = WorkspaceService.getInstance();
  let currentBoard = workspaceService.getCurrentBoard();

  if (!currentBoard) {
    return;
  }

  // 如果画板 elements 为空，可能是还没加载，先加载
  if (!currentBoard.elements || currentBoard.elements.length === 0) {
    console.log('[App] Current board not fully loaded, loading via switchBoard');
    currentBoard = await workspaceService.switchBoard(currentBoard.id);
  }

  try {
    const updatedBoard = await workspaceService.reloadBoard(currentBoard.id);
    // ...
  } catch (error) {
    console.error('[App] Failed to sync board data:', error);
    safeReload();
  }
}, []);
```

## 下一步

1. 添加调试日志，重现问题
2. 检查控制台输出，确认问题发生的时机
3. 检查 IndexedDB 数据，确认数据是否真的丢失
4. 根据调试结果选择合适的修复方案
