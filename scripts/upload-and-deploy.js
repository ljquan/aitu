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
    DEPLOY_UPLOAD_DIR: '/home/aitu/nginx/uploads',
    DEPLOY_SCRIPT_PATH: '/home/aitu/nginx/scripts/deploy.sh',
    DEPLOY_AUTO_DEPLOY: 'test'  // 默认部署到测试环境
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

// 查找最新的打包文件
function findLatestPackage() {
  const distPath = path.join(__dirname, '../dist/apps');
  
  if (!fs.existsSync(distPath)) {
    console.error(`❌ 构建目录不存在: ${distPath}`);
    console.error(`   请先运行 npm run deploy:package 打包`);
    process.exit(1);
  }

  // 查找所有 tar.gz 文件
  const files = fs.readdirSync(distPath)
    .filter(file => file.startsWith('web-') && file.endsWith('.tar.gz'))
    .map(file => {
      const filePath = path.join(distPath, file);
      const stats = fs.statSync(filePath);
      return {
        name: file,
        path: filePath,
        mtime: stats.mtime
      };
    })
    .sort((a, b) => b.mtime - a.mtime); // 按修改时间排序，最新的在前

  if (files.length === 0) {
    console.error(`❌ 未找到打包文件`);
    console.error(`   请先运行 npm run deploy:package 打包`);
    process.exit(1);
  }

  return files[0];
}

// 上传文件到远程服务器
function uploadToServer(tarPath, tarName, config) {
  console.log(`\n🚀 开始上传到远程服务器...`);
  console.log(`   服务器: ${config.DEPLOY_USER}@${config.DEPLOY_HOST}:${config.DEPLOY_PORT}`);
  console.log(`   目标目录: ${config.DEPLOY_UPLOAD_DIR}`);
  console.log(`   文件: ${tarName}`);

  try {
    // 构建 scp 命令
    let scpCommand = '';
    let usePassword = false;
    
    // 如果配置了密码，优先使用密码
    if (config.DEPLOY_SSH_PASSWORD) {
      if (!checkSshpassInstalled()) {
        console.error(`\n❌ 未安装 sshpass，无法使用密码认证`);
        console.error(`\n💡 安装方法:`);
        console.error(`   macOS: brew install hudochenkov/sshpass/sshpass`);
        console.error(`   Linux: apt-get install sshpass 或 yum install sshpass`);
        return false;
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
    const remotePath = `${config.DEPLOY_USER}@${config.DEPLOY_HOST}:${config.DEPLOY_UPLOAD_DIR}`;
    scpCommand += ` "${tarPath}" "${remotePath}/"`;
    
    console.log(`🔄 执行上传命令...`);
    if (usePassword) {
      console.log(`   使用密码认证`);
    } else if (config.DEPLOY_SSH_KEY) {
      console.log(`   使用 SSH 密钥认证`);
    } else {
      console.log(`   使用默认 SSH 认证`);
    }
    
    execSync(scpCommand, { stdio: 'inherit' });
    
    console.log(`✅ 上传成功!`);
    console.log(`📦 远程路径: ${config.DEPLOY_UPLOAD_DIR}/${tarName}`);
    
    return { success: true, tarName, usePassword };
  } catch (error) {
    console.error(`❌ 上传失败:`, error.message);
    return false;
  }
}

// 执行远程部署脚本
function executeRemoteDeploy(config, tarName, env = 'test', usePassword = false) {
  const deployScriptPath = config.DEPLOY_SCRIPT_PATH || '/home/aitu/nginx/scripts/deploy.sh';
  
  console.log(`\n🚀 开始自动部署到${env === 'test' ? '测试' : '生产'}环境...`);
  console.log(`   部署脚本: ${deployScriptPath}`);
  console.log(`   包文件: ${tarName}`);
  
  try {
    // 构建 SSH 命令
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
    
    // 禁用严格主机密钥检查
    sshCommand += ` -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null`;
    
    // 构建远程命令
    const remoteCommand = `bash ${deployScriptPath} --${env} ${tarName}`;
    sshCommand += ` ${config.DEPLOY_USER}@${config.DEPLOY_HOST} "${remoteCommand}"`;
    
    console.log(`🔄 执行远程部署命令...`);
    execSync(sshCommand, { stdio: 'inherit' });
    
    console.log(`✅ 部署成功!`);
    return true;
  } catch (error) {
    console.error(`❌ 部署失败:`, error.message);
    console.error(`\n💡 请检查:`);
    console.error(`   1. 部署脚本路径是否正确: ${deployScriptPath}`);
    console.error(`   2. 脚本是否有执行权限`);
    console.error(`   3. 服务器目录权限是否正确`);
    return false;
  }
}

// 主函数
function main() {
  // 解析命令行参数
  const args = process.argv.slice(2);
  const env = args.includes('--prod') ? 'prod' : (args.includes('--test') ? 'test' : 'test');
  const skipDeploy = args.includes('--no-deploy');
  
  console.log(`🚀 上传并部署工具`);
  console.log(`⏰ 时间: ${new Date().toLocaleString()}`);
  console.log(`───────────────────────────────────`);
  
  // 加载配置
  const config = loadEnvConfig();
  
  // 检查配置
  if (!config.DEPLOY_HOST || !config.DEPLOY_USER) {
    console.error(`❌ 未配置服务器信息`);
    console.error(`   请在 .env 文件中配置 DEPLOY_HOST 和 DEPLOY_USER`);
    process.exit(1);
  }
  
  // 查找最新的打包文件
  console.log(`\n📦 查找最新的打包文件...`);
  const packageFile = findLatestPackage();
  console.log(`✅ 找到文件: ${packageFile.name}`);
  console.log(`   路径: ${packageFile.path}`);
  console.log(`   大小: ${(fs.statSync(packageFile.path).size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   修改时间: ${packageFile.mtime.toLocaleString()}`);
  
  // 上传文件
  const uploadResult = uploadToServer(packageFile.path, packageFile.name, config);
  
  if (!uploadResult || !uploadResult.success) {
    console.error(`\n❌ 上传失败，终止部署`);
    process.exit(1);
  }
  
  // 执行部署
  if (!skipDeploy) {
    const deployEnv = config.DEPLOY_AUTO_DEPLOY === 'prod' ? 'prod' : env;
    const deploySuccess = executeRemoteDeploy(
      config, 
      packageFile.name, 
      deployEnv,
      uploadResult.usePassword
    );
    
    if (!deploySuccess) {
      console.error(`\n❌ 部署失败`);
      process.exit(1);
    }
  } else {
    console.log(`\n💡 已跳过自动部署（使用 --no-deploy 参数）`);
    console.log(`   可以在服务器上手动运行:`);
    console.log(`   ${config.DEPLOY_SCRIPT_PATH} --${env} ${packageFile.name}`);
  }
  
  console.log(`───────────────────────────────────`);
  console.log(`🎊 完成!`);
  console.log(`\n💡 使用方法:`);
  console.log(`   npm run deploy:upload          # 上传并部署到测试环境`);
  console.log(`   npm run deploy:upload -- --prod # 上传并部署到生产环境`);
  console.log(`   npm run deploy:upload -- --no-deploy # 只上传，不部署`);
}

main();
