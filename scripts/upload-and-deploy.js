const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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
    DEPLOY_UPLOAD_DIR: '',
    DEPLOY_RELEASES_DIR: '',  // releases 目录，如果不设置则从 UPLOAD_DIR 推导
    DEPLOY_SCRIPT_PATH: '',
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

// 检查远程文件是否存在
function checkRemoteFileExists(tarName, config) {
  if (!config.DEPLOY_UPLOAD_DIR) {
    return false;
  }
  
  try {
    // 构建 SSH 命令
    let sshCommand = '';
    let usePassword = false;
    
    if (config.DEPLOY_SSH_PASSWORD) {
      if (!checkSshpassInstalled()) {
        return false;
      }
      usePassword = true;
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
    sshCommand += ` "test -f ${config.DEPLOY_UPLOAD_DIR}/${tarName} && echo 'exists' || echo 'not_exists'"`;
    
    const result = execSync(sshCommand, { encoding: 'utf8', stdio: 'pipe' });
    return result.trim() === 'exists';
  } catch (error) {
    return false;
  }
}

// 计算本地文件的哈希
function calculateLocalFileHash(filePath) {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    return hash;
  } catch (error) {
    return null;
  }
}

// 获取远程文件的哈希
function getRemoteFileHash(tarName, config) {
  if (!config.DEPLOY_UPLOAD_DIR) {
    return null;
  }
  
  try {
    // 构建 SSH 命令
    let sshCommand = '';
    let usePassword = false;
    
    if (config.DEPLOY_SSH_PASSWORD) {
      if (!checkSshpassInstalled()) {
        return null;
      }
      usePassword = true;
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
    sshCommand += ` "sha256sum ${config.DEPLOY_UPLOAD_DIR}/${tarName} 2>/dev/null | cut -d' ' -f1 || echo ''"`;
    
    const result = execSync(sshCommand, { encoding: 'utf8', stdio: 'pipe' });
    const hash = result.trim();
    return hash || null;
  } catch (error) {
    return null;
  }
}

// 上传文件到远程服务器
function uploadToServer(tarPath, tarName, config, localHash = null) {
  if (!config.DEPLOY_UPLOAD_DIR) {
    console.error(`\n❌ 未配置上传目录`);
    console.error(`   请在 .env 文件中配置 DEPLOY_UPLOAD_DIR`);
    return false;
  }
  
  // 计算本地文件哈希
  if (!localHash) {
    console.log(`\n🔐 计算本地文件哈希...`);
    localHash = calculateLocalFileHash(tarPath);
    if (localHash) {
      console.log(`   本地哈希: ${localHash.substring(0, 16)}...`);
    }
  }
  
  // 检查远程文件是否存在并比较哈希
  console.log(`\n🔍 检查远程文件...`);
  const remoteHash = getRemoteFileHash(tarName, config);
  
  if (remoteHash) {
    console.log(`   远程哈希: ${remoteHash.substring(0, 16)}...`);
    if (localHash && remoteHash === localHash) {
      console.log(`✅ 远程文件已存在且哈希匹配，跳过上传`);
      return { success: true, tarName, usePassword: false, skipped: true, hash: localHash };
    } else {
      console.log(`⚠️  远程文件存在但哈希不匹配，将重新上传`);
    }
  } else {
    console.log(`   远程文件不存在，需要上传`);
  }
  
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

// 执行远程解压（只解压，不部署）
function executeRemoteExtract(config, tarName, usePassword = false) {
  if (!config.DEPLOY_UPLOAD_DIR) {
    console.error(`\n❌ 未配置上传目录`);
    console.error(`   请在 .env 文件中配置 DEPLOY_UPLOAD_DIR`);
    return false;
  }
  
  // 从包中读取版本号
  const uploadsDir = config.DEPLOY_UPLOAD_DIR;
  const releasesDir = config.DEPLOY_RELEASES_DIR || uploadsDir.replace('/uploads', '/releases');
  
  console.log(`\n📦 开始远程解压...`);
  console.log(`   包文件: ${tarName}`);
  console.log(`   上传目录: ${uploadsDir}`);
  console.log(`   解压目录: ${releasesDir}`);
  
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
    
    // 构建远程解压命令
    // 使用 base64 编码避免引号转义问题
    const extractScript = `VERSION=$(tar -xzf ${uploadsDir}/${tarName} -O web/version.json 2>/dev/null | grep '"version"' | sed 's/.*"version": "\\([^"]*\\)".*/\\1/')
if [ -z "$VERSION" ]; then
  echo "无法读取版本号"
  exit 1
fi
echo "版本: $VERSION"
if [ -d "${releasesDir}/$VERSION" ]; then
  echo "删除旧版本目录..."
  rm -rf "${releasesDir}/$VERSION"
fi
mkdir -p "${releasesDir}/$VERSION"
echo "开始解压..."
tar -xzf ${uploadsDir}/${tarName} -C "${releasesDir}/$VERSION" --strip-components=1
echo "解压完成: ${releasesDir}/$VERSION"
if [ -f "${releasesDir}/$VERSION/version.json" ] && [ -d "${releasesDir}/$VERSION/assets" ]; then
  FILE_COUNT=$(find "${releasesDir}/$VERSION" -type f | wc -l)
  ASSETS_JS_COUNT=$(find "${releasesDir}/$VERSION/assets" -type f -name "*.js" | wc -l)
  echo "解压验证: $FILE_COUNT 个文件，$ASSETS_JS_COUNT 个 JS 文件"
  if [ "$ASSETS_JS_COUNT" -lt 50 ]; then
    echo "警告: JS 文件数量较少，可能不完整"
  fi
else
  echo "解压验证失败"
  exit 1
fi
cp "${releasesDir}/$VERSION/versions.html" "${releasesDir}/versions.html" 2>/dev/null || true
cp "${releasesDir}/$VERSION/changelog.json" "${releasesDir}/changelog.json" 2>/dev/null || true`;
    
    // 将脚本编码为 base64，避免引号转义问题
    const encodedScript = Buffer.from(extractScript).toString('base64');
    const remoteCommand = `echo ${encodedScript} | base64 -d | bash`;
    
    sshCommand += ` ${config.DEPLOY_USER}@${config.DEPLOY_HOST} "${remoteCommand}"`;
    
    console.log(`🔄 执行远程解压命令...`);
    execSync(sshCommand, { stdio: 'inherit' });
    
    console.log(`✅ 解压成功!`);
    return true;
  } catch (error) {
    console.error(`❌ 解压失败:`, error.message);
    console.error(`\n💡 请检查:`);
    console.error(`   1. 包文件是否存在: ${uploadsDir}/${tarName}`);
    console.error(`   2. 服务器目录权限是否正确`);
    console.error(`   3. 磁盘空间是否充足`);
    return false;
  }
}

// 执行远程部署脚本
function executeRemoteDeploy(config, tarName, env = 'test', usePassword = false) {
  if (!config.DEPLOY_SCRIPT_PATH) {
    console.error(`\n❌ 未配置部署脚本路径`);
    console.error(`   请在 .env 文件中配置 DEPLOY_SCRIPT_PATH`);
    return false;
  }
  
  const deployScriptPath = config.DEPLOY_SCRIPT_PATH;
  
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

// 获取认证方式（用于后续的部署命令）
function getAuthInfo(config) {
  let usePassword = false;
  
  if (config.DEPLOY_SSH_PASSWORD) {
    if (checkSshpassInstalled()) {
      usePassword = true;
    }
  }
  
  return { usePassword };
}

// 主函数
function main() {
  // 解析命令行参数
  const args = process.argv.slice(2);
  const env = args.includes('--prod') ? 'prod' : (args.includes('--test') ? 'test' : 'test');
  const skipDeploy = args.includes('--no-deploy');
  const deployOnly = args.includes('--deploy-only') || args.includes('--only-deploy');
  
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
  
  let uploadResult = null;
  let fileExists = false;
  
  // 如果使用 --deploy-only，检查远程文件是否存在
  if (deployOnly) {
    console.log(`\n🔍 检查远程文件是否存在...`);
    fileExists = checkRemoteFileExists(packageFile.name, config);
    
    if (fileExists) {
      console.log(`✅ 远程文件已存在: ${config.DEPLOY_UPLOAD_DIR}/${packageFile.name}`);
      console.log(`   跳过上传，直接部署`);
      uploadResult = getAuthInfo(config);
      uploadResult.success = true;
      uploadResult.tarName = packageFile.name;
    } else {
      console.error(`❌ 远程文件不存在: ${config.DEPLOY_UPLOAD_DIR}/${packageFile.name}`);
      console.error(`   请先上传文件或移除 --deploy-only 参数`);
      process.exit(1);
    }
  } else {
    // 计算本地文件哈希
    console.log(`\n🔐 计算本地文件哈希...`);
    const localHash = calculateLocalFileHash(packageFile.path);
    if (localHash) {
      console.log(`   本地哈希: ${localHash.substring(0, 16)}...`);
    }
    
    // 检查文件是否已存在并比较哈希
    fileExists = checkRemoteFileExists(packageFile.name, config);
    if (fileExists) {
      console.log(`\nℹ️  远程文件已存在: ${config.DEPLOY_UPLOAD_DIR}/${packageFile.name}`);
      
      // 获取远程文件哈希
      const remoteHash = getRemoteFileHash(packageFile.name, config);
      if (remoteHash && localHash) {
        console.log(`   远程哈希: ${remoteHash.substring(0, 16)}...`);
        if (remoteHash === localHash) {
          console.log(`✅ 远程文件哈希匹配，跳过上传`);
          uploadResult = getAuthInfo(config);
          uploadResult.success = true;
          uploadResult.tarName = packageFile.name;
          uploadResult.skipped = true;
          uploadResult.hash = localHash;
        } else {
          console.log(`⚠️  远程文件哈希不匹配，将重新上传`);
          uploadResult = uploadToServer(packageFile.path, packageFile.name, config, localHash);
        }
      } else {
        console.log(`   将重新上传覆盖`);
        uploadResult = uploadToServer(packageFile.path, packageFile.name, config, localHash);
      }
    } else {
      // 上传文件
      uploadResult = uploadToServer(packageFile.path, packageFile.name, config, localHash);
    }
    
    if (!uploadResult || !uploadResult.success) {
      console.error(`\n❌ 上传失败，终止部署`);
      process.exit(1);
    }
  }
  
  // 执行部署或解压
  if (!skipDeploy) {
    // 如果使用 --prod，只解压不部署
    if (env === 'prod') {
      console.log(`\n📦 生产环境模式：只解压，不部署`);
      const extractSuccess = executeRemoteExtract(
        config,
        packageFile.name,
        uploadResult.usePassword
      );
      
      if (!extractSuccess) {
        console.error(`\n❌ 解压失败`);
        process.exit(1);
      }
    } else {
      // 测试环境或其他环境，执行完整部署
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
    }
  } else {
    console.log(`\n💡 已跳过自动部署（使用 --no-deploy 参数）`);
    console.log(`   可以在服务器上手动运行:`);
    if (config.DEPLOY_SCRIPT_PATH) {
      console.log(`   ${config.DEPLOY_SCRIPT_PATH} --${env} ${packageFile.name}`);
    } else {
      console.log(`   部署脚本 --${env} ${packageFile.name}`);
    }
  }
  
  console.log(`───────────────────────────────────`);
  console.log(`🎊 完成!`);
  console.log(`\n💡 使用方法:`);
  console.log(`   npm run deploy:upload              # 上传并部署到测试环境`);
  console.log(`   npm run deploy:upload -- --prod     # 上传并解压到生产环境（不部署）`);
  console.log(`   npm run deploy:upload -- --test    # 上传并部署到测试环境`);
  console.log(`   npm run deploy:upload -- --no-deploy # 只上传，不解压也不部署`);
  console.log(`   npm run deploy:upload -- --deploy-only # 只部署，不上传（文件需已存在）`);
}

main();
