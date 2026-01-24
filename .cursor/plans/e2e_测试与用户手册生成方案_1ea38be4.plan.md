---
name: E2E 测试与用户手册生成方案
overview: 建立分层 E2E 测试体系（冒烟测试 + 完整测试 + 视觉回归），并基于测试过程自动生成带截图的 HTML 用户手册，与发布流程集成确保文档同步更新。
todos:
  - id: setup-test-structure
    content: 创建测试目录结构和基础配置 (smoke/features/visual/manual-gen)
    status: completed
  - id: create-page-objects
    content: 实现 DrawnixApp Page Object 封装和测试固件
    status: completed
  - id: add-testids
    content: 为关键 UI 组件添加 data-testid 属性
    status: completed
  - id: write-smoke-tests
    content: 编写冒烟测试用例 (工具栏/AI输入/素材库)
    status: completed
  - id: write-visual-tests
    content: 编写视觉回归测试 (图标完整性检查)
    status: completed
  - id: write-feature-tests
    content: 编写完整功能测试用例
    status: completed
  - id: create-manual-generator
    content: 实现 HTML 用户手册生成脚本
    status: completed
  - id: integrate-ci
    content: 集成到 CI/CD 流程 (PR冒烟+发布完整)
    status: completed
  - id: integrate-release
    content: 集成到发布流程，确保手册同步更新
    status: completed
---

# E2E 测试与用户手册自动生成方案

## 一、测试架构设计

```
apps/web-e2e/src/
├── smoke/                    # 冒烟测试 (PR 时运行, ~2min)
│   ├── app-load.spec.ts      # 应用加载
│   ├── toolbar.spec.ts       # 工具栏基础点击
│   └── critical-path.spec.ts # 关键路径
├── features/                 # 功能测试 (发布前运行)
│   ├── drawing/              # 绘图功能
│   ├── ai-generation/        # AI 生成
│   ├── mindmap/              # 思维导图
│   ├── media-library/        # 素材库
│   ├── project/              # 项目管理
│   └── settings/             # 设置
├── visual/                   # 视觉回归测试
│   └── icons.spec.ts         # 图标完整性检查
├── manual-gen/               # 用户手册生成测试
│   └── *.manual.spec.ts      # 带文档元数据的测试
├── fixtures/                 # 测试固件
│   ├── test-app.ts           # 应用页面对象
│   └── manual-helper.ts      # 手册生成助手
└── utils/
    └── doc-metadata.ts       # 文档元数据工具
```

## 二、关键实现要点

### 1. Page Object Model 封装

在 [`apps/web-e2e/src/fixtures/test-app.ts`](apps/web-e2e/src/fixtures/test-app.ts) 封装核心页面对象:

```typescript
export class DrawnixApp {
  readonly toolbar: {
    hand: Locator;
    pencil: Locator;
    shapes: Locator;
    // ...
  };
  readonly aiInputBar: Locator;
  readonly mediaLibrary: Locator;
  // ...

  async waitForReady() {
    await this.page.waitForSelector('drawnix');
  }
}
```

### 2. 测试元素定位策略

利用现有的 `data-testid` (132 处)，补充缺失的关键元素:

- 工具栏按钮添加 `data-testid="toolbar-{tool}"`
- 对话框添加 `data-testid="dialog-{name}"`
- AI 输入框添加 `data-testid="ai-input-bar"`

### 3. 视觉回归测试（图标检查）

```typescript
// visual/icons.spec.ts
test('toolbar icons should be complete', async ({ page }) => {
  await page.goto('/');
  const toolbar = page.locator('[data-testid="unified-toolbar"]');
  await expect(toolbar).toHaveScreenshot('toolbar-icons.png');
});
```

### 4. 用户手册自动生成机制

核心思路：测试代码中嵌入文档元数据，执行时自动截图，构建后 AI 生成自然语言描述。

```typescript
// manual-gen/drawing.manual.spec.ts
test.describe('绘图功能', () => {
  test('使用画笔绘制', async ({ page }, testInfo) => {
    // 文档元数据
    testInfo.annotations.push({
      type: 'manual',
      description: JSON.stringify({
        category: '基础绘图',
        title: '使用画笔工具',
        steps: ['点击画笔工具', '在画布上拖拽绘制']
      })
    });

    // 测试 + 截图
    await page.click('[data-testid="toolbar-pencil"]');
    await page.screenshot({ path: 'step-1-click-pencil.png' });
    // ...
  });
});
```

## 三、HTML 用户手册生成流程

```
E2E 测试执行
    │
    ├── 生成测试报告 (Playwright Report)
    ├── 收集截图 (test-results/)
    └── 收集元数据 (annotations)
    │
    ▼
scripts/generate-manual.ts
    │
    ├── 解析测试结果 JSON
    ├── 提取带 'manual' 注解的测试
    ├── 组织截图和步骤描述
    └── 调用 AI 润色文档内容 (可选)
    │
    ▼
生成 HTML 用户手册
    │
    └── docs/user-manual/
        ├── index.html
        ├── drawing.html
        ├── ai-generation.html
        └── assets/screenshots/
```

## 四、CI/CD 集成

### 现有 CI 配置修改

在 [`.github/workflows/ci.yml`](.github/workflows/ci.yml) 中:

```yaml
# PR 时运行冒烟测试
- run: npx nx e2e web-e2e --project=chromium --grep="@smoke"

# 发布前运行完整测试 + 生成手册
release-e2e:
  runs-on: ubuntu-latest
  steps:
    - run: npx nx e2e web-e2e --project=chromium
    - run: pnpm run generate:manual
    - uses: actions/upload-artifact@v4
      with:
        name: user-manual
        path: docs/user-manual/
```

### package.json 新增脚本

```json
{
  "scripts": {
    "e2e": "nx e2e web-e2e",
    "e2e:smoke": "nx e2e web-e2e --grep='@smoke'",
    "e2e:visual": "nx e2e web-e2e --grep='@visual'",
    "generate:manual": "ts-node scripts/generate-manual.ts"
  }
}
```

## 五、用户手册与发布同步

### 发布流程集成

修改 [`scripts/deploy-hybrid.js`](scripts/deploy-hybrid.js):

```javascript
async function deploy() {
  // 1. 构建应用
  await runBuild();

  // 2. 运行 E2E 测试 + 生成手册
  await runE2ETests();
  await generateManual();

  // 3. 部署应用 + 手册
  await deployApp();
  await deployManual(); // 部署到 docs.opentu.ai
}
```

### 手册版本管理

- 手册文件纳入 Git 管理 (`docs/user-manual/`)
- 版本号与应用版本同步 (从 `package.json` 读取)
- 发布时自动更新手册页面的版本信息

## 六、关键测试用例清单

| 模块 | 测试点 | 类型 |

|------|-------|------|

| 工具栏 | 所有工具按钮可点击 | smoke |

| 工具栏 | 工具切换正常 | smoke |

| 工具栏 | 图标完整性 | visual |

| AI 输入 | 输入框可输入 | smoke |

| AI 输入 | 模型选择器正常 | feature |

| 素材库 | 打开/关闭 | smoke |

| 素材库 | 上传/删除 | feature |

| 项目管理 | 新建项目 | feature |

| 设置 | 打开设置对话框 | smoke |

| 设置 | API Key 配置 | feature |

| 思维导图 | 创建节点 | feature |

| 视图导航 | 缩放功能 | feature |

## 七、AI 辅助文档生成（可选增强）

利用 AI 将测试步骤转换为友好的用户指南:

```typescript
// scripts/generate-manual.ts
async function enhanceWithAI(steps: TestStep[]): Promise<string> {
  const prompt = `将以下测试步骤转换为用户友好的操作指南:
${JSON.stringify(steps)}

要求:
1. 使用简洁的中文描述
2. 每个步骤配合截图说明
3. 添加必要的注意事项`;

  // 调用 AI API (Gemini/Claude)
  return await aiService.generateText(prompt);
}
```

## 八、补充需要的 data-testid

需要在以下组件补充测试 ID:

- [`packages/drawnix/src/components/toolbar/unified-toolbar.tsx`](packages/drawnix/src/components/toolbar/unified-toolbar.tsx) - 添加 `data-testid="unified-toolbar"`
- [`packages/drawnix/src/components/ai-input-bar/AIInputBar.tsx`](packages/drawnix/src/components/ai-input-bar/AIInputBar.tsx) - 补充输入框和按钮的 testid
- [`packages/drawnix/src/components/media-library/MediaLibraryModal.tsx`](packages/drawnix/src/components/media-library/MediaLibraryModal.tsx) - 添加模态框 testid
- [`packages/drawnix/src/components/settings-dialog/settings-dialog.tsx`](packages/drawnix/src/components/settings-dialog/settings-dialog.tsx) - 添加设置项 testid