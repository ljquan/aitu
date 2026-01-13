# 合并图片智能拆分功能

## 功能概述

增强了智能拆图功能，现在可以识别并还原从"合并为图片"功能创建的透明背景图片。

## 技术实现

### 1. 透明度检测

新增 `hasTransparency()` 函数，用于检测图片是否包含透明度（Alpha 通道）：

```typescript
function hasTransparency(imageData: ImageData): boolean {
  // 采样检测，每隔 10 个像素检测一次
  // 如果超过 5% 的采样像素是透明的，认为图片有透明度
}
```

### 2. 透明分割线检测

新增透明分割线检测函数：

- `isTransparentPixel()` - 检测单个像素是否透明
- `getRowTransparentRatio()` - 获取一行的透明像素比例
- `getColTransparentRatio()` - 获取一列的透明像素比例
- `isHorizontalTransparentLine()` - 检测水平透明分割线（**要求 100% 透明**）
- `isVerticalTransparentLine()` - 检测垂直透明分割线（**要求 100% 透明**）

**重要**：透明分割线检测要求 `minTransparentRatio = 1.0`（100% 透明），这是为了避免将图形/文字的细线误判为分割线。例如：
- ✅ 完全透明的分隔区域 → 识别为分割线
- ❌ 包含手绘线条的区域（部分透明）→ 不识别为分割线
- ❌ 包含文字笔画的区域（部分透明）→ 不识别为分割线

这比白色分割线检测（90% 白色即可）更严格，确保不会切断图形和文字。

### 3. 透明边框裁剪

新增 `trimTransparentBorders()` 函数，专门用于裁剪透明边框：

```typescript
function trimTransparentBorders(imageData: ImageData): {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
```

**重要**：对于透明背景的合并图片，**禁用边框裁剪**，因为：
1. 透明分割线检测已经足够精确（要求 100% 透明）
2. 如果再裁剪透明边框，会导致文字被截断
3. 文字字符之间的透明间隙会被误判为边框

**实现逻辑**：
```typescript
// 根据图片类型选择 padding
// 透明图片：不使用 padding，因为透明分割线检测已经足够精确（100% 透明）
// 普通图片：使用较大的 padding 以确保裁剪干净
const splitLinePadding = hasAlpha ? 0 : 8;

if (hasAlpha) {
  // 合并图片：不裁剪边框，保持完整
  borders = { top: 0, right: sw - 1, bottom: sh - 1, left: 0 };
} else {
  // 普通图片：裁剪白边和灰边
  borders = trimBorders(regionData, 0.5, 0.15);
}
```

**为什么不使用 padding**：
- ❌ 如果使用 padding（跳过分割线附近的像素），会导致文字边缘被截断
- ✅ 透明分割线检测要求 100% 透明，已经足够精确，不需要额外的 padding
- ✅ 直接使用检测到的分割线位置，保证内容完整

**过滤完全透明的子图片**：
```typescript
// 检查是否完全透明（对于透明背景图片）
if (hasAlpha && isCompletelyTransparent(regionData)) {
  console.log('[splitImageByLines] Skipping completely transparent region');
  continue;
}
```

这样可以避免将贯通文字的透明分割线区域插入到画布，导致出现空白图片。

### 4. 智能检测流程

在 `detectGridLinesInternal()` 函数中，增强了分割线检测逻辑：

```typescript
// 检测图片是否有透明度（合并图片特征）
const hasAlpha = hasTransparency(imageData);

if (hasAlpha) {
  // 合并图片：只检测透明分割线，避免误判白色内容为分割线
  for (let y = marginY; y < height - marginY; y++) {
    if (isHorizontalTransparentLine(imageData, y)) {
      horizontalLines.push(y);
    }
  }
} else {
  // 普通图片：检测白色分割线
  for (let y = marginY; y < height - marginY; y++) {
    if (isHorizontalSplitLine(imageData, y)) {
      horizontalLines.push(y);
    }
  }
}
```

**重要**：当检测到透明度时，**只使用透明分割线检测**，不再检测白色分割线。这样可以避免将图片内容（如白色背景的人物）误判为分割线，防止"切人头"的问题。

### 5. 图片格式保留

在 `splitImageByLines()` 函数中，根据图片类型选择合适的输出格式：

```typescript
// 对于透明背景图片，保存为 PNG 以保留透明度
const imageFormat = hasAlpha ? 'image/png' : 'image/jpeg';
const imageQuality = hasAlpha ? undefined : 0.92;

elements.push({
  imageData: canvas.toDataURL(imageFormat, imageQuality),
  // ...
});
```

## 使用场景

### 场景 1：合并多个元素

1. 用户选中多个元素（图片、形状、文本等）
2. 点击工具栏的"合并为图片"按钮
3. 系统使用 `toImage()` 生成透明背景的 PNG 图片
4. 合并后的图片插入到画布

### 场景 2：还原合并图片

1. 用户选中合并后的图片
2. 点击工具栏的"智能拆图"按钮
3. 系统检测到图片有透明度
4. 使用透明区域作为分割线
5. 还原出原始的独立图片元素

## 支持的图片格式

智能拆图功能现在支持三种格式：

1. **网格分割线格式** - 白色分割线的宫格图
2. **透明分割线格式** - 合并图片的透明区域（新增）
3. **灵感图格式** - 灰色背景 + 白边框图片

## 技术优势

1. **自动识别** - 无需用户手动指定图片类型
2. **精确还原** - 使用透明区域精确定位原始元素边界
3. **格式保留** - 输出 PNG 格式保留透明度
4. **向后兼容** - 不影响现有的白色分割线检测逻辑
5. **防止误判** - 透明图片只检测透明分割线，避免"切人头"问题
6. **严格检测** - 要求 100% 透明，避免切断图形/文字的细线
7. **禁用递归** - 透明图片只拆分一次，保持文本框完整
8. **用户可控** - 如需进一步拆分，用户可手动再次操作
9. **保持布局** - 拆分后的子图片保持原图的相对位置和空间关系

## 关键设计决策

### 互斥检测策略

当检测到图片有透明度时，系统会**完全切换**到透明分割线检测模式，不再检测白色分割线。这是因为：

1. **合并图片特征**：通过"合并为图片"功能创建的图片，使用透明背景分隔元素
2. **避免误判**：如果同时检测白色分割线，会将图片内容（如白色背景的人物、白色衣服等）误判为分割线
3. **精确还原**：透明区域是合并时自动生成的，能够精确标记原始元素边界

### 透明度标记传递机制

为了确保递归拆分时保持一致性，系统实现了透明度标记传递机制：

1. **第一次检测**：在 `splitAndInsertImages` 中检测图片透明度
2. **标记传递**：将透明度标记 `hasTransparency` 添加到每个 `SplitImageElement`
3. **递归保持**：在 `recursiveSplitElement` 中，使用元素的透明度标记强制使用透明分割线检测
4. **从一而终**：整个拆分流程中，一旦检测到透明度，所有后续操作都使用透明分割线逻辑

**关键代码流程**：
```typescript
// 1. 第一次检测获取透明度信息
const { detection, hasTransparency } = await detectGridLinesInternal(imageUrl);

// 2. 传递给 splitImageByLines
const elements = await splitImageByLines(imageUrl, detection, hasTransparency);

// 3. 每个子元素都带有透明度标记
elements.push({
  imageData: canvas.toDataURL(imageFormat, imageQuality),
  hasTransparency: hasAlpha, // 传递给子元素
  // ...
});

// 4. 递归拆分时使用元素的透明度标记
const detection = await detectGridLines(imageUrl, element.hasTransparency);
const subElements = await splitImageByLines(imageUrl, detection, element.hasTransparency);
```

这样可以避免以下问题：
- ❌ 第一次拆分检测到透明度，使用透明分割线
- ❌ 第二次递归拆分时，子图片丢失透明度信息
- ❌ 回退到白色分割线检测，导致"切人头"

正确流程：
- ✅ 第一次拆分检测到透明度，使用透明分割线
- ✅ 透明度标记传递给所有子元素
- ✅ 第二次递归拆分时，强制使用透明分割线检测
- ✅ 完整还原所有图片，不会"切人头"

### 示例场景

**错误做法**（同时检测两种分割线）：
```
合并图片（透明背景）
  ├── 人物图片（白色背景）← 被误判为分割线
  └── 卡通图片
结果：人物的白色背景被当作分割线，导致人物被切碎
```

**正确做法**（只检测透明分割线）：
```
合并图片（透明背景）
  ├── 人物图片（白色背景）← 保持完整
  └── 卡通图片
结果：根据透明区域精确还原两张完整图片
```

### 严格的透明分割线检测

对于包含图形和文字的合并图片，透明分割线检测采用**100% 透明**的严格标准：

**问题场景**：
```
合并图片（透明背景）
  ├── 手绘图形（细线条）
  ├── 文字内容（笔画）
  └── 火柴人图形
```

如果使用 90% 透明的宽松标准：
- ❌ 手绘线条穿过的行/列会被误判为分割线
- ❌ 文字笔画穿过的行/列会被误判为分割线
- ❌ 结果：图形和文字被从中间切断

使用 100% 透明的严格标准：
- ✅ 只有完全透明的行/列才是分割线
- ✅ 任何包含内容的行/列都不会被切断
- ✅ 结果：图形和文字保持完整

**对比**：
| 检测类型 | 阈值 | 适用场景 | 原因 |
|---------|------|---------|------|
| 白色分割线 | 90% | 宫格图 | 允许一定容差，适应扫描图片的噪点 |
| 透明分割线 | 100% | 合并图片 | 严格检测，避免切断图形/文字的细线 |

### 禁用递归拆分

对于透明背景的合并图片，系统会**禁用递归拆分**，只进行一次拆分：

**问题场景**：
```
合并图片（透明背景）
  └── 文本框
      ├── 第一行文字
      ├── 透明间隙（行间距）
      ├── 第二行文字
      ├── 透明间隙
      └── 第三行文字
```

如果启用递归拆分：
- ❌ 第一次拆分：按元素边界拆分，得到文本框
- ❌ 第二次递归：检测到行间距的透明间隙
- ❌ 结果：文本框被切成多个单行文字碎片

禁用递归拆分：
- ✅ 第一次拆分：按元素边界拆分，得到完整文本框
- ✅ 不再递归：保持文本框完整
- ✅ 结果：文本框作为一个整体保留

**实现逻辑**：
```typescript
if (hasTransparency) {
  // 透明背景的合并图片：禁用递归拆分
  console.log('[splitAndInsertImages] Transparent image detected, disabling recursive split');
  elements = initialElements;
} else if (isStandardGrid) {
  // 标准宫格：直接使用拆分结果
  elements = initialElements;
} else {
  // 非标准宫格：允许递归拆分
  // 递归处理每个子元素...
}
```

**用户体验**：
- ✅ 合并图片拆分后，文本框保持完整
- ✅ 如果用户需要进一步拆分文本框，可以手动再次点击"智能拆图"
- ✅ 避免自动过度拆分，导致碎片化

### 保持原图相对位置

拆分后的子图片会保持在原图中的相对位置，而不是重新排列成网格：

**传统网格布局**：
```
原图布局：
  [图1]     [图2]

  [图3]     [图4]

拆分后（网格布局）：
  [图1] [图2]
  [图3] [图4]
```

**保持相对位置**：
```
原图布局：
  [图1]     [图2]

  [图3]     [图4]

拆分后（保持位置，整体下移）：
  原图位置
  ↓ +20px
  [图1]     [图2]

  [图3]     [图4]
```

**实现逻辑**：
```typescript
// 基准位置：在源图片下方 20px
baseX = sourceRect.x;
baseY = sourceRect.y + sourceRect.height + 20;

// 计算子图片在原图中的相对位置（缩放后）
const relativeX = element.sourceX * scale;
const relativeY = element.sourceY * scale;

// 计算最终插入位置
const insertX = baseX + relativeX;
const insertY = baseY + relativeY;

// 插入图片
DrawTransforms.insertImage(board, imageItem, [insertX, insertY]);
```

**优势**：
- ✅ **直观布局** - 拆分后的布局与原图一致，用户容易理解
- ✅ **保持结构** - 元素之间的空间关系得以保留
- ✅ **精确还原** - 完全还原原图的布局结构
- ✅ **无需调整** - 用户不需要手动重新排列元素
- ✅ **避免覆盖** - 拆分结果在原图下方，不会覆盖原图
- ✅ **便于对比** - 用户可以同时看到原图和拆分结果

## 调试日志

功能包含详细的调试日志，方便排查问题：

```typescript
console.log('[splitImageByLines] Image transparency detection:', { hasAlpha });
console.log('[splitImageByLines] Trimming transparent borders:', { row, col, borders });
console.log('[hasSplitLines] Detected grid lines:', { rows, cols });
```

## 性能优化

- 透明度检测使用采样算法，每隔 10 个像素检测一次
- 只在检测到透明度时才使用透明分割线检测
- 保持原有白色分割线检测的高效性

## 未来改进

1. 支持部分透明（半透明）的分割线检测
2. 优化透明度检测的采样策略
3. 支持更复杂的透明背景图片还原
