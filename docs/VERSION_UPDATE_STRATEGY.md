# 版本更新策略

## 问题描述

在应用升级时，旧版本的 HTML 页面可能会尝试加载已被删除的旧版本 JS/CSS 文件，导致出现 MIME 类型错误：

```
Refused to apply style from '...' because its MIME type ('text/html') is not a supported stylesheet MIME type
Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of "text/html"
```

这是因为：
1. 服务器部署新版本后，旧的静态资源文件（如 `index-old.js`）被删除
2. 用户浏览器中的旧 HTML 仍然引用这些已删除的文件
3. 服务器返回 404 页面（HTML 内容），但浏览器期望的是 JS/CSS 文件
4. 导致 MIME 类型不匹配错误

## 解决方案

### 1. Service Worker 延迟清理策略

**修改位置**: `apps/web/public/sw.js`

在 Service Worker 的 `activate` 事件中：

- **不立即删除旧版本缓存**：当检测到旧版本缓存时，记录但不立即删除
- **延迟 30 秒清理**：使用 `setTimeout` 延迟 30 秒后再清理旧缓存
- **保留图片缓存**：图片缓存使用固定名称 `drawnix-images`，不受版本影响

```javascript
// 延迟 30 秒后清理旧缓存，给所有客户端足够时间刷新
setTimeout(async () => {
  console.log('Cleaning up old version caches now...');
  for (const cacheName of [...oldStaticCaches, ...oldAppCaches]) {
    await caches.delete(cacheName);
  }
}, 30000); // 30秒延迟
```

### 2. 主应用平滑更新机制

**修改位置**: `apps/web/src/main.tsx`

添加了以下更新机制：

#### 2.1 自动检测新版本
```javascript
registration.addEventListener('updatefound', () => {
  const newWorker = registration.installing;
  // 检测到新版本时的处理逻辑
});
```

#### 2.2 智能激活策略

**开发模式**：立即激活新 Service Worker
```javascript
if (isDevelopment) {
  newWorker.postMessage({ type: 'SKIP_WAITING' });
}
```

**生产模式**：延迟 5 秒激活，避免打断用户当前操作
```javascript
setTimeout(() => {
  newWorker.postMessage({ type: 'SKIP_WAITING' });
}, 5000);
```

#### 2.3 监听 Controller 变化

当新的 Service Worker 接管时，自动刷新页面：
```javascript
navigator.serviceWorker.addEventListener('controllerchange', () => {
  setTimeout(() => {
    window.location.reload();
  }, 1000);
});
```

#### 2.4 定期检查更新

每 5 分钟自动检查一次新版本：
```javascript
setInterval(() => {
  registration.update();
}, 5 * 60 * 1000);
```

## 更新流程

### 完整更新时间线

```
T+0s    : 新版本部署到服务器
T+0s    : 用户访问应用，Service Worker 检测到新版本
T+0s    : 开始安装新的 Service Worker（后台进行）
T+5s    : 新 Service Worker 安装完成，延迟 5 秒后激活
T+10s   : 新 Service Worker 激活并接管页面
T+11s   : 页面自动刷新，加载新版本资源
T+41s   : 旧版本缓存被清理（激活后 30 秒）
```

### 关键时间点

1. **0-5秒**：新版本检测和安装，用户无感知
2. **5-10秒**：等待当前操作完成，准备切换
3. **10-11秒**：新版本接管，页面刷新
4. **11-41秒**：用户使用新版本，旧缓存仍然保留
5. **41秒后**：旧缓存被清理，完全切换到新版本

## 优势

### 1. 避免 MIME 类型错误
- 旧缓存在页面刷新前保留，确保旧 HTML 能正常加载资源
- 延迟清理给所有标签页足够时间完成更新

### 2. 平滑的用户体验
- 不会突然打断用户操作
- 延迟激活策略让更新在后台静默完成
- 自动刷新确保用户使用最新版本

### 3. 可靠的更新机制
- 定期检查更新，不依赖用户手动刷新
- Controller 变化监听确保更新生效
- 多层延迟策略保证更新过程稳定

## 测试建议

### 本地测试

1. 修改版本号：`apps/web/public/sw.js` 中的 `APP_VERSION`
2. 构建应用：`npm run build`
3. 启动服务器：`npm run serve` 或部署到测试环境
4. 打开应用，观察 Console 输出
5. 修改版本号，重新构建
6. 在已打开的应用中，观察更新流程

### 生产测试

1. 部署新版本到生产环境
2. 在用户端打开 DevTools Console
3. 观察以下日志：
   ```
   New Service Worker found, installing...
   New Service Worker installed, waiting to activate...
   Production mode: New version available, will reload after current operations complete
   Applying new version update...
   Service Worker controller changed
   Reloading page to use new Service Worker...
   ```

### 验证清理时机

在 Console 中观察：
```
Found old version caches, will keep them temporarily: [...]
Old caches will be cleaned up after clients are updated
[30秒后]
Cleaning up old version caches now...
Deleted old cache: drawnix-static-v0.2.9
```

## 回滚策略

如果新版本出现问题，可以：

1. **快速回滚**：部署旧版本代码
2. **清除 Service Worker**：
   ```javascript
   navigator.serviceWorker.getRegistrations().then(registrations => {
     registrations.forEach(r => r.unregister());
   });
   ```
3. **清除缓存**：
   ```javascript
   caches.keys().then(keys => {
     keys.forEach(key => caches.delete(key));
   });
   ```

## 注意事项

1. **不要手动删除旧缓存**：让延迟清理机制自动处理
2. **监控更新日志**：在生产环境中监控 Service Worker 更新日志
3. **测试兼容性**：确保新旧版本 Service Worker 可以平滑过渡
4. **避免频繁更新**：给用户足够时间使用每个版本

## 相关文件

- `apps/web/public/sw.js` - Service Worker 实现
- `apps/web/src/main.tsx` - Service Worker 注册和更新逻辑
- `apps/web/index.html` - 应用入口，包含版本号
- `apps/web/public/version.json` - 版本信息文件
