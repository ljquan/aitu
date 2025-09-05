const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getCurrentVersion() {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  return packageJson.version;
}

function createZipPackage() {
  const version = getCurrentVersion();
  const distPath = path.join(__dirname, '../dist/apps/web');
  const zipName = `web-${version}.zip`;
  const zipPath = path.join(__dirname, '../dist/apps', zipName);
  
  console.log(`📦 开始创建发布包...`);
  console.log(`📂 源目录: ${distPath}`);
  console.log(`📁 目标文件: ${zipPath}`);

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

  console.log(`📝 目录内容 (${files.length} 个文件/目录):`);
  files.forEach(file => {
    const filePath = path.join(distPath, file);
    const stats = fs.statSync(filePath);
    const type = stats.isDirectory() ? '📁' : '📄';
    const size = stats.isDirectory() ? '' : ` (${(stats.size / 1024).toFixed(1)} KB)`;
    console.log(`   ${type} ${file}${size}`);
  });

  try {
    // 删除可能存在的旧版本 zip 文件
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
      console.log(`🗑️  删除旧版本: ${zipName}`);
    }

    // 创建 zip 包 - 进入目录以避免包含完整路径
    const createZipCommand = process.platform === 'win32' 
      ? `powershell Compress-Archive -Path "${distPath}/*" -DestinationPath "${zipPath}"`
      : `cd "${distPath}" && zip -r "${zipPath}" . -x "*.DS_Store" "*.git*"`;
    
    console.log(`🔄 执行压缩命令...`);
    execSync(createZipCommand, { stdio: 'inherit' });

    // 验证 zip 文件是否创建成功
    if (fs.existsSync(zipPath)) {
      const zipStats = fs.statSync(zipPath);
      const zipSizeMB = (zipStats.size / 1024 / 1024).toFixed(2);
      
      console.log(`✅ 发布包创建成功!`);
      console.log(`📦 文件: ${zipName}`);
      console.log(`📏 大小: ${zipSizeMB} MB`);
      console.log(`📍 路径: ${zipPath}`);
      
      // 显示相对路径，更友好
      const relativePath = path.relative(process.cwd(), zipPath);
      console.log(`🎉 相对路径: ${relativePath}`);
      
    } else {
      throw new Error('ZIP 文件创建失败');
    }

  } catch (error) {
    console.error(`❌ 创建发布包失败:`, error.message);
    
    // 提供备用方案
    console.log(`\n💡 手动创建方案:`);
    console.log(`   cd ${distPath}`);
    console.log(`   zip -r ../../${zipName} .`);
    
    process.exit(1);
  }
}

// 主函数
function main() {
  console.log(`🚀 Drawnix 发布包创建工具`);
  console.log(`⏰ 时间: ${new Date().toLocaleString()}`);
  console.log(`───────────────────────────────────`);
  
  createZipPackage();
  
  console.log(`───────────────────────────────────`);
  console.log(`🎊 发布包创建完成!`);
}

main();