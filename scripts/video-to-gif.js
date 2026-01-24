#!/usr/bin/env node
/**
 * 自动将 E2E 测试视频转换为 GIF
 * 
 * 使用方法：
 *   node scripts/video-to-gif.js
 *   node scripts/video-to-gif.js --test "测试名称"
 *   node scripts/video-to-gif.js --test "测试名称" --trim 2    # 裁剪掉开头 2 秒
 *   node scripts/video-to-gif.js --test "测试名称" --trim 2:30 # 从第 2 秒开始，持续 30 秒
 * 
 * 依赖：
 *   - ffmpeg (brew install ffmpeg)
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// 配置
const CONFIG = {
  testResultsDir: 'apps/web-e2e/test-results',
  outputDir: 'apps/web/public/user-manual/gifs',
  fps: 10,           // 帧率
  width: 800,        // 宽度，-1 表示按比例自动计算高度
  quality: 'lanczos' // 缩放算法
};

// 检查 ffmpeg 是否安装
function checkFfmpeg() {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    return true;
  } catch {
    console.error('❌ 未找到 ffmpeg，请先安装：');
    console.error('   macOS: brew install ffmpeg');
    console.error('   Ubuntu: sudo apt install ffmpeg');
    return false;
  }
}

// 查找所有视频文件
function findVideos(baseDir, testNameFilter) {
  const videos = [];
  
  function searchDir(dir) {
    if (!fs.existsSync(dir)) return;
    
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        searchDir(fullPath);
      } else if (item.endsWith('.webm')) {
        // 从目录名提取测试名称
        const testName = path.basename(path.dirname(fullPath));
        
        // 如果指定了过滤器，检查是否匹配
        if (testNameFilter && !testName.includes(testNameFilter)) {
          continue;
        }
        
        videos.push({
          path: fullPath,
          testName: testName,
          outputName: testName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5-]/g, '-') + '.gif'
        });
      }
    }
  }
  
  searchDir(baseDir);
  return videos;
}

// 转换视频为 GIF
// trimOptions: { start: 秒, duration: 秒 | null }
function convertToGif(videoPath, outputPath, trimOptions = null) {
  const { fps, width, quality } = CONFIG;
  
  // 确保输出目录存在
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // 构建裁剪参数
  let trimArgs = '';
  if (trimOptions) {
    if (trimOptions.start > 0) {
      trimArgs += ` -ss ${trimOptions.start}`;
    }
    if (trimOptions.duration) {
      trimArgs += ` -t ${trimOptions.duration}`;
    }
  }
  
  // ffmpeg 命令
  // 使用两遍处理以获得更好的调色板
  const paletteFile = outputPath.replace('.gif', '-palette.png');
  
  try {
    // 第一遍：生成调色板
    execSync(
      `ffmpeg -y${trimArgs} -i "${videoPath}" -vf "fps=${fps},scale=${width}:-1:flags=${quality},palettegen=stats_mode=diff" "${paletteFile}"`,
      { stdio: 'ignore' }
    );
    
    // 第二遍：使用调色板生成 GIF
    execSync(
      `ffmpeg -y${trimArgs} -i "${videoPath}" -i "${paletteFile}" -lavfi "fps=${fps},scale=${width}:-1:flags=${quality}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" -loop 0 "${outputPath}"`,
      { stdio: 'ignore' }
    );
    
    // 删除临时调色板文件
    if (fs.existsSync(paletteFile)) {
      fs.unlinkSync(paletteFile);
    }
    
    return true;
  } catch (error) {
    console.error(`   转换失败: ${error.message}`);
    return false;
  }
}

// 解析裁剪参数
// 格式: "2" (开始秒) 或 "2:30" (开始秒:持续秒)
function parseTrimArg(trimStr) {
  if (!trimStr) return null;
  
  const parts = trimStr.split(':');
  const start = parseFloat(parts[0]) || 0;
  const duration = parts[1] ? parseFloat(parts[1]) : null;
  
  return { start, duration };
}

// 主函数
async function main() {
  console.log('🎬 E2E 视频转 GIF 工具\n');
  
  // 检查 ffmpeg
  if (!checkFfmpeg()) {
    process.exit(1);
  }
  
  // 解析命令行参数
  const args = process.argv.slice(2);
  let testNameFilter = null;
  let trimOptions = null;
  
  const testIndex = args.indexOf('--test');
  if (testIndex !== -1 && args[testIndex + 1]) {
    testNameFilter = args[testIndex + 1];
    console.log(`📋 过滤测试名称: "${testNameFilter}"`);
  }
  
  const trimIndex = args.indexOf('--trim');
  if (trimIndex !== -1 && args[trimIndex + 1]) {
    trimOptions = parseTrimArg(args[trimIndex + 1]);
    if (trimOptions) {
      let trimDesc = `从第 ${trimOptions.start} 秒开始`;
      if (trimOptions.duration) {
        trimDesc += `，持续 ${trimOptions.duration} 秒`;
      }
      console.log(`✂️  裁剪: ${trimDesc}`);
    }
  }
  
  console.log('');
  
  // 查找视频
  const videos = findVideos(CONFIG.testResultsDir, testNameFilter);
  
  if (videos.length === 0) {
    console.log('❌ 未找到视频文件');
    console.log('   请先运行: pnpm manual:video');
    process.exit(1);
  }
  
  console.log(`📹 找到 ${videos.length} 个视频文件\n`);
  
  // 转换每个视频
  let successCount = 0;
  for (const video of videos) {
    const outputPath = path.join(CONFIG.outputDir, video.outputName);
    console.log(`🔄 转换: ${video.testName}`);
    console.log(`   输入: ${video.path}`);
    console.log(`   输出: ${outputPath}`);
    
    if (convertToGif(video.path, outputPath, trimOptions)) {
      const stats = fs.statSync(outputPath);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
      console.log(`   ✅ 完成 (${sizeMB} MB)\n`);
      successCount++;
    } else {
      console.log(`   ❌ 失败\n`);
    }
  }
  
  console.log(`\n🎉 转换完成: ${successCount}/${videos.length} 个文件`);
  console.log(`📁 输出目录: ${CONFIG.outputDir}`);
}

main().catch(console.error);
