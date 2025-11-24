# Internal API Contracts: 批量生成数量选择

## Task Queue Service API

### createBatchTasks

创建批量生成任务。

```typescript
/**
 * 批量创建生成任务
 * @param params - 生成参数
 * @param type - 任务类型 (image | video)
 * @param count - 生成数量 (1-8)
 * @returns 创建的任务数组
 */
function createBatchTasks(
  params: GenerationParams,
  type: TaskType,
  count: number
): Task[]
```

**行为**:
1. 生成唯一的batchId
2. 循环创建count个任务，每个任务包含batchId、batchIndex、batchTotal
3. 返回所有创建的任务

**示例**:
```typescript
const tasks = taskQueueService.createBatchTasks(
  { prompt: "a cat", width: 1024, height: 1024 },
  TaskType.IMAGE,
  4
);
// 返回4个Task，每个带有相同的batchId
```

### getTasksByBatchId

获取批次内所有任务。

```typescript
/**
 * 根据批次ID获取所有任务
 * @param batchId - 批次ID
 * @returns 批次内所有任务
 */
function getTasksByBatchId(batchId: string): Task[]
```

## useTaskQueue Hook API 扩展

```typescript
interface UseTaskQueueReturn {
  // ... 现有方法 ...

  /** 创建批量任务 */
  createBatchTasks: (
    params: GenerationParams,
    type: TaskType,
    count: number
  ) => Task[];

  /** 获取批次任务 */
  getTasksByBatchId: (batchId: string) => Task[];
}
```

## useGenerationCount Hook API

```typescript
function useGenerationCount(): UseGenerationCountReturn

interface UseGenerationCountReturn {
  count: number;
  setCount: (count: number) => void;
  isPreset: boolean;
  isValid: boolean;
  reset: () => void;
}
```

**用法**:
```typescript
const { count, setCount, isPreset } = useGenerationCount();

// 在生成时使用
const handleGenerate = () => {
  const tasks = createBatchTasks(params, type, count);
  setDialogTaskIds(tasks.map(t => t.id));
};
```
