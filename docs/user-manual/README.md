# 用户手册生成系统

## 快速开始

### 一键更新用户手册（推荐）

```bash
pnpm manual:update
```

这个命令会自动完成：
1. 运行 E2E 测试生成带标注的截图
2. 自动复制截图到正确位置
3. 编译 MDX 文档生成 HTML

### 分步执行

如果需要单独执行某个步骤：

```bash
# 1. 只生成截图（需要开发服务器运行）
pnpm manual:screenshots

# 2. 只编译 HTML（会自动复制 E2E 截图）
pnpm manual:build
```

## 目录结构

```
docs/user-manual/
├── config.yaml          # 配置文件
├── content/             # MDX 源文件
│   ├── index.mdx
│   ├── basics/
│   ├── drawing/
│   ├── ai-generation/
│   └── advanced/
└── README.md            # 本文档

apps/web-e2e/
├── src/manual-gen/      # 截图生成测试
│   ├── basics.manual.spec.ts
│   ├── drawing.manual.spec.ts
│   ├── ai-generation.manual.spec.ts
│   └── advanced.manual.spec.ts
├── src/utils/
│   └── screenshot-annotations.ts  # 标注工具库
└── test-results/
    └── manual-screenshots/  # 生成的截图（自动复制）

apps/web/public/user-manual/  # 最终输出
├── index.html
├── *.html               # 各页面
└── screenshots/         # 截图文件
```

## 添加新截图

1. 编辑 `apps/web-e2e/src/manual-gen/` 目录下的测试文件
2. 使用标注工具库添加带标注的截图：

```typescript
import {
  screenshotWithAnnotations,
  circleOnElement,
  highlightElement,
  arrowToElement,
  circle,
  arrow,
  highlight,
} from '../utils/screenshot-annotations';

// 基于元素位置的标注（推荐）
const btn = page.getByRole('button', { name: /示例/ });
const annotations = [];

// 高亮框 + 标签（标签位置：top/bottom/left/right）
const highlight = await highlightElement(btn, '按钮说明', 4, undefined, 'right');
if (highlight) annotations.push(highlight);

// 箭头标注（direction: left/right/up/down）
const arrow = await arrowToElement(btn, '说明文字', 'left', { x: 20 });
if (arrow) annotations.push(arrow);

// 数字圆圈
const circle = await circleOnElement(btn, 1, { x: -30 });
if (circle) annotations.push(circle);

// 截图
await screenshotWithAnnotations(
  page,
  'test-results/manual-screenshots/example.png',
  annotations
);
```

3. 在 MDX 文档中引用截图：

```mdx
<Screenshot id="example" />
<p class="screenshot-caption">截图说明</p>
```

4. 运行 `pnpm manual:update` 更新

## 标注位置策略

- **左侧工具栏元素**：使用 `labelPosition='right'` 或 `direction='left'`
- **右侧面板元素**：使用 `labelPosition='left'` 或 `direction='right'`
- **对话框/弹窗**：基于对话框 boundingBox 计算相对位置
- **避免遮挡**：标注放在元素的 tooltip 通常出现的位置

## 常见问题

### 截图位置不对？

检查标注工具的参数：
- `highlightElement(element, label, padding, color, labelPosition)`
- `arrowToElement(element, label, direction, offset, color)`
- `circleOnElement(element, number, offset, color)`

### 测试失败？

1. 确保开发服务器运行：`pnpm start`
2. 检查元素选择器是否正确
3. 添加适当的等待时间：`await page.waitForTimeout(500)`

### 需要调试？

```bash
# 显示浏览器运行测试
cd apps/web-e2e && npx playwright test --project=manual --headed

# 查看测试报告
npx playwright show-report apps/web-e2e/playwright-report
```

## 录制测试代码

使用 Playwright Codegen 录制用户操作，自动生成测试代码：

```bash
pnpm manual:record
```

1. 浏览器窗口打开后，进行你想录制的操作
2. Playwright Inspector 窗口会显示生成的代码
3. 复制代码到测试文件中

## 生成 GIF 动图

### 步骤 1：录制视频

```bash
# 运行带视频录制的测试
pnpm manual:video

# 或单独运行某个测试
cd apps/web-e2e && CI= npx playwright test --project=manual-video -g "测试名称"
```

视频保存在 `apps/web-e2e/test-results/` 目录下（WebM 格式）。

### 步骤 2：转换为 GIF

需要安装 [ffmpeg](https://ffmpeg.org/)：

```bash
# macOS
brew install ffmpeg

# 转换视频为 GIF（带裁剪）
node scripts/video-to-gif.js --test "测试名称" --trim 2.9
```

#### 裁剪参数说明

```bash
# 从第 2 秒开始
node scripts/video-to-gif.js --trim 2

# 从第 2 秒开始，取 15 秒
node scripts/video-to-gif.js --trim 2:15
```

### 一键生成思维导图 GIF

```bash
pnpm manual:gif:mindmap
```

这个命令会自动：
1. 录制思维导图创建演示视频
2. 裁剪并转换为 GIF
3. 重建用户手册
