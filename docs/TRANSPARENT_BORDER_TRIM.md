# 透明边框裁剪优化

## 问题描述

对于基于透明度切分的场景（如合并图片还原），需要实现严格的"去透明边"逻辑：
- **去除**：图像四周完全透明的区域（alpha = 0）
- **保留**：任何包含非透明像素的区域（alpha > 0）

## 修改内容

### 1. `trimTransparentBorders` 函数增强

**位置**: `packages/drawnix/src/utils/image-splitter.ts:1044`

**修改前**:
- 使用 `isTransparentPixel` 函数，默认阈值为 50
- alpha < 50 的像素被认为是透明的
- 可能会误裁剪半透明的内容

**修改后**:
```typescript
function trimTransparentBorders(
  imageData: ImageData,
  strict: boolean = true
): { top: number; right: number; bottom: number; left: number }
```

- 新增 `strict` 参数（默认 `true`）
- **严格模式** (`strict = true`): 只有 alpha = 0 才认为是透明，避免裁剪任何非完全透明的像素
- **非严格模式** (`strict = false`): alpha < 50 认为是透明，保持原有行为

### 2. `splitImageByLines` 函数应用严格裁剪

**位置**: `packages/drawnix/src/utils/image-splitter.ts:897`

**修改前**:
```typescript
if (hasAlpha) {
  // 合并图片：不裁剪边框，保持完整
  borders = { top: 0, right: sw - 1, bottom: sh - 1, left: 0 };
}
```

**修改后**:
```typescript
if (hasAlpha) {
  // 透明图片：使用严格模式裁剪透明边框
  // 只去除完全透明（alpha=0）的边缘，保留任何包含非透明像素的区域
  borders = trimTransparentBorders(regionData, true);
}
```

## 技术细节

### 严格透明检测算法

```typescript
const alphaThreshold = strict ? 0 : 50;

const isRowTransparent = (y: number): boolean => {
  for (let x = 0; x < width; x++) {
    const idx = (y * width + x) * 4;
    const alpha = data[idx + 3];
    if (alpha > alphaThreshold) {
      return false; // 发现非透明像素，该行不是完全透明
    }
  }
  return true; // 整行都是透明的
};
```

### 裁剪逻辑

1. **从四个方向扫描**：顶部、底部、左侧、右侧
2. **逐行/逐列检查**：检查每一行/列是否所有像素都满足透明条件
3. **停止条件**：遇到第一个包含非透明像素的行/列时停止
4. **返回边界**：返回内容区域的边界坐标

## 使用场景

### 适用场景
- ✅ 合并图片还原（透明分割线）
- ✅ AI 生成的透明背景图片
- ✅ 需要精确保留边缘内容的场景

### 不适用场景
- ❌ 普通白色背景图片（使用 `trimWhiteBordersOnly`）
- ❌ 需要去除半透明边缘的场景（使用非严格模式）

## 测试建议

### 测试用例

1. **完全透明边缘**
   - 输入：四周有 10px 完全透明（alpha=0）的边缘
   - 期望：边缘被完全裁剪

2. **半透明边缘**
   - 输入：四周有 10px 半透明（alpha=128）的边缘
   - 期望：边缘被保留（不裁剪）

3. **混合边缘**
   - 输入：顶部完全透明，其他边有半透明内容
   - 期望：只裁剪顶部，其他边保留

4. **无透明边缘**
   - 输入：边缘直接是不透明内容
   - 期望：不裁剪任何内容

### 验证方法

```typescript
// 在浏览器控制台查看日志
// 日志会显示裁剪前后的尺寸和边界信息
console.log('[splitImageByLines] Transparent image: strict transparent border trim', {
  row, col,
  originalSize: { width: sw, height: sh },
  borders,
  trimmedSize: {
    width: borders.right - borders.left + 1,
    height: borders.bottom - borders.top + 1
  }
});
```

## 性能考虑

- **时间复杂度**: O(width × height)，需要扫描所有边缘像素
- **优化建议**:
  - 对于大图片，可以考虑采样检测
  - 可以提前终止扫描（遇到非透明像素立即停止）

## 相关文件

- `packages/drawnix/src/utils/image-splitter.ts` - 主要实现
- `packages/drawnix/src/utils/image-border-utils.ts` - 边框检测工具

## 版本历史

- **2026-01-09**: 初始实现，支持严格透明边框裁剪
