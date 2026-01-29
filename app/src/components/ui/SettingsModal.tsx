import React, { useState, useEffect, useCallback } from 'react';
import {
  useSettingsStore,
  SEARCH_ENGINES,
  FONT_FAMILIES,
  FONT_SIZES,
  AUTO_SAVE_OPTIONS,
  AVAILABLE_THEMES,
  type Theme,
} from '../../store/settingsStore';
import * as api from '../../lib/api';
import type { DataDirectoryInfo } from '../../lib/api';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenShortcuts?: () => void;
}

export function SettingsModal({ isOpen, onClose, onOpenShortcuts }: SettingsModalProps) {
  // Settings store
  const settings = useSettingsStore();
  const updateSettings = useSettingsStore(state => state.updateSettings);
  const resetSettings = useSettingsStore(state => state.resetSettings);

  // Local state for form values
  const [localTheme, setLocalTheme] = useState<Theme>(settings.theme);
  const [localFontSize, setLocalFontSize] = useState(settings.fontSize);
  const [localFontFamily, setLocalFontFamily] = useState(settings.fontFamily);
  const [localAutoSave, setLocalAutoSave] = useState(settings.autoSaveInterval);
  const [localConfirmDelete, setLocalConfirmDelete] = useState(settings.confirmDelete);
  const [localStartCollapsed, setLocalStartCollapsed] = useState(settings.startCollapsed);
  const [localSearchEngine, setLocalSearchEngine] = useState(settings.searchEngine);
  const [localSearchEngineUrl, setLocalSearchEngineUrl] = useState(settings.searchEngineUrl);

  // Data directory state
  const [dataDir, setDataDir] = useState<DataDirectoryInfo | null>(null);
  const [dataDirLoading, setDataDirLoading] = useState(false);
  const [dataDirError, setDataDirError] = useState('');
  const [needsRestart, setNeedsRestart] = useState(false);

  // Sync local state when modal opens
  useEffect(() => {
    if (isOpen) {
      setLocalTheme(settings.theme);
      setLocalFontSize(settings.fontSize);
      setLocalFontFamily(settings.fontFamily);
      setLocalAutoSave(settings.autoSaveInterval);
      setLocalConfirmDelete(settings.confirmDelete);
      setLocalStartCollapsed(settings.startCollapsed);
      setLocalSearchEngine(settings.searchEngine);
      setLocalSearchEngineUrl(settings.searchEngineUrl);

      // Load data directory info
      loadDataDirectory();
    }
  }, [isOpen, settings]);

  async function loadDataDirectory() {
    setDataDirLoading(true);
    setDataDirError('');
    try {
      const info = await api.getDataDirectory();
      setDataDir(info);
    } catch (e) {
      setDataDirError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setDataDirLoading(false);
    }
  }

  async function handleBrowseDataDir() {
    try {
      const selected = await api.pickDirectory();
      if (selected) {
        setDataDirLoading(true);
        setDataDirError('');
        const info = await api.setDataDirectory(selected);
        setDataDir(info);
        setNeedsRestart(true);
      }
    } catch (e) {
      setDataDirError(e instanceof Error ? e.message : 'Failed to set directory');
    } finally {
      setDataDirLoading(false);
    }
  }

  async function handleResetDataDir() {
    try {
      setDataDirLoading(true);
      setDataDirError('');
      const info = await api.setDataDirectory(null);
      setDataDir(info);
      setNeedsRestart(info?.is_custom === false);
    } catch (e) {
      setDataDirError(e instanceof Error ? e.message : 'Failed to reset');
    } finally {
      setDataDirLoading(false);
    }
  }

  function handleThemeChange(newTheme: Theme) {
    setLocalTheme(newTheme);
    updateSettings({ theme: newTheme });
  }

  function handleFontSizeChange(size: number) {
    setLocalFontSize(size);
    updateSettings({ fontSize: size });
  }

  function handleFontFamilyChange(family: string) {
    setLocalFontFamily(family);
    updateSettings({ fontFamily: family });
  }

  function handleAutoSaveChange(interval: number) {
    setLocalAutoSave(interval);
    updateSettings({ autoSaveInterval: interval });
  }

  function handleConfirmDeleteChange(value: boolean) {
    setLocalConfirmDelete(value);
    updateSettings({ confirmDelete: value });
  }

  function handleStartCollapsedChange(value: boolean) {
    setLocalStartCollapsed(value);
    updateSettings({ startCollapsed: value });
  }

  function handleSearchEngineChange(engine: string) {
    setLocalSearchEngine(engine);
    updateSettings({ searchEngine: engine });
  }

  function handleSearchEngineUrlChange(url: string) {
    setLocalSearchEngineUrl(url);
    updateSettings({ searchEngineUrl: url });
  }

  function handleReset() {
    resetSettings();
    setLocalTheme('system');
    setLocalFontSize(14);
    setLocalFontFamily('system');
    setLocalAutoSave(30);
    setLocalConfirmDelete(true);
    setLocalStartCollapsed(false);
    setLocalSearchEngine('duckduckgo');
    setLocalSearchEngineUrl('');
  }

  // Keyboard handler for escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [isOpen, onClose]);

  const handleBackdropClick = useCallback((event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }, [onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="modal-header">
          <h2 id="settings-title">Settings</h2>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="modal-content">
          {/* Appearance Section */}
          <section className="settings-section">
            <h3>Appearance</h3>

            <div className="setting-row">
              <label className="setting-label" htmlFor="theme-select">
                <span className="label-text">Theme</span>
                <span className="label-hint">Choose your preferred color scheme</span>
              </label>
              <select
                id="theme-select"
                className="setting-select"
                value={localTheme}
                onChange={(e) => handleThemeChange(e.target.value as Theme)}
              >
                {AVAILABLE_THEMES.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div className="setting-row">
              <label className="setting-label" htmlFor="font-size">
                <span className="label-text">Font Size</span>
                <span className="label-hint">Base font size for the editor</span>
              </label>
              <select
                id="font-size"
                className="setting-select"
                value={localFontSize}
                onChange={(e) => handleFontSizeChange(parseInt(e.target.value))}
              >
                {FONT_SIZES.map(size => (
                  <option key={size} value={size}>{size}px</option>
                ))}
              </select>
            </div>

            <div className="setting-row">
              <label className="setting-label" htmlFor="font-family">
                <span className="label-text">Font</span>
                <span className="label-hint">Font family for the editor</span>
              </label>
              <select
                id="font-family"
                className="setting-select"
                value={localFontFamily}
                onChange={(e) => handleFontFamilyChange(e.target.value)}
              >
                {FONT_FAMILIES.map(font => (
                  <option key={font.value} value={font.value}>{font.label}</option>
                ))}
              </select>
            </div>
          </section>

          {/* Behavior Section */}
          <section className="settings-section">
            <h3>Behavior</h3>

            <div className="setting-row">
              <label className="setting-label" htmlFor="auto-save">
                <span className="label-text">Auto-save Interval</span>
                <span className="label-hint">How often to automatically save (0 = disabled)</span>
              </label>
              <select
                id="auto-save"
                className="setting-select"
                value={localAutoSave}
                onChange={(e) => handleAutoSaveChange(parseInt(e.target.value))}
              >
                {AUTO_SAVE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="setting-row">
              <label className="setting-label setting-toggle">
                <span className="label-content">
                  <span className="label-text">Confirm before deleting</span>
                  <span className="label-hint">Show confirmation when deleting items</span>
                </span>
                <input
                  type="checkbox"
                  className="toggle-input"
                  checked={localConfirmDelete}
                  onChange={(e) => handleConfirmDeleteChange(e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            <div className="setting-row">
              <label className="setting-label setting-toggle">
                <span className="label-content">
                  <span className="label-text">Start collapsed</span>
                  <span className="label-hint">Collapse all items when opening a document</span>
                </span>
                <input
                  type="checkbox"
                  className="toggle-input"
                  checked={localStartCollapsed}
                  onChange={(e) => handleStartCollapsedChange(e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
          </section>

          {/* Web Search Section */}
          <section className="settings-section">
            <h3>Web Search</h3>

            <div className="setting-row">
              <label className="setting-label" htmlFor="search-engine">
                <span className="label-text">Search Engine</span>
                <span className="label-hint">Used when searching from context menu</span>
              </label>
              <select
                id="search-engine"
                className="setting-select"
                value={localSearchEngine}
                onChange={(e) => handleSearchEngineChange(e.target.value)}
              >
                {SEARCH_ENGINES.map(engine => (
                  <option key={engine.value} value={engine.value}>{engine.label}</option>
                ))}
              </select>
            </div>

            {localSearchEngine === 'custom' && (
              <div className="setting-row">
                <label className="setting-label" htmlFor="search-url">
                  <span className="label-text">Custom Search URL</span>
                  <span className="label-hint">Use %s as placeholder for the search query</span>
                </label>
                <input
                  id="search-url"
                  type="text"
                  className="setting-input"
                  placeholder="https://example.com/search?q=%s"
                  value={localSearchEngineUrl}
                  onChange={(e) => handleSearchEngineUrlChange(e.target.value)}
                />
              </div>
            )}
          </section>

          {/* Keyboard Shortcuts Section */}
          <section className="settings-section">
            <h3>Keyboard Shortcuts</h3>
            <p className="section-hint">
              Press <kbd>?</kbd> or <kbd>Ctrl+/</kbd> to view all keyboard shortcuts.
              {onOpenShortcuts && (
                <button className="link-btn" onClick={() => { onClose(); onOpenShortcuts(); }}>
                  Open shortcuts
                </button>
              )}
            </p>
          </section>

          {/* Data Section */}
          <section className="settings-section">
            <h3>Data</h3>
            <div className="setting-row data-dir-row">
              <label className="setting-label">
                <span className="label-text">Data Directory</span>
                <span className="label-hint">Where your documents are stored</span>
              </label>
              <div className="data-dir-controls">
                {dataDirLoading ? (
                  <span className="data-dir-loading">Loading...</span>
                ) : dataDir ? (
                  <>
                    <code className="data-dir-path" title={dataDir.current}>{dataDir.current}</code>
                    <div className="data-dir-buttons">
                      <button
                        className="btn-browse"
                        onClick={handleBrowseDataDir}
                        title="Choose a different directory"
                      >
                        Browse...
                      </button>
                      {dataDir.is_custom && (
                        <button
                          className="btn-reset-dir"
                          onClick={handleResetDataDir}
                          title="Reset to default directory"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <span className="data-dir-error">Unable to load</span>
                )}
              </div>
            </div>
            {dataDirError && (
              <div className="data-dir-error-msg">{dataDirError}</div>
            )}
            {needsRestart && (
              <div className="data-dir-restart-notice">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>Restart the app to use the new data directory.</span>
              </div>
            )}
          </section>
        </div>

        <div className="modal-footer">
          <button className="btn-reset" onClick={handleReset}>
            Reset to Defaults
          </button>
          <button className="btn-close" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;
