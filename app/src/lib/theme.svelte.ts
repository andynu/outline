/**
 * Theme Store
 *
 * Manages theme state with localStorage persistence
 * and system preference detection.
 *
 * Supports:
 * - 'system' - follows OS preference (light or dark)
 * - 'light' - light NASA theme
 * - 'dark' - dark NASA theme
 * - 'gruvbox-dark' - Gruvbox dark theme
 * - 'gruvbox-light' - Gruvbox light theme
 */

export type Theme = 'light' | 'dark' | 'system' | 'gruvbox-dark' | 'gruvbox-light';

// Themes that are considered "dark" for UI purposes
const DARK_THEMES = ['dark', 'gruvbox-dark'];

// All available themes for cycling
const THEME_ORDER: Theme[] = ['light', 'dark', 'gruvbox-light', 'gruvbox-dark', 'system'];

class ThemeStore {
  private _theme = $state<Theme>('system');
  private _effectiveTheme = $state<Theme>('light');

  constructor() {
    // Will be initialized in init() to support SSR
  }

  init() {
    // Load saved preference
    const saved = localStorage.getItem('outline-theme') as Theme | null;
    if (saved && THEME_ORDER.includes(saved)) {
      this._theme = saved;
    }

    // Set up system preference listener
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', () => this.updateEffectiveTheme());

    // Apply initial theme
    this.updateEffectiveTheme();
  }

  get theme() {
    return this._theme;
  }

  get effectiveTheme() {
    return this._effectiveTheme;
  }

  get isDark() {
    return DARK_THEMES.includes(this._effectiveTheme);
  }

  /** Get display name for the current theme setting */
  get displayName(): string {
    switch (this._theme) {
      case 'system': return 'System';
      case 'light': return 'Light';
      case 'dark': return 'Dark';
      case 'gruvbox-light': return 'Gruvbox Light';
      case 'gruvbox-dark': return 'Gruvbox Dark';
      default: return this._theme;
    }
  }

  /** Get all available themes */
  get availableThemes(): { id: Theme; name: string; isDark: boolean }[] {
    return [
      { id: 'system', name: 'System', isDark: false },
      { id: 'light', name: 'Light', isDark: false },
      { id: 'dark', name: 'Dark', isDark: true },
      { id: 'gruvbox-light', name: 'Gruvbox Light', isDark: false },
      { id: 'gruvbox-dark', name: 'Gruvbox Dark', isDark: true },
    ];
  }

  setTheme(theme: Theme) {
    this._theme = theme;
    localStorage.setItem('outline-theme', theme);
    this.updateEffectiveTheme();
  }

  toggle() {
    // Simple toggle between light and dark
    const newTheme = this.isDark ? 'light' : 'dark';
    this.setTheme(newTheme);
  }

  cycle() {
    // Cycle through all themes
    const currentIndex = THEME_ORDER.indexOf(this._theme);
    const nextIndex = (currentIndex + 1) % THEME_ORDER.length;
    this.setTheme(THEME_ORDER[nextIndex]);
  }

  private updateEffectiveTheme() {
    let effective: Theme;

    if (this._theme === 'system') {
      effective = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } else {
      effective = this._theme;
    }

    this._effectiveTheme = effective;

    // Apply to document - use the effective theme as data-theme attribute
    if (effective === 'light') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', effective);
    }
  }
}

export const theme = new ThemeStore();
