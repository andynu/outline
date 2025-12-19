/**
 * Theme Store
 *
 * Manages theme state (light/dark) with localStorage persistence
 * and system preference detection.
 */

type Theme = 'light' | 'dark' | 'system';

class ThemeStore {
  private _theme = $state<Theme>('system');
  private _effectiveTheme = $state<'light' | 'dark'>('light');

  constructor() {
    // Will be initialized in init() to support SSR
  }

  init() {
    // Load saved preference
    const saved = localStorage.getItem('outline-theme') as Theme | null;
    if (saved && ['light', 'dark', 'system'].includes(saved)) {
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
    return this._effectiveTheme === 'dark';
  }

  setTheme(theme: Theme) {
    this._theme = theme;
    localStorage.setItem('outline-theme', theme);
    this.updateEffectiveTheme();
  }

  toggle() {
    // Simple toggle between light and dark
    const newTheme = this._effectiveTheme === 'dark' ? 'light' : 'dark';
    this.setTheme(newTheme);
  }

  cycle() {
    // Cycle through: light -> dark -> system -> light
    const order: Theme[] = ['light', 'dark', 'system'];
    const currentIndex = order.indexOf(this._theme);
    const nextIndex = (currentIndex + 1) % order.length;
    this.setTheme(order[nextIndex]);
  }

  private updateEffectiveTheme() {
    let effective: 'light' | 'dark';

    if (this._theme === 'system') {
      effective = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } else {
      effective = this._theme;
    }

    this._effectiveTheme = effective;

    // Apply to document
    if (effective === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }
}

export const theme = new ThemeStore();
