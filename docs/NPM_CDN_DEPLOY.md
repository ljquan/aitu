# NPM + CDN 部署指南

本文档介绍如何将 Aitu 发布到 npm，并通过免费 CDN 访问。

## 概述

通过将构建产物发布到 npm，可以利用免费的 CDN 服务（如 unpkg、jsDelivr）托管和访问应用，无需自建服务器。

## 快速开始

### 1. 发布到 npm

```bash
# 首次发布或版本更新后
pnpm run npm:publish

# 仅测试（不实际发布）
pnpm run npm:publish:dry

# 跳过构建（使用现有构建产物）
pnpm run npm:publish:skip-build
```

### 2. 访问应用

发布成功后，可以通过以下 CDN 地址访问：

#### unpkg (推荐)

```
# 最新版本
https://unpkg.com/aitu-app/index.html

# 指定版本
https://unpkg.com/aitu-app@0.5.14/index.html
```

#### jsDelivr

```
# 最新版本
https://cdn.jsdelivr.net/npm/aitu-app/index.html

# 指定版本
https://cdn.jsdelivr.net/npm/aitu-app@0.5.14/index.html
```

## 技术细节

### 相对路径配置

为支持 CDN 部署，项目做了以下配置：

1. **Vite 配置** (`apps/web/vite.config.ts`)
   ```typescript
   base: process.env.VITE_BASE_URL || './',
   ```

2. **index.html**
   - 移除了 `<base href="/">` 标签
   - 所有静态资源使用相对路径 `./`

### 发布脚本

`scripts/publish-npm.js` 执行以下操作：

1. 构建项目（使用相对路径）
2. 在 `dist/apps/web` 目录生成 npm 专用的 `package.json`
3. 生成 README.md
4. 移除不必要的文件（如 source maps）
5. 发布到 npm

### npm 包结构

```
aitu-app/
├── index.html          # 入口页面
├── assets/             # JS、CSS、字体等资源
├── icons/              # 图标
├── logo/               # Logo
├── manifest.json       # PWA 配置
├── sw.js               # Service Worker
├── package.json        # npm 包信息
└── README.md           # 包说明
```

## 自定义配置

### 修改包名

编辑 `scripts/publish-npm.js` 中的 `CONFIG.packageName`：

```javascript
const CONFIG = {
  packageName: 'your-custom-name',  // 修改这里
  // ...
};
```

### 自定义 CDN 路径

如果需要使用自定义 CDN 路径，可以在构建时设置环境变量：

```bash
VITE_BASE_URL=https://your-cdn.com/path/ pnpm run build:web
```

## 注意事项

### Service Worker

CDN 部署时，Service Worker 的功能可能受限：

- Service Worker 只能在同源或 HTTPS 下运行
- 跨域 CDN 可能需要配置 CORS
- 某些 PWA 功能（如推送通知）可能不可用

### 缓存更新

CDN 可能有缓存延迟，发布新版本后：

- unpkg: 通常几分钟内更新
- jsDelivr: 可能需要 24 小时，可使用版本号强制更新

### 版本管理

建议使用版本号访问，确保一致性：

```
https://unpkg.com/aitu-app@0.5.14/index.html
```

## 与传统部署对比

| 特性 | CDN 部署 | 自建服务器 |
|------|---------|----------|
| 成本 | 免费 | 需付费 |
| 配置 | 零配置 | 需配置 |
| HTTPS | 自动 | 需配置 |
| 全球加速 | 自带 | 需额外配置 |
| 自定义域名 | 不支持 | 支持 |
| Service Worker | 受限 | 完整支持 |

## 故障排除

### 资源 404

检查 `index.html` 中的路径是否都使用相对路径 `./`。

### 样式/脚本加载失败

确认构建时 `base` 配置正确：

```bash
# 检查构建后的 index.html
cat dist/apps/web/index.html | grep -E 'href=|src='
```

### npm 发布失败

1. 确认已登录 npm：`npm whoami`
2. 检查包名是否已被占用
3. 确认版本号已更新

## 相关命令

```bash
# 查看当前版本
npm view aitu-app version

# 查看所有版本
npm view aitu-app versions

# 取消发布（24小时内）
npm unpublish aitu-app@0.5.14
```
