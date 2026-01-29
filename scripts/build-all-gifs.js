#!/usr/bin/env node
/**
 * 一键构建所有用户手册 GIF
 * 
 * 工作流程:
 * 1. 加载所有 GIF 定义 (*.gif.json)
 * 2. 运行 Playwright 录制长视频
 * 3. 更新清单中的视频路径
 * 4. 根据清单批量裁剪生成 GIF
 * 5. 重建用户手册
 * 
 * 使用方法：
 *   node scripts/build-all-gifs.js           # 构建所有 GIF
 *   node scripts/build-all-gifs.js <id>      # 只构建指定 GIF
 *   node scripts/build-all-gifs.js --list    # 列出所有可用的 GIF 定义
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const GIFS_DIR = 'apps/web-e2e/src/manual-gen/gifs';
const MANIFEST_PATH = 'apps/web-e2e/test-results/gif-manifest.json';
const TEST_RESULTS_DIR = 'apps/web-e2e/test-results';

/**
 * 加载所有 GIF 定义
 */
function loadGifDefinitions() {
  if (!fs.existsSync(GIFS_DIR)) {
    return [];
  }

  const files = fs.readdirSync(GIFS_DIR).filter(f => f.endsWith('.gif.json'));
  const definitions = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(GIFS_DIR, file), 'utf-8');
      definitions.push(JSON.parse(content));
    } catch (error) {
      console.error(`❌ 加载失败: ${file}`, error.message);
    }
  }

  return definitions.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * 查找最新的视频文件
 */
function findLatestVideo() {
  if (!fs.existsSync(TEST_RESULTS_DIR)) {
    return null;
  }

  let latestVideo = null;
  let latestTime = 0;

  function searchDir(dir) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        searchDir(fullPath);
      } else if (item.endsWith('.webm')) {
        if (stat.mtimeMs > latestTime) {
          latestTime = stat.mtimeMs;
          latestVideo = fullPath;
        }
      }
    }
  }

  searchDir(TEST_RESULTS_DIR);
  return latestVideo;
}

/**
 * 运行命令并显示输出
 */
function runCommand(command, options = {}) {
  console.log(`\n$ ${command}\n`);
  try {
    execSync(command, { stdio: 'inherit', ...options });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * 列出所有 GIF 定义
 */
function listDefinitions() {
  const definitions = loadGifDefinitions();
  
  if (definitions.length === 0) {
    console.log('⚠️ 没有找到 GIF 定义');
    console.log(`   请在 ${GIFS_DIR} 目录创建 *.gif.json 文件`);
    process.exit(0);
  }

  console.log(`📋 可用的 GIF 定义 (共 ${definitions.length} 个):\n`);
  for (const def of definitions) {
    console.log(`   ${def.id}`);
    console.log(`      名称: ${def.name}`);
    console.log(`      输出: ${def.output}`);
    console.log(`      目标: ${def.targetPage}`);
    console.log('');
  }
  process.exit(0);
}

/**
 * 构建所有 GIF
 */
async function buildAll() {
  const definitions = loadGifDefinitions();
  
  if (definitions.length === 0) {
    console.log('⚠️ 没有找到 GIF 定义');
    console.log(`   请在 ${GIFS_DIR} 目录创建 *.gif.json 文件`);
    process.exit(1);
  }

  console.log(`📚 找到 ${definitions.length} 个 GIF 定义\n`);

  // 步骤 1: 运行 Playwright 录制
  console.log('🎬 步骤 1/4: 录制视频...');
  const recordSuccess = runCommand(
    'cd apps/web-e2e && CI= npx playwright test --project=manual-video -g "录制所有 GIF"',
    { timeout: 600000 } // 10 分钟超时
  );

  if (!recordSuccess) {
    console.error('❌ 视频录制失败');
    process.exit(1);
  }

  // 步骤 2: 查找视频并更新清单
  console.log('\n📹 步骤 2/4: 更新清单...');
  const videoPath = findLatestVideo();
  
  if (!videoPath) {
    console.error('❌ 未找到录制的视频文件');
    process.exit(1);
  }

  if (fs.existsSync(MANIFEST_PATH)) {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
    manifest.videoPath = videoPath;
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
    console.log(`   视频路径: ${videoPath}`);
  } else {
    console.error('❌ 未找到清单文件');
    process.exit(1);
  }

  // 步骤 3: 根据清单生成 GIF
  console.log('\n✂️ 步骤 3/4: 生成 GIF...');
  const gifSuccess = runCommand(`node scripts/video-to-gif.js --manifest ${MANIFEST_PATH}`);

  if (!gifSuccess) {
    console.error('❌ GIF 生成失败');
    process.exit(1);
  }

  // 步骤 4: 重建用户手册
  console.log('\n📖 步骤 4/4: 重建用户手册...');
  runCommand('pnpm manual:build');

  console.log('\n🎉 所有 GIF 构建完成！');
}

/**
 * 构建指定 GIF
 */
async function buildOne(gifId) {
  const definitions = loadGifDefinitions();
  const definition = definitions.find(d => d.id === gifId);
  
  if (!definition) {
    console.error(`❌ 未找到 GIF 定义: ${gifId}`);
    console.log('\n可用的 GIF ID:');
    for (const def of definitions) {
      console.log(`   ${def.id}`);
    }
    process.exit(1);
  }

  console.log(`📄 构建 GIF: ${definition.name}\n`);

  // 步骤 1: 运行 Playwright 录制
  console.log('🎬 步骤 1/4: 录制视频...');
  const recordSuccess = runCommand(
    `cd apps/web-e2e && GIF_ID=${gifId} CI= npx playwright test --project=manual-video -g "录制指定 GIF"`,
    { timeout: 300000 } // 5 分钟超时
  );

  if (!recordSuccess) {
    console.error('❌ 视频录制失败');
    process.exit(1);
  }

  // 步骤 2: 查找视频并更新清单
  console.log('\n📹 步骤 2/4: 更新清单...');
  const videoPath = findLatestVideo();
  
  if (!videoPath) {
    console.error('❌ 未找到录制的视频文件');
    process.exit(1);
  }

  if (fs.existsSync(MANIFEST_PATH)) {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
    manifest.videoPath = videoPath;
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
    console.log(`   视频路径: ${videoPath}`);
  } else {
    console.error('❌ 未找到清单文件');
    process.exit(1);
  }

  // 步骤 3: 根据清单生成 GIF
  console.log('\n✂️ 步骤 3/4: 生成 GIF...');
  const gifSuccess = runCommand(`node scripts/video-to-gif.js --manifest ${MANIFEST_PATH}`);

  if (!gifSuccess) {
    console.error('❌ GIF 生成失败');
    process.exit(1);
  }

  // 步骤 4: 重建用户手册
  console.log('\n📖 步骤 4/4: 重建用户手册...');
  runCommand('pnpm manual:build');

  console.log(`\n🎉 GIF 构建完成: ${definition.output}`);
}

// 主函数
async function main() {
  console.log('🎬 用户手册 GIF 构建工具\n');

  const args = process.argv.slice(2);

  if (args.includes('--list') || args.includes('-l')) {
    listDefinitions();
    return;
  }

  if (args.includes('--help') || args.includes('-h')) {
    console.log('使用方法:');
    console.log('  node scripts/build-all-gifs.js           # 构建所有 GIF');
    console.log('  node scripts/build-all-gifs.js <id>      # 只构建指定 GIF');
    console.log('  node scripts/build-all-gifs.js --list    # 列出所有可用的 GIF 定义');
    return;
  }

  if (args.length > 0 && !args[0].startsWith('-')) {
    await buildOne(args[0]);
  } else {
    await buildAll();
  }
}

main().catch(console.error);
