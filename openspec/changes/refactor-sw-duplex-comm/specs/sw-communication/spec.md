## ADDED Requirements

### Requirement: Duplex Communication Channel

应用层与 Service Worker 之间 SHALL 使用 postmessage-duplex 库建立双工通信通道。

#### Scenario: 页面初始化通道
- **WHEN** 页面加载完成
- **THEN** 自动创建 `ServiceWorkerChannel` 实例
- **AND** 等待 SW 就绪后建立连接
- **AND** 连接就绪前的消息 SHALL 自动缓存

#### Scenario: SW 接受新连接
- **WHEN** SW 收到新客户端连接消息
- **THEN** 为该客户端创建独立的通道实例
- **AND** 将通道存入 `Map<clientId, channel>`

### Requirement: Request-Response Task Creation

任务创建操作 SHALL 使用请求-响应模式，由 SW 返回创建结果。

#### Scenario: 成功创建新任务
- **GIVEN** 用户提交任务创建请求
- **WHEN** SW 验证任务不重复
- **THEN** SW 创建任务并返回 `{success: true, task: SWTask}`
- **AND** 应用层根据响应更新本地状态
- **AND** SW 广播 `task:created` 给其他客户端

#### Scenario: 拒绝重复任务
- **GIVEN** 用户提交任务创建请求
- **WHEN** SW 检测到相同参数的任务已存在
- **THEN** SW 返回 `{success: false, existingTaskId: string, reason: 'duplicate'}`
- **AND** 应用层 SHALL 不创建新任务

#### Scenario: 多页面同时提交相同任务
- **GIVEN** Tab A 和 Tab B 几乎同时提交相同任务
- **WHEN** SW 串行处理请求
- **THEN** 第一个请求成功创建任务
- **AND** 第二个请求收到重复拒绝响应
- **AND** 两个页面最终状态一致

### Requirement: Event-Based Status Updates

任务状态变更 SHALL 使用订阅模式通知所有客户端。

#### Scenario: 订阅任务状态变更
- **GIVEN** 页面订阅 `task:status` 事件
- **WHEN** 任何任务状态发生变更
- **THEN** 所有订阅客户端收到状态更新
- **AND** 事件包含 `{taskId, status, progress?, phase?}`

#### Scenario: 任务完成通知
- **GIVEN** 页面订阅 `task:completed` 事件
- **WHEN** 任务执行成功完成
- **THEN** 所有订阅客户端收到完成通知
- **AND** 事件包含 `{taskId, result}`

### Requirement: Chat Streaming via Subscribe

Chat 流式输出 SHALL 使用订阅模式。

#### Scenario: 订阅 Chat 流式输出
- **GIVEN** 页面发起 Chat 请求
- **WHEN** SW 开始生成响应
- **THEN** 订阅该 chatId 的客户端收到 `chat:chunk` 事件
- **AND** 响应完成时收到 `chat:done` 事件

### Requirement: Multi-Tab Isolation

多标签页 SHALL 独立管理各自的通道连接。

#### Scenario: 页面刷新重建连接
- **WHEN** 页面刷新
- **THEN** 旧通道自动销毁
- **AND** 新页面建立新通道
- **AND** SW 清理旧 clientId 的通道引用

#### Scenario: 页面关闭清理
- **WHEN** 页面关闭
- **THEN** SW 检测到客户端断开
- **AND** 清理对应的通道资源
