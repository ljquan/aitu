# Quickstart: 批量生成数量选择

## 开发环境设置

```bash
# 进入项目目录
cd /Users/ljq/code/shuidiyu/aitu

# 安装依赖
npm install

# 启动开发服务器
npm start
# 访问 http://localhost:4200
```

## 测试功能

### 1. 打开AI生成弹窗
- 点击工具栏中的AI生成按钮
- 或使用快捷键打开

### 2. 测试数量选择
- 点击预设按钮（1/2/4）验证切换
- 在输入框中输入自定义数值
- 验证超范围输入被限制

### 3. 测试批量生成
- 选择数量为2或更多
- 输入提示词并提交
- 验证任务队列显示多个任务
- 验证任务并行执行

### 4. 测试结果展示
- 等待批量任务完成
- 验证所有结果正确显示
- 测试单个结果的操作（预览、下载、插入）

## 关键文件

| 文件 | 说明 |
|------|------|
| `packages/drawnix/src/components/ttd-dialog/generation-count-selector/GenerationCountSelector.tsx` | 数量选择组件 |
| `packages/drawnix/src/hooks/useGenerationCount.ts` | 数量状态管理 |
| `packages/drawnix/src/components/ttd-dialog/ai-image-generation.tsx` | 图片生成弹窗 |
| `packages/drawnix/src/components/ttd-dialog/ai-video-generation.tsx` | 视频生成弹窗 |
| `packages/drawnix/src/services/task-queue-service.ts` | 任务队列服务 |

## 运行测试

```bash
# 运行所有测试
npm test

# 运行特定包测试
nx test drawnix

# 类型检查
nx typecheck drawnix

# 代码检查
nx lint drawnix
```

## 调试提示

1. **查看任务状态**: 使用浏览器DevTools查看localStorage中的任务数据
2. **查看日志**: 任务创建和执行过程会输出到控制台
3. **查看UI状态**: React DevTools检查组件状态
