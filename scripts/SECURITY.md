# 部署脚本安全指南

## ⚠️ 安全风险说明

如果将这些脚本开源，需要注意以下安全风险：

### 1. 密码泄露风险

**风险等级：高**

- **问题**：脚本从 `.env` 文件读取密码，如果 `.env` 文件被意外提交到 Git，密码会泄露
- **缓解措施**：
  - ✅ `.env` 已在 `.gitignore` 中（已确认）
  - ✅ 脚本中不包含硬编码的密码
  - ⚠️ 建议添加 `.env.example` 文件作为模板（不包含真实密码）

### 2. 密码在进程列表中可见

**风险等级：中**

- **问题**：使用 `sshpass -p "password"` 时，密码会出现在进程列表中（`ps aux`）
- **缓解措施**：
  - ✅ 优先使用 SSH 密钥认证（推荐）
  - ⚠️ 如果必须使用密码，考虑使用环境变量或 `sshpass -e`（从环境变量读取）

### 3. Sudo 密码传递方式不安全

**风险等级：中**

- **问题**：使用 `echo 'password' | sudo -S` 时，密码可能出现在命令历史或进程列表中
- **缓解措施**：
  - ⚠️ 建议配置免密 sudo（更安全）
  - ⚠️ 或者使用 `expect` 脚本（但增加了复杂性）

### 4. 命令注入风险

**风险等级：中**

- **问题**：如果配置值包含特殊字符（如 `;`、`|`、`&`），可能导致命令注入
- **当前保护**：
  - ✅ 使用双引号包裹变量
  - ✅ 密码转义单引号
  - ⚠️ 但路径变量（如 `tempPath`）未完全转义

### 5. SSH 安全选项

**风险等级：低**

- **问题**：`StrictHostKeyChecking=no` 禁用了主机密钥验证
- **说明**：这是为了自动化部署的便利性，但降低了安全性
- **建议**：在生产环境首次连接后，应该使用已知主机文件

## 🔒 安全建议

### 1. 使用 SSH 密钥认证（强烈推荐）

```bash
# 生成 SSH 密钥对
ssh-keygen -t ed25519 -C "deploy@aitu"

# 将公钥添加到服务器
ssh-copy-id -i ~/.ssh/id_ed25519.pub user@server

# 在 .env 中配置
DEPLOY_SSH_KEY=~/.ssh/id_ed25519
```

### 2. 配置免密 Sudo（推荐）

在服务器上配置：

```bash
# 编辑 sudoers 文件
sudo visudo

# 添加以下行（将 username 替换为实际用户名）
username ALL=(ALL) NOPASSWD: /bin/cp, /bin/rm, /usr/sbin/nginx, /bin/systemctl, /usr/sbin/service
```

### 3. 使用环境变量传递密码（如果必须）

修改脚本使用环境变量：

```bash
# 在 .env 中不存储密码，而是使用环境变量
export DEPLOY_SSH_PASSWORD="your-password"
export DEPLOY_SUDO_PASSWORD="your-sudo-password"

# 使用 sshpass -e（从环境变量读取）
sshpass -e ssh ...
```

### 4. 限制 SSH 密钥权限

```bash
# 使用受限的 SSH 密钥（只能执行特定命令）
# 在服务器的 ~/.ssh/authorized_keys 中添加：
command="/usr/bin/sudo /bin/cp /tmp/*.conf /etc/nginx/sites-enabled/",no-port-forwarding,no-X11-forwarding,no-agent-forwarding ssh-ed25519 AAAAC3...
```

### 5. 使用专用部署用户

- 创建专门的部署用户（如 `deploy`）
- 限制该用户的权限
- 只允许执行必要的命令

### 6. 添加 `.env.example` 文件

创建示例配置文件，不包含真实密码：

```bash
# .env.example
DEPLOY_HOST=your-server.com
DEPLOY_USER=username
DEPLOY_PORT=22
DEPLOY_SSH_KEY=~/.ssh/id_rsa
# DEPLOY_SSH_PASSWORD=  # 不推荐，使用 SSH 密钥
# DEPLOY_SUDO_PASSWORD=  # 建议配置免密 sudo
```

## 📋 开源前检查清单

- [ ] 确认 `.env` 在 `.gitignore` 中
- [ ] 创建 `.env.example` 文件（不包含真实密码）
- [ ] 检查脚本中是否有硬编码的服务器地址、密码等
- [ ] 添加安全警告注释到脚本顶部
- [ ] 在 README 中添加安全使用说明
- [ ] 考虑添加命令注入防护（更严格的输入验证）

## 🛡️ 改进建议

### 1. 增强命令注入防护

```javascript
// 转义 shell 特殊字符
function escapeShellArg(str) {
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

// 使用转义函数
const safePath = escapeShellArg(tempPath);
const safeRemotePath = escapeShellArg(remotePath);
```

### 2. 使用更安全的密码传递方式

```javascript
// 使用环境变量而不是命令行参数
if (config.DEPLOY_SSH_PASSWORD) {
  process.env.SSHPASS = config.DEPLOY_SSH_PASSWORD;
  scpCommand = 'sshpass -e scp';
}
```

### 3. 添加输入验证

```javascript
// 验证服务器地址格式
function validateHost(host) {
  const hostPattern = /^[a-zA-Z0-9.-]+$/;
  if (!hostPattern.test(host)) {
    throw new Error('Invalid host format');
  }
}
```

## 📝 总结

**当前安全状态**：
- ✅ 基本安全措施已到位（`.env` 在 `.gitignore` 中）
- ⚠️ 密码传递方式可以改进
- ⚠️ 建议优先使用 SSH 密钥和免密 sudo

**开源风险评估**：
- **低风险**：如果用户遵循最佳实践（使用 SSH 密钥、免密 sudo）
- **中风险**：如果用户使用密码认证，密码可能泄露

**建议**：
1. 在脚本顶部添加安全警告
2. 在 README 中强调使用 SSH 密钥认证
3. 提供 `.env.example` 文件
4. 考虑添加更严格的输入验证
