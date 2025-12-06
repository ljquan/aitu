# PWA 图标生成指南

要从基础 SVG 生成 PWA 图标，您可以使用以下任一工具：

## 方法 1: 使用 ImageMagick (convert)
```bash
# 首先安装 ImageMagick
brew install imagemagick  # macOS
sudo apt install imagemagick  # Ubuntu/Debian

# 生成所有需要的尺寸
for size in 72 96 128 144 152 192 384 512; do
  convert -background transparent -resize ${size}x${size} icon-base.svg icon-${size}x${size}.png
done
```

## 方法 2: 使用 Inkscape
```bash
# 首先安装 Inkscape
brew install inkscape  # macOS
sudo apt install inkscape  # Ubuntu/Debian

# 生成所有需要的尺寸
for size in 72 96 128 144 152 192 384 512; do
  inkscape --export-width=${size} --export-height=${size} --export-filename=icon-${size}x${size}.png icon-base.svg
done
```

## 方法 3: 使用 rsvg-convert
```bash
# 首先安装 librsvg
brew install librsvg  # macOS
sudo apt install librsvg2-bin  # Ubuntu/Debian

# 生成所有需要的尺寸
for size in 72 96 128 144 152 192 384 512; do
  rsvg-convert -w ${size} -h ${size} -o icon-${size}x${size}.png icon-base.svg
done
```

## 方法 4: 在线工具
您也可以使用在线 SVG 转 PNG 工具，例如：
- https://cloudconvert.com/svg-to-png
- https://convertio.co/svg-png/
- https://www.iloveimg.com/convert-svg-to-png

## 必需的图标尺寸
- 72x72px
- 96x96px
- 128x128px
- 144x144px
- 152x152px
- 192x192px (maskable)
- 384x384px
- 512x512px (maskable)

# Service Worker 升级指南

## 版本管理
Service Worker (`sw.js`) 使用版本常量来管理缓存失效和更新。

```javascript
// apps/web/public/sw.js
const APP_VERSION = '0.2.13'; // 增加此值以触发更新
```

## 升级步骤
当部署需要用户更新缓存的更改时（例如错误修复、新功能或静态资源更新）：

1.  **修改 `sw.js`**：
    *   在文件顶部找到 `const APP_VERSION`。
    *   增加版本号（例如从 `0.2.12` 到 `0.2.13`）。

2.  **更新如何工作**：
    *   **安装阶段**：当浏览器检测到 `sw.js` 存在字节差异时（由于版本号增加），它会在后台安装新的 Service Worker。
    *   **激活阶段**：
        *   安装完成后，新的 Service Worker 会等待所有客户端标签页关闭（或调用 `skipWaiting()`）。
        *   激活后，它会创建带有新版本后缀的新缓存（例如 `drawnix-v0.2.13`）。
        *   它会识别旧版本的缓存（例如 `drawnix-v0.2.12`）。
        *   **迁移**：它会自动将有价值的数据（如缓存的图像）从旧缓存迁移到新缓存，以节省带宽。
        *   **清理**：迁移和短暂的安全延迟（30秒）后，它会删除旧缓存。

3.  **强制更新**：
    *   `index.html` 使用 `cache: 'reload'` 方式获取，确保始终加载最新版本，防止因 HTML 过期指向丢失的 JS 哈希而导致的“白屏”问题。
    *   在开发模式（`localhost`）下，静态资源缓存会被绕过，以避免调试困扰。
