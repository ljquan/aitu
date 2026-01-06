# @aitu/utils

Aitu 项目的共享工具函数库。

## 功能模块

### 函数工具

#### debounce
防抖函数，延迟执行函数调用。

```typescript
import { debounce } from '@aitu/utils';

const debouncedFn = debounce((value: string) => {
  console.log(value);
}, 300);
```

#### throttle
节流函数，限制函数调用频率。

```typescript
import { throttle } from '@aitu/utils';

const throttledFn = throttle((event: MouseEvent) => {
  console.log(event);
}, 100);
```

### 格式化工具

#### formatFileSize
格式化文件大小为人类可读格式。

```typescript
import { formatFileSize } from '@aitu/utils';

formatFileSize(1024); // "1 KB"
formatFileSize(1048576); // "1 MB"
```

#### formatDate
格式化时间戳为 YYYY-MM-DD HH:mm:ss 格式。

```typescript
import { formatDate } from '@aitu/utils';

formatDate(Date.now()); // "2024-01-06 20:30:45"
```

#### formatDuration
格式化毫秒数为可读的时长字符串。

```typescript
import { formatDuration } from '@aitu/utils';

formatDuration(1000); // "1s"
formatDuration(65000); // "1m 5s"
formatDuration(3665000); // "1h 1m 5s"
```

## 开发

```bash
# 类型检查
pnpm exec tsc --noEmit -p packages/utils

# 代码检查
pnpm exec eslint packages/utils/src
```
