/**
 * SW Debug Panel - Theme and Settings
 * 主题切换和设置管理模块
 */

import { state, elements } from './state.js';

// Forward declarations - will be set by app.js
let renderLogs = null;

/**
 * Set callbacks from app.js
 */
export function setThemeSettingsCallbacks(callbacks) {
  renderLogs = callbacks.renderLogs;
}

/**
 * Toggle theme between light and dark
 */
export function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  updateThemeIcon(newTheme);
  saveTheme(newTheme);
}

/**
 * Update theme icon (SVG)
 */
export function updateThemeIcon(theme) {
  if (elements.themeIcon) {
    if (theme === 'dark') {
      // Sun icon for dark mode (click to switch to light)
      elements.themeIcon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
    } else {
      // Moon icon for light mode (click to switch to dark)
      elements.themeIcon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
    }
  }
}

/**
 * Save theme preference
 */
function saveTheme(theme) {
  try {
    localStorage.setItem('sw-debug-theme', theme);
  } catch (e) {
    console.error('Failed to save theme:', e);
  }
}

/**
 * Load saved theme preference
 */
export function loadTheme() {
  try {
    const savedTheme = localStorage.getItem('sw-debug-theme');
    // Also check system preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = savedTheme || (prefersDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeIcon(theme);
  } catch (e) {
    console.error('Failed to load theme:', e);
  }
}

/**
 * Show settings modal
 */
export function showSettingsModal() {
  if (elements.settingsModalOverlay) {
    // Populate current values
    if (elements.settingMaxLogs) {
      elements.settingMaxLogs.value = state.settings.maxLogs.toString();
    }
    if (elements.settingAutoClean) {
      elements.settingAutoClean.value = state.settings.autoCleanMinutes.toString();
    }
    if (elements.settingKeepBookmarks) {
      elements.settingKeepBookmarks.checked = state.settings.keepBookmarks;
    }
    elements.settingsModalOverlay.style.display = 'flex';
  }
}

/**
 * Close settings modal
 */
export function closeSettingsModal() {
  if (elements.settingsModalOverlay) {
    elements.settingsModalOverlay.style.display = 'none';
  }
}

/**
 * Save settings
 */
export function saveSettings() {
  const newSettings = {
    maxLogs: parseInt(elements.settingMaxLogs?.value || '500'),
    autoCleanMinutes: parseInt(elements.settingAutoClean?.value || '0'),
    keepBookmarks: elements.settingKeepBookmarks?.checked ?? true,
  };
  
  state.settings = newSettings;
  
  // Save to localStorage
  try {
    localStorage.setItem('sw-debug-settings', JSON.stringify(newSettings));
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
  
  // Apply new max logs limit
  applyMaxLogsLimit();
  
  // Setup auto clean timer
  setupAutoCleanTimer();
  
  closeSettingsModal();
}

/**
 * Load saved settings
 */
export function loadSettings() {
  try {
    const saved = localStorage.getItem('sw-debug-settings');
    if (saved) {
      state.settings = { ...state.settings, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
  
  // Setup auto clean timer based on saved settings
  setupAutoCleanTimer();
}

/**
 * Apply max logs limit to current logs
 */
function applyMaxLogsLimit() {
  const maxLogs = state.settings.maxLogs;
  
  if (state.logs.length > maxLogs) {
    // Keep bookmarked logs if setting is enabled
    if (state.settings.keepBookmarks) {
      const bookmarked = state.logs.filter(l => state.bookmarkedLogIds.has(l.id));
      const nonBookmarked = state.logs.filter(l => !state.bookmarkedLogIds.has(l.id));
      state.logs = [...bookmarked, ...nonBookmarked.slice(0, maxLogs - bookmarked.length)];
    } else {
      state.logs = state.logs.slice(0, maxLogs);
    }
    if (renderLogs) renderLogs();
  }
}

/**
 * Setup auto clean timer
 */
export function setupAutoCleanTimer() {
  // Clear existing timer
  if (state.autoCleanTimerId) {
    clearInterval(state.autoCleanTimerId);
    state.autoCleanTimerId = null;
  }
  
  const minutes = state.settings.autoCleanMinutes;
  if (minutes <= 0) return;
  
  // Run cleanup every minute
  state.autoCleanTimerId = setInterval(() => {
    autoCleanLogs();
  }, 60000);
  
  // Also run immediately
  autoCleanLogs();
}

/**
 * Auto clean old logs
 */
function autoCleanLogs() {
  const minutes = state.settings.autoCleanMinutes;
  if (minutes <= 0) return;
  
  const cutoffTime = Date.now() - (minutes * 60 * 1000);
  const beforeCount = state.logs.length;
  
  if (state.settings.keepBookmarks) {
    state.logs = state.logs.filter(l => 
      l.timestamp >= cutoffTime || state.bookmarkedLogIds.has(l.id)
    );
  } else {
    state.logs = state.logs.filter(l => l.timestamp >= cutoffTime);
  }
  
  if (state.logs.length !== beforeCount) {
    if (renderLogs) renderLogs();
  }
}

/**
 * Show shortcuts modal
 */
export function showShortcutsModal() {
  if (elements.shortcutsModalOverlay) {
    elements.shortcutsModalOverlay.style.display = 'flex';
  }
}

/**
 * Close shortcuts modal
 */
export function closeShortcutsModal() {
  if (elements.shortcutsModalOverlay) {
    elements.shortcutsModalOverlay.style.display = 'none';
  }
}
