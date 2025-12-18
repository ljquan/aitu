import { Dialog, DialogContent } from '../dialog/dialog';
import { useDrawnix } from '../../hooks/use-drawnix';
import './settings-dialog.scss';
import { useI18n } from '../../i18n';
import { useState, useEffect } from 'react';
import { geminiSettings } from '../../utils/settings-manager';
import { Tooltip, Select } from 'tdesign-react';
import { InfoCircleIcon } from 'tdesign-icons-react';

// VIP models - shown at top
export const IMAGE_MODEL_VIP_OPTIONS = [
  { label: 'gemini-3-pro-image-preview-vip (nano-banana-2-vip)', value: 'gemini-3-pro-image-preview-vip' },
  { label: 'gemini-3-pro-image-preview-2k-vip (nano-banana-2-2k-vip)', value: 'gemini-3-pro-image-preview-2k-vip' },
  { label: 'gemini-3-pro-image-preview-4k-vip (nano-banana-2-4k-vip)', value: 'gemini-3-pro-image-preview-4k-vip' },
  { label: 'gemini-2.5-flash-image-vip (nano-banana-vip)', value: 'gemini-2.5-flash-image-vip' },
];

// Additional models - shown in "More" section
export const IMAGE_MODEL_MORE_OPTIONS = [
  { label: 'gemini-3-pro-image-preview (nano-banana-2)', value: 'gemini-3-pro-image-preview' },
  { label: 'gemini-2.5-flash-image (nano-banana)', value: 'gemini-2.5-flash-image' },
  { label: 'gemini-3-pro-image-preview-hd (nano-banana-2-hd)', value: 'gemini-3-pro-image-preview-hd' },
  { label: 'gemini-3-pro-image-preview-2k (nano-banana-2-2k)', value: 'gemini-3-pro-image-preview-2k' },
  { label: 'gemini-3-pro-image-preview-4k (nano-banana-2-4k)', value: 'gemini-3-pro-image-preview-4k' },
];

// Combined options for backward compatibility (flat list)
export const IMAGE_MODEL_OPTIONS = [
  ...IMAGE_MODEL_VIP_OPTIONS,
  ...IMAGE_MODEL_MORE_OPTIONS,
];

// Grouped options for Select with "More" section
export const IMAGE_MODEL_GROUPED_OPTIONS = [
  {
    group: '推荐',
    children: IMAGE_MODEL_VIP_OPTIONS,
  },
  {
    group: '更多',
    children: IMAGE_MODEL_MORE_OPTIONS,
  },
];

export const VIDEO_MODEL_OPTIONS = [
  { label: 'veo3.1', value: 'veo3.1' },
  { label: 'sora-2', value: 'sora-2' },
  { label: 'veo3', value: 'veo3' },
  { label: 'veo3-pro', value: 'veo3-pro' },
  { label: 'veo3.1-pro', value: 'veo3.1-pro' },
  { label: 'veo3.1-components', value: 'veo3.1-components' },
  { label: 'sora-2-pro', value: 'sora-2-pro' },
];

export const SettingsDialog = ({
  container,
}: {
  container: HTMLElement | null;
}) => {
  const { appState, setAppState } = useDrawnix();
  const { t } = useI18n();
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [imageModelName, setImageModelName] = useState('');
  const [videoModelName, setVideoModelName] = useState('');

  // 加载当前配置
  useEffect(() => {
    if (appState.openSettings) {
      const config = geminiSettings.get();
      setApiKey(config.apiKey || '');
      setBaseUrl(config.baseUrl || 'https://api.tu-zi.com/v1');
      setImageModelName(config.imageModelName || 'gemini-3-pro-image-preview-vip');
      setVideoModelName(config.videoModelName || 'veo3');
    }
  }, [appState.openSettings]);

  const handleSave = () => {
    // 使用全局设置管理器更新配置
    geminiSettings.update({
      apiKey: apiKey.trim(),
      baseUrl: baseUrl.trim() || 'https://api.tu-zi.com/v1',
      imageModelName: imageModelName.trim() || 'gemini-3-pro-image-preview-vip',
      videoModelName: videoModelName.trim() || 'veo3',
    });

    // 关闭弹窗
    setAppState({ ...appState, openSettings: false });
  };

  const handleCancel = () => {
    setAppState({ ...appState, openSettings: false });
  };

  return (
    <Dialog
      open={appState.openSettings}
      onOpenChange={(open) => {
        setAppState({ ...appState, openSettings: open });
      }}
    >
      <DialogContent className="settings-dialog" container={container}>
        <h2 className="settings-dialog__title">{t('settings.title')}</h2>
        <div className="settings-dialog__form">
          <div className="settings-dialog__field">
            <div className="settings-dialog__label-with-tooltip">
              <label className="settings-dialog__label">{t('settings.apiKey')}</label>
              <Tooltip
                content={
                  <div>
                    您可以从以下地址获取 API Key（新建令牌渠道分组选择default）:
                    <br />
                    <a href="https://api.tu-zi.com/token" target="_blank" rel="noopener noreferrer" 
                       style={{color: '#0052d9', textDecoration: 'none'}}>
                      https://api.tu-zi.com/token
                    </a>
                  </div>
                }
                placement="top"
                theme='light'
              >
                <InfoCircleIcon className="settings-dialog__tooltip-icon" />
              </Tooltip>
            </div>
            <input
              type="password"
              className="settings-dialog__input"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={t('settings.apiKeyPlaceholder')}
            />
          </div>
          <div className="settings-dialog__field">
            <label className="settings-dialog__label">{t('settings.baseUrl')}</label>
            <input
              type="text"
              className="settings-dialog__input"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.tu-zi.com/v1"
            />
          </div>
          <div className="settings-dialog__field">
            <label className="settings-dialog__label">图片模型名称</label>
            <Select
              className="settings-dialog__select"
              value={imageModelName}
              onChange={(value) => setImageModelName(value as string)}
              options={IMAGE_MODEL_GROUPED_OPTIONS}
              filterable
              creatable
              placeholder="gemini-3-pro-image-preview-vip"
            />
          </div>
          <div className="settings-dialog__field">
            <label className="settings-dialog__label">视频模型名称</label>
            <Select
              className="settings-dialog__select"
              value={videoModelName}
              onChange={(value) => setVideoModelName(value as string)}
              options={VIDEO_MODEL_OPTIONS}
              filterable
              creatable
              placeholder="veo3"
            />
          </div>
        </div>
        <div className="settings-dialog__actions">
          <button
            className="settings-dialog__button settings-dialog__button--cancel"
            data-track="settings_click_cancel"
            onClick={handleCancel}
          >
            {t('settings.cancel')}
          </button>
          <button
            className="settings-dialog__button settings-dialog__button--save"
            data-track="settings_click_save"
            onClick={handleSave}
          >
            {t('settings.save')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};