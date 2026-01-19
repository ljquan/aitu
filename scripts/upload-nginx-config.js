/**
 * Nginx 配置文件上传脚本
 * 
 * ⚠️ 安全警告：
 * 1. 确保 .env 文件在 .gitignore 中，不要提交到版本控制
 * 2. 强烈建议使用 SSH 密钥认证，而不是密码认证
 * 3. 建议配置免密 sudo，而不是在 .env 中存储 sudo 密码
 * 4. 密码会出现在进程列表中，使用 SSH 密钥更安全
 * 
 * 详细安全指南请参考 scripts/SECURITY.md
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 加载 .env 配置文件
function loadEnvConfig() {
  const envPath = path.join(__dirname, '../.env');
  const config = {
    DEPLOY_HOST: '',
    DEPLOY_USER: '',
    DEPLOY_PORT: '22',
    DEPLOY_SSH_KEY: '',
    DEPLOY_SSH_PASSWORD: '',
    DEPLOY_SUDO_PASSWORD: '',  // sudo 密码（如果需要）
  };

  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      line = line.trim();
      if (line && !line.startsWith('#')) {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          let value = match[2].trim();
          if ((value.startsWith('"') && value.endsWith('"')) || 
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          if (config.hasOwnProperty(key)) {
            config[key] = value;
          }
        }
      }
    });
  }

  return config;
}

// 检查 sshpass 是否安装
function checkSshpassInstalled() {
  try {
    execSync('which sshpass', { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

// 构建 SSH 命令前缀
function buildSSHCommand(config, usePassword) {
  let sshCommand = '';
  
  if (usePassword) {
    sshCommand = `sshpass -p "${config.DEPLOY_SSH_PASSWORD}" `;
  }
  
  sshCommand += 'ssh';
  
  // 添加端口
  if (config.DEPLOY_PORT && config.DEPLOY_PORT !== '22') {
    sshCommand += ` -p ${config.DEPLOY_PORT}`;
  }
  
  // 添加 SSH 密钥（如果没有使用密码）
  if (config.DEPLOY_SSH_KEY && !usePassword) {
    const sshKeyPath = config.DEPLOY_SSH_KEY.startsWith('/') 
      ? config.DEPLOY_SSH_KEY 
      : path.join(process.env.HOME || '', config.DEPLOY_SSH_KEY.replace(/^~/, ''));
    
    if (fs.existsSync(sshKeyPath)) {
      sshCommand += ` -i "${sshKeyPath}"`;
    }
  }
  
  // 添加 SSH 选项
  sshCommand += ` -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null`;
  
  return sshCommand;
}

// 构建 SCP 命令前缀
function buildSCPCommand(config, usePassword) {
  let scpCommand = '';
  
  if (usePassword) {
    scpCommand = `sshpass -p "${config.DEPLOY_SSH_PASSWORD}" `;
  }
  
  scpCommand += 'scp';
  
  // 添加端口
  if (config.DEPLOY_PORT && config.DEPLOY_PORT !== '22') {
    scpCommand += ` -P ${config.DEPLOY_PORT}`;
  }
  
  // 添加 SSH 密钥（如果没有使用密码）
  if (config.DEPLOY_SSH_KEY && !usePassword) {
    const sshKeyPath = config.DEPLOY_SSH_KEY.startsWith('/') 
      ? config.DEPLOY_SSH_KEY 
      : path.join(process.env.HOME || '', config.DEPLOY_SSH_KEY.replace(/^~/, ''));
    
    if (fs.existsSync(sshKeyPath)) {
      scpCommand += ` -i "${sshKeyPath}"`;
    }
  }
  
  // 添加 SSH 选项
  scpCommand += ` -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null`;
  
  return scpCommand;
}

// 上传配置文件
function uploadNginxConfig(config) {
  const configFile = path.join(__dirname, 'aitu-releases.conf');
  const remotePath = '/etc/nginx/sites-enabled/aitu-releases.conf';
  const tempPath = `/tmp/aitu-releases-${Date.now()}.conf`;
  
  if (!fs.existsSync(configFile)) {
    console.error(`❌ 配置文件不存在: ${configFile}`);
    process.exit(1);
  }

  console.log('📤 上传 Nginx 配置文件...');
  console.log(`   本地文件: ${configFile}`);
  console.log(`   远程路径: ${remotePath}`);
  console.log(`   服务器: ${config.DEPLOY_USER}@${config.DEPLOY_HOST}:${config.DEPLOY_PORT}`);

  // 判断是否使用密码
  let usePassword = false;
  if (config.DEPLOY_SSH_PASSWORD) {
    if (!checkSshpassInstalled()) {
      console.error('\n❌ 未安装 sshpass，无法使用密码认证');
      console.error('   请安装: brew install hudochenkov/sshpass/sshpass (macOS)');
      console.error('   或者配置 SSH 密钥认证（更安全）');
      process.exit(1);
    }
    usePassword = true;
  }

  // 显示认证方式
  if (usePassword) {
    console.log(`   使用密码认证`);
  } else if (config.DEPLOY_SSH_KEY) {
    console.log(`   使用 SSH 密钥认证`);
  } else {
    console.log(`   使用默认 SSH 认证`);
  }

  // 步骤 1: 上传到临时目录
  console.log(`\n   步骤 1/2: 上传到临时目录 ${tempPath}`);
  const scpCommand = buildSCPCommand(config, usePassword);
  const tempTarget = `${config.DEPLOY_USER}@${config.DEPLOY_HOST}:${tempPath}`;
  const uploadCommand = `${scpCommand} "${configFile}" "${tempTarget}"`;

  try {
    execSync(uploadCommand, { stdio: 'inherit' });
    console.log('   ✅ 文件上传到临时目录成功');
  } catch (error) {
    console.error('\n❌ 上传到临时目录失败');
    if (usePassword) {
      console.error('   可能的原因:');
      console.error('   1. 密码错误');
      console.error('   2. 服务器不允许密码认证');
      console.error('   3. 网络连接问题');
      console.error('   建议: 配置 SSH 密钥认证（更安全）');
    } else {
      console.error('   可能的原因:');
      console.error('   1. SSH 密钥未配置或权限不足');
      console.error('   2. 服务器连接失败');
    }
    process.exit(1);
  }

  // 步骤 2: 使用 sudo 移动到目标位置
  console.log(`\n   步骤 2/2: 移动到目标目录（需要 sudo 权限）`);
  const sshCommand = buildSSHCommand(config, usePassword);
  
  // 构建 sudo 命令，如果配置了 sudo 密码则使用 -S 选项
  let sudoPrefix = 'sudo';
  if (config.DEPLOY_SUDO_PASSWORD) {
    // 使用 echo 通过管道传递密码给 sudo -S
    // 注意：需要转义特殊字符，使用单引号包裹密码
    const escapedPassword = config.DEPLOY_SUDO_PASSWORD.replace(/'/g, "'\\''");
    sudoPrefix = `echo '${escapedPassword}' | sudo -S`;
  }
  
  // 备份旧文件（如果存在），然后移动新文件
  const moveCommand = `${sshCommand} ${config.DEPLOY_USER}@${config.DEPLOY_HOST} "${sudoPrefix} cp ${tempPath} ${remotePath} && ${sudoPrefix} rm -f ${tempPath}"`;

  try {
    execSync(moveCommand, { stdio: 'inherit' });
    console.log('   ✅ 文件已移动到目标目录');
    console.log('✅ 配置文件上传成功');
    return true;
  } catch (error) {
    console.error('\n❌ 移动到目标目录失败');
    console.error('   可能的原因:');
    console.error('   1. 用户没有 sudo 权限');
    console.error('   2. sudo 密码错误（如果配置了 DEPLOY_SUDO_PASSWORD）');
    console.error('   3. 目标目录不存在或权限不足');
    if (!config.DEPLOY_SUDO_PASSWORD) {
      console.error('   提示: 可以在 .env 中配置 DEPLOY_SUDO_PASSWORD 来自动输入 sudo 密码');
    }
    console.error(`\n   临时文件位置: ${tempPath}`);
    console.error('   可以手动执行:');
    console.error(`   ssh ${config.DEPLOY_USER}@${config.DEPLOY_HOST}`);
    console.error(`   sudo cp ${tempPath} ${remotePath}`);
    process.exit(1);
  }
}

// 测试并重载 Nginx 配置
function testAndReloadNginx(config) {
  console.log('\n🔧 测试 Nginx 配置...');

  const usePassword = !!config.DEPLOY_SSH_PASSWORD;
  const sshCommand = buildSSHCommand(config, usePassword);
  
  // 构建 sudo 命令，如果配置了 sudo 密码则使用 -S 选项
  let sudoPrefix = 'sudo';
  if (config.DEPLOY_SUDO_PASSWORD) {
    const escapedPassword = config.DEPLOY_SUDO_PASSWORD.replace(/'/g, "'\\''");
    sudoPrefix = `echo '${escapedPassword}' | sudo -S`;
  }

  // 测试配置
  const testCommand = `${sshCommand} ${config.DEPLOY_USER}@${config.DEPLOY_HOST} "${sudoPrefix} nginx -t"`;
  
  try {
    console.log('   执行: sudo nginx -t');
    execSync(testCommand, { stdio: 'inherit' });
    console.log('✅ Nginx 配置测试通过');
  } catch (error) {
    console.error('\n❌ Nginx 配置测试失败');
    console.error('   请检查配置文件语法是否正确');
    if (!config.DEPLOY_SUDO_PASSWORD) {
      console.error('   提示: 如果 sudo 需要密码，可以在 .env 中配置 DEPLOY_SUDO_PASSWORD');
    }
    process.exit(1);
  }

  // 重载 Nginx
  console.log('\n🔄 重载 Nginx 配置...');
  const reloadCommand = `${sshCommand} ${config.DEPLOY_USER}@${config.DEPLOY_HOST} "${sudoPrefix} systemctl reload nginx || ${sudoPrefix} service nginx reload || ${sudoPrefix} nginx -s reload"`;
  
  try {
    execSync(reloadCommand, { stdio: 'inherit' });
    console.log('✅ Nginx 配置已重载');
  } catch (error) {
    console.error('\n❌ Nginx 重载失败');
    console.error('   请手动执行: sudo systemctl reload nginx');
    process.exit(1);
  }
}

// 主函数
function main() {
  console.log('🚀 上传 Nginx 配置文件\n');

  const config = loadEnvConfig();

  if (!config.DEPLOY_HOST || !config.DEPLOY_USER) {
    console.error('❌ 缺少必要的配置');
    console.error('   请在 .env 文件中配置:');
    console.error('   DEPLOY_HOST=your-server.com');
    console.error('   DEPLOY_USER=username');
    console.error('   DEPLOY_PORT=22 (可选)');
    console.error('   DEPLOY_SSH_KEY=~/.ssh/id_rsa (可选，推荐)');
    console.error('   DEPLOY_SSH_PASSWORD=password (可选，不推荐)');
    process.exit(1);
  }

  // 上传配置文件
  uploadNginxConfig(config);

  // 询问是否测试并重载
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('\n是否测试并重载 Nginx 配置? (y/n): ', (answer) => {
    rl.close();
    
    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
      testAndReloadNginx(config);
      console.log('\n✅ 完成！');
    } else {
      console.log('\n⚠️  请手动测试并重载 Nginx:');
      console.log('   sudo nginx -t');
      console.log('   sudo systemctl reload nginx');
    }
  });
}

// 运行主函数
if (require.main === module) {
  main();
}

module.exports = { uploadNginxConfig, testAndReloadNginx };
