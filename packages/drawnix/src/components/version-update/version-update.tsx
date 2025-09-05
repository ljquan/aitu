import React, { useState, useEffect } from 'react';
import { Button } from 'tdesign-react';
import { RefreshIcon } from 'tdesign-icons-react';

interface VersionInfo {
  version: string;
  buildTime: string;
  gitCommit: string;
}

export const VersionUpdate: React.FC = () => {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [currentVersion, setCurrentVersion] = useState('');
  const [newVersion, setNewVersion] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    checkForUpdates();
    
    // 每5分钟检查一次更新
    const interval = setInterval(checkForUpdates, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  const checkForUpdates = async () => {
    try {
      // 获取当前版本（从HTML meta标签）
      const currentVersionMeta = document.querySelector('meta[name="app-version"]');
      const current = currentVersionMeta?.getAttribute('content') || '0.0.0';
      setCurrentVersion(current);

      // 获取服务器最新版本（添加时间戳防缓存）
      const timestamp = Date.now();
      const response = await fetch(`/version.json?t=${timestamp}`);
      
      if (!response.ok) {
        console.log('Version check failed:', response.status);
        return;
      }

      const versionInfo: VersionInfo = await response.json();
      
      // 比较版本号
      if (versionInfo.version !== current && !isVersionNewer(current, versionInfo.version)) {
        setNewVersion(versionInfo.version);
        setHasUpdate(true);
        console.log(`New version available: ${versionInfo.version} (current: ${current})`);
      }
    } catch (error) {
      console.log('Failed to check for updates:', error);
    }
  };

  // 简单的版本号比较
  const isVersionNewer = (current: string, latest: string): boolean => {
    const currentParts = current.split('.').map(Number);
    const latestParts = latest.split('.').map(Number);
    
    for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
      const currentPart = currentParts[i] || 0;
      const latestPart = latestParts[i] || 0;
      
      if (latestPart > currentPart) return false;
      if (latestPart < currentPart) return true;
    }
    
    return true; // 版本相同
  };

  const handleUpdate = async () => {
    setIsUpdating(true);
    
    try {
      // 清除所有缓存
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
        console.log('All caches cleared');
      }

      // 强制 Service Worker 更新
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          await registration.update();
          if (registration.waiting) {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
        }
      }

      // 延迟后刷新页面，确保新版本加载
      setTimeout(() => {
        window.location.reload();
      }, 1000);
      
    } catch (error) {
      console.error('Update failed:', error);
      setIsUpdating(false);
      // 如果清缓存失败，直接刷新页面
      window.location.reload();
    }
  };

  const handleDismiss = () => {
    setHasUpdate(false);
    // 30分钟后再次检查
    setTimeout(checkForUpdates, 30 * 60 * 1000);
  };

  // 监听 Service Worker 更新事件
  useEffect(() => {
    const handleSWUpdate = (event: MessageEvent) => {
      if (event.data && event.data.type === 'SW_UPDATED') {
        checkForUpdates();
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSWUpdate);
      return () => {
        navigator.serviceWorker.removeEventListener('message', handleSWUpdate);
      };
    }
  }, []);

  if (!hasUpdate) {
    return null;
  }

  return (
    <div className="version-update-banner" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      backgroundColor: '#e7f3ff',
      padding: '12px 16px',
      borderBottom: '1px solid #b3d8ff',
      zIndex: 1001,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      animation: 'slideDown 0.3s ease-out'
    }}>
      <div className="version-update-content" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div>
          <strong>发现新版本 v{newVersion}</strong>
          <span style={{ marginLeft: '8px', color: '#666' }}>
            当前版本: v{currentVersion}
          </span>
        </div>
      </div>
      <div className="version-update-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <Button 
          theme="primary" 
          size="small" 
          icon={<RefreshIcon />}
          loading={isUpdating}
          onClick={handleUpdate}
        >
          {isUpdating ? '更新中...' : '立即更新'}
        </Button>
        <Button 
          theme="default" 
          size="small" 
          variant="text"
          onClick={handleDismiss}
          disabled={isUpdating}
        >
          稍后
        </Button>
      </div>
    </div>
  );
};

export default VersionUpdate;