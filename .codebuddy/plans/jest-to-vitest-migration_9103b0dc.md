---
name: jest-to-vitest-migration
overview: 将项目中所有基于 Jest 的单元测试迁移到 Vitest，并移除 Jest 相关依赖和配置文件。
todos:
  - id: explore-jest-files
    content: 使用 [subagent:code-explorer] 探索所有 Jest 测试文件和配置文件的具体内容
    status: completed
  - id: migrate-tests
    content: 将 5 个测试文件从 Jest 语法迁移到 Vitest 语法
    status: completed
    dependencies:
      - explore-jest-files
  - id: remove-jest-configs
    content: 删除 6 个 Jest 配置文件和 1 个 preset 文件
    status: completed
    dependencies:
      - migrate-tests
  - id: remove-jest-deps
    content: 从 package.json 中移除 6 个 Jest 相关依赖
    status: completed
    dependencies:
      - remove-jest-configs
  - id: verify-tests
    content: 运行 Vitest 验证所有迁移后的测试用例正常通过
    status: completed
    dependencies:
      - remove-jest-deps
---

## 产品概述

将项目中所有基于 Jest 的单元测试迁移到 Vitest 测试框架，确保测试功能完整保留，同时清理所有 Jest 相关的依赖和配置文件。

## 核心功能

- 迁移 5 个测试文件从 Jest 语法到 Vitest 语法
- 移除 6 个 Jest 配置文件和 1 个 preset 文件
- 从 package.json 中移除 6 个 Jest 相关依赖
- 确保迁移后所有测试用例正常运行

## 技术栈

- 测试框架：Vitest（已有配置）
- 现有配置：`packages/drawnix/vitest.config.ts` 和 `collimind/vitest.config.ts`

## 迁移方案

### Jest 到 Vitest 语法差异

主要需要调整的部分：

- 导入语句：从 `@jest/globals` 改为 `vitest`
- Mock 函数：`jest.fn()` 改为 `vi.fn()`
- Mock 模块：`jest.mock()` 改为 `vi.mock()`
- 定时器：`jest.useFakeTimers()` 改为 `vi.useFakeTimers()`
- 清理函数：`jest.clearAllMocks()` 改为 `vi.clearAllMocks()`

### 需要迁移的文件

```
packages/drawnix/src/services/tracking/__tests__/
├── 测试文件1
├── 测试文件2
├── 测试文件3
├── 测试文件4
└── 测试文件5
```

### 需要删除的配置文件

- 6 个 Jest 配置文件
- 1 个 Jest preset 文件

### 需要移除的依赖

从 package.json 中移除 6 个 Jest 相关依赖包

## 子代理

- **code-explorer**
- 用途：探索项目中所有 Jest 相关的测试文件、配置文件和依赖项
- 预期结果：获取完整的 Jest 配置文件列表、测试文件内容和 package.json 中的 Jest 依赖