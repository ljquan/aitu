
import React, { useState, useEffect } from 'react';
import { Button } from 'tdesign-react';
import { useTaskQueue } from '../../hooks/useTaskQueue';
import { RefreshIcon } from 'tdesign-icons-react';
import { useI18n } from '../../i18n';
import './version-update-prompt.scss';

export const VersionUpdatePrompt: React.FC = () => {
  const [updateAvailable, setUpdateAvailable] = useState<{ version: string } | null>(null);
  const { activeTasks } = useTaskQueue();
  // const { t } = useI18n(); // Assuming i18n is available, if not fallback to strings

  useEffect(() => {
    // Listen for custom event from main.tsx
    const handleUpdateAvailable = (event: Event) => {
      const customEvent = event as CustomEvent;
      console.log('[VersionUpdatePrompt] Update available:', customEvent.detail);
      setUpdateAvailable(customEvent.detail);
    };

    window.addEventListener('sw-update-available', handleUpdateAvailable);

    // 调试辅助：在开发环境下挂载手动触发方法
    if (process.env.NODE_ENV === 'development') {
      (window as any).__debugTriggerUpdate = (version = '9.9.9') => {
        console.log('[Debug] Triggering update prompt');
        window.dispatchEvent(new CustomEvent('sw-update-available', { 
          detail: { version } 
        }));
      };
      console.log('[VersionUpdatePrompt] Debug mode: run window.__debugTriggerUpdate() to test');
    }

    return () => {
      window.removeEventListener('sw-update-available', handleUpdateAvailable);
    };
  }, []);

  const handleUpdate = () => {
    console.log('[VersionUpdatePrompt] User confirmed update');
    // Dispatch event to notify main.tsx to proceed with upgrade
    window.dispatchEvent(new CustomEvent('user-confirmed-upgrade'));
    // Ideally the page will reload shortly, but we can set loading state if needed
  };

  // Only show if update is available AND no active tasks
  if (!updateAvailable || activeTasks.length > 0) {
    return null;
  }

  return (
    <div className="version-update-prompt">
      <div className="version-update-prompt__content">
        <span className="version-update-prompt__text">
          新版本 v{updateAvailable.version} 已就绪
        </span>
        <Button 
          theme="primary" 
          size="small" 
          onClick={handleUpdate}
          icon={<RefreshIcon />}
        >
          立即更新
        </Button>
      </div>
    </div>
  );
};
