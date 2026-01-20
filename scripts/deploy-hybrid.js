#!/usr/bin/env node

/**
 * 统一混合部署脚本
 * 
 * 一键完成：
 * 1. 构建项目
 * 2. 分离 HTML 和静态资源
 * 3. 发布静态资源到 npm CDN
 * 4. 部署 HTML 到自有服务器
 * 
 * 用法：
 *   node scripts/deploy-hybrid.js [options]
 * 
 * 选项：
 *   --skip-build     跳过构建步骤
 *   --skip-npm       跳过 npm 发布
 *   --skip-server    跳过服务器部署
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
    'batch-image.html',
    'versions.html',
    'iframe-test.html',
    'init.json',
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

function stepBuild() {
  logStep(1, 5, '构建项目');
  
  if (skipBuild) {
    logWarning('跳过构建（使用现有产物）');
    return true;
  }
  
  if (!exec('pnpm run build:web', { cwd: path.resolve(__dirname, '..') })) {
    logError('构建失败');
    return false;
  }
  
  logSuccess('构建完成');
  return true;
}

// ============================================
// 步骤 2: 准备部署文件
// ============================================

function stepSeparateFiles(version, cdnBaseUrl) {
  logStep(2, 5, '准备部署文件');
  
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
// 步骤 3: 发布到 npm CDN
// ============================================

function stepPublishNpm(version) {
  logStep(3, 5, '发布静态资源到 npm CDN');
  
  if (skipNpm) {
    logWarning('跳过 npm 发布');
    return true;
  }
  
  // 生成 package.json
  const npmPackage = {
    name: CONFIG.packageName,
    version: version,
    description: 'Aitu static assets for CDN (HTML not included)',
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
  const readme = `# Aitu CDN Assets v${version}\n\n> 静态资源包，不含 HTML 文件\n\n- unpkg: https://unpkg.com/${CONFIG.packageName}@${version}/\n- jsdelivr: https://cdn.jsdelivr.net/npm/${CONFIG.packageName}@${version}/\n`;
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
// 步骤 4: 部署到服务器（复用 create-deploy-package.js）
// ============================================

function stepDeployServer(version) {
  logStep(4, 5, '打包并部署到服务器');
  
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
// 步骤 5: 验证部署
// ============================================

function stepVerify(version) {
  logStep(5, 5, '部署完成');
  
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
  log('🚀 Aitu 统一混合部署', 'cyan');
  log('═'.repeat(50), 'cyan');
  
  if (isDryRun) {
    log('\n⚠️  DRY RUN 模式 - 预览执行，不实际操作\n', 'yellow');
  }
  
  const version = getVersion();
  const cdnBaseUrl = CONFIG.cdnTemplates[cdnProvider].replace('{version}', version);
  
  log(`\n📦 版本: ${version}`, 'cyan');
  log(`🌐 CDN:  ${cdnProvider}`, 'cyan');
  
  // 执行步骤
  const steps = [
    () => stepBuild(),
    () => stepSeparateFiles(version, cdnBaseUrl),
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
