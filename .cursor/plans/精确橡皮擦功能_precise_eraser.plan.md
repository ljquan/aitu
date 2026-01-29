# 精确橡皮擦功能实现计划

## 功能概述

在橡皮擦工具栏上添加"精确模式"开关，启用后使用布尔运算（Difference）从元素中精确擦除经过的区域，而不是简单删除整个元素。

## 当前实现分析

### 现有橡皮擦逻辑
- 文件：`packages/drawnix/src/plugins/freehand/with-freehand-erase.ts`
- 行为：检测橡皮擦与元素相交 → 标记整个元素 → 删除

### 橡皮擦设置
- 文件：`packages/drawnix/src/plugins/freehand/freehand-settings.ts`
- 现有配置：`eraserWidth`（橡皮擦宽度）

### 橡皮擦工具栏
- 文件：`packages/drawnix/src/components/toolbar/pencil-settings-toolbar/eraser-settings-toolbar.tsx`
- 现有功能：大小选择器

## 实现步骤

### 步骤 1：扩展橡皮擦设置

**修改文件**: `packages/drawnix/src/plugins/freehand/freehand-settings.ts`

```typescript
export interface FreehandSettings {
  strokeWidth: number;
  strokeColor: string;
  strokeStyle: FreehandStrokeStyle;
  eraserWidth: number;
  pressureEnabled: boolean;
  preciseEraserEnabled: boolean;  // 新增：精确橡皮擦开关
}

const DEFAULT_FREEHAND_SETTINGS: FreehandSettings = {
  // ... 现有配置
  preciseEraserEnabled: false,  // 默认关闭
};

// 新增设置函数
export const setPreciseEraserEnabled = (board: PlaitBoard, enabled: boolean) => {
  const current = getFreehandSettings(board);
  FREEHAND_SETTINGS.set(board, { ...current, preciseEraserEnabled: enabled });
};
```

### 步骤 2：添加 i18n 翻译

**修改文件**: `packages/drawnix/src/i18n.tsx`

```typescript
// Translations 接口
'toolbar.preciseEraser': string;
'toolbar.preciseEraserTip': string;

// 中文
'toolbar.preciseEraser': '精确擦除',
'toolbar.preciseEraserTip': '启用后只擦除经过的区域，而不是整个图形',

// 英文
'toolbar.preciseEraser': 'Precise Erase',
'toolbar.preciseEraserTip': 'Erase only the path area instead of the whole shape',
```

### 步骤 3：更新橡皮擦工具栏 UI

**修改文件**: `packages/drawnix/src/components/toolbar/pencil-settings-toolbar/eraser-settings-toolbar.tsx`

```tsx
import { Switch, Tooltip } from 'tdesign-react';
import { getFreehandSettings, setEraserWidth, setPreciseEraserEnabled } from '...';

export const EraserSettingsToolbar: React.FC = () => {
  // ... 现有状态
  const [preciseMode, setPreciseMode] = useState(settings.preciseEraserEnabled);

  // 处理精确模式切换
  const handlePreciseModeChange = useCallback((checked: boolean) => {
    setPreciseMode(checked);
    setPreciseEraserEnabled(board, checked);
  }, [board]);

  return (
    <div className="pencil-settings-toolbar eraser-settings-toolbar">
      {/* ... 现有内容 */}
      <Island ref={containerRef} padding={1}>
        <Stack.Row gap={1} align="center">
          {/* 大小选择器 */}
          <SizePicker ... />
          
          {/* 分隔线 */}
          <div className="toolbar-divider" />
          
          {/* 精确模式开关 */}
          <Tooltip content={t('toolbar.preciseEraserTip')} theme="light">
            <div className="precise-eraser-switch">
              <Switch
                size="small"
                value={preciseMode}
                onChange={handlePreciseModeChange}
              />
              <span className="switch-label">{t('toolbar.preciseEraser')}</span>
            </div>
          </Tooltip>
        </Stack.Row>
      </Island>
    </div>
  );
};
```

### 步骤 4：创建精确擦除工具函数

**新建文件**: `packages/drawnix/src/transforms/precise-erase.ts`

```typescript
import { PlaitBoard, PlaitElement, Point } from '@plait/core';
import { ClipperLibType, ClipperPath } from './boolean';

// Clipper 缩放因子
const CLIPPER_SCALE = 1000;

/**
 * 将橡皮擦路径转换为有宽度的多边形
 * 使用 ClipperOffset 将线段扩展为带宽度的区域
 */
export async function eraserPathToPolygon(
  points: Point[],
  width: number
): Promise<Point[]> {
  if (points.length < 2) return [];
  
  const ClipperLib = await loadClipperLib();
  
  // 将路径转换为 Clipper 格式
  const clipperPath: ClipperPath = points.map(p => ({
    X: Math.round(p[0] * CLIPPER_SCALE),
    Y: Math.round(p[1] * CLIPPER_SCALE),
  }));
  
  // 使用 ClipperOffset 扩展路径
  const offset = new ClipperLib.ClipperOffset();
  offset.AddPath(clipperPath, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etOpenRound);
  
  const result: ClipperPath[] = [];
  offset.Execute(result, (width / 2) * CLIPPER_SCALE);
  
  if (result.length === 0) return [];
  
  // 转换回 Point 格式
  return result[0].map(p => [p.X / CLIPPER_SCALE, p.Y / CLIPPER_SCALE] as Point);
}

/**
 * 执行精确擦除操作
 * @param board 画板
 * @param eraserPath 橡皮擦路径点
 * @param eraserWidth 橡皮擦宽度
 * @param targetElements 目标元素列表
 */
export async function executePreciseErase(
  board: PlaitBoard,
  eraserPath: Point[],
  eraserWidth: number,
  targetElements: PlaitElement[]
): Promise<void> {
  // 1. 将橡皮擦路径转换为多边形
  const eraserPolygon = await eraserPathToPolygon(eraserPath, eraserWidth);
  if (eraserPolygon.length < 3) return;
  
  // 2. 对每个目标元素执行 Difference 操作
  for (const element of targetElements) {
    await eraseFromElement(board, element, eraserPolygon);
  }
}

/**
 * 从单个元素中擦除指定区域
 */
async function eraseFromElement(
  board: PlaitBoard,
  element: PlaitElement,
  eraserPolygon: Point[]
): Promise<void> {
  // 1. 将元素转换为多边形
  const elementPolygon = elementToPolygon(board, element);
  if (!elementPolygon || elementPolygon.length < 3) return;
  
  // 2. 执行 Difference 布尔运算
  const ClipperLib = await loadClipperLib();
  const clipper = new ClipperLib.Clipper();
  const solution: ClipperPath[] = [];
  
  // 元素作为 Subject
  clipper.AddPath(
    pointsToClipperPath(elementPolygon),
    ClipperLib.PolyType.ptSubject,
    true
  );
  
  // 橡皮擦区域作为 Clip
  clipper.AddPath(
    pointsToClipperPath(eraserPolygon),
    ClipperLib.PolyType.ptClip,
    true
  );
  
  // 执行 Difference
  clipper.Execute(
    ClipperLib.ClipType.ctDifference,
    solution,
    ClipperLib.PolyFillType.pftNonZero,
    ClipperLib.PolyFillType.pftNonZero
  );
  
  // 3. 处理结果
  if (solution.length === 0) {
    // 完全擦除 - 删除元素
    CoreTransforms.removeElements(board, [element]);
  } else {
    // 部分擦除 - 替换为新的 PenPath
    CoreTransforms.removeElements(board, [element]);
    for (const resultPath of solution) {
      const newElement = polygonToPenPath(
        clipperPathToPoints(resultPath),
        getElementStrokeColor(element),
        getElementFill(element),
        getElementStrokeWidth(element)
      );
      Transforms.insertNode(board, newElement, [board.children.length]);
    }
  }
}
```

### 步骤 5：修改橡皮擦插件

**修改文件**: `packages/drawnix/src/plugins/freehand/with-freehand-erase.ts`

```typescript
import { getFreehandSettings } from './freehand-settings';
import { executePreciseErase } from '../../transforms/precise-erase';

export const withFreehandErase = (board: PlaitBoard) => {
  // ... 现有代码
  
  let eraserPath: Point[] = [];  // 新增：记录橡皮擦路径
  
  board.pointerDown = (event: PointerEvent) => {
    const isEraserPointer = PlaitBoard.isInPointer(board, [FreehandShape.eraser]);

    if (isEraserPointer && isDrawingMode(board)) {
      isErasing = true;
      elementsToDelete.clear();
      eraserPath = [];  // 重置路径
      
      const currentPoint: Point = [event.x, event.y];
      eraserPath.push(toViewBoxPoint(board, toHostPoint(board, currentPoint[0], currentPoint[1])));
      
      const settings = getFreehandSettings(board);
      if (!settings.preciseEraserEnabled) {
        // 快速模式：标记删除
        checkAndMarkFreehandElementsForDeletion(currentPoint);
      }
      return;
    }

    pointerDown(event);
  };

  board.pointerMove = (event: PointerEvent) => {
    if (isErasing) {
      throttleRAF(board, 'with-freehand-erase', () => {
        const currentPoint: Point = [event.x, event.y];
        const viewBoxPoint = toViewBoxPoint(board, toHostPoint(board, currentPoint[0], currentPoint[1]));
        eraserPath.push(viewBoxPoint);
        
        const settings = getFreehandSettings(board);
        if (!settings.preciseEraserEnabled) {
          // 快速模式：标记删除
          checkAndMarkFreehandElementsForDeletion(currentPoint);
        } else {
          // 精确模式：实时预览（可选）
          // showErasePreview(eraserPath);
        }
      });
      return;
    }

    pointerMove(event);
  };

  const complete = async () => {
    if (isErasing) {
      const settings = getFreehandSettings(board);
      
      if (settings.preciseEraserEnabled && eraserPath.length >= 2) {
        // 精确模式：执行布尔运算擦除
        const targetElements = findElementsInEraserPath(board, eraserPath, settings.eraserWidth);
        if (targetElements.length > 0) {
          await executePreciseErase(board, eraserPath, settings.eraserWidth, targetElements);
        }
      } else {
        // 快速模式：删除整个元素
        deleteMarkedElements();
      }
      
      isErasing = false;
      elementsToDelete.clear();
      eraserPath = [];
    }
  };

  // ... 其余代码
};
```

### 步骤 6：添加样式

**修改文件**: `packages/drawnix/src/components/toolbar/pencil-settings-toolbar/pencil-settings-toolbar.scss`

```scss
.eraser-settings-toolbar {
  .toolbar-divider {
    width: 1px;
    height: 20px;
    background: var(--drawnix-toolbar-divider-color, #e0e0e0);
    margin: 0 8px;
  }

  .precise-eraser-switch {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    
    .switch-label {
      font-size: 12px;
      color: var(--drawnix-text-color, #333);
      white-space: nowrap;
    }
  }
}
```

## 需要修改的文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `plugins/freehand/freehand-settings.ts` | 修改 | 添加 `preciseEraserEnabled` 配置 |
| `i18n.tsx` | 修改 | 添加翻译 |
| `toolbar/.../eraser-settings-toolbar.tsx` | 修改 | 添加开关 UI |
| `toolbar/.../pencil-settings-toolbar.scss` | 修改 | 添加样式 |
| `transforms/precise-erase.ts` | 新建 | 精确擦除核心逻辑 |
| `transforms/boolean.ts` | 修改 | 导出需要复用的函数 |
| `plugins/freehand/with-freehand-erase.ts` | 修改 | 集成精确擦除 |

## 技术依赖

- 复用 `transforms/boolean.ts` 中的布尔运算逻辑
- 复用 `clipper-lib` 库的 `ClipperOffset` 功能

## 用户体验设计

1. **默认关闭**：精确模式默认关闭，保持现有快速擦除行为
2. **视觉反馈**：开关旁显示 Tooltip 说明功能差异
3. **性能提示**：精确模式在 pointerUp 时执行，避免实时卡顿
4. **结果预览**：可选 - 擦除过程中显示预计擦除区域

## 边界情况处理

1. **完全擦除**：元素被完全擦除时删除
2. **分割成多块**：擦除后元素分成多块，创建多个新 PenPath
3. **擦除非闭合元素**：不支持，提示用户
4. **撤销支持**：支持 Ctrl+Z 撤销

## 测试要点

1. 开关状态正确保存和恢复
2. 快速模式行为不变
3. 精确模式正确执行布尔运算
4. 各种形状的擦除效果（矩形、椭圆、PenPath、Freehand）
5. 撤销/重做功能正常
6. 性能：大量点时不卡顿

## 预估工作量

| 步骤 | 预估 |
|------|------|
| 步骤 1-3（设置和 UI） | 简单 |
| 步骤 4（核心函数） | 中等 |
| 步骤 5（插件集成） | 中等 |
| 步骤 6（样式） | 简单 |
| 测试和调优 | 中等 |
