# Data Model: 对话抽屉 (Chat Drawer)

**Date**: 2025-12-03
**Feature**: 001-chat-drawer

## Entities

### ChatSession (对话会话)

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| id | string | 会话唯一标识 | UUID v4, 主键 |
| title | string | 会话标题 | 从首条消息截取，max 30字符 |
| createdAt | number | 创建时间戳 | Unix milliseconds |
| updatedAt | number | 最后更新时间戳 | Unix milliseconds |
| messageCount | number | 消息数量 | ≥ 0 |

**Lifecycle States**: Active → Archived (future)

**Indexes**:
- Primary: `id`
- Secondary: `updatedAt` (用于排序)

### ChatMessage (对话消息)

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| id | string | 消息唯一标识 | UUID v4, 主键 |
| sessionId | string | 所属会话ID | 外键 → ChatSession.id |
| role | 'user' \| 'assistant' | 消息角色 | 枚举值 |
| content | string | 消息内容 | Markdown格式 |
| timestamp | number | 发送时间戳 | Unix milliseconds |
| status | MessageStatus | 消息状态 | 枚举值 |
| attachments | Attachment[] | 附件列表 | 可选，数组 |
| error | string \| null | 错误信息 | 可选 |

**MessageStatus 枚举**:
- `sending`: 发送中
- `streaming`: AI正在生成
- `success`: 发送成功
- `failed`: 发送失败

**Indexes**:
- Primary: `id`
- Compound: `[sessionId, timestamp]` (用于按会话查询消息)

### Attachment (附件)

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| id | string | 附件唯一标识 | UUID v4 |
| name | string | 文件名 | max 255字符 |
| type | string | MIME类型 | e.g., 'image/png' |
| size | number | 文件大小 | bytes |
| data | string | 文件数据 | Base64 或 Blob URL |
| isBlob | boolean | 是否为Blob URL | 用于清理 |

**支持的文件类型**:
- 图片: image/png, image/jpeg, image/gif, image/webp
- 文档: application/pdf, text/plain, text/markdown
- 其他: application/json, text/csv

**大小限制**:
- 单个文件: 10MB
- 单条消息总附件: 20MB

### DrawerState (抽屉状态)

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| isOpen | boolean | 是否展开 | 默认 false |
| width | number | 当前宽度 | 320-500px，默认视口30% |
| activeSessionId | string \| null | 当前活跃会话ID | 可选 |

**Note**: DrawerState 存储在 localStorage，不使用 IndexedDB（需要同步访问）

## Relationships

```
┌─────────────────┐       ┌─────────────────┐
│   ChatSession   │ 1:N   │   ChatMessage   │
│─────────────────│───────│─────────────────│
│ id (PK)         │       │ id (PK)         │
│ title           │       │ sessionId (FK)  │
│ createdAt       │       │ role            │
│ updatedAt       │       │ content         │
│ messageCount    │       │ timestamp       │
└─────────────────┘       │ status          │
                          │ attachments[]   │
                          └─────────────────┘
                                  │
                                  │ 1:N (embedded)
                                  ▼
                          ┌─────────────────┐
                          │   Attachment    │
                          │─────────────────│
                          │ id              │
                          │ name            │
                          │ type            │
                          │ size            │
                          │ data            │
                          └─────────────────┘
```

## Storage Schema

### IndexedDB Configuration

```javascript
// Database: 'aitu-chat'
// Version: 1

const stores = {
  sessions: {
    keyPath: 'id',
    indexes: [
      { name: 'updatedAt', keyPath: 'updatedAt', unique: false }
    ]
  },
  messages: {
    keyPath: 'id',
    indexes: [
      { name: 'sessionId', keyPath: 'sessionId', unique: false },
      { name: 'sessionTimestamp', keyPath: ['sessionId', 'timestamp'], unique: false }
    ]
  }
};
```

### localStorage Keys

```typescript
const CHAT_STORAGE_KEYS = {
  DRAWER_STATE: 'aitu:chat:drawer-state',
  ACTIVE_SESSION: 'aitu:chat:active-session',
};
```

## Validation Rules

### ChatSession
- `id`: 必须是有效的 UUID v4
- `title`: 非空，最大30字符，自动从首条消息截取
- `createdAt/updatedAt`: 有效的 Unix 时间戳

### ChatMessage
- `id`: 必须是有效的 UUID v4
- `sessionId`: 必须引用存在的 ChatSession
- `role`: 必须是 'user' 或 'assistant'
- `content`: 用户消息最大10000字符，AI消息无限制
- `attachments`: 单条消息最多5个附件

### Attachment
- `type`: 必须在支持的 MIME 类型列表中
- `size`: 单个文件最大10MB
- `data`: Base64 字符串或有效的 Blob URL

## Data Cleanup Policies

### 自动清理
- 会话数量超过50时，删除最早的会话（保留最近50个）
- 单会话消息超过100条时，删除最早的消息
- Blob URL 在页面卸载时自动释放

### 手动清理
- 用户可删除单个会话及其所有消息
- 用户可清空所有对话历史

## Migration Strategy

### Version 1 (Initial)
- 创建 sessions 和 messages stores
- 无需迁移

### Future Versions
- 使用 localforage 的版本管理
- 迁移脚本模式参考 `history-migration.ts`
