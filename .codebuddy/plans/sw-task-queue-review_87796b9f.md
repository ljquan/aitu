---
name: sw-task-queue-review
overview: 对 Service Worker 任务队列迁移项目进行全面 review，识别设计问题、潜在 bug 和需要修复的 TypeScript 编译错误。
todos:
  - id: explore-files
    content: 使用 [subagent:code-explorer] 搜索项目中所有 Service Worker 任务队列相关的新增和修改文件
    status: completed
  - id: check-ts-errors
    content: 检查并修复所有 TypeScript 编译错误
    status: completed
    dependencies:
      - explore-files
  - id: review-interfaces
    content: 审查任务队列相关的接口定义和类型声明
    status: completed
    dependencies:
      - explore-files
  - id: review-core-logic
    content: 审查任务队列核心逻辑实现，识别潜在 bug
    status: completed
    dependencies:
      - review-interfaces
  - id: review-integration
    content: 审查任务队列与 Service Worker 的集成点
    status: completed
    dependencies:
      - review-core-logic
  - id: generate-report
    content: 汇总所有问题并生成修复建议报告
    status: completed
    dependencies:
      - check-ts-errors
      - review-integration
---

## Product Overview

对 Service Worker 任务队列迁移项目进行全面代码审查，识别并修复设计问题、潜在 bug 和 TypeScript 编译错误，确保代码质量和功能正确性。

## Core Features

- 全面审查所有新增和修改的核心文件
- 识别 TypeScript 编译错误并提供修复方案
- 发现设计问题和潜在 bug
- 验证任务队列迁移逻辑的正确性
- 确保代码符合项目规范和最佳实践

## 技术审查范围

### 审查重点

- **TypeScript 类型系统**: 检查类型定义、接口声明、泛型使用是否正确
- **Service Worker 生命周期**: 验证任务队列在 SW 环境中的正确行为
- **异步处理逻辑**: 检查 Promise、async/await 的正确使用
- **错误处理机制**: 确保异常情况得到妥善处理

### 常见问题类型

1. **编译错误**: 类型不匹配、缺失类型声明、导入错误
2. **设计问题**: 接口设计不合理、职责划分不清、耦合度过高
3. **潜在 bug**: 边界条件处理、并发问题、内存泄漏风险

### 审查方法

- 静态代码分析
- TypeScript 编译器错误检查
- 代码逻辑走查
- 接口一致性验证

## Agent Extensions

### SubAgent

- **code-explorer**
- Purpose: 搜索项目中所有与 Service Worker 任务队列相关的文件，包括新增文件和修改文件
- Expected outcome: 获取完整的代码变更范围，识别所有需要审查的文件列表