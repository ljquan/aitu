# Quickstart: 对话抽屉 (Chat Drawer)

**Date**: 2025-12-03
**Feature**: 001-chat-drawer

## 快速开始

### 环境准备

```bash
# 确保在项目根目录
cd /Users/liquid/code/self/aitu

# 安装依赖
npm install

# 启动开发服务器
npm start
# 访问 http://localhost:7200
```

### 开发工作流

```bash
# 类型检查
nx typecheck drawnix

# 代码检查
nx lint drawnix

# 运行测试
nx test drawnix

# 构建
nx build drawnix
```

## 文件位置

### 新建文件清单

```text
packages/drawnix/src/
├── components/
│   └── chat-drawer/
│       ├── ChatDrawer.tsx          # 主组件
│       ├── ChatDrawerTrigger.tsx   # 触发按钮
│       ├── MessageList.tsx         # 消息列表
│       ├── MessageItem.tsx         # 单条消息
│       ├── MessageInput.tsx        # 输入框
│       ├── SessionList.tsx         # 会话列表
│       ├── SessionItem.tsx         # 单个会话
│       ├── AttachmentPreview.tsx   # 附件预览
│       ├── StreamingText.tsx       # 流式文本
│       ├── index.ts                # 导出入口
│       └── chat-drawer.scss        # 样式
├── hooks/
│   ├── useChatSessions.ts
│   ├── useChatMessages.ts
│   ├── useChatStream.ts
│   └── useChatStorage.ts
├── services/
│   └── chat-service.ts
├── types/
│   └── chat.types.ts
└── constants/
    └── CHAT_CONSTANTS.ts
```

### 需要修改的现有文件

```text
packages/drawnix/src/
├── drawnix.tsx                    # 添加 ChatDrawer 组件
├── hooks/use-drawnix.tsx          # 扩展 DrawnixState 添加 chat 状态
└── styles/index.scss              # 导入 chat-drawer.scss
```

## 关键实现参考

### 1. 组件结构参考

参考 `components/task-queue/TaskQueuePanel.tsx`:
- 面板展开/收起动画
- 状态管理模式
- BEM 样式命名

### 2. 存储实现参考

参考 `services/storage-service.ts`:
- localforage 配置
- 异步存储操作
- 存储容量管理

### 3. 流式响应参考

参考 `utils/gemini-api/`:
- API 调用模式
- 流式数据处理
- 错误处理

### 4. 样式参考

参考 `components/task-queue/task-queue.scss`:
- BEM 命名规范
- CSS 变量使用
- 响应式布局

## 集成步骤

### Step 1: 创建类型定义

```typescript
// packages/drawnix/src/types/chat.types.ts
// 从 specs/001-chat-drawer/contracts/chat-api.ts 复制接口定义
```

### Step 2: 创建常量

```typescript
// packages/drawnix/src/constants/CHAT_CONSTANTS.ts
export const CHAT_CONSTANTS = {
  MAX_SESSIONS: 50,
  MAX_MESSAGES_PER_SESSION: 100,
  // ...
};
```

### Step 3: 实现存储服务

```typescript
// packages/drawnix/src/services/chat-storage-service.ts
import localforage from 'localforage';

const chatStore = localforage.createInstance({
  name: 'aitu-chat',
  storeName: 'sessions',
});
```

### Step 4: 实现 Hooks

```typescript
// packages/drawnix/src/hooks/useChatStorage.ts
export function useChatStorage() {
  // 参考 useTaskStorage.ts 实现
}
```

### Step 5: 实现组件

```typescript
// packages/drawnix/src/components/chat-drawer/ChatDrawer.tsx
export const ChatDrawer: React.FC<ChatDrawerProps> = () => {
  // 实现
};
```

### Step 6: 集成到主组件

```typescript
// packages/drawnix/src/drawnix.tsx
import { ChatDrawer } from './components/chat-drawer';

// 在 Wrapper 组件内添加
<ChatDrawer />
```

## 测试验证

### 手动测试清单

1. **抽屉展开/收起**
   - [ ] 点击触发按钮展开抽屉
   - [ ] 点击收起按钮收起抽屉
   - [ ] 动画流畅（60fps）

2. **发送消息**
   - [ ] 输入文本并发送
   - [ ] 显示加载状态
   - [ ] 流式显示 AI 回复

3. **对话历史**
   - [ ] 刷新页面后历史保留
   - [ ] 关闭浏览器后历史保留

4. **会话管理**
   - [ ] 创建新会话
   - [ ] 切换会话
   - [ ] 删除会话

5. **附件功能**
   - [ ] 上传图片
   - [ ] 上传文档
   - [ ] 显示附件预览

6. **响应式布局**
   - [ ] 桌面端自适应宽度
   - [ ] 移动端全屏覆盖

## 常见问题

### Q: 如何调试存储问题？

```javascript
// 在浏览器控制台
const db = await localforage.createInstance({ name: 'aitu-chat' });
const sessions = await db.getItem('sessions');
console.log(sessions);
```

### Q: 如何查看 AI API 请求？

打开浏览器开发者工具 → Network 标签 → 筛选 Fetch/XHR

### Q: 组件样式不生效？

确保在 `styles/index.scss` 中导入了 `chat-drawer.scss`

## 相关文档

- [Spec](./spec.md) - 功能规格说明
- [Plan](./plan.md) - 实施计划
- [Research](./research.md) - 技术研究
- [Data Model](./data-model.md) - 数据模型
- [API Contracts](./contracts/chat-api.ts) - TypeScript 接口定义
