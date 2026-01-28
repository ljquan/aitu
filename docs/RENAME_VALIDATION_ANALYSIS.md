# 项目管理重命名功能优化方案

> 分析时间：2026-01-27  
> 问题：项目管理中的文件夹和画板重命名时允许重复名称

---

## 🔍 当前问题分析

### 现状

```typescript
// workspace-service.ts (Line 153-163)
async renameFolder(id: string, name: string): Promise<void> {
  const folder = this.folders.get(id);
  if (!folder) throw new Error(`Folder ${id} not found`);

  folder.name = name;  // ❌ 没有任何验证
  folder.updatedAt = Date.now();

  this.folders.set(id, folder);
  await workspaceStorageService.saveFolder(folder);
  this.emit('folderUpdated', folder);
}

// renameBoard 方法也是一样的问题
```

**问题**：
1. ❌ 没有名称验证
2. ❌ 允许完全重复的名称
3. ❌ 没有空名称检查
4. ❌ 没有长度限制
5. ⚠️  用户体验混乱（多个同名项目无法区分）

---

## 📊 主流应用的做法分析

### 1️⃣ **Figma / FigJam**

**策略**：允许同名，但提供时间戳区分

```
文件结构：
├── 我的项目 (2024-01-15)
├── 我的项目 (2024-01-20)
└── 我的项目 (2024-01-27)
```

**优点**：
- ✅ 用户可以自由命名
- ✅ 通过时间戳避免混淆
- ✅ 不影响工作流

**缺点**：
- ⚠️  需要额外的 UI 显示时间
- ⚠️  列表变长

---

### 2️⃣ **Notion**

**策略**：允许同名，通过路径和图标区分

```
工作区/
├── 📁 项目管理
│   └── 📄 会议记录
└── 📁 个人笔记
    └── 📄 会议记录  ← 同名但在不同文件夹
```

**优点**：
- ✅ 灵活性高
- ✅ 用户体验自然
- ✅ 通过层级结构区分

**缺点**：
- ⚠️  搜索时可能混淆
- ⚠️  需要完整路径展示

---

### 3️⃣ **VS Code / Sublime Text**

**策略**：**同一文件夹内禁止重名**，不同文件夹可以同名

```
项目/
├── 文件夹A/
│   └── index.tsx  ✅
└── 文件夹B/
    └── index.tsx  ✅ (可以同名)

但同一文件夹内：
文件夹A/
├── index.tsx
└── index.tsx  ❌ 不允许
```

**优点**：
- ✅ 避免用户混淆
- ✅ 符合文件系统语义
- ✅ 实现简单

**缺点**：
- ⚠️  需要提示用户

---

### 4️⃣ **Trello**

**策略**：允许同名，但建议添加后缀

```
看板列表：
- 项目计划
- 项目计划 (复制)
- 项目计划 2
```

**优点**：
- ✅ 灵活但有引导
- ✅ 自动添加 "(副本)" 后缀

**缺点**：
- ⚠️  用户仍可能创建同名

---

### 5️⃣ **Apple Finder / Windows 资源管理器**

**策略**：**同一文件夹内严格禁止重名**

```
尝试重命名时：
"已存在名为'新建文件夹'的项目，请选择其他名称。"
```

**优点**：
- ✅ 完全避免混淆
- ✅ 用户理解成本低
- ✅ 符合文件系统习惯

**缺点**：
- ⚠️  稍微不够灵活

---

## 🎯 推荐方案（综合最佳实践）

### 方案 A：**同级禁止重名**（推荐 ⭐⭐⭐⭐⭐）

**规则**：
1. **同一文件夹内**的画板和文件夹不能重名
2. **不同文件夹内**可以有同名项目
3. 文件夹和画板可以同名（不同类型）

**示例**：

```
根目录/
├── 📁 项目A
│   ├── 📄 设计稿  ✅
│   └── 📄 设计稿  ❌ 禁止（同级重名）
├── 📁 项目B
│   └── 📄 设计稿  ✅（不同文件夹，允许）
└── 📄 项目A  ✅（文件夹和画板可以同名）
```

**验证逻辑**：

```typescript
// 重命名画板时
function validateBoardName(
  boardId: string,
  newName: string,
  folderId: string | null
): { valid: boolean; error?: string } {
  // 1. 空名称检查
  if (!newName || newName.trim().length === 0) {
    return { valid: false, error: '名称不能为空' };
  }

  // 2. 长度检查
  if (newName.length > 100) {
    return { valid: false, error: '名称不能超过100个字符' };
  }

  // 3. 同级重名检查（只检查同一文件夹内的画板）
  const siblings = Array.from(boards.values())
    .filter(b => b.folderId === folderId && b.id !== boardId);
  
  const isDuplicate = siblings.some(b => b.name === newName);
  if (isDuplicate) {
    return { 
      valid: false, 
      error: '此文件夹中已存在同名画板，请使用其他名称' 
    };
  }

  return { valid: true };
}
```

**优点**：
- ✅ 避免用户混淆
- ✅ 符合文件系统习惯
- ✅ 实现简单
- ✅ 性能好（只需检查同级）

**缺点**：
- ⚠️  需要提示用户
- ⚠️  稍微限制灵活性

---

### 方案 B：允许重名 + 自动编号（备选）

**规则**：
1. 允许同名
2. 自动添加编号避免完全重复
3. 类似 macOS 复制文件的行为

**示例**：

```
用户输入 "设计稿"：
- 如果已存在 "设计稿" → 自动改为 "设计稿 2"
- 如果已存在 "设计稿 2" → 自动改为 "设计稿 3"
```

**实现**：

```typescript
function generateUniqueName(
  baseName: string,
  folderId: string | null,
  excludeId: string
): string {
  const siblings = Array.from(boards.values())
    .filter(b => b.folderId === folderId && b.id !== excludeId)
    .map(b => b.name);

  if (!siblings.includes(baseName)) {
    return baseName;
  }

  let counter = 2;
  let newName = `${baseName} ${counter}`;
  while (siblings.includes(newName)) {
    counter++;
    newName = `${baseName} ${counter}`;
  }

  return newName;
}
```

**优点**：
- ✅ 不打断用户流程
- ✅ 自动解决冲突
- ✅ 用户体验流畅

**缺点**：
- ⚠️  用户可能不知道名称被改了
- ⚠️  需要明确提示

---

### 方案 C：混合方案（最佳 ⭐⭐⭐⭐⭐）

**策略**：
1. **重命名时**：禁止同名，提示用户修改
2. **复制时**：自动添加 "副本" + 编号
3. **创建时**：允许默认名称重复，但自动编号

**规则**：

| 场景 | 行为 | 示例 |
|------|------|------|
| **手动重命名** | 禁止同名 | "设计稿" → 已存在，提示错误 |
| **复制画板** | 自动添加 "副本" | "设计稿" → "设计稿 副本" |
| **新建画板** | 自动编号 | "未命名画板" → "未命名画板 2" |

**优点**：
- ✅ 用户主动重命名时给予控制权
- ✅ 自动操作时智能避免冲突
- ✅ 符合用户心理预期

---

## 💡 技术实现方案

### 1. 更新 WorkspaceService

```typescript
// workspace-service.ts

/**
 * Validate board name
 */
private validateBoardName(
  boardId: string,
  name: string,
  folderId: string | null
): { valid: boolean; error?: string } {
  // 1. 空名称检查
  const trimmedName = name.trim();
  if (trimmedName.length === 0) {
    return { valid: false, error: '画板名称不能为空' };
  }

  // 2. 长度检查
  if (trimmedName.length > 100) {
    return { valid: false, error: '画板名称不能超过100个字符' };
  }

  // 3. 特殊字符检查（可选）
  // const invalidChars = /[<>:"/\\|?*]/g;
  // if (invalidChars.test(trimmedName)) {
  //   return { valid: false, error: '名称不能包含特殊字符' };
  // }

  // 4. 同级重名检查
  const siblings = Array.from(this.boards.values())
    .filter(b => b.folderId === folderId && b.id !== boardId);
  
  const isDuplicate = siblings.some(b => b.name === trimmedName);
  if (isDuplicate) {
    return { 
      valid: false, 
      error: '此文件夹中已存在同名画板，请使用其他名称' 
    };
  }

  return { valid: true };
}

/**
 * Validate folder name
 */
private validateFolderName(
  folderId: string,
  name: string,
  parentId: string | null
): { valid: boolean; error?: string } {
  // 1. 空名称检查
  const trimmedName = name.trim();
  if (trimmedName.length === 0) {
    return { valid: false, error: '文件夹名称不能为空' };
  }

  // 2. 长度检查
  if (trimmedName.length > 100) {
    return { valid: false, error: '文件夹名称不能超过100个字符' };
  }

  // 3. 同级重名检查
  const siblings = this.getFolderChildren(parentId)
    .filter(f => f.id !== folderId);
  
  const isDuplicate = siblings.some(f => f.name === trimmedName);
  if (isDuplicate) {
    return { 
      valid: false, 
      error: '此文件夹中已存在同名文件夹，请使用其他名称' 
    };
  }

  return { valid: true };
}

/**
 * Rename board with validation
 */
async renameBoard(id: string, name: string): Promise<void> {
  const board = this.boards.get(id);
  if (!board) throw new Error(`Board ${id} not found`);

  // 验证名称
  const validation = this.validateBoardName(id, name, board.folderId);
  if (!validation.valid) {
    throw new ValidationError(validation.error!);
  }

  const trimmedName = name.trim();
  board.name = trimmedName;
  board.updatedAt = Date.now();

  this.boards.set(id, board);
  await workspaceStorageService.saveBoard(board);
  this.emit('boardUpdated', board);
}

/**
 * Rename folder with validation
 */
async renameFolder(id: string, name: string): Promise<void> {
  const folder = this.folders.get(id);
  if (!folder) throw new Error(`Folder ${id} not found`);

  // 验证名称
  const validation = this.validateFolderName(id, name, folder.parentId);
  if (!validation.valid) {
    throw new ValidationError(validation.error!);
  }

  const trimmedName = name.trim();
  folder.name = trimmedName;
  folder.updatedAt = Date.now();

  this.folders.set(id, folder);
  await workspaceStorageService.saveFolder(folder);
  this.emit('folderUpdated', folder);
}
```

### 2. 添加错误类型

```typescript
// types/workspace.types.ts

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
```

### 3. 更新 UI 错误处理

```typescript
// ProjectDrawer.tsx

const handleRename = useCallback(async (
  type: 'folder' | 'board', 
  id: string, 
  name: string
) => {
  try {
    if (type === 'folder') {
      await renameFolder(id, name);
      MessagePlugin.success('重命名成功');
    } else {
      await renameBoard(id, name);
      MessagePlugin.success('重命名成功');
    }
  } catch (error: any) {
    if (error.name === 'ValidationError') {
      MessagePlugin.warning({
        content: error.message,
        duration: 3000,
      });
      // 保持编辑状态，让用户修改
      return false; // 不关闭编辑状态
    } else {
      MessagePlugin.error({
        content: '重命名失败',
        duration: 3000,
      });
    }
    throw error;
  }
}, [renameFolder, renameBoard]);
```

---

## 🎨 UI 优化建议

### 1. 实时验证

```typescript
// 在输入时实时提示
<Input
  value={editingName}
  status={isDuplicate ? 'error' : undefined}
  tips={isDuplicate ? '已存在同名项目' : undefined}
  onChange={(value) => {
    setEditingName(value);
    // 实时检查重名
    checkDuplicate(value);
  }}
/>
```

### 2. 视觉反馈

```scss
.project-drawer-node__label {
  // 正常状态
  
  &--editing-error {
    border-color: var(--td-error-color);
    background: var(--td-error-color-1);
  }
}
```

### 3. 智能建议

```typescript
// 如果用户输入重复名称，自动建议替代名称
function suggestAlternativeName(baseName: string, siblings: string[]): string {
  if (!siblings.includes(baseName)) return baseName;
  
  let counter = 2;
  while (siblings.includes(`${baseName} ${counter}`)) {
    counter++;
  }
  return `${baseName} ${counter}`;
}

// UI 提示
<Message theme="warning">
  名称 "{name}" 已存在，建议使用 "{suggestedName}"
</Message>
```

---

## 📊 对比总结

| 方案 | 用户体验 | 实现复杂度 | 维护成本 | 推荐指数 |
|------|---------|----------|---------|---------|
| **方案 A（同级禁止重名）** | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| **方案 B（自动编号）** | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| **方案 C（混合方案）** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

---

## 🚀 实施建议

### 阶段 1：核心验证（必须）

1. ✅ 添加空名称检查
2. ✅ 添加长度限制
3. ✅ 添加同级重名检查
4. ✅ 更新错误处理

### 阶段 2：体验优化（推荐）

1. ✅ 实时验证提示
2. ✅ 智能名称建议
3. ✅ 保持编辑状态直到成功

### 阶段 3：高级功能（可选）

1. ⭐ 全局搜索时显示完整路径
2. ⭐ 重复名称警告（跨文件夹）
3. ⭐ 批量重命名工具

---

## 📝 测试用例

```typescript
describe('Rename Validation', () => {
  it('应该拒绝空名称', async () => {
    await expect(renameBoard(id, '')).rejects.toThrow('名称不能为空');
  });

  it('应该拒绝过长名称', async () => {
    const longName = 'a'.repeat(101);
    await expect(renameBoard(id, longName)).rejects.toThrow('不能超过100个字符');
  });

  it('应该拒绝同级重名', async () => {
    await createBoard({ name: '设计稿', folderId: null });
    await createBoard({ name: '其他', folderId: null });
    
    await expect(
      renameBoard('其他的ID', '设计稿')
    ).rejects.toThrow('已存在同名画板');
  });

  it('应该允许不同文件夹同名', async () => {
    await createBoard({ name: '设计稿', folderId: 'folder1' });
    await createBoard({ name: '设计稿', folderId: 'folder2' }); // ✅ 应该成功
  });

  it('应该自动 trim 空格', async () => {
    await renameBoard(id, '  设计稿  ');
    const board = getBoard(id);
    expect(board.name).toBe('设计稿');
  });
});
```

---

## 🎯 最终推荐

**采用方案 C（混合方案）**：

1. **手动重命名**：同级禁止重名，给出清晰错误提示
2. **自动操作**：智能编号避免冲突
3. **即时验证**：输入时实时检查，提供建议

这个方案：
- ✅ 兼顾用户体验和系统稳定性
- ✅ 符合主流应用的最佳实践
- ✅ 实现难度适中
- ✅ 易于维护和扩展

---

**文档版本**：v1.0  
**最后更新**：2026-01-27  
**相关文件**：
- `packages/drawnix/src/services/workspace-service.ts`
- `packages/drawnix/src/components/project-drawer/ProjectDrawer.tsx`
- `packages/drawnix/src/types/workspace.types.ts`
