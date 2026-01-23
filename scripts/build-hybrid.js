#!/usr/bin/env node

/**
 * 混合部署构建脚本
 * 
 * 构建产物分离：
 * 1. HTML 文件 → 自有服务器（保护用户信息）
 * 2. 静态资源 → npm CDN（节约流量）
 * 
 * 用法：
 *   node scripts/build-hybrid.js [--version x.x.x] [--cdn unpkg|jsdelivr]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 配置
const CONFIG = {
  packageName: 'aitu-app',
  distDir: path.resolve(__dirname, '../dist/apps/web'),
  // 输出目录
  outputServer: path.resolve(__dirname, '../dist/deploy/server'),  // HTML 文件
  outputCDN: path.resolve(__dirname, '../dist/deploy/cdn'),        // 静态资源
  // CDN URL 模板
  cdnTemplates: {
    unpkg: 'https://unpkg.com/aitu-app@{version}',
    jsdelivr: 'https://cdn.jsdelivr.net/npm/aitu-app@{version}',
  },
  // 需要保留在服务器的文件（不上传到 CDN）
  serverOnlyFiles: [
    'index.html',
    'sw-debug.html',
    'cdn-debug.html',
    'batch-image.html',
    'versions.html',
    'iframe-test.html',
    // 配置文件也留在服务器
    'init.json',
  ],
  // 不上传到 CDN 的文件模式
  excludeFromCDN: [
    /\.html$/,
    /^init\.json$/,
    /\.map$/,  // source maps
  ],
};

// 解析命令行参数
const args = process.argv.slice(2);
const versionArg = args.find(arg => arg.startsWith('--version='));
const cdnArg = args.find(arg => arg.startsWith('--cdn='));
const skipBuild = args.includes('--skip-build');

const cdnProvider = cdnArg ? cdnArg.split('=')[1] : 'unpkg';

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message) {
  log(`\n[${step}] ${message}`, 'blue');
}

function logSuccess(message) {
  log(`✓ ${message}`, 'green');
}

function logWarning(message) {
  log(`⚠ ${message}`, 'yellow');
}

function logError(message) {
  log(`✗ ${message}`, 'red');
}

// 读取版本号
function getVersion() {
  if (versionArg) {
    return versionArg.split('=')[1];
  }
  const versionPath = path.resolve(__dirname, '../apps/web/public/version.json');
  if (fs.existsSync(versionPath)) {
    const versionJson = JSON.parse(fs.readFileSync(versionPath, 'utf-8'));
    return versionJson.version;
  }
  const pkgPath = path.resolve(__dirname, '../package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  return pkg.version;
}

// 确保目录存在
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 复制文件
function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

// 递归复制目录
function copyDir(src, dest, filter = () => true) {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, filter);
    } else if (filter(entry.name, srcPath)) {
      copyFile(srcPath, destPath);
    }
  }
}

// 检查文件是否应该上传到 CDN
function shouldUploadToCDN(filename) {
  for (const pattern of CONFIG.excludeFromCDN) {
    if (pattern instanceof RegExp) {
      if (pattern.test(filename)) return false;
    } else if (filename === pattern) {
      return false;
    }
  }
  return true;
}

// 检查文件是否应该保留在服务器
function shouldKeepOnServer(filename) {
  return CONFIG.serverOnlyFiles.some(f => filename === f || filename.endsWith(f));
}

// 替换 HTML 中的资源路径
function replaceAssetPaths(htmlContent, cdnBaseUrl) {
  // 替换相对路径的 JS 引用
  // ./assets/xxx.js → CDN_URL/assets/xxx.js
  let result = htmlContent;
  
  // 替换 script src
  result = result.replace(
    /src=["'](\.\/)?assets\//g,
    `src="${cdnBaseUrl}/assets/`
  );
  
  // 替换 link href (CSS)
  result = result.replace(
    /href=["'](\.\/)?assets\//g,
    `href="${cdnBaseUrl}/assets/`
  );
  
  // 替换 favicon 和图标
  result = result.replace(
    /href=["'](\.\/)?icons\//g,
    `href="${cdnBaseUrl}/icons/`
  );
  
  // 替换 manifest
  result = result.replace(
    /href=["'](\.\/)?manifest\.json/g,
    `href="${cdnBaseUrl}/manifest.json`
  );
  
  // 保留 sw.js 在本地（Service Worker 必须同源）
  // 不替换 sw.js 的路径
  
  // 替换 cdn-config.js 路径
  result = result.replace(
    /src=["'](\.\/)?cdn-config\.js/g,
    `src="${cdnBaseUrl}/cdn-config.js`
  );
  
  return result;
}

// 主流程
async function main() {
  log('\n🚀 混合部署构建脚本\n', 'cyan');
  
  const version = getVersion();
  const cdnBaseUrl = CONFIG.cdnTemplates[cdnProvider].replace('{version}', version);
  
  log(`📦 版本: ${version}`, 'cyan');
  log(`🌐 CDN: ${cdnProvider} (${cdnBaseUrl})`, 'cyan');
  
  // 步骤 1: 构建项目
  if (!skipBuild) {
    logStep('1/5', '构建项目');
    try {
      execSync('npm run build:web', { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });
      logSuccess('构建完成');
    } catch (error) {
      logError('构建失败');
      process.exit(1);
    }
  } else {
    logStep('1/5', '跳过构建（使用现有产物）');
  }
  
  // 检查构建产物
  if (!fs.existsSync(CONFIG.distDir)) {
    logError(`构建目录不存在: ${CONFIG.distDir}`);
    process.exit(1);
  }
  
  // 步骤 2: 清理输出目录
  logStep('2/5', '清理输出目录');
  if (fs.existsSync(CONFIG.outputServer)) {
    fs.rmSync(CONFIG.outputServer, { recursive: true });
  }
  if (fs.existsSync(CONFIG.outputCDN)) {
    fs.rmSync(CONFIG.outputCDN, { recursive: true });
  }
  ensureDir(CONFIG.outputServer);
  ensureDir(CONFIG.outputCDN);
  logSuccess('输出目录已清理');
  
  // 步骤 3: 分离文件
  logStep('3/5', '分离 HTML 和静态资源');
  
  let serverFileCount = 0;
  let cdnFileCount = 0;
  
  // 遍历构建产物
  function processDir(dir, relativePath = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(dir, entry.name);
      const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      
      if (entry.isDirectory()) {
        processDir(srcPath, relPath);
      } else {
        const filename = entry.name;
        
        // 决定文件去向
        if (shouldKeepOnServer(filename)) {
          // HTML 和敏感文件 → 服务器
          const destPath = path.join(CONFIG.outputServer, relPath);
          copyFile(srcPath, destPath);
          serverFileCount++;
          log(`  → 服务器: ${relPath}`);
        }
        
        if (shouldUploadToCDN(filename)) {
          // 静态资源 → CDN
          const destPath = path.join(CONFIG.outputCDN, relPath);
          copyFile(srcPath, destPath);
          cdnFileCount++;
        }
        
        // Service Worker 需要同时存在于服务器
        if (filename === 'sw.js') {
          const destPath = path.join(CONFIG.outputServer, relPath);
          copyFile(srcPath, destPath);
          serverFileCount++;
          log(`  → 服务器: ${relPath} (Service Worker 必须同源)`);
        }
      }
    }
  }
  
  processDir(CONFIG.distDir);
  logSuccess(`服务器文件: ${serverFileCount} 个, CDN 文件: ${cdnFileCount} 个`);
  
  // 步骤 4: 修改 HTML 中的资源路径
  logStep('4/5', '修改 HTML 资源路径指向 CDN');
  
  const htmlFiles = fs.readdirSync(CONFIG.outputServer).filter(f => f.endsWith('.html'));
  
  for (const htmlFile of htmlFiles) {
    const htmlPath = path.join(CONFIG.outputServer, htmlFile);
    let content = fs.readFileSync(htmlPath, 'utf-8');
    
    // 替换资源路径
    content = replaceAssetPaths(content, cdnBaseUrl);
    
    // 添加 CDN 版本注释
    content = content.replace(
      '</head>',
      `  <!-- CDN: ${cdnProvider} v${version} -->\n  </head>`
    );
    
    fs.writeFileSync(htmlPath, content);
    log(`  ✓ ${htmlFile}`);
  }
  
  logSuccess('HTML 资源路径已更新');
  
  // 步骤 5: 生成部署信息
  logStep('5/5', '生成部署信息');
  
  const deployInfo = {
    version,
    buildTime: new Date().toISOString(),
    cdnProvider,
    cdnBaseUrl,
    serverFiles: fs.readdirSync(CONFIG.outputServer),
    cdnFileCount,
  };
  
  fs.writeFileSync(
    path.join(CONFIG.outputServer, 'deploy-info.json'),
    JSON.stringify(deployInfo, null, 2)
  );
  
  // 输出摘要
  log('\n' + '═'.repeat(50), 'cyan');
  log('📋 部署摘要', 'cyan');
  log('═'.repeat(50), 'cyan');
  log(`\n📁 服务器文件目录: ${CONFIG.outputServer}`);
  log(`   包含: ${htmlFiles.join(', ')}, sw.js`);
  log(`\n📁 CDN 文件目录: ${CONFIG.outputCDN}`);
  log(`   包含: ${cdnFileCount} 个静态资源文件`);
  log(`\n🌐 CDN 地址: ${cdnBaseUrl}`);
  
  log('\n📝 下一步操作:', 'yellow');
  log('  1. 发布 CDN 文件到 npm:');
  log(`     cd ${CONFIG.outputCDN} && npm publish`);
  log('  2. 部署服务器文件:');
  log(`     将 ${CONFIG.outputServer} 中的文件部署到你的服务器`);
  
  log('\n✅ 构建完成!\n', 'green');
}

main().catch(error => {
  logError(`脚本执行失败: ${error.message}`);
  console.error(error);
  process.exit(1);
});
