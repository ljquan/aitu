# AI 编码工具提示词记录

本文档整理了在各种 AI 编码工具（Cursor、Claude Code、Codebuddy）中使用过的用户提示词，供参考和复用。

---

## 问题定位与调试

### 移动端生图问题
```
生图模型nb24k-async 在移动端 Chrome，未能落 LLM API 日志，并且每次进度总是到 90%，无法生成，感觉没有真正发出请求。仔细定位并修复，可以加点日志定位
```

### 工作流调试
```
从AI输入框发送到工作流执行完成的核心链路加上debugger，我要调试一下为什么工作流未能正常执行，请求未能发送出去
```

### SW Debug 页面 Fetch 日志
```
现在/sw-debug.html未能捕获到任何Fetch 请求日志
还是没有，应该是service worker中没有正确记录吧
还是没有，或许可以加点日志定位。还有一个很奇怪的问题，主应用页面刷新会导致/sw-debug.html页面也刷新是怎么回事
```

### 页面白屏问题
```
现在应用页面无法正常加载
取消Update on reload后，页面一直在刷新
```

---

## 代码清理与优化

### 清理遗留代码
```
仔细 review 项目代码把没用到的代码或者遗留代码清理干净，把调试 console 清理干净
```

### 代码精简优化
```
目前项目代码臃肿，存在大量重复代码或未被使用的代码，想办法对代码进行精简优化，并提升加载性能，注意不能变更原逻辑
```

### 日志清理
```
/sw-debug.html?tab=gist页面中，Gist管理中的日志同步，希望能复用控制台日志展示组件
[GitHubApiService] Updating 1 files, total size: 92.87 KB
sw-console-capture.ts:203 [SyncEngine] Initializing sharding system for gistId: 2ef6...44c1
像这类同步相关的日志，不要在控制台打印，落在gist的同步日志中即可
```

---

## 功能开发

### Gist 同步日志功能
```
gist的同步日志增加复制按钮，最好事实展示日志，点击错误、告警、成功可以对数据经行筛选。gist的数据诊断没有任何数据，仔细定位
```

### 数据诊断功能
```
数据诊断点击任务对比、画板对比远程数据等都没数据。同时同步日志需要点击刷新才能看到新数据，应该有自动刷新的逻辑
```

```
数据诊断所有数据都是0
希望自动获取并解密 GitHub Token 以及获取远程数据
```

---

## 架构重构

### postmessage-duplex 双工通信
```
使用https://www.npmjs.com/package/postmessage-duplex 双工通讯工具，改造 service worker 和应用层通信，解决同时打开多个页面任务重复添加等问题
```

```
既然已经用postmessage-duplex替换掉原有的通讯机制，应该把旧代码删除掉
```

```
仔细 review 当前分支的代码变更，充分发挥 postmessage 双工通讯的优势，简化通信流程，优化代码逻辑。现在应用层加载白屏也许修复。
```

### SW 降级处理
```
任务和工作流已经把依赖 sw 的地方改成可降级，仔细检查其他地方，还有没有需要可降级的地方需要调整，确保在 sw 未准备好的时候能够工作
```

---

## Gist 同步优化

### Gist 分片存储自动选择
```
由于现在采用了分片存储 gist，因此在配置 gist 的 token 后，需要能自动选择主 gist，这样就不允许用户手动切换 gist 了
```

### Gist 同步策略优化
```
仔细 review 基于gist 进行数据同步的代码。当前项目是一个纯前端的项目，希望借助 gist 使项目具有后端的数据同步能力。梳理项目中数据同步的策略，探索可能优化的地方。有一个明确可以优化的地方是每次 30 秒自动同步当前画布图片的时候，对于缓存中不存在的图片都会重新请求，这是没有必要的，因为缓存中没有本身就意味着请求失败，没必要再失败一次。
```

### 文件名过长问题
```
GitHubApiError: 文件名过长: 359 字符
url的base64容易超长，换成hash吧，shard-manifest.json等文件非图片的base64编码都应加密
```

---

## 模块提炼

### 工具函数提炼
```
仔细 review@packages/drawnix/src/utils 看有哪些可以作为公共方法提炼到@packages/utils 并添加单测
```

### 工作流能力提炼
```
能否把工作流相关能力提炼出来放到@packages/utils 中，并添加完善的单元测试确保无误
```

```
@packages/utils/package.json 应要有测试的命令
```

```
在@packages/utils/src/workflow下添加原理、流程、使用 文档
```

```
@types.ts (24-35) 工作流的核心是这个数据结构，和执行工作流的方法，而相关的能力似乎未被提炼过来，文档也未提及
```

```
export type { ToolCall, WorkflowJsonResponse } from '@aitu/utils';避免二次导出，在用到的地方直接引入
```

```
工作流似乎少了上下文和递归调用的介绍。比方说每一个next元素的返回都可以添加上下文信息，并且next元素的返回如果不是null的话，就是一个工作流的数据，支持递归调用
```

```
增加对代码结构和阅读顺序的结束
```

---

## 快速修复指令

### TypeScript 错误修复
```
For the code present, we get this error:
  Type number trivially inferred from a number literal, remove type annotation.
Fix it, verify, and then give a concise explanation. @packages/utils/src/format/index.ts:22-25
```

### LLM API 日志字段支持
```
不能简单得删掉，remoteId 和 errorMessage 还是有意义的，应当在LLM API 中支持展示
```

---

## 文档更新

### 更新 CLAUDE.md
```
/update-claude-md
```

### Git 操作
```
提交
推送到远程
```

---

## 提示词模式总结

### 问题定位模式
```
[问题描述]，仔细定位并修复，可以加点日志定位
```

### 代码审查模式
```
仔细 review [范围] 的代码变更，[优化目标]
```

### 功能增强模式
```
[现有功能] 增加 [新能力]，[具体要求]
```

### 模块提炼模式
```
能否把 [功能] 相关能力提炼出来放到 [目标位置]，并添加完善的单元测试确保无误
```

### 降级处理模式
```
[已处理的部分] 已经改成可降级，仔细检查其他地方，还有没有需要可降级的地方需要调整，确保在 [异常情况] 能够工作
```

### 快速修复模式
```
For the code present, we get this error:
  [错误信息]
Fix it, verify, and then give a concise explanation. @[文件路径:行号]
```

---

## 常用 Slash 命令

| 命令 | 说明 |
|------|------|
| `/update-claude-md` | 更新 CLAUDE.md 文档规则 |
| `/auto-commit` | 自动分析变更并提交 |
| `/commit-push-pr` | 一键提交、推送、创建 PR |
| `/fix-and-validate` | 自动修复代码问题并验证 |
| `/validate` | 运行完整验证流程 |

---

---

## Claude Code 提示词

### 代码审查与优化
```
review当前分支的修改,优化不合理的地方修复可能的问题
```

### 日志清理
```
删除所有[SWChannel]调试日志
```

### 问题定位
```
还是没有正确执行,加点日志定位
```

```
installHook.js:1 [SWChannel] [ServiceWorkerChannel](page):  Invalid message structure: Message must have requestId, cmdname, or msg field
sw-console-capture.ts:125 [SWChannel] [ServiceWorkerChannel](page):  onMessage 
{type: 'SW_DEBUG_NEW_CRASH_SNAPSHOT', snapshot: {…}}  这里似乎陷入了死循环
```

### 架构分析
```
按道理已经使用postmessage-duplex,不应该再有addEventListener('message'类似的消息监听,这2种处理方式冲突了
```

```
还是死循环了,可能 console 的消息通过 postmessage 发送给 service worker 而 postmessage 中又有 console,所以存在死循环
```

### 功能优化
```
用了新的方式处理 postmessage, /sw-debug.html 的 PostMessage日志 处理方式可以优化一下,因为现在 service worker 通信可以区分应用页面了,可以标注出是跟哪个应用进行通信
```

### 白屏问题
```
[SW Console Capture] 已初始化
index.ts:77 Service Worker v0.5.63 installing...
index.ts:77 Service Worker: Cannot load precache-manifest.json, skipping precache
installHook.js:1 [MemoryLog] 白屏检测: 画板组件未加载  现在进入应用白屏
```

### 错误处理探索
```
探索这个项目中处理 API 错误的代码结构，特别是：

1. 找到 apiCalls.ts 中 onError 处理的位置和逻辑
2. 找到设置对话框（SettingsDialog）的打开方式和相关状态管理
3. 找到 DrawnixContext 或其他全局状态管理中控制对话框显示的方法
4. 查看 workflow-submission-service.ts 中错误处理的逻辑
5. 查看是否有现有的全局错误提示机制（如 toast/notification）

需要了解：
- 如何从 Service Worker 或 API 层触发主线程的 UI 变化
- 设置对话框是如何被打开的
- 是否有现有的事件机制来处理这种跨层级的通信

请返回相关文件路径和关键代码片段。
```

### 技术问答
```
servise worker会对所有兄弟域名或子域名生效吗
```

---

## AI 编码工具配置目录

| 工具 | 全局配置目录 | 对话历史位置 |
|------|------------|-------------|
| Cursor | `~/.cursor/` | `~/.cursor/projects/{project}/agent-transcripts/` |
| Claude Code | `~/.claude/` | `~/.claude/projects/{project}/*.jsonl` |
| Codebuddy | `~/.codebuddy/` | `~/.codebuddy/projects/{project}/*.jsonl` |

---

*最后更新: 2026-02-05*
