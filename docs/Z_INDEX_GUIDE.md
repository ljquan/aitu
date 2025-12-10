# Z-Index 层级管理规范

## 当前问题分析

经过代码审查，发现以下z-index混乱问题：
1. **unified-toolbar (1000)** 遮挡了弹窗和popover
2. **popup/popover (1000)** 与toolbar使用相同层级
3. **AI弹窗 (2000)** 被unified-toolbar遮挡
4. **多个组件使用1000** 导致层级冲突
5. **临时修复层出现9999、10000等随意值**

## Z-Index 层级规范

采用**分层设计**，每层预留100个单位空间：

```
┌─────────────────────────────────────────────┐
│ Layer 9: Critical Overlays (9000+)         │  全局最高层
├─────────────────────────────────────────────┤
│ Layer 8: Image Viewer (8000-8999)          │  图片查看器
├─────────────────────────────────────────────┤
│ Layer 7: Auth Dialogs (7000-7999)          │  认证弹窗
├─────────────────────────────────────────────┤
│ Layer 6: Notifications (6000-6999)         │  通知提示
├─────────────────────────────────────────────┤
│ Layer 5: Modals (5000-5999)                │  模态弹窗
├─────────────────────────────────────────────┤
│ Layer 4: Drawers/Panels (4000-4999)        │  抽屉/面板
├─────────────────────────────────────────────┤
│ Layer 3: Popovers (3000-3999)              │  弹出层
├─────────────────────────────────────────────┤
│ Layer 2: Toolbars (2000-2999)              │  工具栏
├─────────────────────────────────────────────┤
│ Layer 1: Canvas Elements (1000-1999)       │  画布元素
├─────────────────────────────────────────────┤
│ Layer 0: Base (0-999)                      │  基础层
└─────────────────────────────────────────────┘
```

### 详细层级定义

#### Layer 0: Base (0-999)
- **0-99**: 默认文档流
- **100-199**: 画布内部元素（selection, drag handlers）
- **200-299**: 预留

#### Layer 1: Canvas Elements (1000-1999)
- **1000-1099**: 画布装饰元素（网格、辅助线）
- **1100-1199**: 临时元素（resize handles, anchors）
- **1200-1299**: 预留

#### Layer 2: Toolbars (2000-2999)
- **2000**: unified-toolbar (主工具栏)
- **2010**: creation-toolbar
- **2020**: popup-toolbar
- **2030**: zoom-toolbar
- **2040**: app-toolbar
- **2050**: pencil-mode-toolbar
- **2100-2199**: 其他工具栏

#### Layer 3: Popovers (3000-3999)
- **3000**: 工具栏popover (freehand-panel, shape-picker, arrow-picker)
- **3010**: feedback-button popover
- **3020**: zoom-toolbar popover
- **3030**: app-toolbar popover
- **3100-3199**: 其他popover
- **3500**: Tooltip (始终在popover之上)

#### Layer 4: Drawers/Panels (4000-4999)
- **4000**: task-queue-panel
- **4010**: chat-drawer
- **4020**: generation-history drawer
- **4100-4199**: 其他侧边栏

#### Layer 5: Modals (5000-5999)
- **5000**: 普通Dialog (ttd-dialog)
- **5010**: clean-confirm
- **5020**: settings-dialog
- **5100**: AI Image Generation Dialog (react-rnd窗口)
- **5110**: AI Video Generation Dialog (react-rnd窗口)
- **5200-5299**: Dialog内部元素（header, footer等）
- **5500-5599**: Dialog内的popover/select

#### Layer 6: Notifications (6000-6999)
- **6000**: active-task-warning
- **6100**: Toast通知
- **6200**: 成功/错误提示

#### Layer 7: Auth Dialogs (7000-7999)
- **7000**: API key auth dialog
- **7100**: 登录/注册弹窗

#### Layer 8: Image Viewer (8000-8999)
- **8000**: Image viewer overlay
- **8010**: Image viewer toolbar
- **8020**: Image viewer close button

#### Layer 9: Critical Overlays (9000+)
- **9000**: Loading spinner (全屏)
- **9100**: 系统级错误提示
- **9999**: 开发调试层

## 实施规则

### 1. 使用CSS变量
```scss
// styles/variables.scss
$z-index: (
  // Layer 0: Base
  'canvas-internal': 100,
  
  // Layer 1: Canvas Elements  
  'canvas-decoration': 1000,
  'canvas-temporary': 1100,
  
  // Layer 2: Toolbars
  'unified-toolbar': 2000,
  'creation-toolbar': 2010,
  'popup-toolbar': 2020,
  'zoom-toolbar': 2030,
  'app-toolbar': 2040,
  'pencil-toolbar': 2050,
  
  // Layer 3: Popovers
  'popover': 3000,
  'popover-feedback': 3010,
  'popover-zoom': 3020,
  'popover-app': 3030,
  'tooltip': 3500,
  
  // Layer 4: Drawers
  'task-queue-panel': 4000,
  'chat-drawer': 4010,
  'generation-history': 4020,
  
  // Layer 5: Modals
  'dialog': 5000,
  'dialog-clean-confirm': 5010,
  'dialog-settings': 5020,
  'dialog-ai-image': 5100,
  'dialog-ai-video': 5110,
  'dialog-inner': 5200,
  'dialog-popover': 5500,
  
  // Layer 6: Notifications
  'active-task-warning': 6000,
  'toast': 6100,
  'message': 6200,
  
  // Layer 7: Auth
  'auth-dialog': 7000,
  
  // Layer 8: Image Viewer
  'image-viewer': 8000,
  'image-viewer-toolbar': 8010,
  'image-viewer-close': 8020,
  
  // Layer 9: Critical
  'loading': 9000,
  'system-error': 9100,
  'debug': 9999,
);

// 辅助函数
@function z($layer) {
  @return map-get($z-index, $layer);
}
```

### 2. TypeScript常量
```typescript
// constants/z-index.ts
export const Z_INDEX = {
  // Layer 0: Base
  CANVAS_INTERNAL: 100,
  
  // Layer 1: Canvas Elements
  CANVAS_DECORATION: 1000,
  CANVAS_TEMPORARY: 1100,
  
  // Layer 2: Toolbars
  UNIFIED_TOOLBAR: 2000,
  CREATION_TOOLBAR: 2010,
  POPUP_TOOLBAR: 2020,
  ZOOM_TOOLBAR: 2030,
  APP_TOOLBAR: 2040,
  PENCIL_TOOLBAR: 2050,
  
  // Layer 3: Popovers
  POPOVER: 3000,
  POPOVER_FEEDBACK: 3010,
  POPOVER_ZOOM: 3020,
  POPOVER_APP: 3030,
  TOOLTIP: 3500,
  
  // Layer 4: Drawers
  TASK_QUEUE_PANEL: 4000,
  CHAT_DRAWER: 4010,
  GENERATION_HISTORY: 4020,
  
  // Layer 5: Modals
  DIALOG: 5000,
  DIALOG_CLEAN_CONFIRM: 5010,
  DIALOG_SETTINGS: 5020,
  DIALOG_AI_IMAGE: 5100,
  DIALOG_AI_VIDEO: 5110,
  DIALOG_INNER: 5200,
  DIALOG_POPOVER: 5500,
  
  // Layer 6: Notifications
  ACTIVE_TASK_WARNING: 6000,
  TOAST: 6100,
  MESSAGE: 6200,
  
  // Layer 7: Auth
  AUTH_DIALOG: 7000,
  
  // Layer 8: Image Viewer
  IMAGE_VIEWER: 8000,
  IMAGE_VIEWER_TOOLBAR: 8010,
  IMAGE_VIEWER_CLOSE: 8020,
  
  // Layer 9: Critical
  LOADING: 9000,
  SYSTEM_ERROR: 9100,
  DEBUG: 9999,
} as const;

export type ZIndexKey = keyof typeof Z_INDEX;
```

### 3. 使用示例

#### SCSS中使用
```scss
@import 'styles/variables';

.unified-toolbar {
  z-index: z('unified-toolbar'); // 2000
}

.my-popover {
  z-index: z('popover'); // 3000
}
```

#### TSX中使用
```tsx
import { Z_INDEX } from '@/constants/z-index';

<Rnd style={{ zIndex: Z_INDEX.DIALOG_AI_IMAGE }}>
  {/* AI Image Dialog */}
</Rnd>

<PopoverContent style={{ zIndex: Z_INDEX.POPOVER }}>
  {/* Popover content */}
</PopoverContent>
```

## 禁止事项

❌ **禁止随意使用魔术数字**
```scss
// ❌ 错误
.my-component {
  z-index: 9999; // 不要使用随意的大数字
}

.another {
  z-index: 10001; // 临时修复会破坏层级体系
}
```

✅ **正确做法**
```scss
// ✅ 正确
@import 'styles/variables';

.my-component {
  z-index: z('dialog'); // 使用预定义的层级
}
```

❌ **禁止在同一层级随意加减**
```scss
// ❌ 错误
.toolbar {
  z-index: 2000;
}
.toolbar-fixed {
  z-index: 2001; // 破坏了层级结构
}
```

✅ **正确做法**
```scss
// ✅ 正确 - 如果需要层内排序，使用DOM顺序或position
.toolbar {
  z-index: z('unified-toolbar');
}
.toolbar-fixed {
  z-index: z('unified-toolbar');
  position: relative; // DOM顺序决定层级
}
```

## Code Review检查清单

在代码审查时，检查以下项目：

- [ ] 所有z-index使用都通过变量/常量引用
- [ ] 没有硬编码的魔术数字
- [ ] 新增组件的z-index符合层级规范
- [ ] 没有超过9999的z-index值
- [ ] Popover/Tooltip使用对应层级(3000+)
- [ ] Dialog/Modal使用对应层级(5000+)
- [ ] 临时修复已转换为规范用法

## 迁移计划

### Phase 1: 创建变量文件
- [ ] 创建 `styles/z-index.scss`
- [ ] 创建 `constants/z-index.ts`

### Phase 2: 修复关键冲突
- [ ] unified-toolbar: 1000 → 2000
- [ ] popovers: 1000 → 3000
- [ ] task-queue-panel: 999 → 4000
- [ ] AI dialogs: 2000 → 5100

### Phase 3: 全面迁移
- [ ] 替换所有SCSS中的硬编码z-index
- [ ] 替换所有TSX中的内联z-index
- [ ] 移除临时修复(9999, 10000等)

### Phase 4: 文档和测试
- [ ] 更新CODEBUDDY.md
- [ ] 添加层级可视化测试页面
- [ ] 团队培训

## 常见问题

**Q: 如果需要在两个预定义层级之间插入新层级怎么办?**  
A: 每层预留了100个单位空间。例如在popover(3000)和drawer(4000)之间，可以使用3100-3999。

**Q: TDesign组件的z-index怎么处理?**  
A: 通过组件的style或className属性覆盖，或使用TDesign的zIndex prop。

**Q: react-rnd的默认z-index是多少?**  
A: 默认没有z-index，需要显式设置。统一使用`Z_INDEX.DIALOG_*`系列。

**Q: 如何调试z-index问题?**  
A: 
1. 使用浏览器DevTools的3D视图
2. 临时添加不同背景色区分层级
3. 使用 `debug: 9999` 层进行调试，完成后移除

## 参考资料

- [MDN: z-index](https://developer.mozilla.org/en-US/docs/Web/CSS/z-index)
- [CSS Stacking Context](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_positioned_layout/Understanding_z-index/Stacking_context)
- [React Portals](https://react.dev/reference/react-dom/createPortal)
