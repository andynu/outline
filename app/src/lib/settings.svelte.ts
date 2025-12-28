/**
 * Settings Store
 *
 * Manages application settings with localStorage persistence.
 */

import type { Theme } from './theme.svelte';

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

export const SEARCH_ENGINES = [
  { value: 'duckduckgo', label: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
  { value: 'google', label: 'Google', url: 'https://www.google.com/search?q=%s' },
  { value: 'bing', label: 'Bing', url: 'https://www.bing.com/search?q=%s' },
  { value: 'kagi', label: 'Kagi', url: 'https://kagi.com/search?q=%s' },
  { value: 'brave', label: 'Brave', url: 'https://search.brave.com/search?q=%s' },
  { value: 'custom', label: 'Custom...', url: '' },
];

const FONT_FAMILIES = [
  { value: 'system', label: 'System Default' },
  { value: 'inter', label: 'Inter' },
  { value: 'roboto', label: 'Roboto' },
  { value: 'source-sans', label: 'Source Sans Pro' },
  { value: 'jetbrains-mono', label: 'JetBrains Mono' },
  { value: 'fira-code', label: 'Fira Code' },
];

const FONT_SIZES = [12, 13, 14, 15, 16, 18, 20];

class SettingsStore {
  private _settings = $state<Settings>({ ...DEFAULT_SETTINGS });
  private _initialized = false;

  constructor() {
    // Will be initialized in init() to support SSR
  }

  init() {
    if (this._initialized) return;
    this._initialized = true;

    // Load saved settings
    const saved = localStorage.getItem('outline-settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        this._settings = { ...DEFAULT_SETTINGS, ...parsed };
      } catch {
        // Invalid JSON, use defaults
      }
    }

    // Apply settings
    this.applySettings();
  }

  get settings(): Settings {
    return this._settings;
  }

  get fontFamilies() {
    return FONT_FAMILIES;
  }

  get fontSizes() {
    return FONT_SIZES;
  }

  get searchEngines() {
    return SEARCH_ENGINES;
  }

  /**
   * Get the search URL template for the current search engine setting.
   * Returns the URL template with %s as placeholder for the query.
   */
  getSearchUrl(): string {
    if (this._settings.searchEngine === 'custom') {
      return this._settings.searchEngineUrl;
    }
    const engine = SEARCH_ENGINES.find(e => e.value === this._settings.searchEngine);
    return engine?.url || SEARCH_ENGINES[0].url;
  }

  /**
   * Build a search URL for the given query text.
   */
  buildSearchUrl(query: string): string {
    const template = this.getSearchUrl();
    return template.replace('%s', encodeURIComponent(query));
  }

  update(partial: Partial<Settings>) {
    this._settings = { ...this._settings, ...partial };
    this.save();
    this.applySettings();
  }

  reset() {
    this._settings = { ...DEFAULT_SETTINGS };
    this.save();
    this.applySettings();
  }

  private save() {
    localStorage.setItem('outline-settings', JSON.stringify(this._settings));
  }

  private applySettings() {
    const root = document.documentElement;

    // Apply font size
    root.style.setProperty('--base-font-size', `${this._settings.fontSize}px`);

    // Apply font family
    let fontStack: string;
    switch (this._settings.fontFamily) {
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
  }
}

export const settings = new SettingsStore();
