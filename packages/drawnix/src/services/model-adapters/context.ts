import { geminiSettings } from '../../utils/settings-manager';
import type { AdapterContext } from './types';

export const getAdapterContextFromSettings = (): AdapterContext => {
  const settings = geminiSettings.get();
  return {
    baseUrl: settings.baseUrl,
    apiKey: settings.apiKey,
  };
};
