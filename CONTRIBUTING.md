# 贡献指南 Contributing Guide

感谢您对爱图(Aitu)项目的关注和支持！我们欢迎任何形式的贡献。

[English](#english) | [中文](#中文)

## 中文

### 🤝 如何贡献

#### 报告问题
- 在 [Issues](https://github.com/ljquan/aitu/issues) 页面提交问题
- 请详细描述问题，包括复现步骤、期望结果和实际结果
- 附上相关的截图或错误日志

#### 功能建议
- 在 Issues 中提交功能请求
- 详细描述功能的用途和预期效果
- 说明为什么这个功能对项目有价值

#### 代码贡献

1. **Fork 项目**
   ```bash
   git clone https://github.com/YOUR_USERNAME/drawnix.git
   cd drawnix
   ```

2. **创建功能分支**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **安装依赖**
   ```bash
   npm install
   ```

4. **开发和测试**
   ```bash
   npm start          # 启动开发服务器
   npm test           # 运行测试
   npm run build      # 构建项目
   ```

5. **提交代码**
   ```bash
   git add .
   git commit -m "feat: 添加新功能描述"
   git push origin feature/your-feature-name
   ```

6. **创建 Pull Request**
   - 在 GitHub 上创建 PR
   - 详细描述变更内容
   - 关联相关的 Issue

### 📝 开发规范

#### 代码风格
- 使用 TypeScript
- 遵循项目的 ESLint 配置
- 使用 TDesign React 组件库
- 保持代码简洁和可读性

#### 提交规范
遵循 [Conventional Commits](https://conventionalcommits.org/) 规范：

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

类型：
- `feat`: 新功能
- `fix`: 修复bug
- `docs`: 文档更新
- `style`: 代码格式调整
- `refactor`: 重构
- `test`: 测试相关
- `chore`: 构建/工具相关

示例：
```
feat(toolbar): 添加新的绘图工具
fix(mind-map): 修复节点连接问题
docs: 更新安装指南
```

#### 项目结构
```
drawnix/
├── apps/web/              # Web 应用
├── packages/
│   ├── drawnix/          # 核心白板库
│   ├── react-board/      # React 白板组件
│   └── react-text/       # 文本组件
└── docs/                 # 文档
```

### 🧪 测试

- 添加单元测试覆盖新功能
- 确保所有测试通过
- 在多个浏览器中测试功能

### 📋 Pull Request 检查清单

- [ ] 代码遵循项目风格指南
- [ ] 添加了必要的测试
- [ ] 所有测试通过
- [ ] 更新了相关文档
- [ ] 提交消息遵循规范
- [ ] 没有合并冲突

---

## English

### 🤝 How to Contribute

#### Report Issues
- Submit issues on the [Issues](https://github.com/ljquan/aitu/issues) page
- Provide detailed descriptions including reproduction steps, expected and actual results
- Attach relevant screenshots or error logs

#### Feature Requests
- Submit feature requests in Issues
- Describe the feature's purpose and expected behavior
- Explain why this feature would be valuable to the project

#### Code Contributions

1. **Fork the Repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/drawnix.git
   cd drawnix
   ```

2. **Create Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Install Dependencies**
   ```bash
   npm install
   ```

4. **Develop and Test**
   ```bash
   npm start          # Start development server
   npm test           # Run tests
   npm run build      # Build project
   ```

5. **Commit Changes**
   ```bash
   git add .
   git commit -m "feat: add new feature description"
   git push origin feature/your-feature-name
   ```

6. **Create Pull Request**
   - Create PR on GitHub
   - Provide detailed description of changes
   - Link related Issues

### 📝 Development Guidelines

#### Code Style
- Use TypeScript
- Follow project ESLint configuration
- Use TDesign React component library
- Keep code clean and readable

#### Commit Convention
Follow [Conventional Commits](https://conventionalcommits.org/) specification:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

Types:
- `feat`: New features
- `fix`: Bug fixes
- `docs`: Documentation updates
- `style`: Code formatting
- `refactor`: Code refactoring
- `test`: Testing related
- `chore`: Build/tooling related

Examples:
```
feat(toolbar): add new drawing tool
fix(mind-map): fix node connection issue
docs: update installation guide
```

### 🧪 Testing

- Add unit tests for new features
- Ensure all tests pass
- Test functionality across multiple browsers

### 📋 Pull Request Checklist

- [ ] Code follows project style guidelines
- [ ] Added necessary tests
- [ ] All tests pass
- [ ] Updated relevant documentation
- [ ] Commit messages follow convention
- [ ] No merge conflicts

---

## 🎯 Development Focus Areas

我们特别欢迎在以下领域的贡献：

- 🖼️ 新的绘图工具和功能
- 🎨 主题和样式改进  
- 🔧 性能优化
- 📱 移动端体验提升
- 🌍 国际化支持
- 📚 文档和示例
- 🧪 测试覆盖率提升

## 📞 联系我们

- GitHub Issues: [https://github.com/ljquan/aitu/issues](https://github.com/ljquan/aitu/issues)
- 项目网站: [https://opentu.ai](https://opentu.ai)

再次感谢您的贡献！🎉