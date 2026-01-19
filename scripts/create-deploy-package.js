const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getCurrentVersion() {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  return packageJson.version;
}

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
    DEPLOY_AUTO_UPLOAD: 'false',
    DEPLOY_AUTO_DEPLOY: 'false'  // 'false', 'true' (prod), 'test'
  };

  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      line = line.trim();
      // 跳过注释和空行
      if (line && !line.startsWith('#')) {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          let value = match[2].trim();
          // 移除引号
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

// 执行远程部署脚本
function executeRemoteDeploy(config, tarName, env = 'test') {
  const deployScriptPath = config.DEPLOY_SCRIPT_PATH || '/home/aitu/nginx/scripts/deploy.sh';
  
  console.log(`\n🚀 开始自动部署到${env === 'test' ? '测试' : '生产'}环境...`);
  console.log(`   部署脚本: ${deployScriptPath}`);
  console.log(`   包文件: ${tarName}`);
  
  try {
    // 构建 SSH 命令
    let sshCommand = '';
    let usePassword = false;
    
    // 如果配置了密码，使用 sshpass
    if (config.DEPLOY_SSH_PASSWORD && !config.DEPLOY_SSH_KEY) {
      if (!checkSshpassInstalled()) {
        console.error(`\n❌ 未安装 sshpass，无法执行远程部署`);
        console.error(`   请安装: brew install hudochenkov/sshpass/sshpass`);
        return false;
      }
      usePassword = true;
      sshCommand = `sshpass -p "${config.DEPLOY_SSH_PASSWORD}" `;
    }
    
    sshCommand += 'ssh';
    
    // 添加端口
    if (config.DEPLOY_PORT && config.DEPLOY_PORT !== '22') {
      sshCommand += ` -p ${config.DEPLOY_PORT}`;
    }
    
    // 添加 SSH 密钥
    if (config.DEPLOY_SSH_KEY) {
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

// 上传文件到远程服务器
function uploadToServer(tarPath, tarName, config) {
  if (!config.DEPLOY_HOST || !config.DEPLOY_USER) {
    console.log(`\n⚠️  未配置远程服务器信息，跳过上传`);
    console.log(`   请在 .env 文件中配置 DEPLOY_HOST 和 DEPLOY_USER`);
    return false;
  }

  console.log(`\n🚀 开始上传到远程服务器...`);
  console.log(`   服务器: ${config.DEPLOY_USER}@${config.DEPLOY_HOST}:${config.DEPLOY_PORT}`);
  console.log(`   目标目录: ${config.DEPLOY_UPLOAD_DIR}`);
  console.log(`   文件: ${tarName}`);

  try {
    // 构建 scp 命令
    let scpCommand = '';
    let usePassword = false;
    
    // 如果配置了密码，使用 sshpass
    if (config.DEPLOY_SSH_PASSWORD && !config.DEPLOY_SSH_KEY) {
      if (!checkSshpassInstalled()) {
        console.error(`\n❌ 未安装 sshpass，无法使用密码认证`);
        console.error(`\n💡 安装方法:`);
        console.error(`   macOS: brew install hudochenkov/sshpass/sshpass`);
        console.error(`   Linux: apt-get install sshpass 或 yum install sshpass`);
        console.error(`\n   或者配置 SSH 密钥认证（更安全）`);
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
    
    // 添加 SSH 密钥（如果配置了密钥，优先使用密钥）
    if (config.DEPLOY_SSH_KEY) {
      const sshKeyPath = config.DEPLOY_SSH_KEY.startsWith('/') 
        ? config.DEPLOY_SSH_KEY 
        : path.join(process.env.HOME || '', config.DEPLOY_SSH_KEY);
      
      if (fs.existsSync(sshKeyPath)) {
        scpCommand += ` -i "${sshKeyPath}"`;
      } else {
        console.warn(`⚠️  SSH 密钥文件不存在: ${sshKeyPath}`);
      }
    }
    
    // 禁用严格主机密钥检查（可选，用于自动化场景）
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
    
    return { success: true, tarName };
  } catch (error) {
    console.error(`❌ 上传失败:`, error.message);
    console.error(`\n💡 请检查:`);
    console.error(`   1. 服务器地址和端口是否正确`);
    if (config.DEPLOY_SSH_PASSWORD) {
      console.error(`   2. 密码是否正确`);
      console.error(`   3. 是否已安装 sshpass (brew install hudochenkov/sshpass/sshpass)`);
    } else {
      console.error(`   2. SSH 密钥是否正确配置`);
    }
    console.error(`   4. 服务器目录权限是否正确`);
    console.error(`   5. 网络连接是否正常`);
    return false;
  }
  
  return false;
}

function createDeployPackage() {
  const version = getCurrentVersion();
  const distPath = path.join(__dirname, '../dist/apps/web');
  const tarName = `web-${version}.tar.gz`;
  const tarPath = path.join(__dirname, '../dist/apps', tarName);
  
  console.log(`📦 开始创建部署包...`);
  console.log(`📂 源目录: ${distPath}`);
  console.log(`📁 目标文件: ${tarPath}`);

  // 检查源目录是否存在
  if (!fs.existsSync(distPath)) {
    console.error(`❌ 构建目录不存在: ${distPath}`);
    console.error(`请先运行 npm run build 命令`);
    process.exit(1);
  }

  // 检查目录是否为空
  const files = fs.readdirSync(distPath);
  if (files.length === 0) {
    console.error(`❌ 构建目录为空: ${distPath}`);
    process.exit(1);
  }

  // 检查 version.json 是否存在
  const versionJsonPath = path.join(distPath, 'version.json');
  if (!fs.existsSync(versionJsonPath)) {
    console.error(`❌ version.json 不存在: ${versionJsonPath}`);
    console.error(`请确保构建过程已正确复制 version.json`);
    process.exit(1);
  }

  console.log(`📝 目录内容 (${files.length} 个文件/目录):`);
  files.forEach(file => {
    const filePath = path.join(distPath, file);
    const stats = fs.statSync(filePath);
    const type = stats.isDirectory() ? '📁' : '📄';
    const size = stats.isDirectory() ? '' : ` (${(stats.size / 1024).toFixed(1)} KB)`;
    console.log(`   ${type} ${file}${size}`);
  });

  try {
    // 删除可能存在的旧版本 tar.gz 文件
    if (fs.existsSync(tarPath)) {
      fs.unlinkSync(tarPath);
      console.log(`🗑️  删除旧版本: ${tarName}`);
    }

    // 创建 tar.gz 包
    // 包内结构应该是 web/ 目录，这样 deploy.sh 可以从 web/version.json 读取版本
    // 进入 dist/apps 目录，打包 web 目录，这样包内路径就是 web/
    // 使用 COPYFILE_DISABLE=1 禁用 macOS 扩展属性，确保跨平台兼容性
    const appsDir = path.dirname(distPath);
    const tarFileName = path.basename(tarPath);
    
    // 切换到 apps 目录，使用相对路径避免路径问题
    // 排除 macOS 特定文件，使用 --exclude 选项
    console.log(`🔄 执行压缩命令...`);
    console.log(`   工作目录: ${appsDir}`);
    console.log(`   打包目录: web`);
    console.log(`   输出文件: ${tarFileName}`);
    
    const env = { ...process.env, COPYFILE_DISABLE: '1' };
    // 使用 tar 打包，确保包含所有文件
    // COPYFILE_DISABLE=1 环境变量会禁用 macOS 扩展属性
    // 只排除系统文件，不排除任何业务文件
    execSync(
      `tar -czf "${tarFileName}" --exclude='.DS_Store' --exclude='._*' --exclude='.git*' web`,
      { 
        cwd: appsDir,
        stdio: 'inherit',
        env: env
      }
    );

    // 验证 tar.gz 文件是否创建成功
    if (fs.existsSync(tarPath)) {
      const tarStats = fs.statSync(tarPath);
      const tarSizeMB = (tarStats.size / 1024 / 1024).toFixed(2);
      
      // 验证包内结构（检查是否能从 web/version.json 读取）
      try {
        // 使用 2>/dev/null 忽略扩展属性警告，这些警告不影响功能
        const versionCheck = execSync(
          `tar -xzf "${tarPath}" -O web/version.json 2>/dev/null`, 
          { encoding: 'utf8' }
        );
        const versionInfo = JSON.parse(versionCheck.trim());
        if (versionInfo.version === version) {
          console.log(`✅ 版本验证通过: ${version}`);
        } else {
          console.warn(`⚠️  版本不匹配: 期望 ${version}, 实际 ${versionInfo.version}`);
        }
      } catch (e) {
        console.warn(`⚠️  无法验证包内版本信息: ${e.message}`);
        console.warn(`   这可能是由于 macOS 扩展属性警告导致的，但不影响包的功能`);
      }
      
      // 验证关键文件是否存在
      try {
        const fileList = execSync(
          `tar -tzf "${tarPath}" 2>/dev/null`, 
          { encoding: 'utf8' }
        );
        const files = fileList.split('\n').filter(f => f.trim());
        const hasAssets = files.some(f => f.includes('assets/'));
        const hasIndex = files.some(f => f.includes('index.html'));
        const assetCount = files.filter(f => f.includes('assets/') && (f.endsWith('.js') || f.endsWith('.css'))).length;
        
        // 检查关键文件模式（文件名是动态生成的，只检查模式）
        const hasHasIn = files.some(f => f.includes('assets/') && f.includes('hasIn-') && f.endsWith('.js'));
        const hasHas = files.some(f => f.includes('assets/') && f.includes('has-') && f.endsWith('.js'));
        const hasToolbox = files.some(f => f.includes('assets/') && f.includes('ToolboxDrawer-') && f.endsWith('.js'));
        
        console.log(`📊 打包统计:`);
        console.log(`   总文件数: ${files.length}`);
        console.log(`   Assets 文件数: ${assetCount}`);
        console.log(`   关键文件模式检查:`);
        console.log(`     - hasIn-*.js: ${hasHasIn ? '✅' : '❌'}`);
        console.log(`     - has-*.js: ${hasHas ? '✅' : '❌'}`);
        console.log(`     - ToolboxDrawer-*.js: ${hasToolbox ? '✅' : '❌'}`);
        
        if (!hasAssets) {
          console.warn(`⚠️  警告: 未找到 assets 目录`);
        }
        if (!hasIndex) {
          console.warn(`⚠️  警告: 未找到 index.html`);
        }
        if (assetCount < 50) {
          console.warn(`⚠️  警告: Assets 文件数量较少 (${assetCount})，可能不完整`);
        }
        // 只警告，不阻止打包（因为文件名是动态的）
        if (!hasHasIn || !hasHas || !hasToolbox) {
          console.warn(`⚠️  警告: 某些关键文件模式未找到，但文件名是动态生成的，可能正常`);
        }
      } catch (e) {
        if (e.message === '关键文件缺失') {
          throw e;
        }
        console.warn(`⚠️  无法验证包内文件列表: ${e.message}`);
      }
      
      // 测试解压（在临时目录）
      console.log(`🧪 测试解压...`);
      try {
        const testDir = path.join(__dirname, '../.test-extract');
        if (fs.existsSync(testDir)) {
          fs.rmSync(testDir, { recursive: true, force: true });
        }
        fs.mkdirSync(testDir, { recursive: true });
        
        execSync(
          `tar -xzf "${tarPath}" -C "${testDir}" --strip-components=1 2>/dev/null`,
          { stdio: 'ignore' }
        );
        
        // 验证解压后的关键文件（只检查必须存在的文件）
        const requiredFiles = ['version.json', 'index.html', 'assets'];
        
        let allFilesExist = true;
        for (const testFile of requiredFiles) {
          const testPath = path.join(testDir, testFile);
          if (!fs.existsSync(testPath)) {
            console.error(`❌ 测试解压失败: 未找到 ${testFile}`);
            allFilesExist = false;
          }
        }
        
        // 检查 assets 目录中是否有 JS 文件
        const assetsDir = path.join(testDir, 'assets');
        if (fs.existsSync(assetsDir)) {
          const assetFiles = fs.readdirSync(assetsDir).filter(f => f.endsWith('.js'));
          if (assetFiles.length === 0) {
            console.error(`❌ 测试解压失败: assets 目录为空`);
            allFilesExist = false;
          } else {
            console.log(`✅ assets 目录包含 ${assetFiles.length} 个 JS 文件`);
          }
        }
        
        // 清理测试目录
        fs.rmSync(testDir, { recursive: true, force: true });
        
        if (allFilesExist) {
          console.log(`✅ 解压测试通过: 所有关键文件都能正确解压`);
        } else {
          throw new Error('解压测试失败');
        }
      } catch (e) {
        if (e.message === '解压测试失败') {
          throw e;
        }
        console.warn(`⚠️  解压测试跳过: ${e.message}`);
      }
      
      console.log(`✅ 部署包创建成功!`);
      console.log(`📦 文件: ${tarName}`);
      console.log(`📏 大小: ${tarSizeMB} MB`);
      console.log(`📍 路径: ${tarPath}`);
      
      // 显示相对路径，更友好
      const relativePath = path.relative(process.cwd(), tarPath);
      console.log(`🎉 相对路径: ${relativePath}`);
      
      // 返回 tar 文件路径和名称，供上传使用
      return { tarPath, tarName };
      
    } else {
      throw new Error('TAR.GZ 文件创建失败');
    }

  } catch (error) {
    console.error(`❌ 创建部署包失败:`, error.message);
    
    // 提供备用方案
    console.log(`\n💡 手动创建方案:`);
    console.log(`   cd ${path.dirname(distPath)}`);
    console.log(`   tar -czf ${tarName} -C web .`);
    
    process.exit(1);
  }
}

// 主函数
function main() {
  // 解析命令行参数
  const args = process.argv.slice(2);
  
  console.log(`🚀 Aitu 部署包创建工具`);
  console.log(`⏰ 时间: ${new Date().toLocaleString()}`);
  console.log(`───────────────────────────────────`);
  
  // 加载环境配置
  const config = loadEnvConfig();
  
  // 创建部署包
  const result = createDeployPackage();
  
  console.log(`───────────────────────────────────`);
  console.log(`🎊 部署包创建完成!`);
  
  // 自动上传（如果配置了服务器信息）
  let uploadSuccess = false;
  let deploySuccess = false;
  if (config.DEPLOY_HOST && config.DEPLOY_USER) {
    // 默认自动上传，除非明确禁用
    const shouldSkipUpload = args.includes('--no-upload');
    if (!shouldSkipUpload) {
      const uploadResult = uploadToServer(result.tarPath, result.tarName, config);
      uploadSuccess = uploadResult && uploadResult.success;
      
      // 如果上传成功且配置了自动部署，执行远程部署脚本
      if (uploadSuccess && (config.DEPLOY_AUTO_DEPLOY === 'true' || config.DEPLOY_AUTO_DEPLOY === 'test')) {
        const deployEnv = config.DEPLOY_AUTO_DEPLOY === 'test' ? 'test' : 'prod';
        deploySuccess = executeRemoteDeploy(config, result.tarName, deployEnv, uploadResult.usePassword);
      }
    } else {
      console.log(`\n💡 已跳过上传（使用 --no-upload 参数）`);
      console.log(`   手动上传: scp ${result.tarPath} ${config.DEPLOY_USER}@${config.DEPLOY_HOST}:${config.DEPLOY_UPLOAD_DIR}/`);
    }
  } else {
    console.log(`\n💡 未配置远程服务器信息，跳过上传`);
    console.log(`   请在 .env 文件中配置 DEPLOY_HOST 和 DEPLOY_USER`);
  }
  
  const version = getCurrentVersion();
  const tarName = `web-${version}.tar.gz`;
  console.log(`\n💡 使用方法:`);
  if (uploadSuccess) {
    console.log(`   ✅ 文件已上传到 ${config.DEPLOY_UPLOAD_DIR}/${tarName}`);
    if (deploySuccess) {
      console.log(`   ✅ 已自动部署到${config.DEPLOY_AUTO_DEPLOY === 'test' ? '测试' : '生产'}环境`);
    } else {
      console.log(`   在服务器上运行: ${config.DEPLOY_SCRIPT_PATH || '/home/aitu/nginx/scripts/deploy.sh'} --test ${tarName}`);
    }
  } else {
    console.log(`   本地部署: ./deploy.sh --test ${tarName}`);
    if (config.DEPLOY_HOST && config.DEPLOY_USER) {
      console.log(`   手动上传: scp ${result.tarPath} ${config.DEPLOY_USER}@${config.DEPLOY_HOST}:${config.DEPLOY_UPLOAD_DIR}/`);
    }
  }
}

main();
