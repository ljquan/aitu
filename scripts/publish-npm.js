#!/usr/bin/env node

/**
 * npm 发布脚本
 * 
 * 功能：
 * 1. 构建项目（使用相对路径）
 * 2. 在 dist 目录生成 npm 专用的 package.json
 * 3. 发布到 npm
 * 
 * 使用免费 CDN 访问：
 * - unpkg: https://unpkg.com/aitu-app@版本号/index.html
 * - jsdelivr: https://cdn.jsdelivr.net/npm/aitu-app@版本号/index.html
 * 
 * 用法：
 *   node scripts/publish-npm.js [--dry-run] [--skip-build]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 配置
const CONFIG = {
  // npm 包名（使用非 scoped 包名，便于公开访问）
  packageName: 'aitu-app',
  distDir: path.resolve(__dirname, '../dist/apps/web'),
  rootPackageJson: path.resolve(__dirname, '../package.json'),
};

// 解析命令行参数
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const skipBuild = args.includes('--skip-build');
// 获取 OTP 参数 (--otp=123456)
const otpArg = args.find(arg => arg.startsWith('--otp='));
const otp = otpArg ? otpArg.split('=')[1] : null;

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
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

// 执行命令
function exec(command, options = {}) {
  log(`  执行: ${command}`, 'yellow');
  try {
    execSync(command, { stdio: 'inherit', ...options });
    return true;
  } catch (error) {
    logError(`命令执行失败: ${command}`);
    return false;
  }
}

// 读取根目录 package.json 获取版本号
function getVersion() {
  const pkg = JSON.parse(fs.readFileSync(CONFIG.rootPackageJson, 'utf-8'));
  return pkg.version;
}

// 生成 npm 发布用的 package.json
function generateNpmPackageJson(version) {
  const npmPackage = {
    name: CONFIG.packageName,
    version: version,
    description: 'Opentu - AI-powered whiteboard app with image/video creation, mind mapping, flowcharts, and freehand drawing',
    keywords: [
      'aitu',
      'whiteboard',
      'mindmap',
      'flowchart',
      'drawing',
      'AI',
      'image-generation',
      'video-generation'
    ],
    homepage: 'https://opentu.ai',
    repository: {
      type: 'git',
      url: 'https://github.com/ljquan/aitu.git'
    },
    bugs: {
      url: 'https://github.com/ljquan/aitu/issues'
    },
    license: 'MIT',
    author: 'ljquan',
    files: [
      '**/*'
    ],
    publishConfig: {
      access: 'public'
    }
  };
  
  return npmPackage;
}

// 生成 README
function generateReadme(version) {
  return `# Opentu (开图) - AI 图片视频创作工具

[![npm version](https://img.shields.io/npm/v/${CONFIG.packageName}.svg)](https://www.npmjs.com/package/${CONFIG.packageName})
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 在线访问

通过免费 CDN 直接访问：

### unpkg (推荐)
- **最新版**: [https://unpkg.com/${CONFIG.packageName}/index.html](https://unpkg.com/${CONFIG.packageName}/index.html)
- **指定版本**: [https://unpkg.com/${CONFIG.packageName}@${version}/index.html](https://unpkg.com/${CONFIG.packageName}@${version}/index.html)

### jsDelivr
- **最新版**: [https://cdn.jsdelivr.net/npm/${CONFIG.packageName}/index.html](https://cdn.jsdelivr.net/npm/${CONFIG.packageName}/index.html)
- **指定版本**: [https://cdn.jsdelivr.net/npm/${CONFIG.packageName}@${version}/index.html](https://cdn.jsdelivr.net/npm/${CONFIG.packageName}@${version}/index.html)

## 功能特性

- 🎨 **AI 图片生成** - 通过 Gemini 生成精美图片
- 🎬 **AI 视频生成** - 支持 Veo3、Sora-2 等模型
- 🧠 **思维导图** - 快速整理思路
- 📊 **流程图** - 可视化流程设计
- ✏️ **自由绘画** - 手绘风格绘图
- 💾 **自动保存** - 本地数据持久化
- 📱 **PWA 支持** - 可安装为桌面应用

## 本地部署

1. 下载此 npm 包的内容
2. 使用任意静态文件服务器托管

\`\`\`bash
# 使用 npx serve
npx serve ./node_modules/${CONFIG.packageName}

# 或使用 http-server
npx http-server ./node_modules/${CONFIG.packageName}
\`\`\`

## 源代码

GitHub: [https://github.com/ljquan/aitu](https://github.com/ljquan/aitu)

## 许可证

MIT License
`;
}

// 主流程
async function main() {
  log('\n🚀 Opentu npm 发布脚本\n', 'blue');
  
  if (isDryRun) {
    logWarning('DRY RUN 模式 - 不会实际发布');
  }

  // 步骤 1: 构建项目
  if (!skipBuild) {
    logStep('1/4', '构建项目');
    if (!exec('npm run build:web')) {
      logError('构建失败');
      process.exit(1);
    }
    logSuccess('构建完成');
  } else {
    logStep('1/4', '跳过构建（使用现有构建产物）');
  }

  // 步骤 2: 检查 dist 目录
  logStep('2/4', '检查构建产物');
  if (!fs.existsSync(CONFIG.distDir)) {
    logError(`构建目录不存在: ${CONFIG.distDir}`);
    process.exit(1);
  }
  
  const indexHtml = path.join(CONFIG.distDir, 'index.html');
  if (!fs.existsSync(indexHtml)) {
    logError('index.html 不存在');
    process.exit(1);
  }
  logSuccess('构建产物检查通过');

  // 步骤 3: 生成 npm package.json 和 README
  logStep('3/4', '生成 npm 发布文件');
  const version = getVersion();
  log(`  版本号: ${version}`);
  
  const npmPackageJson = generateNpmPackageJson(version);
  const npmPackageJsonPath = path.join(CONFIG.distDir, 'package.json');
  fs.writeFileSync(npmPackageJsonPath, JSON.stringify(npmPackageJson, null, 2));
  logSuccess(`生成 package.json`);
  
  const readme = generateReadme(version);
  const readmePath = path.join(CONFIG.distDir, 'README.md');
  fs.writeFileSync(readmePath, readme);
  logSuccess(`生成 README.md`);

  // 移除不需要发布的文件
  const filesToRemove = ['stats.html', 'sw.js.map'];
  filesToRemove.forEach(file => {
    const filePath = path.join(CONFIG.distDir, file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      log(`  移除: ${file}`);
    }
  });

  // 步骤 4: 发布到 npm
  logStep('4/4', '发布到 npm');
  
  if (isDryRun) {
    log('\n📦 DRY RUN - 将要发布的内容:', 'yellow');
    exec(`ls -la "${CONFIG.distDir}"`);
    log('\n📄 package.json 内容:', 'yellow');
    console.log(JSON.stringify(npmPackageJson, null, 2));
    logWarning('\n使用 --dry-run 模式，未实际发布');
  } else {
    // 切换到 dist 目录并发布（使用 cd 确保在正确目录）
    let publishCmd = `cd "${CONFIG.distDir}" && npm publish --access public --registry https://registry.npmjs.org`;
    
    // 如果提供了 OTP，添加到命令中
    if (otp) {
      publishCmd += ` --otp=${otp}`;
      log(`  使用 OTP: ${otp.slice(0, 2)}****`);
    }
    
    if (!exec(publishCmd)) {
      logError('发布失败');
      if (!otp) {
        log('\n💡 提示：如果启用了 2FA，请使用 --otp=123456 参数', 'yellow');
        log('   例如: pnpm run npm:publish --skip-build --otp=123456', 'yellow');
      }
      process.exit(1);
    }
    logSuccess('发布成功！');
  }

  // 输出访问链接
  log('\n🎉 完成！', 'green');
  log('\n📌 CDN 访问链接:', 'blue');
  log(`   unpkg:     https://unpkg.com/${CONFIG.packageName}@${version}/index.html`);
  log(`   jsdelivr:  https://cdn.jsdelivr.net/npm/${CONFIG.packageName}@${version}/index.html`);
  log(`   最新版:    https://unpkg.com/${CONFIG.packageName}/index.html`);
}

main().catch(error => {
  logError(`脚本执行失败: ${error.message}`);
  process.exit(1);
});
