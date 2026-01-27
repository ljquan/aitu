# Aitu Manual 测试覆盖度分析与扩展计划

> 生成时间：2026-01-27  
> 分析范围：整个项目的 Manual 测试覆盖度  
> 重点模块：AI 输入栏（底部对话模块）及其配套功能

---

## 📊 目前已完成的测试覆盖

### ✅ 已测试模块（100% 完成）

| 模块 | 静态截图 | 动态 GIF | 测试代码 | 状态 |
|------|---------|---------|---------|------|
| **工具箱操作** | ✅ | ✅ | ✅ | 🎉 完成 |
| **素材库管理** | ✅ | ✅ | ✅ | 🎉 完成 |
| **项目管理** | ✅ | ✅ | ✅ | 🎉 完成 |
| **备份/恢复** | ✅ | ✅ | ✅ | 🎉 完成 |

### ⚠️ 部分完成的测试（代码已有，GIF 未生成）

| 模块 | 静态截图 | 动态 GIF | 测试代码 | GIF 生成 | 状态 |
|------|---------|---------|---------|---------|------|
| **思维导图** | ⚠️ | ✅ | ✅ | ⏳ | 67% |
| **画笔绘制** | ✅ | ✅ | ✅ | ⏳ | 67% |
| **AI 图片生成** | ✅ | ✅ | ✅ | ⏳ | 67% |
| **画布导航** | ✅ | ✅ | ✅ | ⏳ | 67% |
| **形状工具** | ✅ | ✅ | ✅ | ⏳ | 67% |

---

## 🚨 **缺失的核心测试：AI 输入栏模块**

### 🎯 模块概述

**AI 输入栏**（AIInputBar）是 Aitu 最核心的交互组件，位于画布底部中央，类似 Google Mixboard 的交互模式。它是用户与 AI 功能交互的主入口。

**相关文件**：
```
packages/drawnix/src/components/ai-input-bar/
├── AIInputBar.tsx                    (主组件，1872 行)
├── ModelDropdown.tsx                 (模型选择器)
├── ParametersDropdown.tsx            (参数配置器)
├── GenerationTypeDropdown.tsx        (生成类型选择)
├── CountDropdown.tsx                 (数量选择)
├── PromptHistoryPopover.tsx          (历史提示词)
├── PromptSuggestionPanel.tsx         (智能提示面板)
├── SizeDropdown.tsx                  (尺寸选择)
├── KeyboardDropdown.tsx              (键盘导航)
└── ModelSelector.tsx                 (模型选择器)
```

---

## 🔍 AI 输入栏功能详细分解

### 1️⃣ **核心功能组（基础交互）**

#### 📋 功能清单

| 功能点 | 优先级 | 测试难度 | 预计时长 | 依赖 API |
|--------|--------|---------|---------|---------|
| **输入框聚焦/失焦** | P0 | 简单 | 5 秒 | ❌ |
| **文本输入** | P0 | 简单 | 10 秒 | ❌ |
| **输入框展开/收缩** | P0 | 简单 | 8 秒 | ❌ |
| **发送按钮交互** | P0 | 简单 | 5 秒 | ❌ |
| **清空输入** | P1 | 简单 | 3 秒 | ❌ |

#### 🎬 测试思路

```typescript
test('AI 输入栏基础交互演示', async ({ page }) => {
  // 1. 等待页面加载
  await page.goto('http://localhost:7200/');
  await page.waitForTimeout(1500);
  
  // 2. 显示提示：找到 AI 输入栏
  await showKeyHint(page, '底部 AI 输入栏', 1500);
  const aiInputBar = page.getByTestId('ai-input-bar');
  
  // 3. 点击输入框聚焦
  await clickWithEffect(page, aiInputBar.locator('input'), '点击输入框', 1000);
  
  // 4. 输入文本
  await showKeyHint(page, '输入提示词', 1000);
  await page.keyboard.type('一只可爱的猫咪', { delay: 100 });
  await page.waitForTimeout(1000);
  
  // 5. 展示输入框展开效果
  await showKeyHint(page, '输入框自动展开', 1500);
  
  // 6. 清空输入（Ctrl+A + Backspace）
  await showKeyHint(page, '清空输入', 1000);
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(1000);
  
  // 7. 失焦收缩
  await page.keyboard.press('Escape');
  await showKeyHint(page, '输入框收缩', 1500);
});
```

---

### 2️⃣ **模型选择组（关键配置）**

#### 📋 功能清单

| 功能点 | 优先级 | 测试难度 | 预计时长 | 子功能 |
|--------|--------|---------|---------|--------|
| **模型下拉菜单** | P0 | 中等 | 15 秒 | 展开、搜索、选择 |
| **模型健康状态** | P1 | 简单 | 5 秒 | 显示模型可用性 |
| **模型快捷代码** | P2 | 简单 | 5 秒 | `#imagen3` 显示 |
| **模型分类筛选** | P1 | 中等 | 10 秒 | 图片/视频/Agent |

#### 🎬 测试思路

```typescript
test('模型选择器演示', async ({ page }) => {
  await page.goto('http://localhost:7200/');
  const aiInputBar = page.getByTestId('ai-input-bar');
  
  // 1. 打开模型下拉菜单
  await showKeyHint(page, '选择生成模型', 1500);
  const modelDropdown = aiInputBar.locator('.model-dropdown__trigger');
  await clickWithEffect(page, modelDropdown, '打开模型列表', 1500);
  
  // 2. 展示模型列表（滚动浏览）
  await showKeyHint(page, '浏览可用模型', 1500);
  const modelList = page.locator('.model-dropdown__menu');
  await modelList.evaluate(el => {
    el.scrollBy({ top: 100, behavior: 'smooth' });
  });
  await page.waitForTimeout(1000);
  
  // 3. 健康状态展示
  await showKeyHint(page, '模型健康状态', 1500);
  
  // 4. 选择模型
  const imagen3 = page.locator('.model-dropdown__item').filter({ hasText: 'imagen3' });
  await clickWithEffect(page, imagen3, '选择 Imagen 3', 1500);
  
  // 5. 显示快捷代码
  await showKeyHint(page, '模型快捷代码 #imagen3', 1500);
});
```

---

### 3️⃣ **参数配置组（高级功能）**

#### 📋 功能清单

| 功能点 | 优先级 | 测试难度 | 预计时长 | 配置项 |
|--------|--------|---------|---------|--------|
| **参数下拉菜单** | P0 | 中等 | 15 秒 | 展开、平铺展示 |
| **尺寸选择** | P0 | 简单 | 8 秒 | 1:1, 16:9, 4:3 等 |
| **数量选择** | P0 | 简单 | 8 秒 | 1-20 张 |
| **生成类型** | P0 | 简单 | 8 秒 | 图片/视频/Agent |
| **键盘导航** | P2 | 复杂 | 10 秒 | 上下左右键 |

#### 🎬 测试思路

```typescript
test('参数配置演示', async ({ page }) => {
  await page.goto('http://localhost:7200/');
  const aiInputBar = page.getByTestId('ai-input-bar');
  
  // 1. 打开参数配置
  await showKeyHint(page, '配置生成参数', 1500);
  const paramsBtn = aiInputBar.locator('.parameters-dropdown__trigger');
  await clickWithEffect(page, paramsBtn, '打开参数配置', 1500);
  
  // 2. 展示参数分组（平铺显示）
  await showKeyHint(page, '所有参数平铺展示', 1500);
  const paramsPanel = page.locator('.parameters-dropdown__menu');
  
  // 3. 选择尺寸
  await showKeyHint(page, '选择图片尺寸', 1000);
  const size16_9 = paramsPanel.locator('[data-param-value="16:9"]');
  await clickWithEffect(page, size16_9, '选择 16:9', 1000);
  
  // 4. 选择数量
  await showKeyHint(page, '选择生成数量', 1000);
  const count4 = paramsPanel.locator('[data-param-value="4"]');
  await clickWithEffect(page, count4, '选择 4 张', 1000);
  
  // 5. 关闭参数面板
  await page.keyboard.press('Escape');
  await showKeyHint(page, '配置已保存', 1500);
});
```

---

### 4️⃣ **内容选择组（多模态输入）**

#### 📋 功能清单

| 功能点 | 优先级 | 测试难度 | 预计时长 | 子功能 |
|--------|--------|---------|---------|--------|
| **上传图片** | P0 | 中等 | 10 秒 | 文件选择、预览 |
| **从素材库选择** | P0 | 中等 | 12 秒 | 打开模态框、选择 |
| **画布元素选择** | P0 | 复杂 | 15 秒 | 自动捕获选中内容 |
| **已选内容预览** | P0 | 简单 | 8 秒 | 缩略图展示 |
| **移除选中内容** | P1 | 简单 | 5 秒 | 点击 X 移除 |

#### 🎬 测试思路

```typescript
test('多模态内容选择演示', async ({ page }) => {
  await page.goto('http://localhost:7200/');
  const aiInputBar = page.getByTestId('ai-input-bar');
  
  // 1. 上传图片（模拟）
  await showKeyHint(page, '上传参考图片', 1500);
  const uploadBtn = aiInputBar.locator('.ai-input-bar__upload-btn');
  await clickWithEffect(page, uploadBtn, '上传图片', 1000);
  // 注意：实际文件上传需要特殊处理
  await showKeyHint(page, '（演示：文件选择器）', 1500);
  
  // 2. 从素材库选择
  await showKeyHint(page, '从素材库选择', 1500);
  const libraryBtn = aiInputBar.locator('.ai-input-bar__library-btn');
  await clickWithEffect(page, libraryBtn, '打开素材库', 1500);
  
  // 假设素材库已打开
  const firstAsset = page.getByTestId('media-library-grid')
    .locator('.asset-item').first();
  if (await firstAsset.isVisible()) {
    await clickWithEffect(page, firstAsset, '选择素材', 1000);
    const confirmBtn = page.getByRole('button', { name: '确认' });
    await clickWithEffect(page, confirmBtn, '确认', 1000);
  }
  
  // 3. 展示已选内容预览
  await showKeyHint(page, '已选内容预览', 1500);
  const preview = aiInputBar.locator('.selected-content-preview');
  
  // 4. 移除内容
  const removeBtn = preview.locator('.remove-btn').first();
  if (await removeBtn.isVisible()) {
    await clickWithEffect(page, removeBtn, '移除', 1000);
  }
});
```

---

### 5️⃣ **智能提示组（体验优化）**

#### 📋 功能清单

| 功能点 | 优先级 | 测试难度 | 预计时长 | 特性 |
|--------|--------|---------|---------|------|
| **历史提示词** | P1 | 中等 | 12 秒 | 悬浮展示、选择 |
| **预设提示词** | P1 | 简单 | 10 秒 | 分类展示 |
| **置顶提示词** | P2 | 简单 | 5 秒 | Pin 功能 |
| **删除历史** | P2 | 简单 | 5 秒 | 删除操作 |
| **灵感面板** | P1 | 中等 | 15 秒 | 空画布时显示 |

#### 🎬 测试思路

```typescript
test('智能提示面板演示', async ({ page }) => {
  await page.goto('http://localhost:7200/');
  const aiInputBar = page.getByTestId('ai-input-bar');
  
  // 1. 显示灵感面板（空画布）
  await showKeyHint(page, '灵感提示面板', 1500);
  const inspirationBoard = page.locator('.inspiration-board');
  if (await inspirationBoard.isVisible()) {
    await showKeyHint(page, '选择预设提示词', 1500);
    const card = inspirationBoard.locator('.inspiration-card').first();
    await clickWithEffect(page, card, '选择灵感', 1500);
  }
  
  // 2. 打开历史提示词
  await showKeyHint(page, '查看历史提示词', 1500);
  const historyBtn = aiInputBar.locator('.prompt-history-popover__trigger');
  await page.hover(historyBtn.locator('button'));
  await page.waitForTimeout(800); // 悬浮延迟
  
  // 3. 展示历史列表
  await showKeyHint(page, '历史记录与预设', 1500);
  const historyPanel = page.locator('.prompt-list-panel');
  
  // 4. 置顶操作
  const pinBtn = historyPanel.locator('.pin-btn').first();
  if (await pinBtn.isVisible()) {
    await clickWithEffect(page, pinBtn, '置顶', 1000);
  }
  
  // 5. 选择提示词
  const promptItem = historyPanel.locator('.prompt-item').first();
  await clickWithEffect(page, promptItem, '使用提示词', 1000);
});
```

---

### 6️⃣ **工作流集成组（高级场景）**

#### 📋 功能清单

| 功能点 | 优先级 | 测试难度 | 预计时长 | 说明 |
|--------|--------|---------|---------|------|
| **发送后打开 ChatDrawer** | P0 | 中等 | 10 秒 | 自动打开对话抽屉 |
| **Agent 模式** | P1 | 复杂 | 20 秒 | AI 自动选择工具 |
| **工作流显示** | P1 | 中等 | 15 秒 | 显示执行步骤 |
| **任务状态同步** | P1 | 复杂 | 15 秒 | 实时更新状态 |
| **错误处理** | P2 | 中等 | 10 秒 | API 失败提示 |

#### 🎬 测试思路

```typescript
test('AI 工作流完整演示', async ({ page }) => {
  await page.goto('http://localhost:7200/');
  const aiInputBar = page.getByTestId('ai-input-bar');
  
  // 1. 输入提示词
  await showKeyHint(page, '输入生成请求', 1500);
  await clickWithEffect(page, aiInputBar.locator('input'), '输入', 1000);
  await page.keyboard.type('生成一只猫咪', { delay: 100 });
  
  // 2. 配置参数（快速）
  await showKeyHint(page, '配置生成参数', 1000);
  // ... 选择模型、尺寸等
  
  // 3. 发送请求
  await showKeyHint(page, '发送生成请求', 1500);
  const sendBtn = aiInputBar.locator('.ai-input-bar__send-btn');
  await clickWithEffect(page, sendBtn, '发送', 1500);
  
  // 4. 自动打开 ChatDrawer
  await showKeyHint(page, '对话抽屉自动打开', 1500);
  const chatDrawer = page.getByTestId('chat-drawer');
  await page.waitForSelector('[data-testid="chat-drawer"]', { 
    state: 'visible', 
    timeout: 3000 
  });
  
  // 5. 展示工作流执行
  await showKeyHint(page, '工作流执行中', 2000);
  // 注意：实际 AI 生成会很慢，测试中可能需要 mock
  
  // 6. 关闭抽屉
  await page.keyboard.press('Escape');
  await showKeyHint(page, '关闭对话抽屉', 1000);
});
```

---

## 🎯 ChatDrawer（对话抽屉）功能分解

### 1️⃣ **基础交互**

| 功能点 | 优先级 | 测试难度 | 预计时长 |
|--------|--------|---------|---------|
| **打开/关闭抽屉** | P0 | 简单 | 8 秒 |
| **拖动调整宽度** | P1 | 中等 | 10 秒 |
| **会话列表** | P0 | 中等 | 15 秒 |
| **新建会话** | P0 | 简单 | 5 秒 |
| **切换会话** | P0 | 简单 | 8 秒 |
| **删除会话** | P1 | 简单 | 5 秒 |

### 2️⃣ **消息交互**

| 功能点 | 优先级 | 测试难度 | 预计时长 |
|--------|--------|---------|---------|
| **显示用户消息** | P0 | 简单 | 5 秒 |
| **显示 AI 响应** | P0 | 中等 | 10 秒 |
| **工作流消息** | P1 | 复杂 | 20 秒 |
| **重试失败任务** | P1 | 中等 | 12 秒 |
| **插入到画布** | P0 | 中等 | 10 秒 |
| **下载结果** | P1 | 简单 | 5 秒 |

### 3️⃣ **高级功能**

| 功能点 | 优先级 | 测试难度 | 预计时长 |
|--------|--------|---------|---------|
| **模型切换** | P1 | 简单 | 8 秒 |
| **Mermaid 渲染** | P2 | 中等 | 10 秒 |
| **代理日志** | P2 | 中等 | 10 秒 |
| **会话搜索** | P2 | 中等 | 10 秒 |

---

## 📈 测试优先级矩阵

### 🔥 P0 级（必须测试，核心功能）

```
优先执行顺序：

1. AI 输入栏基础交互         ⏱️  8 秒
2. 模型选择器                ⏱️ 15 秒
3. 参数配置                  ⏱️ 15 秒
4. 多模态内容选择            ⏱️ 12 秒
5. 发送 + ChatDrawer 打开    ⏱️ 10 秒
6. ChatDrawer 基础交互       ⏱️ 15 秒
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   总计时长：~75 秒（1 分 15 秒）
```

### ⚡ P1 级（重要功能，增强体验）

```
1. 智能提示面板              ⏱️ 15 秒
2. 工作流完整演示            ⏱️ 20 秒
3. 会话管理                  ⏱️ 15 秒
4. ChatDrawer 拖动调整       ⏱️ 10 秒
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   总计时长：~60 秒（1 分钟）
```

### 🎨 P2 级（锦上添花，可选）

```
1. 键盘快捷键导航            ⏱️ 10 秒
2. 历史提示词置顶/删除       ⏱️  8 秒
3. Mermaid 流程图渲染        ⏱️ 10 秒
4. 代理日志查看              ⏱️ 10 秒
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   总计时长：~38 秒
```

---

## 🎬 推荐测试计划

### 📅 阶段 1：核心功能覆盖（Week 1）

#### Day 1-2: AI 输入栏基础
```
✅ test('AI 输入栏基础交互演示')         - 8 秒
✅ test('模型选择器演示')                - 15 秒
✅ test('参数配置演示')                  - 15 秒
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   合计 GIF: ~38 秒
```

#### Day 3-4: 内容选择与工作流
```
✅ test('多模态内容选择演示')            - 12 秒
✅ test('AI 工作流完整演示')             - 20 秒
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   合计 GIF: ~32 秒
```

#### Day 5: ChatDrawer 基础
```
✅ test('ChatDrawer 基础交互演示')       - 15 秒
✅ test('会话管理演示')                  - 15 秒
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   合计 GIF: ~30 秒
```

### 📅 阶段 2：体验优化（Week 2）

#### Day 1-2: 智能提示
```
✅ test('智能提示面板演示')              - 15 秒
✅ test('灵感面板演示')                  - 12 秒
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   合计 GIF: ~27 秒
```

#### Day 3-4: 高级功能
```
✅ test('ChatDrawer 高级功能演示')       - 20 秒
✅ test('工作流重试与插入演示')          - 15 秒
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   合计 GIF: ~35 秒
```

---

## 🛠️ 技术实现建议

### 1. Mock API 响应

由于 AI 生成需要较长时间（10-60 秒），测试中建议 mock：

```typescript
// 在测试开始前注入 mock
await page.route('**/api/generation/**', route => {
  route.fulfill({
    status: 200,
    body: JSON.stringify({
      id: 'mock-task-id',
      status: 'completed',
      result_url: 'https://example.com/mock-image.png',
    }),
  });
});
```

### 2. Service Worker 通信

AI 输入栏通过 Service Worker 处理任务，测试时需要：

```typescript
// 等待 SW 就绪
await page.waitForFunction(() => {
  return navigator.serviceWorker.controller !== null;
});

// 监听 SW 消息
await page.evaluate(() => {
  window.__swMessages = [];
  navigator.serviceWorker.addEventListener('message', (event) => {
    window.__swMessages.push(event.data);
  });
});
```

### 3. 文件上传测试

对于图片上传功能：

```typescript
// 方式 1: 使用测试图片文件
await page.setInputFiles(
  'input[type="file"]',
  'apps/web-e2e/fixtures/test-image.png'
);

// 方式 2: 创建临时 Blob（仅演示界面）
await page.evaluate(() => {
  const input = document.querySelector('input[type="file"]');
  const dataTransfer = new DataTransfer();
  const file = new File(['mock'], 'test.png', { type: 'image/png' });
  dataTransfer.items.add(file);
  input.files = dataTransfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
});
```

---

## 📊 最终测试覆盖度预期

### 完成阶段 1 后

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 100%

静态截图:   ████████████████████████████████ 100% (21/21)
动态 GIF:   ████████████████████████████░░░░  80% (15/19)
测试代码:   ████████████████████████████░░░░  80% (13/16)
已生成 GIF: ██████████████░░░░░░░░░░░░░░░░░░  50% (10/19)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
总进度:     ███████████████████████████████░  90%
```

### 完成阶段 2 后

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 100%

静态截图:   ████████████████████████████████ 100% (21/21)
动态 GIF:   ████████████████████████████████ 100% (19/19)
测试代码:   ████████████████████████████████ 100% (16/16)
已生成 GIF: ████████████████████████████████ 100% (19/19)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
总进度:     ████████████████████████████████ 100%

🎊 完整测试体系达成！
```

---

## 📦 其他需要补充的测试模块

### 🎨 绘图工具详细测试

| 模块 | 当前状态 | 缺失测试 |
|------|---------|---------|
| **铅笔工具** | 有基础 GIF | 压感、橡皮擦、设置面板 |
| **形状工具** | 有基础 GIF | 圆角调整、布尔运算、组合 |
| **文本工具** | ❌ | 字体、大小、颜色、对齐 |
| **渐变编辑器** | ❌ | 多色渐变、角度调整 |

### 🖼️ 画布操作测试

| 模块 | 当前状态 | 缺失测试 |
|------|---------|---------|
| **缩放平移** | 有基础 GIF | 快捷键、手势、小地图 |
| **多选操作** | ❌ | 框选、Shift 多选、群组 |
| **图层管理** | ❌ | 上移、下移、置顶、置底 |
| **对齐分布** | ❌ | 左对齐、居中、等间距 |

### 🔧 工具箱详细测试

| 模块 | 当前状态 | 缺失测试 |
|------|---------|---------|
| **工具列表** | ✅ 完成 | - |
| **工具窗口** | ✅ 完成 | - |
| **自定义工具** | ❌ | 添加、配置、删除 |
| **工具设置** | ❌ | iframe 配置、权限设置 |

### 📚 其他功能模块

| 模块 | 优先级 | 预计时长 |
|------|--------|---------|
| **应用设置** | P1 | 15 秒 |
| **语言切换** | P2 | 5 秒 |
| **快捷键面板** | P2 | 10 秒 |
| **版本更新提示** | P2 | 5 秒 |
| **性能面板** | P2 | 8 秒 |
| **小地图** | P1 | 10 秒 |
| **导出功能** | P1 | 12 秒 |

---

## 🎯 总结与建议

### ✅ 已完成的优势

1. ✅ **核心项目管理功能**：工具箱、素材库、项目管理、备份恢复全覆盖
2. ✅ **测试框架完善**：DSL 配置 + 手动录制双轨系统
3. ✅ **视觉效果统一**：品牌色、动画、标注完全一致
4. ✅ **代码质量高**：清晰注释、容错处理、可维护性强

### 🚨 最大缺口：AI 交互模块

**AI 输入栏 + ChatDrawer** 是 Aitu 的核心竞争力，但目前 **0% 测试覆盖**！

**重要性评分**：⭐⭐⭐⭐⭐ (5/5)
**紧急程度**：🔥🔥🔥🔥🔥 (5/5)
**用户影响**：🎯🎯🎯🎯🎯 (5/5)

### 📋 行动建议

#### 短期（本周）

1. ✅ 完成 AI 输入栏基础交互测试（3 个 GIF，~38 秒）
2. ✅ 完成 ChatDrawer 基础交互测试（2 个 GIF，~30 秒）
3. ✅ 添加 Mock API 支持，避免长时间等待

#### 中期（下周）

1. ✅ 完成智能提示面板测试（2 个 GIF，~27 秒）
2. ✅ 完成工作流高级功能测试（2 个 GIF，~35 秒）
3. ✅ 补充文本工具、多选、图层管理测试

#### 长期（本月内）

1. ✅ 达成 100% Manual 测试覆盖
2. ✅ 建立 CI/CD 自动化测试流程
3. ✅ 完善国际化（英文）测试

---

## 🔗 相关文档

- `docs/CODING_RULES.md` - 编码规则
- `docs/FEATURE_FLOWS.md` - 功能流程
- `apps/web-e2e/src/manual-gen/gif-recordings.manual.spec.ts` - 现有 GIF 测试
- `packages/drawnix/src/components/ai-input-bar/` - AI 输入栏源码
- `packages/drawnix/src/components/chat-drawer/` - ChatDrawer 源码

---

**生成时间**：2026-01-27  
**分析师**：Claude Sonnet 4.5  
**版本**：v1.0
