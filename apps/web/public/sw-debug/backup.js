/**
 * SW Debug Panel - Data Backup
 * 数据备份功能模块
 */

import { elements } from './state.js';
import {
  IDB_STORES,
  KV_KEYS,
  CACHE_NAMES,
  SW_TASK_QUEUE_DB,
  TaskType,
  TaskStatus,
  readAllFromIDB,
  readKVItem,
} from './indexeddb.js';
import { showToast } from './toast.js';

/**
 * 备份签名和版本
 */
const BACKUP_SIGNATURE = 'aitu-backup';
const BACKUP_VERSION = 2;

/**
 * 获取文件扩展名
 */
function getExtensionFromMimeType(mimeType) {
  const mimeToExt = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
  };
  return mimeToExt[mimeType] || '';
}

/**
 * 清理文件/文件夹名称
 */
function sanitizeFileName(name) {
  return (
    name
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, ' ')
      .trim() || 'unnamed'
  );
}

/**
 * 等待 JSZip 加载完成
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {Promise<boolean>}
 */
function waitForJSZip(timeout = 5000) {
  return new Promise((resolve) => {
    if (typeof JSZip !== 'undefined') {
      resolve(true);
      return;
    }
    
    const startTime = Date.now();
    const checkInterval = setInterval(() => {
      if (typeof JSZip !== 'undefined') {
        clearInterval(checkInterval);
        resolve(true);
      } else if (Date.now() - startTime > timeout) {
        clearInterval(checkInterval);
        resolve(false);
      }
    }, 100);
  });
}

/**
 * 执行数据备份
 */
export async function performBackup() {
  const btn = elements.backupDataBtn;
  if (!btn) return;
  
  const originalText = btn.innerHTML;
  
  try {
    btn.disabled = true;
    btn.innerHTML = '⏳ 加载中...';
    
    // 等待 JSZip 加载
    const jsZipLoaded = await waitForJSZip(5000);
    
    if (!jsZipLoaded) {
      throw new Error('JSZip 库加载超时，请检查网络连接后重试');
    }
    
    btn.innerHTML = '⏳ 准备中...';
    
    const zip = new JSZip();
    
    const manifest = {
      signature: BACKUP_SIGNATURE,
      version: BACKUP_VERSION,
      createdAt: Date.now(),
      source: 'sw-debug-panel',
      includes: {
        prompts: true,
        projects: true,
        assets: true,
      },
      stats: {
        promptCount: 0,
        videoPromptCount: 0,
        imagePromptCount: 0,
        folderCount: 0,
        boardCount: 0,
        assetCount: 0,
        taskCount: 0,
      },
    };
    
    // 显示进度条
    const progressContainer = showBackupProgress();
    const updateProgress = (percent, text) => {
      const progressBar = progressContainer.querySelector('.backup-progress-fill');
      const progressText = progressContainer.querySelector('.backup-progress-text');
      if (progressBar) progressBar.style.width = `${percent}%`;
      if (progressText) progressText.textContent = text;
    };
    
    // 0. 先收集任务数据（后面提示词收集需要用到）
    updateProgress(5, '正在读取任务数据...');
    const allTasks = await collectTasksData();
    
    // 1. 收集提示词数据（会从任务中提取提示词合并）
    updateProgress(15, '正在备份提示词...');
    const promptsData = await collectPromptsData(allTasks);
    zip.file('prompts.json', JSON.stringify(promptsData, null, 2));
    manifest.stats.promptCount = promptsData.promptHistory?.length || 0;
    manifest.stats.videoPromptCount = promptsData.videoPromptHistory?.length || 0;
    manifest.stats.imagePromptCount = promptsData.imagePromptHistory?.length || 0;
    
    // 2. 收集项目数据
    updateProgress(25, '正在备份项目...');
    const projectStats = await collectProjectsData(zip);
    manifest.stats.folderCount = projectStats.folders;
    manifest.stats.boardCount = projectStats.boards;
    
    // 3. 收集素材数据（进度回调）
    updateProgress(35, '正在备份素材...');
    const assetCount = await collectAssetsData(zip, (current, total) => {
      const percent = 35 + Math.round((current / total) * 40);
      updateProgress(percent, `正在备份素材 (${current}/${total})...`);
    });
    manifest.stats.assetCount = assetCount;
    
    // 4. 导出已完成的媒体任务数据（素材库展示需要）
    updateProgress(80, '正在导出任务数据...');
    const completedMediaTasks = allTasks.filter(
      task => task.status === TaskStatus.COMPLETED &&
              (task.type === TaskType.IMAGE || task.type === TaskType.VIDEO) &&
              task.result?.url
    );
    if (completedMediaTasks.length > 0) {
      zip.file('tasks.json', JSON.stringify(completedMediaTasks, null, 2));
      manifest.stats.taskCount = completedMediaTasks.length;
    }
    
    // 5. 写入清单文件
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    
    // 6. 生成并下载 ZIP 文件
    updateProgress(85, '正在压缩文件...');
    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    }, (metadata) => {
      const percent = 85 + Math.round(metadata.percent * 0.14);
      updateProgress(percent, '正在压缩文件...');
    });
    
    // 下载文件
    updateProgress(100, '备份完成！');
    const date = new Date();
    const dateStr = date.toISOString().split('T')[0];
    const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '');
    const filename = `aitu_backup_${dateStr}_${timeStr}.zip`;
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    // 关闭进度条，显示成功信息
    setTimeout(() => {
      progressContainer.remove();
      const sizeInMB = (blob.size / 1024 / 1024).toFixed(2);
      showBackupSuccessNotification({
        filename,
        size: sizeInMB,
        stats: manifest.stats,
      });
    }, 500);
    
    btn.innerHTML = originalText;
    btn.disabled = false;
    
  } catch (error) {
    // 关闭进度条
    const progressContainer = document.querySelector('.backup-progress-container');
    if (progressContainer) progressContainer.remove();
    
    showToast('备份失败: ' + error.message, 'error', 5000);
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

/**
 * 收集任务数据
 * 从 sw-task-queue 数据库读取所有任务
 */
async function collectTasksData() {
  try {
    const tasks = await readAllFromIDB(SW_TASK_QUEUE_DB.name, SW_TASK_QUEUE_DB.stores.TASKS);
    return tasks || [];
  } catch (error) {
    console.warn('[Backup] Failed to read tasks:', error);
    return [];
  }
}

/**
 * 收集提示词数据
 * 合并两个来源：
 * 1. IndexedDB 中的提示词历史
 * 2. 任务队列中已完成任务的提示词
 */
async function collectPromptsData(allTasks = []) {
  const [promptHistory, videoPromptHistory, imagePromptHistory, presetSettings] = await Promise.all([
    readKVItem(KV_KEYS.PROMPT_HISTORY),
    readKVItem(KV_KEYS.VIDEO_PROMPT_HISTORY),
    readKVItem(KV_KEYS.IMAGE_PROMPT_HISTORY),
    readKVItem(KV_KEYS.PRESET_SETTINGS),
  ]);
  
  let finalPromptHistory = promptHistory || [];
  let finalVideoPromptHistory = videoPromptHistory || [];
  let finalImagePromptHistory = imagePromptHistory || [];
  
  // 从已完成的任务中提取提示词
  const completedTasks = allTasks.filter(task => task.status === TaskStatus.COMPLETED);
  
  // 提取图片任务的提示词
  const imageTaskPrompts = completedTasks
    .filter(task => task.type === TaskType.IMAGE && task.params?.prompt)
    .map(task => ({
      id: `task_${task.id}`,
      content: task.params.prompt.trim(),
      timestamp: task.completedAt || task.createdAt,
    }))
    .filter(item => item.content && item.content.length > 0);
  
  // 提取视频任务的提示词
  const videoTaskPrompts = completedTasks
    .filter(task => task.type === TaskType.VIDEO && task.params?.prompt)
    .map(task => ({
      id: `task_${task.id}`,
      content: task.params.prompt.trim(),
      timestamp: task.completedAt || task.createdAt,
    }))
    .filter(item => item.content && item.content.length > 0);
  
  // 合并图片提示词（去重）
  const existingImageContents = new Set(finalImagePromptHistory.map(p => p.content));
  const newImagePrompts = imageTaskPrompts.filter(p => !existingImageContents.has(p.content));
  finalImagePromptHistory = [...finalImagePromptHistory, ...newImagePrompts];
  
  // 合并视频提示词（去重）
  const existingVideoContents = new Set(finalVideoPromptHistory.map(p => p.content));
  const newVideoPrompts = videoTaskPrompts.filter(p => !existingVideoContents.has(p.content));
  finalVideoPromptHistory = [...finalVideoPromptHistory, ...newVideoPrompts];
  
  return {
    promptHistory: finalPromptHistory,
    videoPromptHistory: finalVideoPromptHistory,
    imagePromptHistory: finalImagePromptHistory,
    presetSettings: presetSettings || {
      image: { pinnedPrompts: [], deletedPrompts: [] },
      video: { pinnedPrompts: [], deletedPrompts: [] },
    },
  };
}

/**
 * 收集项目数据
 * 从 aitu-workspace 数据库的 folders 和 boards store 读取
 */
async function collectProjectsData(zip) {
  const projectsFolder = zip.folder('projects');
  
  // 从独立的 store 读取，而不是 KV 存储
  const [folders, boards] = await Promise.all([
    readAllFromIDB(IDB_STORES.WORKSPACE.name, IDB_STORES.WORKSPACE.stores.FOLDERS),
    readAllFromIDB(IDB_STORES.WORKSPACE.name, IDB_STORES.WORKSPACE.stores.BOARDS),
  ]);
  
  const folderList = folders || [];
  const boardList = boards || [];
  
  // 构建文件夹路径映射
  const folderPathMap = new Map();
  const folderMap = new Map();
  
  for (const folder of folderList) {
    folderMap.set(folder.id, folder);
  }
  
  const getPath = (folderId) => {
    if (folderPathMap.has(folderId)) {
      return folderPathMap.get(folderId);
    }
    
    const folder = folderMap.get(folderId);
    if (!folder) return '';
    
    const safeName = sanitizeFileName(folder.name);
    if (folder.parentId) {
      const parentPath = getPath(folder.parentId);
      const fullPath = parentPath ? `${parentPath}/${safeName}` : safeName;
      folderPathMap.set(folderId, fullPath);
      return fullPath;
    }
    
    folderPathMap.set(folderId, safeName);
    return safeName;
  };
  
  for (const folder of folderList) {
    getPath(folder.id);
  }
  
  // 创建文件夹结构
  for (const folder of folderList) {
    const path = folderPathMap.get(folder.id) || folder.name;
    projectsFolder.folder(path);
  }
  
  // 导出画板
  for (const board of boardList) {
    const folderPath = board.folderId ? folderPathMap.get(board.folderId) : null;
    const safeName = sanitizeFileName(board.name);
    const boardPath = folderPath
      ? `${folderPath}/${safeName}.drawnix`
      : `${safeName}.drawnix`;
    
    const drawnixData = {
      type: 'drawnix',
      version: 1,
      source: 'backup',
      elements: board.elements || [],
      viewport: board.viewport || { zoom: 1 },
      theme: board.theme,
      boardMeta: {
        id: board.id,
        name: board.name,
        folderId: board.folderId,
        order: board.order,
        createdAt: board.createdAt,
        updatedAt: board.updatedAt,
      },
    };
    
    projectsFolder.file(boardPath, JSON.stringify(drawnixData, null, 2));
  }
  
  return {
    folders: folderList.length,
    boards: boardList.length,
  };
}

/**
 * 从 URL 生成唯一 ID（与应用层保持一致）
 */
function generateIdFromUrl(url) {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `cache-${Math.abs(hash).toString(36)}`;
}

/**
 * 收集素材数据
 * 三个数据源：
 * 1. aitu-assets 数据库（本地素材库元数据）
 * 2. drawnix-unified-cache 数据库（AI 生成媒体元数据）
 * 3. drawnix-images Cache Storage（媒体二进制数据）
 * @param {JSZip} zip - ZIP 实例
 * @param {Function} onProgress - 进度回调 (current, total)
 */
async function collectAssetsData(zip, onProgress) {
  const assetsFolder = zip.folder('assets');
  let exportedCount = 0;
  const exportedUrls = new Set();
  
  try {
    // 打开 Cache Storage
    const cache = await caches.open(CACHE_NAMES.IMAGES);
    
    // 1. 从 aitu-assets 数据库读取本地素材元数据
    const assetMetaList = await readAllFromIDB(IDB_STORES.ASSETS.name, IDB_STORES.ASSETS.store);
    
    // 2. 从 drawnix-unified-cache 数据库读取 AI 生成媒体元数据
    const unifiedCacheItems = await readAllFromIDB(IDB_STORES.UNIFIED_CACHE.name, IDB_STORES.UNIFIED_CACHE.store);
    
    // 3. 获取虚拟路径缓存
    const cacheKeys = await cache.keys();
    const virtualRequests = cacheKeys.filter(req => req.url.includes('/__aitu_cache__/'));
    
    // 计算总数用于进度显示
    const totalItems = assetMetaList.length + unifiedCacheItems.length + virtualRequests.length;
    let processedCount = 0;
    
    // 1. 导出本地素材
    for (const asset of assetMetaList) {
      try {
        assetsFolder.file(`${asset.id}.meta.json`, JSON.stringify(asset, null, 2));
        
        if (asset.url) {
          const response = await cache.match(asset.url);
          if (response) {
            const blob = await response.blob();
            if (blob.size > 0) {
              const ext = getExtensionFromMimeType(asset.mimeType || blob.type);
              assetsFolder.file(`${asset.id}${ext}`, blob);
              exportedUrls.add(asset.url);
              exportedCount++;
            }
          }
        }
      } catch (err) {
        // 静默处理错误
      }
      processedCount++;
      if (onProgress) onProgress(processedCount, totalItems);
    }
    
    // 2. 导出 unified-cache 中的素材
    const newCacheItems = unifiedCacheItems.filter(item => !exportedUrls.has(item.url));
    
    for (const item of newCacheItems) {
      try {
        const itemId = item.metadata?.taskId || generateIdFromUrl(item.url);
        
        const metaData = {
          id: itemId,
          url: item.url,
          type: item.type === 'video' ? 'VIDEO' : 'IMAGE',
          mimeType: item.mimeType,
          size: item.size,
          source: 'AI_GENERATED',
          createdAt: item.cachedAt,
          updatedAt: item.lastUsed,
          metadata: item.metadata,
        };
        assetsFolder.file(`${itemId}.meta.json`, JSON.stringify(metaData, null, 2));
        
        const response = await cache.match(item.url);
        if (response) {
          const blob = await response.blob();
          if (blob.size > 0) {
            const ext = getExtensionFromMimeType(item.mimeType);
            assetsFolder.file(`${itemId}${ext}`, blob);
            exportedUrls.add(item.url);
            exportedCount++;
          }
        }
      } catch (err) {
        // 静默处理错误
      }
      processedCount++;
      if (onProgress) onProgress(processedCount, totalItems);
    }
    
    // 跳过已处理的 unified-cache items
    processedCount += (unifiedCacheItems.length - newCacheItems.length);
    
    // 3. 导出虚拟路径缓存中的媒体（可能有些不在 unified-cache 中）
    const pendingVirtualRequests = virtualRequests.filter(req => !exportedUrls.has(req.url));
    
    for (const request of pendingVirtualRequests) {
      const url = request.url;
      
      try {
        const response = await cache.match(request);
        if (response) {
          const blob = await response.blob();
          if (blob.size > 0) {
            const urlParts = url.split('/');
            const filename = urlParts[urlParts.length - 1];
            const id = filename.split('.')[0] || `cache-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            
            const contentType = response.headers.get('content-type') || blob.type;
            const ext = getExtensionFromMimeType(contentType);
            const type = contentType.startsWith('video/') ? 'VIDEO' : 'IMAGE';
            
            const metadata = {
              id,
              url,
              type,
              mimeType: contentType,
              size: blob.size,
              source: 'AI_GENERATED',
              createdAt: Date.now(),
            };
            assetsFolder.file(`${id}.meta.json`, JSON.stringify(metadata, null, 2));
            assetsFolder.file(`${id}${ext}`, blob);
            exportedUrls.add(url);
            exportedCount++;
          }
        }
      } catch (err) {
        // 静默处理错误
      }
      processedCount++;
      if (onProgress) onProgress(processedCount, totalItems);
    }
    
  } catch (error) {
    // 静默处理错误
  }
  
  return exportedCount;
}

/**
 * 显示备份进度条
 */
function showBackupProgress() {
  const container = document.createElement('div');
  container.className = 'backup-progress-container';
  container.innerHTML = `
    <div class="backup-progress-content">
      <div class="backup-progress-header">
        <span class="backup-progress-icon">📦</span>
        <span class="backup-progress-title">正在备份数据</span>
      </div>
      <div class="backup-progress-bar">
        <div class="backup-progress-fill" style="width: 0%"></div>
      </div>
      <div class="backup-progress-text">准备中...</div>
    </div>
  `;
  document.body.appendChild(container);
  return container;
}

/**
 * 显示备份成功通知
 */
function showBackupSuccessNotification({ filename, size, stats }) {
  const notification = document.createElement('div');
  notification.className = 'import-notification backup-notification';
  notification.innerHTML = `
    <div class="import-notification-content">
      <span class="icon">✅</span>
      <div class="info">
        <strong>备份成功</strong>
        <p>${filename}</p>
        <p class="counts">
          文件大小: ${size} MB
          ${stats.boardCount > 0 ? `| 画板: ${stats.boardCount}` : ''}
          ${stats.folderCount > 0 ? `| 文件夹: ${stats.folderCount}` : ''}
          ${stats.assetCount > 0 ? `| 素材: ${stats.assetCount}` : ''}
          ${stats.taskCount > 0 ? `| 任务: ${stats.taskCount}` : ''}
          ${stats.imagePromptCount > 0 ? `| 图片提示词: ${stats.imagePromptCount}` : ''}
          ${stats.videoPromptCount > 0 ? `| 视频提示词: ${stats.videoPromptCount}` : ''}
        </p>
      </div>
      <button class="close" onclick="this.parentElement.parentElement.remove()">×</button>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  // 5 秒后自动消失
  setTimeout(() => {
    notification.classList.add('fade-out');
    setTimeout(() => notification.remove(), 300);
  }, 5000);
}
