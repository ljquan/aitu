import { Dialog, DialogContent } from '../dialog/dialog';
import { useDrawnix } from '../../hooks/use-drawnix';
import './settings-dialog.scss';
import { useI18n } from '../../i18n';
import { useState, useEffect } from 'react';
import { geminiSettings } from '../../utils/settings-manager';
import { Tooltip } from 'tdesign-react';
import { InfoCircleIcon } from 'tdesign-icons-react';

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
      setImageModelName(config.imageModelName || 'gemini-2.5-flash-image-vip');
      setVideoModelName(config.videoModelName || 'veo3');
    }
  }, [appState.openSettings]);

  const handleSave = () => {
    // 使用全局设置管理器更新配置
    geminiSettings.update({
      apiKey: apiKey.trim(),
      baseUrl: baseUrl.trim() || 'https://api.tu-zi.com/v1',
      imageModelName: imageModelName.trim() || 'gemini-2.5-flash-image-vip',
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
            <input
              type="text"
              className="settings-dialog__input"
              value={imageModelName}
              onChange={(e) => setImageModelName(e.target.value)}
              placeholder="gemini-2.5-flash-image-vip"
            />
          </div>
          <div className="settings-dialog__field">
            <label className="settings-dialog__label">视频模型名称</label>
            <input
              type="text"
              className="settings-dialog__input"
              value={videoModelName}
              onChange={(e) => setVideoModelName(e.target.value)}
              placeholder="veo3"
            />
          </div>
        </div>
        <div className="settings-dialog__actions">
          <button
            className="settings-dialog__button settings-dialog__button--cancel"
            onClick={handleCancel}
          >
            {t('settings.cancel')}
          </button>
          <button
            className="settings-dialog__button settings-dialog__button--save"
            onClick={handleSave}
          >
            {t('settings.save')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};