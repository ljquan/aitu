# 重复事件上报修复 - 验证指南

**修复版本**: V2
**修复日期**: 2025-12-05

## 快速验证步骤

### 方法 1: 浏览器控制台检查 ⭐ 推荐

1. 打开应用的浏览器控制台（F12）

2. 运行以下代码检查事件监听器数量：

```javascript
// 检查 click 事件监听器
const listeners = getEventListeners(document.body);
console.log('📊 Click listeners count:', listeners.click?.length);

// 预期输出: 1
// 如果 > 1，说明还有重复问题
```

3. **结果判断**:
   - ✅ `listeners.click.length === 1` → 修复成功
   - ❌ `listeners.click.length > 1` → 仍有问题，请重启应用

### 方法 2: 启用调试日志

1. 找到 `packages/drawnix/src/drawnix.tsx` 文件

2. 修改 plugins 配置，启用 devMode:

```typescript
const plugins: PlaitPlugin[] = [
  withDraw,
  withGroup,
  withMind,
  withMindExtend,
  withCommonPlugin,
  buildDrawnixHotkeyPlugin(updateAppState),
  withFreehand,
  buildPencilPlugin(updateAppState),
  buildTextLinkPlugin(updateAppState),
  withVideo,
  // ⬇️ 修改这一行，添加配置
  (editor) => withTracking(editor, {
    devMode: true,      // 启用调试模式
    logLevel: 'debug'   // 显示详细日志
  }),
];
```

3. 刷新应用，点击任意按钮

4. 观察控制台输出：

```
✅ 正常情况（修复成功）:
[Tracking] ✅ Track: chat_click_drawer_close

❌ 异常情况（仍有重复）:
[Tracking] ✅ Track: chat_click_drawer_close
[Tracking] ✅ Track: chat_click_drawer_close  ⬅️ 重复了！
```

### 方法 3: Umami Analytics 后台验证

1. 登录 Umami Analytics 后台

2. 进入"实时"（Real-time）视图

3. 在应用中点击一个按钮（如"收起对话"）

4. 观察 Umami 后台的事件流：

```
✅ 正常情况:
12:34:56  chat_click_drawer_close  (1 次)

❌ 异常情况:
12:34:56  chat_click_drawer_close  (2 次) ⬅️ 重复了！
12:34:56  chat_click_drawer_close
```

## 高级验证

### 验证单例模式

在控制台运行：

```javascript
// 检查是否是单例
let service1, service2;

// 模拟创建多个 editor
const editor1 = { /* mock editor */ };
const editor2 = { /* mock editor */ };

// 应该共享同一个 trackingService 实例
console.log(editor1.trackingService === editor2.trackingService);
// 预期输出: true
```

### 验证防抖机制

1. 启用 devMode（参考方法2）

2. **快速双击**任意按钮（<200ms 间隔）

3. 观察控制台输出：

```
[Tracking] ✅ Track: toolbar_click_hand
[Tracking] 🚫 Global debounce: toolbar_click_hand (85ms ago)  ⬅️ 第二次被拦截
```

4. **正常点击**（>200ms 间隔）

```
[Tracking] ✅ Track: toolbar_click_hand
// ... 等待 300ms ...
[Tracking] ✅ Track: toolbar_click_hand  ⬅️ 第二次正常上报
```

### 验证 onClick 功能

点击各个按钮，确认功能正常：

- ✅ 聊天抽屉触发器：能正常打开/关闭对话框
- ✅ 工具栏按钮：能正常切换工具
- ✅ 任务队列按钮：能正常删除/重试任务
- ✅ 设置按钮：能正常保存设置

## 常见问题排查

### 问题1: 仍然有重复上报

**可能原因**: 应用未重启，旧的 TrackingService 实例仍在内存中

**解决方法**:
1. 完全关闭浏览器标签页
2. 重新打开应用
3. 硬刷新（Ctrl + Shift + R 或 Cmd + Shift + R）

### 问题2: 监听器数量 > 1

**可能原因**: 热重载导致多个实例累积

**解决方法**:
```javascript
// 在控制台手动重置
import { resetGlobalTrackingService } from './plugins/tracking';
resetGlobalTrackingService();
location.reload();
```

### 问题3: onClick 不工作

**可能原因**: 事件被其他代码阻止

**检查步骤**:
1. 打开控制台 → Elements 标签
2. 选中按钮元素
3. 查看 Event Listeners
4. 确认 click 事件监听器存在

### 问题4: 调试日志不显示

**可能原因**: devMode 未启用或配置未生效

**检查步骤**:
```javascript
// 在控制台检查配置
const service = document.querySelector('.drawnix')?.__trackingService;
console.log('DevMode:', service?.config?.devMode);
// 预期输出: true
```

## 性能验证

### 检查内存泄漏

1. 打开 Chrome DevTools → Performance 标签
2. 开始录制
3. 在应用中进行正常操作（点击按钮、打开对话框等）
4. 停止录制
5. 查看内存使用曲线

**正常情况**: 内存曲线平稳，有小幅波动但无持续增长

### 检查事件处理时间

```javascript
// 在控制台测试点击响应时间
console.time('click-response');
document.querySelector('[data-track="chat_click_drawer_close"]').click();
console.timeEnd('click-response');
// 预期输出: < 5ms
```

## 回归测试清单

验证以下功能是否正常：

### 聊天功能
- [ ] 打开/关闭聊天抽屉
- [ ] 切换会话列表
- [ ] 新建会话
- [ ] 删除会话
- [ ] 选择模型

### 工具栏功能
- [ ] 切换工具（手型、选择、画笔等）
- [ ] 调整尺寸
- [ ] 选择颜色
- [ ] 缩放画布

### 任务队列功能
- [ ] 打开/关闭任务面板
- [ ] 预览任务结果
- [ ] 删除任务
- [ ] 重试失败任务
- [ ] 插入到画板
- [ ] 下载结果

### AI 生成功能
- [ ] 图片生成
- [ ] 视频生成
- [ ] 调整参数
- [ ] 插入到画板

### 设置功能
- [ ] 打开设置对话框
- [ ] 保存设置
- [ ] 取消设置

## 验证成功标准

所有以下条件都满足，说明修复成功：

1. ✅ 事件监听器数量 = 1
2. ✅ 每次点击只上报 1 次事件
3. ✅ onClick 功能全部正常
4. ✅ 防抖机制正常工作（快速双击只上报 1 次）
5. ✅ devMode 日志正常显示
6. ✅ 无内存泄漏
7. ✅ 响应时间 < 5ms

## 报告问题

如果验证失败，请提供以下信息：

1. **监听器数量**: `getEventListeners(document.body).click?.length`
2. **控制台截图**: 包含错误或异常日志
3. **Umami 截图**: 显示重复事件
4. **复现步骤**: 详细的操作步骤
5. **环境信息**:
   - 浏览器版本
   - 操作系统
   - 应用版本/分支

## 自动化测试（可选）

创建 Cypress/Playwright 测试：

```typescript
describe('Tracking Deduplication', () => {
  it('should track event only once', () => {
    // 清空 Umami 事件队列
    cy.window().then((win) => {
      win.localStorage.removeItem('umami.cache');
    });

    // 点击按钮
    cy.get('[data-track="chat_click_drawer_close"]').click();

    // 等待上报
    cy.wait(1000);

    // 验证只上报了 1 次
    cy.window().then((win) => {
      const events = JSON.parse(win.localStorage.getItem('umami.cache') || '[]');
      const clickEvents = events.filter(e => e.name === 'chat_click_drawer_close');
      expect(clickEvents).to.have.length(1);
    });
  });
});
```

---

**最后更新**: 2025-12-05
**文档版本**: V2
**适用修复**: BUG_FIX_DUPLICATE_EVENTS_V2.md
