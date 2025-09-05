# 版本控制和缓存管理

## 🎯 版本控制策略

### 1. 版本号管理
项目使用 [语义版本控制 (Semantic Versioning)](https://semver.org/)：
- `MAJOR.MINOR.PATCH` (例如: 1.2.3)
- **PATCH**: 向后兼容的错误修复
- **MINOR**: 向后兼容的新功能
- **MAJOR**: 不向后兼容的重大更改

### 2. 发布命令
```bash
# 补丁版本 (0.0.2 -> 0.0.3)
npm run release

# 次版本 (0.0.2 -> 0.1.0)  
npm run release:minor

# 主版本 (0.0.2 -> 1.0.0)
npm run release:major

# 仅构建（不更新版本号）
npm run build
```

## 🔧 缓存管理机制

### 1. Service Worker 版本化
- 每次构建时，Service Worker 缓存名称包含版本号
- 新版本发布时自动清除旧版本缓存
- 开发模式禁用缓存，生产模式启用完整缓存

### 2. 自动更新检测
- 应用每5分钟检查一次版本更新
- 发现新版本时显示更新提示
- 用户可选择立即更新或稍后更新

### 3. 强制缓存清除
用户更新时会：
1. 清除所有浏览器缓存
2. 强制 Service Worker 更新
3. 重新加载页面获取最新资源

## 📁 相关文件

### 版本控制文件
- `package.json` - 版本号定义
- `scripts/update-version.js` - 版本更新脚本
- `apps/web/public/version.json` - 运行时版本信息

### 缓存管理文件
- `apps/web/public/sw.js` - Service Worker (含版本化缓存)
- `packages/drawnix/src/components/version-update/` - 版本更新组件
- `apps/web/src/main.tsx` - Service Worker 注册和更新逻辑

## 🚀 部署流程

### 开发环境
```bash
npm start  # 启动开发服务器，禁用缓存
```

### 生产环境
```bash
# 1. 更新版本号并构建
npm run release

# 2. 部署到服务器
# 确保 version.json 和 sw.js 都包含新版本号
```

## 🔍 版本检查机制

### 1. 版本信息来源
- **当前版本**: HTML meta 标签 `<meta name="app-version">`  
- **最新版本**: 服务器 `/version.json` 接口

### 2. 更新触发条件
- 定时检查 (每5分钟)
- Service Worker 更新事件
- 用户手动刷新

### 3. 缓存策略
- **开发模式**: 完全禁用缓存，实时更新
- **生产模式**: 版本化缓存，自动清理旧版本

## 🛠️ 自定义配置

### 修改检查频率
在 `version-update.tsx` 中修改：
```javascript
// 每5分钟检查一次更新
const interval = setInterval(checkForUpdates, 5 * 60 * 1000);
```

### 修改缓存策略
在 `sw.js` 中修改缓存名称和清理逻辑：
```javascript
const CACHE_NAME = `drawnix-v${APP_VERSION}`;
const IMAGE_CACHE_NAME = `drawnix-images-v${APP_VERSION}`;
const STATIC_CACHE_NAME = `drawnix-static-v${APP_VERSION}`;
```

## 📊 监控和调试

### 查看当前版本
```javascript
// 控制台中查看
console.log(document.querySelector('meta[name="app-version"]').content);
```

### 查看缓存状态
```javascript
// 控制台中查看所有缓存
caches.keys().then(console.log);
```

### Service Worker 调试
1. 打开 DevTools > Application > Service Workers
2. 查看当前 SW 状态和版本
3. 可手动触发更新或注销