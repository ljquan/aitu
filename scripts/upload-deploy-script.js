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
    DEPLOY_SCRIPT_PATH: '/home/aitu/nginx/scripts/deploy.sh'
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

// 上传 deploy.sh 到服务器
function uploadDeployScript() {
  const config = loadEnvConfig();
  const deployScriptPath = path.join(__dirname, '../deploy.sh');
  const remoteScriptPath = config.DEPLOY_SCRIPT_PATH || '/home/aitu/nginx/scripts/deploy.sh';
  
  console.log(`🚀 上传 deploy.sh 到远程服务器...`);
  console.log(`   本地文件: ${deployScriptPath}`);
  console.log(`   远程路径: ${remoteScriptPath}`);
  console.log(`   服务器: ${config.DEPLOY_USER}@${config.DEPLOY_HOST}:${config.DEPLOY_PORT}`);

  // 检查本地文件是否存在
  if (!fs.existsSync(deployScriptPath)) {
    console.error(`❌ 本地文件不存在: ${deployScriptPath}`);
    process.exit(1);
  }

  // 检查配置
  if (!config.DEPLOY_HOST || !config.DEPLOY_USER) {
    console.error(`❌ 未配置服务器信息`);
    console.error(`   请在 .env 文件中配置 DEPLOY_HOST 和 DEPLOY_USER`);
    process.exit(1);
  }

  try {
    // 构建 scp 命令
    let scpCommand = '';
    let usePassword = false;
    
    // 如果配置了密码，优先使用密码（即使也配置了密钥）
    if (config.DEPLOY_SSH_PASSWORD) {
      if (!checkSshpassInstalled()) {
        console.error(`\n❌ 未安装 sshpass，无法使用密码认证`);
        console.error(`\n💡 安装方法:`);
        console.error(`   macOS: brew install hudochenkov/sshpass/sshpass`);
        console.error(`   Linux: apt-get install sshpass 或 yum install sshpass`);
        process.exit(1);
      }
      usePassword = true;
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
    
    // 禁用严格主机密钥检查
    scpCommand += ` -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null`;
    
    // 添加源文件和目标
    const remotePath = `${config.DEPLOY_USER}@${config.DEPLOY_HOST}:${path.dirname(remoteScriptPath)}`;
    scpCommand += ` "${deployScriptPath}" "${remotePath}/"`;
    
    console.log(`🔄 执行上传命令...`);
    if (usePassword) {
      console.log(`   使用密码认证`);
    } else if (config.DEPLOY_SSH_KEY) {
      console.log(`   使用 SSH 密钥认证`);
    } else {
      console.log(`   使用默认 SSH 认证`);
    }
    
    execSync(scpCommand, { stdio: 'inherit' });
    
    // 设置远程文件权限（确保可执行）
    console.log(`\n🔧 设置远程文件权限...`);
    let sshCommand = '';
    if (usePassword) {
      sshCommand = `sshpass -p "${config.DEPLOY_SSH_PASSWORD}" `;
    }
    
    sshCommand += 'ssh';
    
    if (config.DEPLOY_PORT && config.DEPLOY_PORT !== '22') {
      sshCommand += ` -p ${config.DEPLOY_PORT}`;
    }
    
    if (config.DEPLOY_SSH_KEY && !usePassword) {
      const sshKeyPath = config.DEPLOY_SSH_KEY.startsWith('/') 
        ? config.DEPLOY_SSH_KEY 
        : path.join(process.env.HOME || '', config.DEPLOY_SSH_KEY.replace(/^~/, ''));
      
      if (fs.existsSync(sshKeyPath)) {
        sshCommand += ` -i "${sshKeyPath}"`;
      }
    }
    
    sshCommand += ` -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null`;
    sshCommand += ` ${config.DEPLOY_USER}@${config.DEPLOY_HOST}`;
    sshCommand += ` "chmod +x ${remoteScriptPath}"`;
    
    execSync(sshCommand, { stdio: 'inherit' });
    
    console.log(`\n✅ 上传成功!`);
    console.log(`📦 远程路径: ${remoteScriptPath}`);
    console.log(`💡 可以在服务器上使用: ${remoteScriptPath} --test`);
    
  } catch (error) {
    console.error(`\n❌ 上传失败:`, error.message);
    console.error(`\n💡 请检查:`);
    console.error(`   1. 服务器地址和端口是否正确`);
    if (config.DEPLOY_SSH_PASSWORD) {
      console.error(`   2. 密码是否正确`);
    } else {
      console.error(`   2. SSH 密钥是否正确配置`);
    }
    console.error(`   3. 服务器目录权限是否正确`);
    console.error(`   4. 网络连接是否正常`);
    process.exit(1);
  }
}

// 主函数
function main() {
  console.log(`🚀 Deploy.sh 上传工具`);
  console.log(`⏰ 时间: ${new Date().toLocaleString()}`);
  console.log(`───────────────────────────────────`);
  
  uploadDeployScript();
  
  console.log(`───────────────────────────────────`);
  console.log(`🎊 上传完成!`);
}

main();
