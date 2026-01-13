# Gemini API 前端工具

基于原始 Python 版本 `gemini.py` 改写的 TypeScript 前端工具，支持在浏览器环境中调用 Gemini AI 进行图片生成和处理。

## 功能特性

- ✅ **多图片支持**: 支持单张或多张图片输入
- ✅ **多种输入格式**: 支持 File 对象、base64 字符串、URL 链接
- ✅ **流式响应**: 支持流式 API 调用，确保大型图片数据完整接收
- ✅ **智能重试**: 自动处理 API 配额超限和超时错误
- ✅ **混合内容处理**: 自动解析和处理 API 返回的文字、base64 图片、URL 图片
- ✅ **TypeScript 支持**: 完整的类型定义和 IntelliSense 支持
- ✅ **React 集成**: 提供 React Hook 和组件示例

## 文件结构

```
src/utils/
├── gemini-api.ts          # 核心 API 工具函数
├── gemini-examples.ts     # 使用示例和 React 集成
└── README.md             # 说明文档（本文件）
```

## 快速开始

### 1. 基础配置

```typescript
import { GeminiClient, type GeminiConfig } from './utils/gemini-api';

const config: GeminiConfig = {
  apiKey: 'sk-your-api-key-here',        // 替换为你的 API Key
  baseUrl: 'https://api.tu-zi.com/v1',   // 替换为你的 Base URL
  modelName: 'gemini-2.5-flash-image',   // 可选，默认值
  maxRetries: 10,                        // 可选，最大重试次数
  timeout: 120000,                       // 可选，超时时间（毫秒）
  useStream: true,                       // 可选，是否使用流式响应
};

const client = new GeminiClient(config);
```

### 2. 基础图片生成

```typescript
// 使用文件输入
const fileInput = document.getElementById('imageInput') as HTMLInputElement;
const file = fileInput.files?.[0];

if (file) {
  const images = [{ file }];
  const prompt = '请分析这张图片并生成一个类似风格的新图片';
  
  try {
    const result = await client.generateImage(prompt, images);
    console.log('生成结果:', result.processedContent);
    
    // 处理返回的图片
    result.processedContent.images.forEach((img, index) => {
      if (img.type === 'base64') {
        const blobUrl = base64ToBlobUrl(img.data);
        // 显示或下载图片
        console.log(`生成的图片 ${index + 1}:`, blobUrl);
      }
    });
  } catch (error) {
    console.error('生成失败:', error);
  }
}
```

### 3. 多图片合成

```typescript
const images = [
  { file: file1 },
  { file: file2 },
  { base64: 'data:image/png;base64,iVBORw0KGgo...' },
];

const prompt = '将第一张图片中的人物与第二张图片的背景进行合成';

const result = await client.generateImage(prompt, images);
```

### 4. React Hook 集成

```typescript
import { useGeminiImageGeneration } from './utils/gemini-examples';

function MyComponent() {
  const { generateImage, isLoading, result, error } = useGeminiImageGeneration();
  
  const handleGenerate = async () => {
    const images = [{ file: selectedFile }];
    await generateImage('生成一个卡通版本', images);
  };
  
  return (
    <div>
      <button onClick={handleGenerate} disabled={isLoading}>
        {isLoading ? '生成中...' : '生成图片'}
      </button>
      {error && <div>错误: {error}</div>}
      {result && <div>生成成功！</div>}
    </div>
  );
}
```

## API 参考

### GeminiClient 类

#### 构造函数
```typescript
new GeminiClient(config: GeminiConfig)
```

#### 方法

- `generateImage(prompt: string, images?: ImageInput[])`: 生成图片
- `updateConfig(newConfig: Partial<GeminiConfig>)`: 更新配置
- `getConfig()`: 获取当前配置

### 配置选项 (GeminiConfig)

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| `apiKey` | string | ✅ | - | Gemini API 密钥 |
| `baseUrl` | string | ✅ | - | API 基础 URL |
| `modelName` | string | ❌ | `gemini-2.5-flash-image` | 使用的模型名称 |
| `maxRetries` | number | ❌ | `10` | 最大重试次数 |
| `retryDelay` | number | ❌ | `0` | 重试延迟时间（毫秒） |
| `timeout` | number | ❌ | `120000` | API 调用超时时间（毫秒） |
| `useStream` | boolean | ❌ | `true` | 是否使用流式响应 |

### 图片输入格式 (ImageInput)

```typescript
interface ImageInput {
  file?: File;        // 文件对象
  base64?: string;    // base64 字符串
  url?: string;       // 图片 URL
}
```

### 响应格式 (ProcessedContent)

```typescript
interface ProcessedContent {
  textContent: string;           // 处理后的文本内容
  images: Array<{               // 提取的图片数组
    type: 'base64' | 'url';
    data: string;
    index: number;
  }>;
  originalContent: string;       // 原始响应内容
}
```

## 工具函数

### fileToBase64(file: File)
将文件转换为 base64 格式。

### base64ToBlobUrl(base64Data: string, mimeType?: string)
将 base64 数据转换为 Blob URL，用于显示或下载。

### processMixedContent(content: string)
处理 API 返回的混合内容，提取文字和图片。

## 错误处理

工具会自动处理以下错误类型：

1. **配额超出错误**: 自动重试
2. **超时错误**: 自动重试
3. **网络错误**: 抛出异常
4. **文件读取错误**: 抛出异常

```typescript
try {
  const result = await client.generateImage(prompt, images);
  // 处理成功结果
} catch (error) {
  if (error.message.includes('quota')) {
    console.error('API 配额不足');
  } else if (error.message.includes('timeout')) {
    console.error('请求超时');
  } else {
    console.error('其他错误:', error.message);
  }
}
```

## 最佳实践

### 1. 配置管理

```typescript
// 推荐：使用环境变量
const config: GeminiConfig = {
  apiKey: process.env.REACT_APP_GEMINI_API_KEY || '',
  baseUrl: process.env.REACT_APP_GEMINI_BASE_URL || '',
};

// 或者使用配置文件
import { geminiConfig } from './config';
const client = new GeminiClient(geminiConfig);
```

### 2. 图片大小优化

```typescript
// 压缩大图片以提高性能
function compressImage(file: File, maxWidth: number = 1024): Promise<File> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const img = new Image();
    
    img.onload = () => {
      const ratio = Math.min(maxWidth / img.width, maxWidth / img.height);
      canvas.width = img.width * ratio;
      canvas.height = img.height * ratio;
      
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        resolve(new File([blob!], file.name, { type: file.type }));
      }, file.type);
    };
    
    img.src = URL.createObjectURL(file);
  });
}
```

### 3. 批量处理

```typescript
// 批量生成多个变体
async function generateVariations(prompt: string, image: ImageInput, count: number = 3) {
  const results = [];
  
  for (let i = 0; i < count; i++) {
    try {
      const result = await client.generateImage(`${prompt} (变体 ${i + 1})`, [image]);
      results.push(result);
    } catch (error) {
      console.error(`变体 ${i + 1} 生成失败:`, error);
    }
  }
  
  return results;
}
```

### 4. 缓存机制

```typescript
// 简单的结果缓存
const cache = new Map<string, any>();

async function generateWithCache(prompt: string, images: ImageInput[]) {
  const cacheKey = `${prompt}-${JSON.stringify(images)}`;
  
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }
  
  const result = await client.generateImage(prompt, images);
  cache.set(cacheKey, result);
  
  return result;
}
```

## 与原始 Python 版本的对比

| 功能 | Python 版本 | TypeScript 版本 |
|------|-------------|------------------|
| 图片输入 | 文件路径 | File 对象、base64、URL |
| 输出保存 | 自动保存到文件 | 返回 Blob URL |
| 错误处理 | 控制台输出 | 异常抛出 |
| 流式响应 | ✅ | ✅ |
| 重试机制 | ✅ | ✅ |
| 混合内容处理 | ✅ | ✅ |
| React 集成 | ❌ | ✅ |

## 故障排除

### 常见问题

1. **API Key 无效**
   ```
   错误: HTTP 401: Unauthorized
   解决: 检查 API Key 是否正确
   ```

2. **请求超时**
   ```
   错误: timeout
   解决: 增加 timeout 配置或检查网络连接
   ```

3. **文件过大**
   ```
   错误: Request entity too large
   解决: 压缩图片或使用较小的图片
   ```

4. **CORS 错误**
   ```
   错误: CORS policy
   解决: 确保 API 服务器支持 CORS 或使用代理
   ```

### 调试模式

```typescript
// 启用详细日志
const client = new GeminiClient({
  ...config,
  // 在浏览器控制台查看详细信息
});

// 查看原始响应
const result = await client.generateImage(prompt, images);
console.log('原始响应:', result.response);
console.log('处理后内容:', result.processedContent);
```

## 许可证

本工具基于原始 Python 版本改写，遵循相同的开源许可证。