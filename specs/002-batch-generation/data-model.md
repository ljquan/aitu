# Data Model: 批量生成数量选择

## 类型扩展

### GenerationParams 扩展

```typescript
// 在 task.types.ts 中扩展
export interface GenerationParams {
  prompt: string;
  width?: number;
  height?: number;
  duration?: number;
  style?: string;
  seed?: number;
  /** 批量生成ID，用于关联同批次任务 */
  batchId?: string;
  /** 批次中的序号 (1-based) */
  batchIndex?: number;
  /** 批次总数 */
  batchTotal?: number;
  [key: string]: any;
}
```

### 新增常量定义

```typescript
// 在 constants/generation.ts 中
export const GENERATION_COUNT = {
  MIN: 1,
  MAX: 8,
  DEFAULT: 1,
  PRESETS: [1, 2, 4] as const
};

export const GENERATION_COUNT_STORAGE_KEY = 'aitu_generation_count_preference';
```

### 组件Props类型

```typescript
// GenerationCountSelector Props
interface GenerationCountSelectorProps {
  /** 当前选择的数量 */
  value: number;
  /** 数量变化回调 */
  onChange: (count: number) => void;
  /** 语言设置 */
  language: 'zh' | 'en';
  /** 禁用状态 */
  disabled?: boolean;
}
```

### Hook返回类型

```typescript
// useGenerationCount Hook
interface UseGenerationCountReturn {
  /** 当前生成数量 */
  count: number;
  /** 设置生成数量 */
  setCount: (count: number) => void;
  /** 当前是否为预设值 */
  isPreset: boolean;
  /** 验证数量是否有效 */
  isValid: boolean;
  /** 重置为默认值 */
  reset: () => void;
}
```

## 状态流转

```
用户点击预设按钮 → count更新 → isPreset=true
用户输入自定义值 → count更新 → isPreset=false
用户提交生成 → 循环创建count个任务 → 任务带batchId
```

## 数据验证规则

| 字段 | 规则 |
|------|------|
| count | 整数，1 ≤ count ≤ 8 |
| batchId | UUID v4 格式 |
| batchIndex | 整数，1 ≤ index ≤ batchTotal |
| batchTotal | 等于用户选择的count值 |
