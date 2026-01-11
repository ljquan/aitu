---
name: smart-suggestion-panel
overview: "将 ModelSelector 和 PromptSuggestionPanel 合并为统一的 SmartSuggestionPanel 组件，支持 # 模型选择、- 参数提示、+ 生成个数选择，参数根据已选模型动态过滤且互斥。"
todos:
  - id: explore-existing
    content: 使用 [subagent:code-explorer] 探索现有 ModelSelector、PromptSuggestionPanel 组件和 model-config.ts 结构
    status: completed
  - id: extend-config
    content: 扩展 model-config.ts，为 videoDefaults/imageDefaults 添加参数兼容性配置
    status: completed
    dependencies:
      - explore-existing
  - id: create-types
    content: 创建 SmartSuggestionPanel 类型定义文件
    status: completed
    dependencies:
      - explore-existing
  - id: implement-hooks
    content: 实现 useTriggerDetection 和 useParameterFilter 自定义 Hooks
    status: completed
    dependencies:
      - create-types
  - id: implement-panel
    content: 实现 SmartSuggestionPanel 主组件，整合三种选择模式
    status: completed
    dependencies:
      - implement-hooks
      - extend-config
  - id: integrate-component
    content: 将 SmartSuggestionPanel 集成到现有页面，替换原有组件
    status: completed
    dependencies:
      - implement-panel
---

## 产品概述

SmartSuggestionPanel 是一个统一的智能建议面板组件，整合了模型选择、参数提示和生成个数选择功能。用户通过特定前缀触发不同的选择菜单：`#` 触发模型选择、`-` 触发参数提示、`+` 触发生成个数选择。参数列表根据已选模型动态过滤，确保参数与模型兼容且互斥。

## 核心功能

- **# 模型选择**：输入 `#` 触发模型选择菜单，展示可用的视频/图片生成模型
- **- 参数提示**：输入 `-` 触发参数选择菜单，根据当前已选模型动态过滤显示兼容参数
- **+ 生成个数**：输入 `+` 触发数字选择菜单，选择生成内容的数量
- **动态参数过滤**：参数列表根据已选模型实时变化，已选参数互斥不可重复选择
- **统一交互体验**：三种选择模式共用一个面板组件，通过前缀字符切换模式

## 技术栈

- 前端框架：React + TypeScript
- 样式方案：复用项目现有样式体系
- 状态管理：React Hooks

## 技术架构

### 系统架构

```mermaid
flowchart TD
    A[SmartSuggestionPanel] --> B[TriggerDetector]
    A --> C[SuggestionList]
    A --> D[SelectionManager]
    
    B --> E{触发字符检测}
    E -->|#| F[模型选择模式]
    E -->|-| G[参数选择模式]
    E -->|+| H[数量选择模式]
    
    D --> I[model-config.ts]
    I --> J[videoDefaults]
    I --> K[imageDefaults]
    
    G --> L[动态参数过滤]
    L --> M[已选模型]
    L --> N[已选参数互斥]
```

### 模块划分

- **SmartSuggestionPanel**：主组件，负责整合所有子功能和状态管理
- **TriggerDetector**：触发检测逻辑，识别 `#`、`-`、`+` 前缀
- **SuggestionList**：通用建议列表渲染，支持模型、参数、数量三种数据类型
- **SelectionManager**：选择状态管理，处理参数互斥和动态过滤逻辑

### 数据流

用户输入触发字符 -> TriggerDetector 识别模式 -> 从 model-config.ts 获取对应数据 -> 动态过滤（参数模式下根据已选模型过滤）-> SuggestionList 渲染 -> 用户选择 -> 更新状态并回调

## 实现细节

### 核心目录结构

```
src/
├── components/
│   └── SmartSuggestionPanel/
│       ├── index.tsx                 # 主组件入口
│       ├── SmartSuggestionPanel.tsx  # 面板主体实现
│       ├── SuggestionList.tsx        # 建议列表组件
│       ├── types.ts                  # 类型定义
│       └── hooks/
│           ├── useTriggerDetection.ts    # 触发检测 Hook
│           └── useParameterFilter.ts     # 参数过滤 Hook
├── config/
│   └── model-config.ts               # 扩展现有配置，添加参数定义
```

### 关键代码结构

**SuggestionMode 类型**：定义三种建议模式的枚举类型。

```typescript
type SuggestionMode = 'model' | 'parameter' | 'count' | null;
```

**SmartSuggestionPanelProps 接口**：定义组件的属性接口，包含当前输入、已选模型、已选参数和选择回调。

```typescript
interface SmartSuggestionPanelProps {
  inputValue: string;
  selectedModel: string | null;
  selectedParams: string[];
  onSelectModel: (model: string) => void;
  onSelectParam: (param: string) => void;
  onSelectCount: (count: number) => void;
}
```

**ParameterConfig 接口**：扩展 model-config.ts 中的参数配置结构，支持模型兼容性定义。

```typescript
interface ParameterConfig {
  key: string;
  label: string;
  compatibleModels: string[];  // 兼容的模型列表
  type: 'video' | 'image';
}
```

### 技术实现方案

1. **触发检测机制**

- 监听输入变化，检测最后输入字符
- 根据 `#`、`-`、`+` 切换对应模式
- 支持关键词过滤搜索

2. **动态参数过滤**

- 从 model-config.ts 的 videoDefaults/imageDefaults 读取参数配置
- 根据 selectedModel 过滤 compatibleModels 包含该模型的参数
- 排除 selectedParams 中已选的参数实现互斥

3. **数量选择菜单**

- 显示预设数字列表（如 1-10）
- 支持快速选择常用数量

## Agent Extensions

### SubAgent

- **code-explorer**
- 用途：探索现有 ModelSelector、PromptSuggestionPanel 组件实现及 model-config.ts 配置结构
- 预期结果：获取现有组件的接口定义、样式规范和配置数据结构，确保新组件与现有代码风格一致