import { Dialog, DialogContent } from '../dialog/dialog';
import { useDrawnix } from '../../hooks/use-drawnix';
import './settings-dialog.scss';
import { useI18n } from '../../i18n';
import { useState, useEffect } from 'react';
import { geminiSettings } from '../../utils/settings-manager';
import { Tooltip } from 'tdesign-react';
import { InfoCircleIcon } from 'tdesign-icons-react';
import { ModelDropdown } from '../ai-input-bar/ModelDropdown';
import {
  IMAGE_MODEL_GROUPED_SELECT_OPTIONS,
  VIDEO_MODEL_SELECT_OPTIONS,
  TEXT_MODEL_SELECT_OPTIONS,
  getDefaultImageModel,
  DEFAULT_VIDEO_MODEL,
  DEFAULT_TEXT_MODEL,
  VIDEO_MODELS,
  TEXT_MODELS,
} from '../../constants/model-config';

// 为了向后兼容，重新导出这些常量
export { IMAGE_MODEL_GROUPED_SELECT_OPTIONS as IMAGE_MODEL_GROUPED_OPTIONS } from '../../constants/model-config';
export { VIDEO_MODEL_SELECT_OPTIONS as VIDEO_MODEL_OPTIONS } from '../../constants/model-config';

export const SettingsDialog = ({
  container,
}: {
  container: HTMLElement | null;
}) => {
  const { appState, setAppState } = useDrawnix();
  const { t, language } = useI18n();
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [imageModelName, setImageModelName] = useState('');
  const [videoModelName, setVideoModelName] = useState('');
  const [textModelName, setTextModelName] = useState('');

  // 加载当前配置
  useEffect(() => {
    if (appState.openSettings) {
      const config = geminiSettings.get();
      setApiKey(config.apiKey || '');
      setBaseUrl(config.baseUrl || 'https://api.tu-zi.com/v1');
      setImageModelName(config.imageModelName || getDefaultImageModel());
      setVideoModelName(config.videoModelName || DEFAULT_VIDEO_MODEL);
      setTextModelName(config.textModelName || DEFAULT_TEXT_MODEL);
    }
  }, [appState.openSettings]);

  const handleSave = () => {
    // 使用全局设置管理器更新配置
    geminiSettings.update({
      apiKey: apiKey.trim(),
      baseUrl: baseUrl.trim() || 'https://api.tu-zi.com/v1',
      imageModelName: imageModelName.trim() || getDefaultImageModel(),
      videoModelName: videoModelName.trim() || DEFAULT_VIDEO_MODEL,
      textModelName: textModelName.trim() || DEFAULT_TEXT_MODEL,
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
      <DialogContent className="settings-dialog" container={container} data-testid="settings-dialog">
        <h2 className="settings-dialog__title">{t('settings.title')}</h2>
        <form className="settings-dialog__form" onSubmit={(e) => e.preventDefault()}>
          <div className="settings-dialog__field">
            <div className="settings-dialog__label-with-tooltip">
              <label className="settings-dialog__label" htmlFor="apiKeyInput">
                API Key
              </label>
              <Tooltip
                content={
                  <div>
                    您可以从以下地址获取 API Key:
                    <br />
                    <a
                      href="https://api.tu-zi.com/token"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#F39C12', textDecoration: 'none' }}
                    >
                      api.tu-zi.com/token
                    </a>
                  </div>
                }
                placement="top"
                theme="light"
                showArrow={false}
              >
                <InfoCircleIcon className="settings-dialog__tooltip-icon" />
              </Tooltip>
            </div>
            <input
              type="password"
              id="apiKeyInput"
              className="settings-dialog__input"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={t('settings.apiKeyPlaceholder')}
              autoComplete="off"
            />
          </div>
          <div className="settings-dialog__field">
            <label className="settings-dialog__label">Base URL</label>
            <input
              type="text"
              className="settings-dialog__input"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.tu-zi.com/v1"
            />
          </div>
          <div className="settings-dialog__field">
            <div className="settings-dialog__label-with-tooltip">
              <label className="settings-dialog__label">图片模型</label>
              <Tooltip
                content="图片生成使用接口 /v1/images/generations"
                placement="top"
                theme="light"
                showArrow={false}
              >
                <InfoCircleIcon className="settings-dialog__tooltip-icon" />
              </Tooltip>
            </div>
            <div className="settings-dialog__model-dropdown-container">
              <ModelDropdown
                selectedModel={imageModelName}
                onSelect={(value) => setImageModelName(value)}
                language={language}
                placement="down"
                variant="form"
              />
            </div>
          </div>
          <div className="settings-dialog__field">
            <div className="settings-dialog__label-with-tooltip">
              <label className="settings-dialog__label">视频模型</label>
              <Tooltip
                content="视频生成使用接口 /v1/videos"
                placement="top"
                theme="light"
                showArrow={false}
              >
                <InfoCircleIcon className="settings-dialog__tooltip-icon" />
              </Tooltip>
            </div>
            <div className="settings-dialog__model-dropdown-container">
              <ModelDropdown
                selectedModel={videoModelName}
                onSelect={(value) => setVideoModelName(value)}
                language={language}
                models={VIDEO_MODELS}
                placement="down"
                variant="form"
              />
            </div>
          </div>
          <div className="settings-dialog__field">
            <div className="settings-dialog__label-with-tooltip">
              <label className="settings-dialog__label">文本模型</label>
              <Tooltip
                content="Agent 模式使用，接口 /v1/chat/completions"
                placement="top"
                theme="light"
                showArrow={false}
              >
                <InfoCircleIcon className="settings-dialog__tooltip-icon" />
              </Tooltip>
            </div>
            <div className="settings-dialog__model-dropdown-container">
              <ModelDropdown
                selectedModel={textModelName}
                onSelect={(value) => setTextModelName(value)}
                language={language}
                models={TEXT_MODELS}
                placement="down"
                variant="form"
              />
            </div>
          </div>
        </form>
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
