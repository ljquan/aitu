/**
 * SW Debug Panel - Backup Restore
 * 从备份 ZIP 恢复数据到 IndexedDB + Cache Storage
 */

import { elements } from './state.js';
import {
  IDB_STORES,
  KV_KEYS,
  CACHE_NAMES,
  SW_TASK_QUEUE_DB,
  readAllFromIDB,
  readKVItem,
  writeToIDB,
  writeKVItem,
  writeBatchToIDB,
} from './indexeddb.js';
import { BACKUP_SIGNATURE, waitForJSZip } from './backup.js';
import { showToast } from './toast.js';

/**
 * 触发文件选择器
 */
export function triggerRestoreDialog() {
  elements.restoreBackupInput?.click();
}

/**
 * 处理文件选择后的恢复流程
 */
export async function handleRestoreFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  // 重置 input 以便再次选择同一文件
  event.target.value = '';

  try {
    await performRestore(file);
  } catch (error) {
    showToast('恢复失败: ' + error.message, 'error', 5000);
  }
}

/**
 * 执行恢复
 */
async function performRestore(file) {
  const jsZipLoaded = await waitForJSZip(5000);
  if (!jsZipLoaded) throw new Error('JSZip 库加载超时');

  const progressContainer = showRestoreProgress();
  const updateProgress = (percent, text) => {
    const bar = progressContainer.querySelector('.backup-progress-fill');
    const label = progressContainer.querySelector('.backup-progress-text');
    if (bar) bar.style.width = `${percent}%`;
    if (label) label.textContent = text;
  };

  try {
    updateProgress(5, '正在读取 ZIP 文件...');
    const zip = await JSZip.loadAsync(file);

    // 读取并验证 manifest
    const manifestFile = zip.file('manifest.json');
    if (!manifestFile) throw new Error('无效的备份文件：缺少 manifest.json');

    const manifest = JSON.parse(await manifestFile.async('string'));
    if (manifest.signature !== BACKUP_SIGNATURE) {
      throw new Error('无效的备份文件：签名不匹配');
    }
    // 兼容 v2（无分片字段）和 v3
    if (manifest.version < 2 || manifest.version > 3) {
      throw new Error(`不支持的备份版本: ${manifest.version}`);
    }

    const stats = { prompts: 0, projects: 0, tasks: 0, assets: 0 };

    // 1. 恢复提示词
    if (manifest.includes?.prompts !== false) {
      updateProgress(15, '正在恢复提示词...');
      stats.prompts = await restorePrompts(zip);
    }

    // 2. 恢复项目
    if (manifest.includes?.projects !== false) {
      updateProgress(30, '正在恢复项目...');
      stats.projects = await restoreProjects(zip);
    }

    // 3. 恢复任务
    if (manifest.includes?.tasks !== false) {
      updateProgress(45, '正在恢复任务...');
      stats.tasks = await restoreTasks(zip);
    }

    // 4. 恢复素材
    if (manifest.includes?.assets !== false) {
      updateProgress(55, '正在恢复素材...');
      stats.assets = await restoreAssets(zip, (current, total) => {
        const percent = 55 + Math.round((current / total) * 35);
        updateProgress(percent, `正在恢复素材 (${current}/${total})...`);
      });
    }

    updateProgress(100, '恢复完成！');
    setTimeout(() => {
      progressContainer.remove();
      showRestoreSuccessNotification(stats, manifest);
    }, 500);

  } catch (error) {
    progressContainer.remove();
    throw error;
  }
}

/**
 * 恢复提示词（按 content 去重合并）
 */
async function restorePrompts(zip) {
  const promptsFile = zip.file('prompts.json');
  if (!promptsFile) return 0;

  const data = JSON.parse(await promptsFile.async('string'));
  let count = 0;

  // 合并各类提示词历史
  const mergePromptList = async (kvKey, incoming) => {
    if (!incoming || incoming.length === 0) return 0;
    const existing = (await readKVItem(kvKey)) || [];
    const existingContents = new Set(existing.map(p => p.content));
    const newItems = incoming.filter(p => p.content && !existingContents.has(p.content));
    if (newItems.length > 0) {
      await writeKVItem(kvKey, [...existing, ...newItems]);
    }
    return newItems.length;
  };

  count += await mergePromptList(KV_KEYS.PROMPT_HISTORY, data.promptHistory);
  count += await mergePromptList(KV_KEYS.VIDEO_PROMPT_HISTORY, data.videoPromptHistory);
  count += await mergePromptList(KV_KEYS.IMAGE_PROMPT_HISTORY, data.imagePromptHistory);

  // 恢复预设设置（如果本地没有则写入）
  if (data.presetSettings) {
    const existing = await readKVItem(KV_KEYS.PRESET_SETTINGS);
    if (!existing) {
      await writeKVItem(KV_KEYS.PRESET_SETTINGS, data.presetSettings);
    }
  }

  return count;
}

/**
 * 恢复项目（文件夹 + 画板，按 ID upsert）
 */
async function restoreProjects(zip) {
  const projectsFolder = zip.folder('projects');
  if (!projectsFolder) return 0;

  let count = 0;
  const folders = [];
  const boards = [];

  // 遍历 projects/ 下的所有 .drawnix 文件
  const drawnixFiles = [];
  projectsFolder.forEach((relativePath, file) => {
    if (file.name.endsWith('.drawnix') && !file.dir) {
      drawnixFiles.push(file);
    }
  });

  for (const file of drawnixFiles) {
    try {
      const content = JSON.parse(await file.async('string'));
      if (content.boardMeta) {
        const meta = content.boardMeta;
        boards.push({
          id: meta.id,
          name: meta.name,
          folderId: meta.folderId,
          order: meta.order,
          elements: content.elements || [],
          viewport: content.viewport || { zoom: 1 },
          theme: content.theme,
          createdAt: meta.createdAt,
          updatedAt: meta.updatedAt,
        });
      }
    } catch (err) {
      console.debug('[Restore] Failed to parse board file:', file.name, err);
    }
  }

  // 从画板中提取文件夹信息（通过 folderId 关联）
  // 文件夹结构在 ZIP 中是目录，但元数据在画板的 boardMeta.folderId 中
  // 读取现有文件夹以避免覆盖
  const existingFolders = await readAllFromIDB(
    IDB_STORES.WORKSPACE.name, IDB_STORES.WORKSPACE.stores.FOLDERS
  );
  const existingFolderIds = new Set((existingFolders || []).map(f => f.id));

  // 写入画板（upsert）
  if (boards.length > 0) {
    const existingBoards = await readAllFromIDB(
      IDB_STORES.WORKSPACE.name, IDB_STORES.WORKSPACE.stores.BOARDS
    );
    const existingBoardMap = new Map((existingBoards || []).map(b => [b.id, b]));

    for (const board of boards) {
      const existing = existingBoardMap.get(board.id);
      // 如果已存在且本地更新时间更新，跳过
      if (existing && existing.updatedAt >= (board.updatedAt || 0)) continue;
      try {
        await writeToIDB(IDB_STORES.WORKSPACE.name, IDB_STORES.WORKSPACE.stores.BOARDS, board);
        count++;
      } catch (err) {
        console.debug('[Restore] Failed to write board:', board.id, err);
      }
    }
  }

  return count;
}

/**
 * 恢复任务（按 ID upsert）
 */
async function restoreTasks(zip) {
  const tasksFile = zip.file('tasks.json');
  if (!tasksFile) return 0;

  const tasks = JSON.parse(await tasksFile.async('string'));
  if (!Array.isArray(tasks) || tasks.length === 0) return 0;

  const existingTasks = await readAllFromIDB(SW_TASK_QUEUE_DB.name, SW_TASK_QUEUE_DB.stores.TASKS);
  const existingIds = new Set((existingTasks || []).map(t => t.id));

  const newTasks = tasks.filter(t => !existingIds.has(t.id));
  if (newTasks.length > 0) {
    // 标记为远程同步，避免 SW 重新执行
    const markedTasks = newTasks.map(t => ({ ...t, syncedFromRemote: true }));
    await writeBatchToIDB(SW_TASK_QUEUE_DB.name, SW_TASK_QUEUE_DB.stores.TASKS, markedTasks);
  }

  return newTasks.length;
}

/**
 * 恢复素材（元数据到 IndexedDB + 二进制到 Cache Storage）
 */
async function restoreAssets(zip, onProgress) {
  const assetsFolder = zip.folder('assets');
  if (!assetsFolder) return 0;

  let count = 0;
  const cache = await caches.open(CACHE_NAMES.IMAGES);

  // 收集所有 .meta.json 文件
  const metaFiles = [];
  assetsFolder.forEach((relativePath, file) => {
    if (file.name.endsWith('.meta.json') && !file.dir) {
      metaFiles.push({ relativePath, file });
    }
  });

  const totalItems = metaFiles.length;
  let processedCount = 0;

  for (const { relativePath, file } of metaFiles) {
    try {
      const meta = JSON.parse(await file.async('string'));
      const assetId = meta.id;
      if (!assetId) { processedCount++; continue; }

      // 查找对应的二进制文件
      const binaryFile = findBinaryFile(assetsFolder, relativePath, assetId);

      if (binaryFile) {
        const blob = await binaryFile.async('blob');
        if (blob.size > 0 && meta.url) {
          // 写入 Cache Storage（为每个 URL 创建独立 Response）
          const contentType = meta.mimeType || blob.type || 'application/octet-stream';
          const response = new Response(blob, {
            headers: { 'Content-Type': contentType },
          });
          await cache.put(meta.url, response);
        }
      }

      // 写入元数据到对应的 IndexedDB
      if (meta.source === 'AI_GENERATED') {
        // AI 生成的素材 → unified-cache
        const cacheItem = {
          url: meta.url,
          type: meta.type === 'VIDEO' ? 'video' : 'image',
          mimeType: meta.mimeType,
          size: meta.size,
          cachedAt: meta.createdAt,
          lastUsed: meta.updatedAt || meta.createdAt,
          metadata: meta.metadata,
        };
        await writeToIDB(IDB_STORES.UNIFIED_CACHE.name, IDB_STORES.UNIFIED_CACHE.store, cacheItem);
      } else {
        // 本地素材 → aitu-assets
        await writeToIDB(IDB_STORES.ASSETS.name, IDB_STORES.ASSETS.store, meta);
      }

      count++;
    } catch (err) {
      console.debug('[Restore] Failed to restore asset:', relativePath, err);
    }

    processedCount++;
    if (onProgress) onProgress(processedCount, totalItems);
  }

  return count;
}

/**
 * 查找 meta 文件对应的二进制文件
 */
function findBinaryFile(assetsFolder, metaRelativePath, assetId) {
  // meta 文件路径: "assetId.meta.json"，二进制文件: "assetId.ext"
  const basePath = metaRelativePath.replace('.meta.json', '');
  const extensions = ['.jpg', '.png', '.gif', '.webp', '.svg', '.mp4', '.webm', '.mov', ''];

  for (const ext of extensions) {
    const file = assetsFolder.file(basePath + ext);
    if (file && !file.dir) return file;
  }
  return null;
}

/**
 * 显示恢复进度条
 */
function showRestoreProgress() {
  const container = document.createElement('div');
  container.className = 'backup-progress-container';
  container.innerHTML = `
    <div class="backup-progress-content">
      <div class="backup-progress-header">
        <span class="backup-progress-icon">📥</span>
        <span class="backup-progress-title">正在恢复数据</span>
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
 * 显示恢复成功通知
 */
function showRestoreSuccessNotification(stats, manifest) {
  const partInfo = manifest.partIndex
    ? ` (分片 ${manifest.partIndex}${manifest.totalParts ? '/' + manifest.totalParts : ''})`
    : '';
  const notification = document.createElement('div');
  notification.className = 'import-notification restore-notification';
  notification.innerHTML = `
    <div class="import-notification-content">
      <span class="icon">✅</span>
      <div class="info">
        <strong>恢复成功${partInfo}</strong>
        <p class="counts">
          ${stats.prompts > 0 ? `新增提示词: ${stats.prompts}` : ''}
          ${stats.projects > 0 ? `${stats.prompts > 0 ? ' | ' : ''}画板: ${stats.projects}` : ''}
          ${stats.tasks > 0 ? `${(stats.prompts + stats.projects) > 0 ? ' | ' : ''}任务: ${stats.tasks}` : ''}
          ${stats.assets > 0 ? `${(stats.prompts + stats.projects + stats.tasks) > 0 ? ' | ' : ''}素材: ${stats.assets}` : ''}
          ${(stats.prompts + stats.projects + stats.tasks + stats.assets) === 0 ? '所有数据已是最新，无需更新' : ''}
        </p>
      </div>
      <button class="close" onclick="this.parentElement.parentElement.remove()">×</button>
    </div>
  `;

  document.body.appendChild(notification);
  setTimeout(() => {
    notification.classList.add('fade-out');
    setTimeout(() => notification.remove(), 300);
  }, 5000);
}
