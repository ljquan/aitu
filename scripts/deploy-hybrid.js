#!/usr/bin/env node

/**
 * 统一混合部署脚本
 * 
 * 一键完成：
 * 1. 构建项目
 * 2. 运行 E2E 冒烟测试
 * 3. 分离 HTML 和静态资源
 * 4. 发布静态资源到 npm CDN
 * 5. 部署 HTML 到自有服务器
 * 6. 生成用户手册
 * 
 * 用法：
 *   node scripts/deploy-hybrid.js [options]
 * 
 * 选项：
 *   --skip-build     跳过构建步骤
 *   --skip-npm       跳过 npm 发布
 *   --skip-server    跳过服务器部署
 *   --skip-e2e       跳过 E2E 测试
 *   --skip-manual    跳过手册生成
 *   --dry-run        预览模式，不实际执行
 *   --otp=123456     npm 2FA 验证码
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ============================================
// 配置
// ============================================

const CONFIG = {
  packageName: 'aitu-app',
  distDir: path.resolve(__dirname, '../dist/apps/web'),
  outputServer: path.resolve(__dirname, '../dist/deploy/server'),
  outputCDN: path.resolve(__dirname, '../dist/deploy/cdn'),
  cdnTemplates: {
    unpkg: 'https://unpkg.com/aitu-app@{version}',
    jsdelivr: 'https://cdn.jsdelivr.net/npm/aitu-app@{version}',
  },
  // 只在服务器的文件
  serverOnlyFiles: [
    'index.html',
    'sw-debug.html',
    'cdn-debug.html',
    'versions.html',
    'iframe-test.html',
  ],
  // 不上传到 CDN 的模式
  excludeFromCDN: [
    /\.html$/,
    /^init\.json$/,
    /\.map$/,
  ],
};

// ============================================
// 命令行参数
// ============================================

const args = process.argv.slice(2);
const skipBuild = args.includes('--skip-build');
const skipNpm = args.includes('--skip-npm');
const skipServer = args.includes('--skip-server');
const skipE2E = args.includes('--skip-e2e');
const skipManual = args.includes('--skip-manual');
const isDryRun = args.includes('--dry-run');
const otpArg = args.find(arg => arg.startsWith('--otp='));
const otp = otpArg ? otpArg.split('=')[1] : null;
const cdnProvider = 'unpkg';

// ============================================
// 工具函数
// ============================================

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, total, message) {
  log(`\n[${'='.repeat(step)}${'-'.repeat(total - step)}] 步骤 ${step}/${total}: ${message}`, 'blue');
}

function logSuccess(message) {
  log(`  ✓ ${message}`, 'green');
}

function logWarning(message) {
  log(`  ⚠ ${message}`, 'yellow');
}

function logError(message) {
  log(`  ✗ ${message}`, 'red');
}

function exec(command, options = {}) {
  log(`    执行: ${command.substring(0, 80)}${command.length > 80 ? '...' : ''}`, 'gray');
  try {
    if (isDryRun) {
      log(`    [DRY RUN] 跳过执行`, 'yellow');
      return true;
    }
    execSync(command, { stdio: 'inherit', ...options });
    return true;
  } catch (error) {
    return false;
  }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function getVersion() {
  const versionPath = path.resolve(__dirname, '../apps/web/public/version.json');
  if (fs.existsSync(versionPath)) {
    return JSON.parse(fs.readFileSync(versionPath, 'utf-8')).version;
  }
  const pkgPath = path.resolve(__dirname, '../package.json');
  return JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).version;
}

function shouldUploadToCDN(filename) {
  return !CONFIG.excludeFromCDN.some(pattern => 
    pattern instanceof RegExp ? pattern.test(filename) : filename === pattern
  );
}

function shouldKeepOnServer(filename) {
  return CONFIG.serverOnlyFiles.some(f => filename === f || filename.endsWith(f));
}

/**
 * 检查 npm 包的指定版本是否已存在
 * @param {string} packageName 包名
 * @param {string} version 版本号
 * @returns {boolean} 是否存在
 */
function checkNpmVersionExists(packageName, version) {
  try {
    // 使用 npm view 命令检查版本是否存在
    execSync(`npm view ${packageName}@${version} version`, {
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    return true; // 命令成功执行，版本存在
  } catch (error) {
    // 命令失败，版本不存在
    return false;
  }
}

/**
 * 检查是否可以跳过构建
 * 条件：
 * 1. dist/deploy/cdn/precache-manifest.json 存在
 * 2. 版本与当前要构建的版本一致
 * 3. manifest 中的文件都存在于 dist/deploy/cdn 目录
 * 
 * @returns {{ canSkip: boolean, reason: string, details?: object }}
 */
function checkCanSkipBuild(currentVersion) {
  const manifestPath = path.join(CONFIG.outputCDN, 'precache-manifest.json');
  
  // 检查 manifest 是否存在
  if (!fs.existsSync(manifestPath)) {
    return { canSkip: false, reason: 'precache-manifest.json 不存在' };
  }
  
  // 读取 manifest
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch (error) {
    return { canSkip: false, reason: `无法解析 precache-manifest.json: ${error.message}` };
  }
  
  // 检查版本
  if (manifest.version !== currentVersion) {
    return { 
      canSkip: false, 
      reason: `版本不匹配 (现有: ${manifest.version}, 目标: ${currentVersion})` 
    };
  }
  
  // 检查所有文件是否存在（只检查应该在 CDN 的文件，排除 HTML 等）
  const files = manifest.files || [];
  if (files.length === 0) {
    return { canSkip: false, reason: 'manifest 文件列表为空' };
  }
  
  // 过滤出应该在 CDN 的文件
  const cdnFiles = files.filter(file => {
    const filename = path.basename(file.url);
    return shouldUploadToCDN(filename);
  });
  
  if (cdnFiles.length === 0) {
    return { canSkip: false, reason: 'manifest 中没有 CDN 文件' };
  }
  
  const missingFiles = [];
  for (const file of cdnFiles) {
    // url 格式如 "/assets/xxx.js"，需要去掉开头的 "/"
    const relativePath = file.url.startsWith('/') ? file.url.slice(1) : file.url;
    const filePath = path.join(CONFIG.outputCDN, relativePath);
    
    if (!fs.existsSync(filePath)) {
      missingFiles.push(file.url);
      // 只收集前5个缺失文件用于提示
      if (missingFiles.length >= 5) {
        break;
      }
    }
  }
  
  if (missingFiles.length > 0) {
    return { 
      canSkip: false, 
      reason: `CDN 目录缺少 ${missingFiles.length}+ 个文件`,
      details: { missingFiles: missingFiles.slice(0, 5) }
    };
  }
  
  // 检查 server 目录的 manifest
  const serverManifestPath = path.join(CONFIG.outputServer, 'precache-manifest.json');
  if (!fs.existsSync(serverManifestPath)) {
    return { canSkip: false, reason: 'server/precache-manifest.json 不存在' };
  }
  
  // 读取 server manifest
  let serverManifest;
  try {
    serverManifest = JSON.parse(fs.readFileSync(serverManifestPath, 'utf-8'));
  } catch (error) {
    return { canSkip: false, reason: `无法解析 server/precache-manifest.json: ${error.message}` };
  }
  
  // 检查 server 版本
  if (serverManifest.version !== currentVersion) {
    return { 
      canSkip: false, 
      reason: `server 版本不匹配 (现有: ${serverManifest.version}, 目标: ${currentVersion})` 
    };
  }
  
  // 检查 server 文件是否齐全
  const serverFiles = serverManifest.files || [];
  const missingServerFiles = [];
  for (const file of serverFiles) {
    const relativePath = file.url.startsWith('/') ? file.url.slice(1) : file.url;
    const filePath = path.join(CONFIG.outputServer, relativePath);
    
    if (!fs.existsSync(filePath)) {
      missingServerFiles.push(file.url);
      if (missingServerFiles.length >= 5) {
        break;
      }
    }
  }
  
  if (missingServerFiles.length > 0) {
    return { 
      canSkip: false, 
      reason: `server 目录缺少 ${missingServerFiles.length}+ 个文件`,
      details: { missingFiles: missingServerFiles.slice(0, 5) }
    };
  }
  
  return { 
    canSkip: true, 
    reason: `版本 ${currentVersion} 已构建完成`,
    details: { 
      cdnFileCount: cdnFiles.length,
      serverFileCount: serverFiles.length,
      timestamp: manifest.timestamp
    }
  };
}

// ============================================
// 加载服务器配置
// ============================================

function loadEnvConfig() {
  const envPath = path.join(__dirname, '../.env');
  const config = {
    DEPLOY_HOST: '',
    DEPLOY_USER: '',
    DEPLOY_PORT: '22',
    DEPLOY_SSH_KEY: '',
    DEPLOY_SSH_PASSWORD: '',
    DEPLOY_WEB_DIR: '',  // 新增：Web 根目录
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

// ============================================
// 步骤 1: 构建项目
// ============================================

function stepBuild(version) {
  logStep(1, 7, '构建项目');
  
  // 显式跳过
  if (skipBuild) {
    logWarning('跳过构建（--skip-build 参数）');
    return true;
  }
  
  // 智能跳过：检查现有构建产物
  const buildCheck = checkCanSkipBuild(version);
  if (buildCheck.canSkip) {
    logSuccess(`跳过构建 - ${buildCheck.reason}`);
    if (buildCheck.details) {
      log(`    CDN: ${buildCheck.details.cdnFileCount} 个文件，Server: ${buildCheck.details.serverFileCount} 个文件`, 'gray');
      log(`    构建时间: ${buildCheck.details.timestamp}`, 'gray');
    }
    return { skipped: true };
  } else {
    log(`    需要构建: ${buildCheck.reason}`, 'gray');
    if (buildCheck.details?.missingFiles) {
      log(`    缺失文件示例: ${buildCheck.details.missingFiles.join(', ')}`, 'gray');
    }
  }
  
  if (!exec('pnpm run build:web', { cwd: path.resolve(__dirname, '..') })) {
    logError('构建失败');
    return false;
  }
  
  logSuccess('构建完成');
  return true;
}

// ============================================
// 步骤 2: E2E 冒烟测试
// ============================================

function stepE2ETest() {
  logStep(2, 7, 'E2E 冒烟测试');
  
  if (skipE2E) {
    logWarning('跳过 E2E 测试（--skip-e2e 参数）');
    return true;
  }
  
  if (isDryRun) {
    log(`    [DRY RUN] 将运行 E2E 冒烟测试`, 'yellow');
    return true;
  }
  
  log('    运行冒烟测试...', 'gray');
  
  if (!exec('pnpm run e2e:smoke', { cwd: path.resolve(__dirname, '..') })) {
    logError('E2E 冒烟测试失败');
    logWarning('提示：可使用 --skip-e2e 跳过测试继续部署');
    return false;
  }
  
  logSuccess('E2E 冒烟测试通过');
  return true;
}

// ============================================
// 步骤 3: 准备部署文件
// ============================================

function stepSeparateFiles(version, cdnBaseUrl, buildSkipped = false) {
  logStep(3, 7, '准备部署文件');
  
  // 如果构建被跳过，文件已经准备好了
  if (buildSkipped) {
    // 快速验证文件是否存在
    const serverExists = fs.existsSync(CONFIG.outputServer);
    const cdnExists = fs.existsSync(CONFIG.outputCDN);
    
    if (serverExists && cdnExists) {
      // 统计文件数量
      const countFiles = (dir) => {
        let count = 0;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            count += countFiles(path.join(dir, entry.name));
          } else {
            count++;
          }
        }
        return count;
      };
      
      const serverCount = countFiles(CONFIG.outputServer);
      const cdnCount = countFiles(CONFIG.outputCDN);
      
      logSuccess(`跳过文件准备 - 使用现有产物`);
      log(`    服务器: ${serverCount} 个文件`, 'gray');
      log(`    CDN: ${cdnCount} 个文件`, 'gray');
      return true;
    }
    
    log(`    现有产物不完整，重新准备文件...`, 'yellow');
  }
  
  // 检查构建产物
  if (!fs.existsSync(CONFIG.distDir)) {
    logError(`构建目录不存在: ${CONFIG.distDir}`);
    return false;
  }
  
  // 清理输出目录
  if (fs.existsSync(CONFIG.outputServer)) {
    fs.rmSync(CONFIG.outputServer, { recursive: true });
  }
  if (fs.existsSync(CONFIG.outputCDN)) {
    fs.rmSync(CONFIG.outputCDN, { recursive: true });
  }
  ensureDir(CONFIG.outputServer);
  ensureDir(CONFIG.outputCDN);
  
  let serverFileCount = 0;
  let cdnFileCount = 0;
  
  // 递归复制目录
  function copyDir(src, dest, filter = () => true) {
    ensureDir(dest);
    const entries = fs.readdirSync(src, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      
      if (entry.isDirectory()) {
        copyDir(srcPath, destPath, filter);
      } else if (filter(entry.name)) {
        copyFile(srcPath, destPath);
      }
    }
  }
  
  // 服务器：复制全部文件（作为兜底）
  log('    复制全部文件到服务器目录（兜底）...', 'gray');
  copyDir(CONFIG.distDir, CONFIG.outputServer, (filename) => {
    // 排除 source maps
    if (filename.endsWith('.map')) return false;
    serverFileCount++;
    return true;
  });
  
  // CDN：只复制静态资源（不含 HTML）
  log('    复制静态资源到 CDN 目录...', 'gray');
  copyDir(CONFIG.distDir, CONFIG.outputCDN, (filename) => {
    if (!shouldUploadToCDN(filename)) return false;
    cdnFileCount++;
    return true;
  });
  
  // 添加 CDN 版本注释到 HTML（资源路径保持相对，由 SW 处理 CDN 加载）
  const htmlFiles = fs.readdirSync(CONFIG.outputServer).filter(f => f.endsWith('.html'));
  for (const htmlFile of htmlFiles) {
    const htmlPath = path.join(CONFIG.outputServer, htmlFile);
    let content = fs.readFileSync(htmlPath, 'utf-8');
    
    // 只添加注释，不修改资源路径（SW 会自动从 CDN 加载并缓存）
    content = content.replace('</head>', `  <!-- CDN: ${cdnProvider} v${version} | SW handles CDN loading -->\n  </head>`);
    
    fs.writeFileSync(htmlPath, content);
  }
  
  logSuccess(`服务器: ${serverFileCount} 个文件（完整副本，用于兜底）`);
  logSuccess(`CDN: ${cdnFileCount} 个静态资源（不含 HTML）`);
  logSuccess(`资源加载：SW 优先 CDN，缓存到 Cache Storage，兜底服务器`);
  return true;
}

// ============================================
// 步骤 4: 发布到 npm CDN
// ============================================

function stepPublishNpm(version) {
  logStep(5, 7, '发布静态资源到 npm CDN');
  
  if (skipNpm) {
    logWarning('跳过 npm 发布');
    return true;
  }
  
  // 版本检查已在 main 函数开头完成，这里直接发布
  log(`    发布版本: ${CONFIG.packageName}@${version}`, 'gray');
  
  // 生成 package.json
  const npmPackage = {
    name: CONFIG.packageName,
    version: version,
    description: 'Opentu static assets for CDN (HTML not included)',
    license: 'MIT',
    files: ['**/*'],
    publishConfig: { access: 'public' },
    aituAssets: { type: 'cdn-assets', htmlIncluded: false }
  };
  
  fs.writeFileSync(
    path.join(CONFIG.outputCDN, 'package.json'),
    JSON.stringify(npmPackage, null, 2)
  );
  
  // 生成 README
  const readme = `# Opentu CDN Assets v${version}\n\n> 静态资源包，不含 HTML 文件\n\n- unpkg: https://unpkg.com/${CONFIG.packageName}@${version}/\n- jsdelivr: https://cdn.jsdelivr.net/npm/${CONFIG.packageName}@${version}/\n`;
  fs.writeFileSync(path.join(CONFIG.outputCDN, 'README.md'), readme);
  
  // 发布
  let publishCmd = `cd "${CONFIG.outputCDN}" && npm publish --access public --registry https://registry.npmjs.org`;
  if (otp) {
    publishCmd += ` --otp=${otp}`;
  }
  
  if (isDryRun) {
    log(`    [DRY RUN] 将发布: ${CONFIG.packageName}@${version}`, 'yellow');
    return true;
  }
  
  if (!exec(publishCmd)) {
    logError('npm 发布失败');
    if (!otp) {
      logWarning('提示：如果启用了 2FA，请使用 --otp=123456 参数');
    }
    return false;
  }
  
  logSuccess(`已发布 ${CONFIG.packageName}@${version}`);
  return true;
}

// ============================================
// 步骤 5: 部署到服务器（复用 create-deploy-package.js）
// ============================================

function stepDeployServer(version) {
  logStep(6, 7, '打包并部署到服务器');
  
  if (skipServer) {
    logWarning('跳过服务器部署');
    return true;
  }
  
  if (isDryRun) {
    log(`    [DRY RUN] 将调用 create-deploy-package.js 打包并部署`, 'yellow');
    return true;
  }
  
  // 调用 create-deploy-package.js 进行打包和部署
  log('    调用 create-deploy-package.js 打包并部署...', 'gray');
  
  try {
    execSync('node scripts/create-deploy-package.js', {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'inherit',
    });
    logSuccess('打包并部署完成');
    return true;
  } catch (error) {
    logError('打包或部署失败');
    return false;
  }
}

// ============================================
// 步骤 6: 生成用户手册
// ============================================

function stepGenerateManual(version) {
  logStep(4, 7, '生成用户手册');
  const startTime = Date.now();
  
  if (skipManual) {
    logWarning('跳过手册生成（--skip-manual 参数）');
    return true;
  }
  
  if (isDryRun) {
    log(`    [DRY RUN] 将生成用户手册`, 'yellow');
    return true;
  }
  
  // 手册生成不阻塞部署，失败只警告
  try {
    // 步骤 1: 检查端口 7200 是否已被占用，决定截图策略
    let portInUse = false;
    try {
      execSync('lsof -i :7200 -t', { stdio: 'pipe' });
      portInUse = true;
    } catch {
      // 端口未被占用
    }
    
    if (portInUse) {
      // 端口已被占用，检查 Playwright 浏览器是否已安装
      let playwrightReady = false;
      try {
        execSync('npx playwright --version', { stdio: 'pipe', timeout: 10000 });
        playwrightReady = true;
      } catch {
        // Playwright 未安装或不可用
      }
      
      if (playwrightReady) {
        log('    📖 手册生成：将更新截图并构建 HTML', 'gray');
        log('    检测到开发服务器已在运行 (端口 7200)，复用现有服务器生成截图', 'gray');
        
        try {
          execSync(`cd apps/web-e2e && CI= npx playwright test --project=manual`, {
            cwd: path.resolve(__dirname, '..'),
            stdio: 'inherit',
            timeout: 60000, // 1 分钟超时（复用现有服务器，无需等待启动）
          });
          logSuccess('截图生成完成');
        } catch (screenshotError) {
          logWarning('截图生成失败，将使用已有截图继续构建');
          log(`    错误: ${screenshotError.message}`, 'gray');
        }
      } else {
        log('    📖 手册生成：跳过截图（Playwright 浏览器未安装），仅构建 HTML', 'gray');
        logWarning('Playwright 浏览器未安装，跳过截图生成，使用已有截图');
        log('    💡 安装命令: npx playwright install chromium', 'gray');
      }
    } else {
      // 端口未被占用，直接跳过截图
      log('    📖 手册生成：跳过截图，仅构建 HTML', 'gray');
      log('    ⏭️  开发服务器未运行（端口 7200），跳过截图生成，使用已有截图', 'gray');
      log('    💡 如需更新截图，请先运行: pnpm manual:screenshots', 'gray');
    }
    
    // 步骤 2: 设置 CDN 基础路径环境变量，供 generate-manual.ts 使用
    const cdnBaseUrl = CONFIG.cdnTemplates[cdnProvider].replace('{version}', version);
    const manualCdnBase = `${cdnBaseUrl}/user-manual`;
    
    // 步骤 3: 构建手册 HTML
    log('    构建手册 HTML...', 'gray');
    try {
      execSync('pnpm run manual:build', {
        cwd: path.resolve(__dirname, '..'),
        stdio: 'inherit',
        env: {
          ...process.env,
          MANUAL_CDN_BASE: skipNpm ? '' : manualCdnBase,
        },
      });
      logSuccess('手册 HTML 构建完成');
    } catch (buildError) {
      logWarning('手册 HTML 构建失败（不影响部署）');
      log(`    错误: ${buildError.message}`, 'gray');
      log('    💡 手动排查: pnpm manual:build', 'gray');
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      log(`    ⏱️  手册生成耗时: ${elapsed} 秒`, 'gray');
      return true; // 不阻塞部署
    }
    
    // 复制手册到 dist 目录（构建后手册不会自动包含）
    const manualSourceDir = path.resolve(__dirname, '../apps/web/public/user-manual');
    const manualDistDir = path.resolve(__dirname, '../dist/apps/web/user-manual');
    const manualServerDir = path.join(CONFIG.outputServer, 'user-manual');
    const manualCdnDir = path.join(CONFIG.outputCDN, 'user-manual');
    
    if (fs.existsSync(manualSourceDir)) {
      // 复制到 dist/apps/web/user-manual
      copyDirRecursive(manualSourceDir, manualDistDir);
      log(`    复制到 dist/apps/web/user-manual`, 'gray');
      
      // 复制到 dist/deploy/server/user-manual（HTML + 静态资源，完整副本）
      if (fs.existsSync(CONFIG.outputServer)) {
        copyDirRecursive(manualSourceDir, manualServerDir);
        log(`    复制到 dist/deploy/server/user-manual`, 'gray');
      }
      
      // 复制静态资源到 CDN 目录（不含 HTML）
      if (fs.existsSync(CONFIG.outputCDN) && !skipNpm) {
        const screenshotsDir = path.join(manualSourceDir, 'screenshots');
        const gifsDir = path.join(manualSourceDir, 'gifs');
        
        if (fs.existsSync(screenshotsDir)) {
          copyDirRecursive(screenshotsDir, path.join(manualCdnDir, 'screenshots'));
        }
        if (fs.existsSync(gifsDir)) {
          copyDirRecursive(gifsDir, path.join(manualCdnDir, 'gifs'));
        }
        
        // 统计 CDN 文件数
        let cdnFileCount = 0;
        if (fs.existsSync(manualCdnDir)) {
          cdnFileCount = countFilesRecursive(manualCdnDir);
        }
        log(`    复制 ${cdnFileCount} 个静态资源到 CDN`, 'gray');
      }
      
      // 统计文件数
      const fileCount = countFilesRecursive(manualDistDir);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      logSuccess(`用户手册生成完成 (${fileCount} 个文件，耗时 ${elapsed} 秒)`);
      if (!skipNpm) {
        log(`    静态资源将通过 CDN 加载`, 'gray');
      }
    } else {
      logWarning('手册源目录不存在');
    }
    
    return true;
  } catch (error) {
    logWarning('用户手册生成失败（不影响部署）');
    log(`    错误: ${error.message}`, 'gray');
    log('    💡 手动排查: pnpm manual:build', 'gray');
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`    ⏱️  手册生成耗时: ${elapsed} 秒`, 'gray');
    return true; // 不阻塞部署
  }
}

// 统计目录文件数
function countFilesRecursive(dir) {
  let count = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      count += countFilesRecursive(path.join(dir, entry.name));
    } else {
      count++;
    }
  }
  return count;
}

// 递归复制目录
function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ============================================
// 步骤 7: 验证部署
// ============================================

function stepVerify(version) {
  logStep(7, 7, '部署完成');
  
  log('\n📋 部署摘要', 'cyan');
  log('═'.repeat(50), 'cyan');
  
  log('\n🏗️  架构说明:', 'cyan');
  log('   用户访问 → 自有服务器（HTML + 静态资源）');
  log('   静态资源 → 优先 CDN，失败兜底服务器');
  
  if (!skipNpm) {
    log(`\n🌐 CDN（静态资源，优先加载）:`, 'green');
    log(`   unpkg:     https://unpkg.com/${CONFIG.packageName}@${version}/`);
    log(`   jsdelivr:  https://cdn.jsdelivr.net/npm/${CONFIG.packageName}@${version}/`);
    log(`   ⚠️  CDN 不含 HTML 文件，用户信息安全`);
  }
  
  if (!skipServer) {
    const config = loadEnvConfig();
    log(`\n🖥️  自有服务器:`, 'green');
    if (config.DEPLOY_HOST) {
      log(`   ${config.DEPLOY_HOST}`);
    }
    log(`   ✓ 通过 create-deploy-package.js 部署`);
    log(`   ✓ 完整副本（CDN 失败时兜底）`);
  }
  
  if (!skipManual) {
    log(`\n📖 用户手册:`, 'green');
    log(`   部署路径: /user-manual/index.html`);
    log(`   本地预览: dist/apps/web/user-manual/index.html`);
    if (!skipNpm) {
      log(`   静态资源: CDN (截图、GIF 通过 ${cdnProvider} 加载)`);
    } else {
      log(`   静态资源: 服务器（跳过 CDN 发布）`);
    }
  }
  
  log('\n🔄 加载顺序:', 'cyan');
  log('   1. Service Worker 缓存（最快）');
  log('   2. CDN unpkg/jsdelivr（节约流量）');
  log('   3. 自有服务器（兜底保障）');
  
  if (isDryRun) {
    log('\n⚠️  DRY RUN 模式 - 未实际执行任何操作', 'yellow');
  }
  
  return true;
}

// ============================================
// 主流程
// ============================================

async function main() {
  log('\n' + '═'.repeat(50), 'cyan');
  log('🚀 Opentu 统一混合部署', 'cyan');
  log('═'.repeat(50), 'cyan');
  
  if (isDryRun) {
    log('\n⚠️  DRY RUN 模式 - 预览执行，不实际操作\n', 'yellow');
  }
  
  let version = getVersion();
  
  // 在开始部署前检查版本是否需要升级
  if (!skipNpm) {
    log(`\n🔍 检查版本 ${CONFIG.packageName}@${version} 是否已存在于 npm...`, 'gray');
    if (checkNpmVersionExists(CONFIG.packageName, version)) {
      // 版本已存在，需要升级版本
      log(`    版本 ${version} 已存在，需要升级版本`, 'yellow');
      try {
        execSync('pnpm run version:patch', {
          cwd: path.resolve(__dirname, '..'),
          stdio: 'inherit',
        });
        // 重新获取新版本号
        version = getVersion();
        log(`✅ 版本已升级到: ${version}`, 'green');
      } catch (error) {
        logError('版本升级失败');
        process.exit(1);
      }
    } else {
      log(`✅ 版本 ${version} 不存在于 npm，无需升级`, 'green');
    }
  }
  
  const cdnBaseUrl = CONFIG.cdnTemplates[cdnProvider].replace('{version}', version);
  
  log(`\n📦 版本: ${version}`, 'cyan');
  log(`🌐 CDN:  ${cdnProvider}`, 'cyan');
  
  // 步骤 1: 构建（可能被智能跳过）
  const buildResult = stepBuild(version);
  if (buildResult === false) {
    log('\n❌ 部署失败\n', 'red');
    process.exit(1);
  }
  const buildSkipped = buildResult && buildResult.skipped === true;
  
  // 步骤 2: E2E 冒烟测试
  if (!stepE2ETest()) {
    log('\n❌ 部署失败\n', 'red');
    process.exit(1);
  }
  
  // 步骤 3-7: 后续流程
  // 注意：手册生成必须在 npm 发布和部署之前执行，否则 CDN 和部署包中不会包含手册
  const steps = [
    () => stepSeparateFiles(version, cdnBaseUrl, buildSkipped),
    () => stepGenerateManual(version),  // 必须在 npm 发布之前，确保截图被包含在 CDN
    () => stepPublishNpm(version),
    () => stepDeployServer(version),
    () => stepVerify(version),
  ];
  
  for (const step of steps) {
    if (!step()) {
      log('\n❌ 部署失败\n', 'red');
      process.exit(1);
    }
  }
  
  log('\n✅ 部署完成!\n', 'green');
}

main().catch(error => {
  logError(`脚本执行失败: ${error.message}`);
  console.error(error);
  process.exit(1);
});
