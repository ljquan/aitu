export { GenerationHistory } from './generation-history';
export type { 
  BaseHistoryItem, 
  ImageHistoryItem, 
  VideoHistoryItem, 
  HistoryItem,
  GenerationHistoryProps 
} from './generation-history';
export {
  saveToHistory,
  loadHistory,
  saveImageToHistory,
  saveVideoToHistory,
  loadImageHistory,
  loadVideoHistory,
  generateHistoryId,
  extractUserPromptsFromHistory,
  IMAGE_HISTORY_CACHE_KEY,
  VIDEO_HISTORY_CACHE_KEY
} from './history-manager';