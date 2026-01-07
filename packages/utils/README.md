# @aitu/utils

Aitu 项目的共享工具函数库，提供常用的工具函数和格式化方法。

## 功能模块

### 函数工具 (Function)

#### debounce
防抖函数，延迟执行函数调用。

```typescript
import { debounce } from '@aitu/utils';

const debouncedFn = debounce((value: string) => {
  console.log(value);
}, 300);

debouncedFn('hello'); // 300ms 后执行
```

#### throttle
节流函数，限制函数调用频率。

```typescript
import { throttle } from '@aitu/utils';

const throttledFn = throttle((event: MouseEvent) => {
  console.log(event);
}, 100);

window.addEventListener('scroll', throttledFn);
```

### 格式化工具 (Format)

#### formatFileSize
格式化文件大小为人类可读格式。

```typescript
import { formatFileSize } from '@aitu/utils';

formatFileSize(1024); // "1 KB"
formatFileSize(1048576); // "1 MB"
formatFileSize(1073741824); // "1 GB"
```

#### formatDate
格式化时间戳为 YYYY-MM-DD HH:mm:ss 格式。

```typescript
import { formatDate } from '@aitu/utils';

formatDate(Date.now()); // "2026-01-06 20:30:45"
formatDate(1704556800000); // "2024-01-06 20:00:00"
```

#### formatDuration
格式化毫秒数为可读的时长字符串。

```typescript
import { formatDuration } from '@aitu/utils';

formatDuration(1000); // "1s"
formatDuration(65000); // "1m 5s"
formatDuration(3665000); // "1h 1m 5s"
```

### 字符串工具 (String)

#### sanitizeFilename
清理字符串使其适合作为文件名。

```typescript
import { sanitizeFilename } from '@aitu/utils';

sanitizeFilename('Hello World! 你好世界'); // "Hello-World-你好世界"
sanitizeFilename('file@#$%name.txt', 20); // "filename.txt"
```

#### truncate
截断字符串到指定长度并添加省略号。

```typescript
import { truncate } from '@aitu/utils';

truncate('Hello World', 5); // "Hello..."
truncate('Hello World', 20); // "Hello World"
truncate('Hello World', 8, '…'); // "Hello W…"
```

#### capitalize
首字母大写。

```typescript
import { capitalize } from '@aitu/utils';

capitalize('hello world'); // "Hello world"
capitalize('HELLO'); // "HELLO"
```

#### toKebabCase
转换为 kebab-case 格式。

```typescript
import { toKebabCase } from '@aitu/utils';

toKebabCase('HelloWorld'); // "hello-world"
toKebabCase('hello_world'); // "hello-world"
toKebabCase('Hello World'); // "hello-world"
```

#### toCamelCase
转换为 camelCase 格式。

```typescript
import { toCamelCase } from '@aitu/utils';

toCamelCase('hello-world'); // "helloWorld"
toCamelCase('hello_world'); // "helloWorld"
toCamelCase('Hello World'); // "helloWorld"
```

### 颜色工具 (Color)

提供纯函数的颜色处理工具，支持 hex 颜色转换和透明度计算。

```typescript
import {
  applyOpacityToHex,
  hexAlphaToOpacity,
  removeHexAlpha,
  isValidColor,
  TRANSPARENT,
  NO_COLOR,
  WHITE
} from '@aitu/utils';

// 应用不透明度到 hex 颜色
applyOpacityToHex('#FF0000', 50); // "#FF000080" (50% 不透明度)

// 提取 hex 颜色的不透明度
hexAlphaToOpacity('#FF000080'); // 50

// 移除 alpha 通道
removeHexAlpha('#FF0000FF'); // "#FF0000"

// 颜色常量
console.log(TRANSPARENT); // "TRANSPARENT"
console.log(NO_COLOR); // "NO_COLOR"
console.log(WHITE); // "#FFFFFF"
```

### 日志工具 (Logger)

提供环境感知的日志工具，开发环境显示调试信息，生产环境仅显示警告和错误。

```typescript
import { createLogger, logger } from '@aitu/utils';

// 创建命名空间日志器
const moduleLogger = createLogger('MyModule');
moduleLogger.debug('调试信息'); // 仅开发环境
moduleLogger.info('普通信息'); // 仅开发环境
moduleLogger.warn('警告信息'); // 始终显示
moduleLogger.error('错误信息'); // 始终显示

// 使用默认日志器
logger.debug('调试消息');
logger.error('发生错误');
```

### 异步工具 (Async)

Promise 和事件处理相关的工具函数。

```typescript
import { isPromiseLike, composeEventHandlers } from '@aitu/utils';

// 类型守卫：检查值是否为 Promise
const value: unknown = fetchData();
if (isPromiseLike(value)) {
  value.then(data => console.log(data));
}

// 组合多个事件处理器
const userHandler = (e) => console.log('用户处理');
const libHandler = (e) => console.log('库处理');
const composed = composeEventHandlers(userHandler, libHandler);
button.addEventListener('click', composed);
```

### 数组工具 (Array)

数组操作和转换的工具函数。

```typescript
import { splitRows, chunk } from '@aitu/utils';

// 将数组分割为指定大小的行
const items = [1, 2, 3, 4, 5, 6, 7];
splitRows(items, 3); // [[1, 2, 3], [4, 5, 6], [7]]

// chunk 是 splitRows 的别名
chunk(items, 2); // [[1, 2], [3, 4], [5, 6], [7]]
```

### TypeScript 类型工具 (Types)

TypeScript 类型推断辅助类型。

```typescript
import type { ResolutionType, ValueOf } from '@aitu/utils';

// 提取 Promise 解析类型
async function fetchUser() {
  return { id: 1, name: 'Alice' };
}
type User = ResolutionType<typeof fetchUser>; // { id: number; name: string }

// 提取对象值类型
const colors = {
  red: '#FF0000',
  blue: '#0000FF',
} as const;
type ColorValue = ValueOf<typeof colors>; // '#FF0000' | '#0000FF'
```

### 编码工具 (Encoding)

数据编码和格式转换工具。

```typescript
import { base64ToBlob } from '@aitu/utils';

// 将 base64 data URL 转换为 Blob
const dataUrl = 'data:image/png;base64,iVBORw0KGgo...';
const blob = base64ToBlob(dataUrl);

// 使用 Blob 进行文件下载、上传等操作
const url = URL.createObjectURL(blob);
```

### URL 工具 (URL)

URL 解析、域名检查和文件扩展名检测工具。

```typescript
import {
  isDomainMatch,
  isVolcesDomain,
  getFileExtension,
  getHostname,
  isDataURL,
  isAbsoluteURL,
} from '@aitu/utils';

// 检查 URL 是否匹配特定域名模式
isDomainMatch('https://cdn.example.com/file.jpg', ['.example.com']);
// true

// 检查是否为火山引擎域名（专用函数）
isVolcesDomain('https://cdn.volces.com/video.mp4');
// true

// 从 URL 或 MIME 类型获取文件扩展名
getFileExtension('https://example.com/image.jpg');
// "jpg"
getFileExtension('data:image/svg+xml;base64,...');
// "svg"
getFileExtension('https://api.example.com/download/123', 'video/mp4');
// "mp4"

// 提取主机名
getHostname('https://www.example.com/path');
// "www.example.com"

// 检查是否为 data URL
isDataURL('data:image/png;base64,...');
// true

// 检查是否为绝对 URL
isAbsoluteURL('https://example.com/path');
// true
```

## 开发

```bash
# 安装依赖
pnpm install

# 类型检查
pnpm exec tsc --noEmit -p packages/utils

# 代码检查
pnpm exec eslint packages/utils/src

# 构建
pnpm exec nx build utils

# 运行测试
pnpm exec nx test utils

# 运行测试并生成覆盖率报告
cd packages/utils && pnpm exec vitest run --coverage
```

## License

MIT
