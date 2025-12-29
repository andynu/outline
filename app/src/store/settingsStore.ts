/**
 * Settings Store for React
 *
 * Manages application settings with localStorage persistence.
 */

import { create } from 'zustand';

// Types
export type Theme = 'light' | 'dark' | 'system' | 'gruvbox-dark' | 'gruvbox-light';

export interface Settings {
  // Appearance
  theme: Theme;
  fontSize: number;
  fontFamily: string;

  // Behavior
  autoSaveInterval: number;  // seconds, 0 = disabled
  confirmDelete: boolean;
  startCollapsed: boolean;

  // Data
  dataDirectory: string;  // Read-only display of data location

  // Web Search
  searchEngine: string;  // Search engine preset or 'custom'
  searchEngineUrl: string;  // Custom URL template with %s placeholder
}

export interface SettingsStore extends Settings {
  // Actions
  updateSettings: (partial: Partial<Settings>) => void;
  resetSettings: () => void;
  getSearchUrl: () => string;
  buildSearchUrl: (query: string) => string;
  applySettings: () => void;
}

// Constants
export const SEARCH_ENGINES = [
  { value: 'duckduckgo', label: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
  { value: 'google', label: 'Google', url: 'https://www.google.com/search?q=%s' },
  { value: 'bing', label: 'Bing', url: 'https://www.bing.com/search?q=%s' },
  { value: 'kagi', label: 'Kagi', url: 'https://kagi.com/search?q=%s' },
  { value: 'brave', label: 'Brave', url: 'https://search.brave.com/search?q=%s' },
  { value: 'custom', label: 'Custom...', url: '' },
];

export const FONT_FAMILIES = [
  { value: 'system', label: 'System Default' },
  { value: 'inter', label: 'Inter' },
  { value: 'roboto', label: 'Roboto' },
  { value: 'source-sans', label: 'Source Sans Pro' },
  { value: 'jetbrains-mono', label: 'JetBrains Mono' },
  { value: 'fira-code', label: 'Fira Code' },
];

export const FONT_SIZES = [12, 13, 14, 15, 16, 18, 20];

export const AUTO_SAVE_OPTIONS = [
  { value: 0, label: 'Disabled' },
  { value: 15, label: '15 seconds' },
  { value: 30, label: '30 seconds' },
  { value: 60, label: '1 minute' },
  { value: 300, label: '5 minutes' },
];

export const AVAILABLE_THEMES = [
  { id: 'system' as Theme, name: 'System', isDark: false },
  { id: 'light' as Theme, name: 'Light', isDark: false },
  { id: 'dark' as Theme, name: 'Dark', isDark: true },
  { id: 'gruvbox-light' as Theme, name: 'Gruvbox Light', isDark: false },
  { id: 'gruvbox-dark' as Theme, name: 'Gruvbox Dark', isDark: true },
];

const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  fontSize: 14,
  fontFamily: 'system',
  autoSaveInterval: 30,
  confirmDelete: true,
  startCollapsed: false,
  dataDirectory: '~/.outline-data',
  searchEngine: 'duckduckgo',
  searchEngineUrl: '',
};

const STORAGE_KEY = 'outline-settings';

// Apply settings to DOM
function applySettingsToDOM(settings: Settings) {
  const root = document.documentElement;

  // Apply font size
  root.style.setProperty('--base-font-size', `${settings.fontSize}px`);

  // Apply font family
  let fontStack: string;
  switch (settings.fontFamily) {
    case 'inter':
      fontStack = 'Inter, system-ui, sans-serif';
      break;
    case 'roboto':
      fontStack = 'Roboto, system-ui, sans-serif';
      break;
    case 'source-sans':
      fontStack = '"Source Sans Pro", system-ui, sans-serif';
      break;
    case 'jetbrains-mono':
      fontStack = '"JetBrains Mono", ui-monospace, monospace';
      break;
    case 'fira-code':
      fontStack = '"Fira Code", ui-monospace, monospace';
      break;
    default:
      fontStack = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  }
  root.style.setProperty('--font-family', fontStack);

  // Apply theme
  applyTheme(settings.theme);
}

// Apply theme to DOM
function applyTheme(theme: Theme) {
  let effectiveTheme: Theme = theme;

  if (theme === 'system') {
    effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  // Apply to document - use the effective theme as data-theme attribute
  if (effectiveTheme === 'light') {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.classList.remove('dark');
  } else {
    document.documentElement.setAttribute('data-theme', effectiveTheme);
    if (effectiveTheme === 'dark' || effectiveTheme === 'gruvbox-dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }
}

// Load settings from localStorage
function loadSettings(): Settings {
  if (typeof localStorage === 'undefined') return DEFAULT_SETTINGS;

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch {
    // Invalid JSON, use defaults
  }
  return DEFAULT_SETTINGS;
}

// Save settings to localStorage
function saveSettings(settings: Settings) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export const useSettingsStore = create<SettingsStore>((set, get) => {
  // Load initial settings
  const initial = loadSettings();

  // Apply initial settings after a tick (to ensure DOM is ready)
  if (typeof window !== 'undefined') {
    setTimeout(() => applySettingsToDOM(initial), 0);

    // Set up system preference listener
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', () => {
      const { theme } = get();
      if (theme === 'system') {
        applyTheme(theme);
      }
    });
  }

  return {
    ...initial,

    updateSettings: (partial) => {
      set(state => {
        const newSettings = { ...state, ...partial };
        saveSettings(newSettings);
        applySettingsToDOM(newSettings);
        return newSettings;
      });
    },

    resetSettings: () => {
      set(() => {
        saveSettings(DEFAULT_SETTINGS);
        applySettingsToDOM(DEFAULT_SETTINGS);
        return DEFAULT_SETTINGS;
      });
    },

    getSearchUrl: () => {
      const { searchEngine, searchEngineUrl } = get();
      if (searchEngine === 'custom') {
        return searchEngineUrl;
      }
      const engine = SEARCH_ENGINES.find(e => e.value === searchEngine);
      return engine?.url || SEARCH_ENGINES[0].url;
    },

    buildSearchUrl: (query: string) => {
      const template = get().getSearchUrl();
      return template.replace('%s', encodeURIComponent(query));
    },

    applySettings: () => {
      applySettingsToDOM(get());
    },
  };
});
