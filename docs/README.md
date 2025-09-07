# 爱图 (AITU) 开发文档

本目录包含项目的所有开发相关文档，包括最新的品牌重塑设计方案。

## 📚 文档索引

### 🎨 品牌设计文档 (NEW)
- **[BRAND_DESIGN.md](./BRAND_DESIGN.md)** - AITU 品牌设计完整方案和思考过程
- **[BRAND_GUIDELINES.md](./BRAND_GUIDELINES.md)** - 品牌规范开发者速查手册
- **[LOGO_CONCEPTS.md](./LOGO_CONCEPTS.md)** - Logo 设计概念和 SVG 代码实现

### 📋 项目开发文档
- **[VERSION_CONTROL.md](./VERSION_CONTROL.md)** - 版本控制和缓存管理文档

### 🚀 部署相关文档  
- **[CFPAGE-DEPLOY.md](./CFPAGE-DEPLOY.md)** - Cloudflare Pages 部署指南

### 📱 PWA 相关文档
- **[PWA_ICONS.md](./PWA_ICONS.md)** - PWA 图标生成指南

## 🎯 品牌转型概述

**品牌名称**: 爱图 (AITU) - AI图片视频创作平台
**项目仓库**: https://github.com/ljquan/aitu

### 核心变化
- **定位转变**: 从白板工具 → AI图片/视频创作工具
- **目标用户**: 数字创作者、设计师、内容创作者
- **核心价值**: "AI让创意触手可及"

### 品牌亮点
- **品牌名**: AITU (Visual + AI)
- **主色调**: 智慧紫渐变 (#6C5CE7 → #FD79A8)  
- **Logo理念**: 智慧之眼 + AI芯片 + 像素粒子
- **愿景**: 让每个人都能成为视觉创作大师

## 🚀 快速开始

### 开发环境
```bash
npm install       # 安装依赖
npm start         # 启动开发服务器 (localhost:7201)
npm run build     # 构建项目
npm test          # 运行测试
```

### 版本发布
```bash
npm run release         # 发布补丁版本 (自动打包)
npm run release:minor   # 发布次版本  
npm run release:major   # 发布主版本
npm run package         # 仅创建发布包
```

### 品牌资源应用
参考 [品牌规范文档](./BRAND_GUIDELINES.md) 获取：
- CSS 色彩变量和组件样式
- Logo 使用规范和文件
- 字体和排版规范
- 动效和交互指南

## 📁 项目结构
```
drawnix/ (项目根目录)
├── apps/web/              # 主 Web 应用
├── packages/drawnix/      # 核心白板库 (即将重构为AI创作库)
├── packages/react-board/  # React 白板组件
├── packages/react-text/   # React 文本组件
├── scripts/              # 构建和发布脚本
└── docs/                 # 开发文档（本目录）
```

## 🔗 相关链接

- [项目主 README](../README.md) - 项目介绍和快速开始
- [英文 README](../README_en.md) - English documentation
- [GitHub 仓库](https://github.com/ljquan/aitu) - 源代码仓库
- [在线演示](https://drawnix.com) - 当前版本演示

## 🛠️ 开发规范

### 代码规范
- 遵循现有的 ESLint 和 Prettier 配置
- 使用 TypeScript 进行类型安全开发
- 组件命名采用 PascalCase
- 文件命名采用 kebab-case

### Git 规范
- 提交信息格式: `type: description`
- 主要类型: `feat`, `fix`, `docs`, `style`, `refactor`
- 分支命名: `feature/xxx`, `fix/xxx`, `docs/xxx`

### 版本管理
- 遵循语义化版本控制 (Semantic Versioning)
- 自动版本升级和 git tag 创建
- 构建完成后自动创建发布包

---

## 📝 更新日志

### 2025-09-05
- ✨ 完成品牌重塑设计方案
- 📚 新增品牌设计文档系列
- 🎨 设计 AITU 品牌形象和 Logo 概念
- 🔧 整理开发文档结构

---

*📖 文档持续更新中... 如有问题请提交 Issue*  
*最后更新: 2025-09-05*