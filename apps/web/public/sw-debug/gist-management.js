/**
 * Gist Management Module for SW Debug Panel
 * Provides debugging tools for Gist sync system
 */

import {
  decryptToken,
  getGistCredentials,
  decryptGistFile,
  getSyncConfig,
  getShardEnabledStatus,
  getLocalMasterIndex,
  hasCustomPassword,
  getDeviceIdExported,
  getLocalTasks,
  getLocalBoards,
  listCacheStorageMedia,
  getCacheStorageStats,
  querySyncLogs,
  getSyncLogStats,
  getSyncSessions,
  clearSyncLogs,
  exportSyncLogs,
} from './crypto-helper.js';

// ====================================
// State
// ====================================

let elements = {};
let currentGistData = null;
let currentGistId = null;
let currentToken = null;
let currentCustomPassword = null;
let remoteMasterIndex = null;
let localMasterIndex = null;

// Sync Log State
let syncLogCurrentPage = 1;
let syncLogPageSize = 50;
let syncLogTotalEntries = 0;
let syncLogCurrentFilters = {};

// ====================================
// Initialization
// ====================================

export function initGistManagement() {
  // Cache DOM elements
  elements = {
    // Toolbar
    refreshBtn: document.getElementById('refreshGistBtn'),
    status: document.getElementById('gistStatus'),
    
    // Config section
    tokenStatus: document.getElementById('gistTokenStatus'),
    gistId: document.getElementById('gistId'),
    shardEnabled: document.getElementById('gistShardEnabled'),
    passwordStatus: document.getElementById('gistPasswordStatus'),
    deviceId: document.getElementById('gistDeviceId'),
    lastSync: document.getElementById('gistLastSync'),
    
    // Shard section
    shardTotalCount: document.getElementById('shardTotalCount'),
    shardActiveCount: document.getElementById('shardActiveCount'),
    shardFullCount: document.getElementById('shardFullCount'),
    shardFileCount: document.getElementById('shardFileCount'),
    shardTotalSize: document.getElementById('shardTotalSize'),
    shardList: document.getElementById('gistShardList'),
    
    // Diagnostics - Tasks
    localTaskCount: document.getElementById('localTaskCount'),
    remoteTaskCount: document.getElementById('remoteTaskCount'),
    localOnlyTaskCount: document.getElementById('localOnlyTaskCount'),
    remoteOnlyTaskCount: document.getElementById('remoteOnlyTaskCount'),
    syncedTaskCount: document.getElementById('syncedTaskCount'),
    taskComparisonTable: document.getElementById('taskComparisonTable'),
    
    // Diagnostics - Boards
    localBoardCount: document.getElementById('localBoardCount'),
    remoteBoardCount: document.getElementById('remoteBoardCount'),
    localOnlyBoardCount: document.getElementById('localOnlyBoardCount'),
    remoteOnlyBoardCount: document.getElementById('remoteOnlyBoardCount'),
    boardComparisonTable: document.getElementById('boardComparisonTable'),
    
    // Diagnostics - Media
    localMediaCount: document.getElementById('localMediaCount'),
    remoteMediaCount: document.getElementById('remoteMediaCount'),
    localOnlyMediaCount: document.getElementById('localOnlyMediaCount'),
    remoteOnlyMediaCount: document.getElementById('remoteOnlyMediaCount'),
    mediaComparisonTable: document.getElementById('mediaComparisonTable'),
    
    // Files browser
    fileList: document.getElementById('gistFileList'),
    fileContent: document.getElementById('gistFileContent'),
    previewName: document.getElementById('previewFileName'),
  };

  // Event listeners
  if (elements.refreshBtn) {
    elements.refreshBtn.addEventListener('click', refreshGistData);
  }

  // Section collapse/expand
  document.querySelectorAll('.gist-section-header').forEach(header => {
    header.addEventListener('click', () => {
      const section = header.closest('.gist-section');
      section.classList.toggle('collapsed');
      
      // Auto-refresh sync logs when section is expanded
      const sectionType = header.dataset.section;
      if (sectionType === 'synclogs' && !section.classList.contains('collapsed')) {
        refreshSyncLogs();
      }
    });
  });

  // Sub-tab switching
  document.querySelectorAll('.gist-subtab').forEach(tab => {
    tab.addEventListener('click', () => {
      const subtabName = tab.dataset.subtab;
      switchSubtab(subtabName);
    });
  });

  // Debug operation buttons
  initDebugOperations();

  // Load initial local data
  loadLocalConfigInfo();
}

// ====================================
// Sub-tab Management
// ====================================

function switchSubtab(subtabName) {
  // Update tab buttons
  document.querySelectorAll('.gist-subtab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.subtab === subtabName);
  });

  // Update tab content
  document.querySelectorAll('.gist-subtab-content').forEach(content => {
    content.classList.toggle('active', content.id === `${subtabName}Subtab`);
  });
}

// ====================================
// Status Updates
// ====================================

function updateStatus(msg, type = 'info') {
  if (!elements.status) return;
  elements.status.textContent = msg;
  elements.status.style.color = type === 'error' ? 'var(--error-color)' : 
                                type === 'success' ? 'var(--success-color)' : 
                                'var(--text-secondary)';
}

// ====================================
// Local Config Info
// ====================================

async function loadLocalConfigInfo() {
  try {
    // Device ID
    const deviceId = getDeviceIdExported();
    if (elements.deviceId) {
      elements.deviceId.textContent = deviceId ? deviceId.substring(0, 16) + '...' : '-';
      elements.deviceId.title = deviceId || '';
    }

    // Sync config
    const config = await getSyncConfig();
    if (config) {
      if (elements.gistId) {
        elements.gistId.textContent = config.gistId ? 
          config.gistId.substring(0, 12) + '...' : '未配置';
        elements.gistId.title = config.gistId || '';
        elements.gistId.classList.toggle('warning', !config.gistId);
      }
      
      if (elements.lastSync) {
        elements.lastSync.textContent = config.lastSyncTime ? 
          formatTime(config.lastSyncTime) : '从未同步';
        elements.lastSync.classList.toggle('warning', !config.lastSyncTime);
      }
    }

    // Shard enabled
    const shardEnabled = await getShardEnabledStatus();
    if (elements.shardEnabled) {
      elements.shardEnabled.textContent = shardEnabled ? '已启用' : '未启用';
      elements.shardEnabled.classList.toggle('success', shardEnabled);
      elements.shardEnabled.classList.toggle('warning', !shardEnabled);
    }

    // Password status
    const hasPassword = await hasCustomPassword();
    if (elements.passwordStatus) {
      elements.passwordStatus.textContent = hasPassword ? '已设置' : '未设置';
      elements.passwordStatus.classList.toggle('success', hasPassword);
    }

    // Local master index
    localMasterIndex = await getLocalMasterIndex();
    if (localMasterIndex) {
      renderShardStats(localMasterIndex);
    }

  } catch (error) {
    console.error('Failed to load local config:', error);
  }
}

// ====================================
// Main Refresh
// ====================================

async function refreshGistData() {
  updateStatus('正在加载...', 'info');
  
  try {
    // 1. Get Token
    const encryptedToken = localStorage.getItem('github_sync_token');
    if (!encryptedToken) {
      throw new Error('未找到 GitHub Token');
    }
    
    try {
      currentToken = await decryptToken(encryptedToken);
      if (elements.tokenStatus) {
        elements.tokenStatus.textContent = '已解密';
        elements.tokenStatus.classList.add('success');
      }
    } catch (e) {
      if (elements.tokenStatus) {
        elements.tokenStatus.textContent = '解密失败';
        elements.tokenStatus.classList.add('error');
      }
      throw new Error('Token 解密失败');
    }

    // 2. Get Credentials
    const creds = await getGistCredentials();
    currentGistId = creds.gistId;
    currentCustomPassword = creds.customPassword;
    
    if (!currentGistId) {
      throw new Error('未配置 Gist ID');
    }

    // 3. Reload local config
    await loadLocalConfigInfo();

    // 4. Fetch main Gist
    updateStatus('正在获取 Gist 数据...', 'info');
    const gist = await fetchGist(currentGistId);
    currentGistData = gist;

    // 5. Parse master-index.json
    if (gist.files && gist.files['master-index.json']) {
      updateStatus('正在解析分片索引...', 'info');
      remoteMasterIndex = await parseGistFile(gist.files['master-index.json']);
      if (remoteMasterIndex) {
        renderShardStats(remoteMasterIndex);
      }
    }

    // 6. Render remote files list
    renderFileList(gist.files || {});

    // 7. Run diagnostics
    updateStatus('正在对比数据...', 'info');
    await runDiagnostics(gist);

    updateStatus('加载完成', 'success');

  } catch (error) {
    console.error('Gist Refresh Error:', error);
    updateStatus(error.message, 'error');
  }
}

// ====================================
// GitHub API
// ====================================

async function fetchGist(gistId) {
  const response = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: {
      'Authorization': `token ${currentToken}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub API 错误: ${response.status}`);
  }

  return response.json();
}

async function parseGistFile(fileData) {
  try {
    let content = fileData.content;
    if (fileData.truncated) {
      const res = await fetch(fileData.raw_url);
      content = await res.text();
    }
    
    const decrypted = await decryptGistFile(content, currentGistId, currentCustomPassword);
    return JSON.parse(decrypted);
  } catch (e) {
    console.error('Failed to parse gist file:', e);
    return null;
  }
}

// ====================================
// Shard Stats Rendering
// ====================================

function renderShardStats(masterIndex) {
  if (!masterIndex) return;

  const stats = masterIndex.stats || {};
  const shards = masterIndex.shards || {};
  const shardList = Object.values(shards);

  // Update stat cards
  if (elements.shardTotalCount) {
    elements.shardTotalCount.textContent = shardList.length;
  }
  if (elements.shardActiveCount) {
    elements.shardActiveCount.textContent = stats.activeShards || 
      shardList.filter(s => s.status === 'active').length;
  }
  if (elements.shardFullCount) {
    elements.shardFullCount.textContent = stats.fullShards || 
      shardList.filter(s => s.status === 'full').length;
  }
  if (elements.shardFileCount) {
    elements.shardFileCount.textContent = stats.totalFiles || 
      Object.keys(masterIndex.fileIndex || {}).length;
  }
  if (elements.shardTotalSize) {
    elements.shardTotalSize.textContent = formatSize(stats.totalSize || 0);
  }

  // Render shard list
  if (elements.shardList) {
    if (shardList.length === 0) {
      elements.shardList.innerHTML = '<div class="empty-state" style="padding: 20px;">无分片数据</div>';
      return;
    }

    elements.shardList.innerHTML = shardList.map(shard => `
      <div class="gist-shard-item">
        <span class="gist-shard-id">${escapeHtml(shard.alias || shard.gistId?.substring(0, 8))}</span>
        <span class="gist-shard-info">
          <span>${shard.fileCount || 0} 文件</span>
          <span>${formatSize(shard.totalSize || 0)}</span>
        </span>
        <span class="gist-shard-status ${shard.status}">${shard.status}</span>
      </div>
    `).join('');
  }
}

// ====================================
// Remote Files Browser
// ====================================

function renderFileList(files) {
  if (!elements.fileList) return;
  
  const fileNames = Object.keys(files).sort();
  
  if (fileNames.length === 0) {
    elements.fileList.innerHTML = '<div class="empty-state" style="padding: 20px;">无文件</div>';
    return;
  }

  elements.fileList.innerHTML = fileNames.map(fileName => {
    let type = 'Text';
    if (fileName.endsWith('.png') || fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) {
      type = 'Image';
    } else if (fileName.endsWith('.drawnix')) {
      type = 'Canvas';
    } else if (fileName === 'tasks.json' || fileName === 'master-index.json') {
      type = 'Data';
    } else if (fileName === 'shard-manifest.json') {
      type = 'Manifest';
    }
    
    return `
      <div class="gist-file-item" data-filename="${escapeHtml(fileName)}">
        <span class="file-name">${escapeHtml(fileName)}</span>
        <span class="file-type">${type}</span>
      </div>
    `;
  }).join('');

  // Add click handlers
  elements.fileList.querySelectorAll('.gist-file-item').forEach(item => {
    item.addEventListener('click', () => {
      // Update active state
      elements.fileList.querySelectorAll('.gist-file-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      
      const fileName = item.dataset.filename;
      showFileContent(fileName, files[fileName]);
    });
  });
}

async function showFileContent(fileName, fileData) {
  if (!elements.previewName || !elements.fileContent) return;
  
  elements.previewName.textContent = fileName;
  elements.fileContent.textContent = '正在加载...';
  
  try {
    let content = fileData.content;
    if (fileData.truncated) {
      const res = await fetch(fileData.raw_url);
      content = await res.text();
    }

    // Try decrypt
    let displayContent = content;
    try {
      displayContent = await decryptGistFile(content, currentGistId, currentCustomPassword);
      // Format JSON
      try {
        const json = JSON.parse(displayContent);
        displayContent = JSON.stringify(json, null, 2);
      } catch {}
    } catch (e) {
      console.warn('Decryption failed, showing raw', e);
      displayContent = content + '\n\n[解密失败]';
    }
    
    elements.fileContent.textContent = displayContent;
  } catch (e) {
    elements.fileContent.textContent = '加载失败: ' + e.message;
  }
}

// ====================================
// Diagnostics
// ====================================

async function runDiagnostics(gist) {
  await Promise.all([
    compareTasksData(gist),
    compareBoardsData(gist),
    compareMediaData(),
  ]);
}

// --- Tasks Comparison ---

async function compareTasksData(gist) {
  try {
    // Get local tasks
    const localTasks = await getLocalTasks();
    const localTaskMap = new Map(localTasks.map(t => [t.id, t]));

    // Get remote tasks
    let remoteTasks = [];
    if (gist.files && gist.files['tasks.json']) {
      const tasksData = await parseGistFile(gist.files['tasks.json']);
      if (Array.isArray(tasksData)) {
        remoteTasks = tasksData;
      }
    }
    const remoteTaskMap = new Map(remoteTasks.map(t => [t.id, t]));

    // Compare
    const localIds = new Set(localTaskMap.keys());
    const remoteIds = new Set(remoteTaskMap.keys());
    
    const localOnly = [...localIds].filter(id => !remoteIds.has(id));
    const remoteOnly = [...remoteIds].filter(id => !localIds.has(id));
    const synced = [...localIds].filter(id => remoteIds.has(id));

    // Update summary
    if (elements.localTaskCount) elements.localTaskCount.textContent = localTasks.length;
    if (elements.remoteTaskCount) elements.remoteTaskCount.textContent = remoteTasks.length;
    if (elements.localOnlyTaskCount) elements.localOnlyTaskCount.textContent = localOnly.length;
    if (elements.remoteOnlyTaskCount) elements.remoteOnlyTaskCount.textContent = remoteOnly.length;
    if (elements.syncedTaskCount) elements.syncedTaskCount.textContent = synced.length;

    // Render comparison table
    renderComparisonTable(elements.taskComparisonTable, {
      localOnly: localOnly.map(id => ({ id, data: localTaskMap.get(id) })),
      remoteOnly: remoteOnly.map(id => ({ id, data: remoteTaskMap.get(id) })),
      synced: synced.map(id => ({
        id,
        local: localTaskMap.get(id),
        remote: remoteTaskMap.get(id),
      })),
    }, 'task');

  } catch (error) {
    console.error('Task comparison failed:', error);
    if (elements.taskComparisonTable) {
      elements.taskComparisonTable.innerHTML = `<div class="empty-state" style="padding: 20px;">对比失败: ${error.message}</div>`;
    }
  }
}

// --- Boards Comparison ---

async function compareBoardsData(gist) {
  try {
    // Get local boards
    const localBoards = await getLocalBoards();
    const localBoardMap = new Map(localBoards.map(b => [b.id, b]));

    // Get remote boards (*.drawnix files)
    const remoteBoards = [];
    if (gist.files) {
      for (const [fileName, fileData] of Object.entries(gist.files)) {
        if (fileName.endsWith('.drawnix')) {
          const boardId = fileName.replace('.drawnix', '');
          remoteBoards.push({ id: boardId, fileName, fileData });
        }
      }
    }
    const remoteBoardMap = new Map(remoteBoards.map(b => [b.id, b]));

    // Compare
    const localIds = new Set(localBoardMap.keys());
    const remoteIds = new Set(remoteBoardMap.keys());
    
    const localOnly = [...localIds].filter(id => !remoteIds.has(id));
    const remoteOnly = [...remoteIds].filter(id => !localIds.has(id));
    const synced = [...localIds].filter(id => remoteIds.has(id));

    // Update summary
    if (elements.localBoardCount) elements.localBoardCount.textContent = localBoards.length;
    if (elements.remoteBoardCount) elements.remoteBoardCount.textContent = remoteBoards.length;
    if (elements.localOnlyBoardCount) elements.localOnlyBoardCount.textContent = localOnly.length;
    if (elements.remoteOnlyBoardCount) elements.remoteOnlyBoardCount.textContent = remoteOnly.length;

    // Render comparison table
    renderComparisonTable(elements.boardComparisonTable, {
      localOnly: localOnly.map(id => ({ id, data: localBoardMap.get(id) })),
      remoteOnly: remoteOnly.map(id => ({ id, data: remoteBoardMap.get(id) })),
      synced: synced.map(id => ({
        id,
        local: localBoardMap.get(id),
        remote: remoteBoardMap.get(id),
      })),
    }, 'board');

  } catch (error) {
    console.error('Board comparison failed:', error);
    if (elements.boardComparisonTable) {
      elements.boardComparisonTable.innerHTML = `<div class="empty-state" style="padding: 20px;">对比失败: ${error.message}</div>`;
    }
  }
}

// --- Media Comparison ---

async function compareMediaData() {
  try {
    // Get local cache media
    const localMedia = await listCacheStorageMedia();
    const localUrls = new Set(localMedia.map(m => m.url));

    // Get remote media from master index
    const masterIndex = remoteMasterIndex || localMasterIndex;
    const remoteMedia = masterIndex?.fileIndex ? Object.keys(masterIndex.fileIndex) : [];
    const remoteUrls = new Set(remoteMedia);

    // Compare
    const localOnly = [...localUrls].filter(url => !remoteUrls.has(url));
    const remoteOnly = [...remoteUrls].filter(url => !localUrls.has(url));
    const synced = [...localUrls].filter(url => remoteUrls.has(url));

    // Update summary
    if (elements.localMediaCount) elements.localMediaCount.textContent = localMedia.length;
    if (elements.remoteMediaCount) elements.remoteMediaCount.textContent = remoteMedia.length;
    if (elements.localOnlyMediaCount) elements.localOnlyMediaCount.textContent = localOnly.length;
    if (elements.remoteOnlyMediaCount) elements.remoteOnlyMediaCount.textContent = remoteOnly.length;

    // Render comparison table
    renderMediaComparisonTable(elements.mediaComparisonTable, {
      localOnly,
      remoteOnly,
      synced,
      masterIndex,
    });

  } catch (error) {
    console.error('Media comparison failed:', error);
    if (elements.mediaComparisonTable) {
      elements.mediaComparisonTable.innerHTML = `<div class="empty-state" style="padding: 20px;">对比失败: ${error.message}</div>`;
    }
  }
}

// ====================================
// Comparison Table Rendering
// ====================================

function renderComparisonTable(container, data, type) {
  if (!container) return;

  const rows = [];

  // Local only items
  data.localOnly.forEach(item => {
    rows.push({
      id: item.id,
      status: 'local-only',
      statusText: '仅本地',
      details: getItemDetails(item.data, type),
    });
  });

  // Remote only items
  data.remoteOnly.forEach(item => {
    rows.push({
      id: item.id,
      status: 'remote-only',
      statusText: '仅远程',
      details: getItemDetails(item.data, type),
    });
  });

  // Synced items (show first 10 to avoid overwhelming)
  data.synced.slice(0, 10).forEach(item => {
    const hasConflict = checkConflict(item.local, item.remote);
    rows.push({
      id: item.id,
      status: hasConflict ? 'conflict' : 'synced',
      statusText: hasConflict ? '冲突' : '已同步',
      details: getItemDetails(item.local, type),
    });
  });

  if (rows.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding: 20px;">无数据</div>';
    return;
  }

  // Sort: local-only first, then remote-only, then conflicts, then synced
  const statusOrder = { 'local-only': 0, 'remote-only': 1, 'conflict': 2, 'synced': 3 };
  rows.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

  container.innerHTML = rows.map(row => `
    <div class="gist-comparison-row">
      <span class="item-id" title="${escapeHtml(row.id)}">${escapeHtml(truncateId(row.id))}</span>
      <span class="item-details">${escapeHtml(row.details)}</span>
      <span class="item-status ${row.status}">${row.statusText}</span>
    </div>
  `).join('');

  // Add note if there are more synced items
  if (data.synced.length > 10) {
    container.innerHTML += `
      <div class="gist-comparison-row" style="justify-content: center; color: var(--text-muted); font-style: italic;">
        还有 ${data.synced.length - 10} 个已同步项未显示
      </div>
    `;
  }
}

function renderMediaComparisonTable(container, data) {
  if (!container) return;

  const rows = [];

  // Local only
  data.localOnly.slice(0, 20).forEach(url => {
    rows.push({
      url,
      status: 'local-only',
      statusText: '仅本地',
    });
  });

  // Remote only
  data.remoteOnly.slice(0, 20).forEach(url => {
    const fileInfo = data.masterIndex?.fileIndex?.[url];
    rows.push({
      url,
      status: 'remote-only',
      statusText: '仅远程',
      shard: fileInfo?.shardId,
    });
  });

  // Synced (show first 10)
  data.synced.slice(0, 10).forEach(url => {
    rows.push({
      url,
      status: 'synced',
      statusText: '已同步',
    });
  });

  if (rows.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding: 20px;">无媒体数据</div>';
    return;
  }

  // Sort
  const statusOrder = { 'local-only': 0, 'remote-only': 1, 'synced': 2 };
  rows.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

  container.innerHTML = rows.map(row => `
    <div class="gist-comparison-row">
      <span class="item-id" title="${escapeHtml(row.url)}">${escapeHtml(extractFilename(row.url))}</span>
      <span class="item-details">${row.shard ? `分片: ${row.shard}` : ''}</span>
      <span class="item-status ${row.status}">${row.statusText}</span>
    </div>
  `).join('');

  // Add notes for truncated lists
  const totalHidden = 
    Math.max(0, data.localOnly.length - 20) + 
    Math.max(0, data.remoteOnly.length - 20) + 
    Math.max(0, data.synced.length - 10);
    
  if (totalHidden > 0) {
    container.innerHTML += `
      <div class="gist-comparison-row" style="justify-content: center; color: var(--text-muted); font-style: italic;">
        还有 ${totalHidden} 个项未显示
      </div>
    `;
  }
}

// ====================================
// Helper Functions
// ====================================

function getItemDetails(item, type) {
  if (!item) return '';
  
  if (type === 'task') {
    const status = item.status || 'unknown';
    const taskType = item.type || '';
    return `${taskType} - ${status}`;
  }
  
  if (type === 'board') {
    const name = item.name || item.title || '';
    return name;
  }
  
  return '';
}

function checkConflict(local, remote) {
  if (!local || !remote) return false;
  // Simple conflict check: different updatedAt
  if (local.updatedAt && remote.updatedAt) {
    return local.updatedAt !== remote.updatedAt;
  }
  return false;
}

function truncateId(id) {
  if (!id) return '';
  if (id.length <= 24) return id;
  return id.substring(0, 12) + '...' + id.substring(id.length - 8);
}

function extractFilename(url) {
  if (!url) return '';
  try {
    const pathname = new URL(url).pathname;
    return pathname.split('/').pop() || url;
  } catch {
    return url.split('/').pop() || url;
  }
}

function formatTime(timestamp) {
  if (!timestamp) return '-';
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  
  return date.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ====================================
// Debug Operations
// ====================================

let debugLogOutput = null;

function initDebugOperations() {
  debugLogOutput = document.getElementById('debugLogOutput');
  
  // Clear log button
  document.getElementById('debugClearLog')?.addEventListener('click', clearDebugLog);
  
  // Connection tests
  document.getElementById('debugTestConnection')?.addEventListener('click', debugTestConnection);
  document.getElementById('debugListGists')?.addEventListener('click', debugListGists);
  
  // Task operations
  document.getElementById('debugPreviewTaskMerge')?.addEventListener('click', debugPreviewTaskMerge);
  document.getElementById('debugImportRemoteTasks')?.addEventListener('click', debugImportRemoteTasks);
  
  // Board operations
  document.getElementById('debugPreviewBoardMerge')?.addEventListener('click', debugPreviewBoardMerge);
  document.getElementById('debugDownloadBoard')?.addEventListener('click', debugDownloadBoard);
  
  // Media operations
  document.getElementById('debugListShardFiles')?.addEventListener('click', debugListShardFiles);
  document.getElementById('debugTestMediaDownload')?.addEventListener('click', debugTestMediaDownload);
  
  // Log diagnostics
  document.getElementById('debugCheckSyncLogDb')?.addEventListener('click', debugCheckSyncLogDb);
  document.getElementById('debugWriteTestLog')?.addEventListener('click', debugWriteTestLog);
  document.getElementById('debugPerformanceTest')?.addEventListener('click', debugPerformanceTest);
  
  // Initialize Sync Log Viewer
  initSyncLogViewer();
}

function clearDebugLog() {
  if (debugLogOutput) {
    debugLogOutput.innerHTML = '<div class="debug-log-placeholder">日志已清空</div>';
  }
}

function debugLog(level, message, details = null) {
  if (!debugLogOutput) return;
  
  // Remove placeholder
  const placeholder = debugLogOutput.querySelector('.debug-log-placeholder');
  if (placeholder) placeholder.remove();
  
  const time = new Date().toLocaleTimeString('zh-CN');
  const entry = document.createElement('div');
  entry.className = 'debug-log-entry';
  
  let html = `
    <span class="debug-log-time">${time}</span>
    <span class="debug-log-level ${level}">${level}</span>
    <span class="debug-log-message">${escapeHtml(message)}</span>
  `;
  
  if (details) {
    const detailStr = typeof details === 'string' ? details : JSON.stringify(details, null, 2);
    const isLong = detailStr.length > 200;
    html += `
      <div class="debug-log-details ${isLong ? 'collapsible collapsed' : ''}" 
           ${isLong ? 'onclick="this.classList.toggle(\'collapsed\')"' : ''}>
        ${escapeHtml(detailStr)}
      </div>
    `;
  }
  
  entry.innerHTML = html;
  debugLogOutput.appendChild(entry);
  
  // Auto scroll to bottom
  debugLogOutput.scrollTop = debugLogOutput.scrollHeight;
}

// --- Connection Tests ---

async function debugTestConnection() {
  debugLog('info', '开始测试 GitHub API 连接...');
  
  try {
    // Check token
    const encryptedToken = localStorage.getItem('github_sync_token');
    if (!encryptedToken) {
      debugLog('error', 'Token 未配置', '请先在应用中配置 GitHub Token');
      return;
    }
    
    const token = await decryptToken(encryptedToken);
    debugLog('success', 'Token 解密成功');
    
    // Test API
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (!response.ok) {
      debugLog('error', `API 请求失败: ${response.status}`, await response.text());
      return;
    }
    
    const user = await response.json();
    debugLog('success', `连接成功! 用户: ${user.login}`, {
      id: user.id,
      login: user.login,
      name: user.name,
      email: user.email,
      plan: user.plan?.name,
    });
    
    // Check rate limit
    const rateLimit = {
      limit: response.headers.get('x-ratelimit-limit'),
      remaining: response.headers.get('x-ratelimit-remaining'),
      reset: new Date(parseInt(response.headers.get('x-ratelimit-reset')) * 1000).toLocaleTimeString(),
    };
    debugLog('info', 'API 速率限制', rateLimit);
    
  } catch (error) {
    debugLog('error', `连接测试失败: ${error.message}`);
  }
}

async function debugListGists() {
  debugLog('info', '获取用户的所有 Gists...');
  
  try {
    await ensureToken();
    
    const response = await fetch('https://api.github.com/gists?per_page=100', {
      headers: {
        'Authorization': `token ${currentToken}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (!response.ok) {
      debugLog('error', `获取 Gists 失败: ${response.status}`);
      return;
    }
    
    const gists = await response.json();
    
    // Filter for sync gists
    const syncGists = gists.filter(g => 
      g.description?.includes('Opentu') || 
      g.description?.includes('开图') ||
      Object.keys(g.files).some(f => f.endsWith('.drawnix') || f === 'tasks.json' || f === 'master-index.json')
    );
    
    debugLog('success', `找到 ${syncGists.length} 个同步相关的 Gists`, 
      syncGists.map(g => ({
        id: g.id,
        description: g.description?.substring(0, 50),
        files: Object.keys(g.files).length,
        created: new Date(g.created_at).toLocaleDateString(),
        updated: new Date(g.updated_at).toLocaleDateString(),
      }))
    );
    
  } catch (error) {
    debugLog('error', `获取 Gists 失败: ${error.message}`);
  }
}

// --- Task Operations ---

async function debugPreviewTaskMerge() {
  debugLog('info', '预览任务合并...');
  
  try {
    await ensureToken();
    await ensureGistData();
    
    // Get local tasks
    const localTasks = await getLocalTasks();
    debugLog('info', `本地任务: ${localTasks.length} 个`);
    
    // Get remote tasks
    let remoteTasks = [];
    if (currentGistData?.files?.['tasks.json']) {
      const tasksData = await parseGistFile(currentGistData.files['tasks.json']);
      if (Array.isArray(tasksData)) {
        remoteTasks = tasksData;
      }
    }
    debugLog('info', `远程任务: ${remoteTasks.length} 个`);
    
    // Build maps
    const localMap = new Map(localTasks.map(t => [t.id, t]));
    const remoteMap = new Map(remoteTasks.map(t => [t.id, t]));
    
    // Analyze merge
    const mergeResult = {
      localOnly: [],
      remoteOnly: [],
      conflicts: [],
      identical: [],
    };
    
    // Check local tasks
    for (const [id, local] of localMap) {
      const remote = remoteMap.get(id);
      if (!remote) {
        mergeResult.localOnly.push({ id, type: local.type, status: local.status });
      } else {
        // Compare
        const localUpdated = local.updatedAt || local.createdAt || 0;
        const remoteUpdated = remote.updatedAt || remote.createdAt || 0;
        
        if (localUpdated === remoteUpdated && local.status === remote.status) {
          mergeResult.identical.push({ id });
        } else {
          mergeResult.conflicts.push({
            id,
            local: { status: local.status, updated: localUpdated },
            remote: { status: remote.status, updated: remoteUpdated },
            winner: localUpdated > remoteUpdated ? 'local' : 'remote',
          });
        }
      }
    }
    
    // Check remote only
    for (const [id, remote] of remoteMap) {
      if (!localMap.has(id)) {
        mergeResult.remoteOnly.push({ id, type: remote.type, status: remote.status });
      }
    }
    
    debugLog('success', '任务合并预览完成', mergeResult);
    
    if (mergeResult.remoteOnly.length > 0) {
      debugLog('warning', `有 ${mergeResult.remoteOnly.length} 个远程任务在本地不存在，可能需要导入`);
    }
    
  } catch (error) {
    debugLog('error', `预览任务合并失败: ${error.message}`);
  }
}

async function debugImportRemoteTasks() {
  debugLog('info', '开始导入远程任务...');
  
  try {
    await ensureToken();
    await ensureGistData();
    
    // Get local and remote tasks
    const localTasks = await getLocalTasks();
    const localIds = new Set(localTasks.map(t => t.id));
    
    let remoteTasks = [];
    if (currentGistData?.files?.['tasks.json']) {
      const tasksData = await parseGistFile(currentGistData.files['tasks.json']);
      if (Array.isArray(tasksData)) {
        remoteTasks = tasksData;
      }
    }
    
    // Find tasks to import
    const tasksToImport = remoteTasks.filter(t => !localIds.has(t.id));
    
    if (tasksToImport.length === 0) {
      debugLog('info', '没有需要导入的任务');
      return;
    }
    
    debugLog('info', `将导入 ${tasksToImport.length} 个任务`);
    
    // Import to SW task queue via IndexedDB
    const db = await openDatabase('sw-task-queue', 2, (db) => {
      if (!db.objectStoreNames.contains('tasks')) {
        db.createObjectStore('tasks', { keyPath: 'id' });
      }
    });
    
    const tx = db.transaction('tasks', 'readwrite');
    const store = tx.objectStore('tasks');
    
    for (const task of tasksToImport) {
      store.put(task);
    }
    
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    
    db.close();
    
    debugLog('success', `成功导入 ${tasksToImport.length} 个任务`, 
      tasksToImport.map(t => ({ id: t.id, type: t.type, status: t.status }))
    );
    
  } catch (error) {
    debugLog('error', `导入任务失败: ${error.message}`);
  }
}

// --- Board Operations ---

async function debugPreviewBoardMerge() {
  debugLog('info', '预览画板合并...');
  
  try {
    await ensureToken();
    await ensureGistData();
    
    // Get local boards
    const localBoards = await getLocalBoards();
    debugLog('info', `本地画板: ${localBoards.length} 个`);
    
    // Get remote boards
    const remoteBoards = [];
    if (currentGistData?.files) {
      for (const [fileName, fileData] of Object.entries(currentGistData.files)) {
        if (fileName.endsWith('.drawnix')) {
          const boardId = fileName.replace('.drawnix', '');
          remoteBoards.push({ id: boardId, fileName });
        }
      }
    }
    debugLog('info', `远程画板: ${remoteBoards.length} 个`);
    
    // Build comparison
    const localIds = new Set(localBoards.map(b => b.id));
    const remoteIds = new Set(remoteBoards.map(b => b.id));
    
    const result = {
      localOnly: localBoards.filter(b => !remoteIds.has(b.id)).map(b => ({
        id: b.id,
        name: b.name || b.title,
        elements: b.elements?.length || 0,
      })),
      remoteOnly: remoteBoards.filter(b => !localIds.has(b.id)).map(b => ({
        id: b.id,
        fileName: b.fileName,
      })),
      both: [...localIds].filter(id => remoteIds.has(id)),
    };
    
    debugLog('success', '画板对比完成', result);
    
    if (result.localOnly.length > 0) {
      debugLog('info', `${result.localOnly.length} 个本地画板未同步到远程`);
    }
    if (result.remoteOnly.length > 0) {
      debugLog('warning', `${result.remoteOnly.length} 个远程画板在本地不存在`);
    }
    
  } catch (error) {
    debugLog('error', `预览画板合并失败: ${error.message}`);
  }
}

async function debugDownloadBoard() {
  debugLog('info', '下载画板...');
  
  try {
    await ensureToken();
    await ensureGistData();
    
    // Get available boards
    const remoteBoards = [];
    if (currentGistData?.files) {
      for (const [fileName] of Object.entries(currentGistData.files)) {
        if (fileName.endsWith('.drawnix')) {
          remoteBoards.push(fileName);
        }
      }
    }
    
    if (remoteBoards.length === 0) {
      debugLog('warning', '没有可下载的画板');
      return;
    }
    
    // Download first board as example
    const boardFile = remoteBoards[0];
    debugLog('info', `下载画板: ${boardFile}`);
    
    const boardData = await parseGistFile(currentGistData.files[boardFile]);
    
    if (boardData) {
      debugLog('success', `画板下载成功: ${boardFile}`, {
        id: boardData.id,
        name: boardData.name || boardData.title,
        elements: boardData.elements?.length || 0,
        updatedAt: boardData.updatedAt,
      });
      
      // Show element types
      if (boardData.elements?.length > 0) {
        const elementTypes = {};
        boardData.elements.forEach(el => {
          const type = el.type || 'unknown';
          elementTypes[type] = (elementTypes[type] || 0) + 1;
        });
        debugLog('info', '元素类型统计', elementTypes);
      }
    } else {
      debugLog('error', '画板解析失败');
    }
    
  } catch (error) {
    debugLog('error', `下载画板失败: ${error.message}`);
  }
}

// --- Media Operations ---

async function debugListShardFiles() {
  debugLog('info', '获取分片文件列表...');
  
  try {
    await ensureToken();
    
    // Get master index
    const masterIndex = remoteMasterIndex || localMasterIndex || await getLocalMasterIndex();
    
    if (!masterIndex) {
      debugLog('warning', '未找到分片索引');
      return;
    }
    
    const shards = Object.values(masterIndex.shards || {});
    debugLog('info', `找到 ${shards.length} 个分片`);
    
    // List files in each shard
    for (const shard of shards) {
      debugLog('info', `分片 ${shard.alias}: ${shard.fileCount} 文件, ${formatSize(shard.totalSize)}`, {
        gistId: shard.gistId,
        status: shard.status,
        createdAt: formatTime(shard.createdAt),
      });
    }
    
    // List file index
    const fileIndex = masterIndex.fileIndex || {};
    const fileCount = Object.keys(fileIndex).length;
    debugLog('success', `文件索引: ${fileCount} 个文件`);
    
    // Sample files
    const sampleFiles = Object.entries(fileIndex).slice(0, 5);
    if (sampleFiles.length > 0) {
      debugLog('info', '示例文件', sampleFiles.map(([url, info]) => ({
        url: extractFilename(url),
        shard: info.shardId,
        size: formatSize(info.size),
        type: info.type,
      })));
    }
    
  } catch (error) {
    debugLog('error', `获取分片文件失败: ${error.message}`);
  }
}

async function debugTestMediaDownload() {
  debugLog('info', '测试媒体下载...');
  
  try {
    await ensureToken();
    
    // Get master index
    const masterIndex = remoteMasterIndex || localMasterIndex || await getLocalMasterIndex();
    
    if (!masterIndex?.fileIndex) {
      debugLog('warning', '未找到文件索引');
      return;
    }
    
    // Get a sample file
    const files = Object.entries(masterIndex.fileIndex);
    if (files.length === 0) {
      debugLog('warning', '索引中没有文件');
      return;
    }
    
    const [url, fileInfo] = files[0];
    debugLog('info', `测试下载: ${extractFilename(url)}`, fileInfo);
    
    // Get shard info
    const shard = masterIndex.shards?.[fileInfo.shardId];
    if (!shard) {
      debugLog('error', `找不到分片: ${fileInfo.shardId}`);
      return;
    }
    
    // Fetch shard gist
    debugLog('info', `从分片 ${shard.alias} (${shard.gistId}) 下载...`);
    
    const shardGist = await fetchGist(shard.gistId);
    const fileName = fileInfo.filename;
    
    if (!shardGist.files?.[fileName]) {
      debugLog('error', `分片中找不到文件: ${fileName}`);
      return;
    }
    
    const fileData = shardGist.files[fileName];
    debugLog('success', '文件获取成功', {
      filename: fileName,
      size: fileData.size,
      truncated: fileData.truncated,
      type: fileData.type,
    });
    
    // Check if it's base64 encoded
    if (fileData.content) {
      const isBase64 = fileData.content.match(/^[A-Za-z0-9+/=]+$/);
      debugLog('info', `内容格式: ${isBase64 ? 'Base64 编码' : '文本'}`);
    }
    
  } catch (error) {
    debugLog('error', `测试媒体下载失败: ${error.message}`);
  }
}

// --- Log Diagnostics ---

async function debugCheckSyncLogDb() {
  debugLog('info', '检查同步日志数据库...');
  
  try {
    // 1. Check if IndexedDB is available
    if (!window.indexedDB) {
      debugLog('error', 'IndexedDB 不可用');
      return;
    }
    debugLog('success', 'IndexedDB 可用');
    
    // 2. List all databases
    if (indexedDB.databases) {
      const dbs = await indexedDB.databases();
      const dbNames = dbs.map(db => `${db.name} (v${db.version})`);
      debugLog('info', `已有数据库: ${dbs.length} 个`, dbNames);
      
      const hasUnifiedLogDb = dbs.some(db => db.name === 'aitu-unified-logs');
      if (!hasUnifiedLogDb) {
        debugLog('warning', '统一日志数据库 aitu-unified-logs 不存在');
      }
    }
    
    // 3. Try to open the sync log database
    const stats = await getSyncLogStats();
    debugLog('success', '日志数据库连接成功', stats);
    
    // 4. Query recent logs
    const logs = await querySyncLogs({ limit: 5 });
    if (logs.length === 0) {
      debugLog('warning', '日志数据库为空 - 主应用可能尚未写入日志');
    } else {
      debugLog('success', `找到 ${logs.length} 条最新日志`, 
        logs.map(l => ({
          time: new Date(l.timestamp).toLocaleTimeString(),
          level: l.level,
          category: l.category,
          message: l.message.substring(0, 50),
        }))
      );
    }
    
  } catch (error) {
    debugLog('error', `检查日志数据库失败: ${error.message}`);
  }
}

async function debugWriteTestLog() {
  debugLog('info', '写入测试日志到统一日志数据库...');
  
  try {
    const UNIFIED_LOG_DB = 'aitu-unified-logs';
    const UNIFIED_LOG_STORE = 'logs';
    
    // Open database
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(UNIFIED_LOG_DB, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const database = event.target.result;
        if (!database.objectStoreNames.contains(UNIFIED_LOG_STORE)) {
          const store = database.createObjectStore(UNIFIED_LOG_STORE, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('category', 'category', { unique: false });
          store.createIndex('level', 'level', { unique: false });
          store.createIndex('sessionId', 'sessionId', { unique: false });
          store.createIndex('category_timestamp', ['category', 'timestamp'], { unique: false });
        }
      };
    });
    
    // Write test log (unified log format)
    const testEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      timestamp: Date.now(),
      category: 'sync',
      level: 'info',
      message: '这是来自 sw-debug 面板的测试日志',
      data: { source: 'sw-debug', test: true },
    };
    
    const tx = db.transaction(UNIFIED_LOG_STORE, 'readwrite');
    const store = tx.objectStore(UNIFIED_LOG_STORE);
    store.add(testEntry);
    
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    
    db.close();
    
    debugLog('success', '测试日志写入成功', testEntry);
    debugLog('info', '请刷新同步日志区域查看');
    
  } catch (error) {
    debugLog('error', `写入测试日志失败: ${error.message}`);
  }
}

/**
 * Performance benchmark test
 */
async function debugPerformanceTest() {
  debugLog('info', '开始性能基准测试 (1000 次日志写入)...');
  
  try {
    const UNIFIED_LOG_DB = 'aitu-unified-logs';
    const UNIFIED_LOG_STORE = 'logs';
    const iterations = 1000;
    
    // Open database
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(UNIFIED_LOG_DB, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    
    // Test 1: Memory write speed (sync)
    const memoryLogs = [];
    const memoryStart = performance.now();
    
    for (let i = 0; i < iterations; i++) {
      memoryLogs.push({
        id: `perf-${Date.now()}-${i}`,
        timestamp: Date.now(),
        category: 'sync',
        level: 'info',
        message: `Performance test log #${i}`,
        data: { iteration: i },
      });
    }
    
    const memoryEnd = performance.now();
    const memoryTimeMs = memoryEnd - memoryStart;
    const memoryAvgUs = (memoryTimeMs / iterations) * 1000;
    
    debugLog('success', `内存写入: ${memoryTimeMs.toFixed(2)}ms (${memoryAvgUs.toFixed(2)}μs/条)`, {
      iterations,
      totalMs: memoryTimeMs.toFixed(2),
      avgMicroseconds: memoryAvgUs.toFixed(2),
      logsPerSecond: Math.round(iterations / (memoryTimeMs / 1000)),
    });
    
    // Test 2: IndexedDB write speed (async batch)
    const dbStart = performance.now();
    
    const tx = db.transaction(UNIFIED_LOG_STORE, 'readwrite');
    const store = tx.objectStore(UNIFIED_LOG_STORE);
    
    // Batch write
    for (const log of memoryLogs) {
      store.add(log);
    }
    
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    
    const dbEnd = performance.now();
    const dbTimeMs = dbEnd - dbStart;
    const dbAvgUs = (dbTimeMs / iterations) * 1000;
    
    debugLog('success', `IndexedDB 写入: ${dbTimeMs.toFixed(2)}ms (${dbAvgUs.toFixed(2)}μs/条)`, {
      iterations,
      totalMs: dbTimeMs.toFixed(2),
      avgMicroseconds: dbAvgUs.toFixed(2),
      logsPerSecond: Math.round(iterations / (dbTimeMs / 1000)),
    });
    
    db.close();
    
    // Summary
    const passed = memoryAvgUs < 100; // Target: < 100μs per log
    if (passed) {
      debugLog('success', '性能测试通过 ✓', {
        target: '< 100μs/条',
        actual: `${memoryAvgUs.toFixed(2)}μs/条`,
      });
    } else {
      debugLog('warning', '性能未达标', {
        target: '< 100μs/条',
        actual: `${memoryAvgUs.toFixed(2)}μs/条`,
      });
    }
    
  } catch (error) {
    debugLog('error', `性能测试失败: ${error.message}`);
  }
}

// --- Helper Functions for Debug ---

async function ensureToken() {
  if (currentToken) return;
  
  const encryptedToken = localStorage.getItem('github_sync_token');
  if (!encryptedToken) {
    throw new Error('未配置 GitHub Token');
  }
  currentToken = await decryptToken(encryptedToken);
}

async function ensureGistData() {
  if (currentGistData) return;
  
  const creds = await getGistCredentials();
  if (!creds.gistId) {
    throw new Error('未配置 Gist ID');
  }
  currentGistId = creds.gistId;
  currentCustomPassword = creds.customPassword;
  currentGistData = await fetchGist(currentGistId);
}

function openDatabase(name, version, upgradeCallback) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      if (upgradeCallback) {
        upgradeCallback(event.target.result);
      }
    };
  });
}

// ====================================
// Sync Log Viewer
// ====================================

function initSyncLogViewer() {
  // Refresh button
  document.getElementById('refreshSyncLogs')?.addEventListener('click', refreshSyncLogs);
  
  // Export button
  document.getElementById('exportSyncLogs')?.addEventListener('click', handleExportSyncLogs);
  
  // Clear button
  document.getElementById('clearSyncLogs')?.addEventListener('click', handleClearSyncLogs);
  
  // Filters
  document.getElementById('syncLogLevelFilter')?.addEventListener('change', handleSyncLogFilterChange);
  document.getElementById('syncLogCategoryFilter')?.addEventListener('change', handleSyncLogFilterChange);
  document.getElementById('syncLogSessionFilter')?.addEventListener('change', handleSyncLogFilterChange);
  
  // Search with debounce
  let searchTimeout;
  document.getElementById('syncLogSearch')?.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      syncLogCurrentFilters.search = e.target.value;
      syncLogCurrentPage = 1;
      loadSyncLogs();
    }, 300);
  });
  
  // Pagination
  document.getElementById('syncLogPrevPage')?.addEventListener('click', () => {
    if (syncLogCurrentPage > 1) {
      syncLogCurrentPage--;
      loadSyncLogs();
    }
  });
  
  document.getElementById('syncLogNextPage')?.addEventListener('click', () => {
    const totalPages = Math.ceil(syncLogTotalEntries / syncLogPageSize);
    if (syncLogCurrentPage < totalPages) {
      syncLogCurrentPage++;
      loadSyncLogs();
    }
  });
}

async function refreshSyncLogs() {
  console.log('[SyncLogViewer] Refreshing sync logs...');
  try {
    // Load stats
    const stats = await getSyncLogStats();
    console.log('[SyncLogViewer] Stats:', stats);
    updateSyncLogStats(stats);
    
    // Load sessions for filter
    const sessions = await getSyncSessions();
    console.log('[SyncLogViewer] Sessions:', sessions.length);
    populateSessionFilter(sessions);
    
    // Reset to first page and load logs
    syncLogCurrentPage = 1;
    syncLogTotalEntries = stats.total;
    await loadSyncLogs();
    
  } catch (error) {
    console.error('Failed to refresh sync logs:', error);
  }
}

function updateSyncLogStats(stats) {
  document.getElementById('syncLogTotal').textContent = stats.total || 0;
  document.getElementById('syncLogErrors').textContent = stats.byLevel?.error || 0;
  document.getElementById('syncLogWarnings').textContent = stats.byLevel?.warning || 0;
  document.getElementById('syncLogSuccesses').textContent = stats.byLevel?.success || 0;
  document.getElementById('syncLogSessions').textContent = stats.sessionCount || 0;
}

function populateSessionFilter(sessions) {
  const select = document.getElementById('syncLogSessionFilter');
  if (!select) return;
  
  // Keep first option
  select.innerHTML = '<option value="">全部会话</option>';
  
  // Add sessions (most recent first)
  sessions.slice(0, 20).forEach(session => {
    const option = document.createElement('option');
    option.value = session.sessionId;
    const date = new Date(session.startTime);
    const dateStr = date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    const timeStr = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    option.textContent = `${dateStr} ${timeStr} (${session.logCount}条${session.hasErrors ? ', 有错误' : ''})`;
    select.appendChild(option);
  });
}

function handleSyncLogFilterChange() {
  syncLogCurrentFilters = {
    level: document.getElementById('syncLogLevelFilter')?.value || '',
    category: document.getElementById('syncLogCategoryFilter')?.value || '',
    sessionId: document.getElementById('syncLogSessionFilter')?.value || '',
    search: document.getElementById('syncLogSearch')?.value || '',
  };
  syncLogCurrentPage = 1;
  loadSyncLogs();
}

async function loadSyncLogs() {
  const container = document.getElementById('syncLogList');
  if (!container) return;
  
  try {
    const query = {
      ...syncLogCurrentFilters,
      limit: syncLogPageSize * syncLogCurrentPage, // We'll slice later
    };
    
    // Remove empty filters
    Object.keys(query).forEach(key => {
      if (!query[key]) delete query[key];
    });
    
    const allLogs = await querySyncLogs(query);
    
    // Calculate pagination
    const startIndex = (syncLogCurrentPage - 1) * syncLogPageSize;
    const logs = allLogs.slice(startIndex, startIndex + syncLogPageSize);
    syncLogTotalEntries = allLogs.length;
    
    if (logs.length === 0) {
      container.innerHTML = '<div class="empty-state" style="padding: 40px;">没有找到匹配的日志</div>';
      updatePagination();
      return;
    }
    
    container.innerHTML = logs.map(log => renderSyncLogEntry(log)).join('');
    updatePagination();
    
  } catch (error) {
    console.error('Failed to load sync logs:', error);
    container.innerHTML = `<div class="empty-state" style="padding: 40px;">加载日志失败: ${error.message}</div>`;
  }
}

function renderSyncLogEntry(log) {
  const time = new Date(log.timestamp);
  const timeStr = time.toLocaleTimeString('zh-CN', { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  });
  const dateStr = time.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  
  const levelLabels = {
    info: '信息',
    success: '成功',
    warning: '警告',
    error: '错误',
    debug: '调试',
  };
  
  let html = `
    <div class="sync-log-entry">
      <div class="sync-log-entry-header">
        <span class="sync-log-time">${dateStr} ${timeStr}</span>
        <span class="sync-log-level ${log.level}">${levelLabels[log.level] || log.level}</span>
        ${log.duration ? `<span class="sync-log-duration">${log.duration}ms</span>` : ''}
        ${log.sessionId ? `<span class="sync-log-session" title="${log.sessionId}">${truncateSyncLogSessionId(log.sessionId)}</span>` : ''}
      </div>
      <div class="sync-log-message">${escapeHtml(log.message)}</div>
  `;
  
  // 统一日志格式使用 data 字段
  if (log.data && Object.keys(log.data).length > 0) {
    html += `<div class="sync-log-details">${escapeHtml(JSON.stringify(log.data, null, 2))}</div>`;
  }
  
  if (log.error) {
    html += `
      <div class="sync-log-error">
        <div class="sync-log-error-name">${escapeHtml(log.error.name)}</div>
        <div class="sync-log-error-message">${escapeHtml(log.error.message)}</div>
        ${log.error.stack ? `<div class="sync-log-error-stack">${escapeHtml(log.error.stack)}</div>` : ''}
      </div>
    `;
  }
  
  html += '</div>';
  return html;
}

function truncateSyncLogSessionId(sessionId) {
  if (!sessionId) return '';
  // Format: sync-1234567890-abc123
  const parts = sessionId.split('-');
  if (parts.length >= 3) {
    const timestamp = parseInt(parts[1]);
    if (!isNaN(timestamp)) {
      const date = new Date(timestamp);
      return `${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    }
  }
  return sessionId.slice(-8);
}

function updatePagination() {
  const totalPages = Math.ceil(syncLogTotalEntries / syncLogPageSize) || 1;
  
  document.getElementById('syncLogPageInfo').textContent = 
    `第 ${syncLogCurrentPage} / ${totalPages} 页 (共 ${syncLogTotalEntries} 条)`;
  
  const prevBtn = document.getElementById('syncLogPrevPage');
  const nextBtn = document.getElementById('syncLogNextPage');
  
  if (prevBtn) prevBtn.disabled = syncLogCurrentPage <= 1;
  if (nextBtn) nextBtn.disabled = syncLogCurrentPage >= totalPages;
}

async function handleExportSyncLogs() {
  try {
    const json = await exportSyncLogs(syncLogCurrentFilters);
    
    // Create download
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sync-logs-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    debugLog('success', '日志导出成功');
    
  } catch (error) {
    console.error('Failed to export logs:', error);
    debugLog('error', `日志导出失败: ${error.message}`);
  }
}

async function handleClearSyncLogs() {
  if (!confirm('确定要清空所有同步日志吗？此操作不可恢复。')) {
    return;
  }
  
  try {
    await clearSyncLogs();
    debugLog('success', '日志已清空');
    await refreshSyncLogs();
    
  } catch (error) {
    console.error('Failed to clear logs:', error);
    debugLog('error', `清空日志失败: ${error.message}`);
  }
}
