const fs = require('fs');
const { execSync } = require('child_process');

function getCurrentVersion() {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  return packageJson.version;
}

function getNextVersion(currentVersion, type = 'patch') {
  const parts = currentVersion.split('.').map(Number);
  
  switch (type) {
    case 'major':
      parts[0]++;
      parts[1] = 0;
      parts[2] = 0;
      break;
    case 'minor':
      parts[1]++;
      parts[2] = 0;
      break;
    case 'patch':
    default:
      parts[2]++;
      break;
  }
  
  return parts.join('.');
}

function tagExists(version) {
  try {
    execSync(`git tag -l | grep -q "^v${version}$"`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function findNextAvailableVersion(baseVersion, type) {
  let version = getNextVersion(baseVersion, type);
  
  // 如果 tag 已存在，继续递增直到找到可用的版本号
  while (tagExists(version)) {
    console.log(`⚠️  版本 v${version} 已存在，尝试下一个版本...`);
    version = getNextVersion(version, 'patch'); // 总是递增 patch 版本
  }
  
  return version;
}

function updatePackageVersion(newVersion) {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  packageJson.version = newVersion;
  fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2) + '\n');
}

function main() {
  const versionType = process.argv[2] || 'patch';
  
  try {
    const currentVersion = getCurrentVersion();
    console.log(`📦 当前版本: ${currentVersion}`);
    
    const nextVersion = findNextAvailableVersion(currentVersion, versionType);
    console.log(`🚀 升级到版本: ${nextVersion}`);
    
    // 更新 package.json
    updatePackageVersion(nextVersion);
    console.log(`✅ package.json 已更新到 ${nextVersion}`);
    
    // 提交更改
    try {
      execSync('git add package.json package-lock.json', { stdio: 'inherit' });
      execSync(`git commit -m "chore: bump version to ${nextVersion}"`, { stdio: 'inherit' });
      console.log(`✅ 版本更改已提交`);
    } catch (error) {
      console.log(`ℹ️  跳过 git 提交（可能没有更改或不在 git 仓库中）`);
    }
    
    // 创建 tag
    try {
      execSync(`git tag -a v${nextVersion} -m "Release ${nextVersion}"`, { stdio: 'inherit' });
      console.log(`✅ 创建 git tag: v${nextVersion}`);
    } catch (error) {
      console.log(`⚠️  创建 git tag 失败: ${error.message}`);
    }
    
    console.log(`\n🎉 版本升级完成: ${currentVersion} → ${nextVersion}`);
    
  } catch (error) {
    console.error(`❌ 版本升级失败:`, error.message);
    process.exit(1);
  }
}

main();