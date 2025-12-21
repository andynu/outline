<script lang="ts">
  import { settings } from './settings.svelte';
  import { theme, type Theme } from './theme.svelte';
  import { getDataDirectory, setDataDirectory, pickDirectory, type DataDirectoryInfo } from './api';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
  }

  let { isOpen, onClose }: Props = $props();

  // Local state for form values
  let localTheme = $state<Theme>('system');
  let localFontSize = $state(14);
  let localFontFamily = $state('system');
  let localAutoSave = $state(30);
  let localConfirmDelete = $state(true);
  let localStartCollapsed = $state(false);

  // Data directory state
  let dataDir = $state<DataDirectoryInfo | null>(null);
  let dataDirLoading = $state(false);
  let dataDirError = $state('');
  let needsRestart = $state(false);

  // Sync local state when modal opens
  $effect(() => {
    if (isOpen) {
      const s = settings.settings;
      localTheme = s.theme;
      localFontSize = s.fontSize;
      localFontFamily = s.fontFamily;
      localAutoSave = s.autoSaveInterval;
      localConfirmDelete = s.confirmDelete;
      localStartCollapsed = s.startCollapsed;

      // Load data directory info
      loadDataDirectory();
    }
  });

  async function loadDataDirectory() {
    dataDirLoading = true;
    dataDirError = '';
    try {
      dataDir = await getDataDirectory();
    } catch (e) {
      dataDirError = e instanceof Error ? e.message : 'Failed to load';
    } finally {
      dataDirLoading = false;
    }
  }

  async function handleBrowseDataDir() {
    try {
      const selected = await pickDirectory();
      if (selected) {
        dataDirLoading = true;
        dataDirError = '';
        dataDir = await setDataDirectory(selected);
        needsRestart = true;
      }
    } catch (e) {
      dataDirError = e instanceof Error ? e.message : 'Failed to set directory';
    } finally {
      dataDirLoading = false;
    }
  }

  async function handleResetDataDir() {
    try {
      dataDirLoading = true;
      dataDirError = '';
      dataDir = await setDataDirectory(null);
      needsRestart = dataDir?.is_custom === false;
    } catch (e) {
      dataDirError = e instanceof Error ? e.message : 'Failed to reset';
    } finally {
      dataDirLoading = false;
    }
  }

  function handleThemeChange(newTheme: Theme) {
    localTheme = newTheme;
    settings.update({ theme: newTheme });
    theme.setTheme(newTheme);
  }

  function handleFontSizeChange(size: number) {
    localFontSize = size;
    settings.update({ fontSize: size });
  }

  function handleFontFamilyChange(family: string) {
    localFontFamily = family;
    settings.update({ fontFamily: family });
  }

  function handleAutoSaveChange(interval: number) {
    localAutoSave = interval;
    settings.update({ autoSaveInterval: interval });
  }

  function handleConfirmDeleteChange(value: boolean) {
    localConfirmDelete = value;
    settings.update({ confirmDelete: value });
  }

  function handleStartCollapsedChange(value: boolean) {
    localStartCollapsed = value;
    settings.update({ startCollapsed: value });
  }

  function handleReset() {
    settings.reset();
    theme.setTheme('system');
    const s = settings.settings;
    localTheme = s.theme;
    localFontSize = s.fontSize;
    localFontFamily = s.fontFamily;
    localAutoSave = s.autoSaveInterval;
    localConfirmDelete = s.confirmDelete;
    localStartCollapsed = s.startCollapsed;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!isOpen) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={handleBackdropClick}>
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div class="modal-header">
        <h2 id="settings-title">Settings</h2>
        <button class="close-btn" onclick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="modal-content">
        <!-- Appearance Section -->
        <section class="settings-section">
          <h3>Appearance</h3>

          <div class="setting-row">
            <label class="setting-label" for="theme-select">
              <span class="label-text">Theme</span>
              <span class="label-hint">Choose your preferred color scheme</span>
            </label>
            <select
              id="theme-select"
              class="setting-select"
              value={localTheme}
              onchange={(e) => handleThemeChange(e.currentTarget.value as Theme)}
            >
              {#each theme.availableThemes as t}
                <option value={t.id}>{t.name}</option>
              {/each}
            </select>
          </div>

          <div class="setting-row">
            <label class="setting-label" for="font-size">
              <span class="label-text">Font Size</span>
              <span class="label-hint">Base font size for the editor</span>
            </label>
            <select
              id="font-size"
              class="setting-select"
              value={localFontSize}
              onchange={(e) => handleFontSizeChange(parseInt(e.currentTarget.value))}
            >
              {#each settings.fontSizes as size}
                <option value={size}>{size}px</option>
              {/each}
            </select>
          </div>

          <div class="setting-row">
            <label class="setting-label" for="font-family">
              <span class="label-text">Font</span>
              <span class="label-hint">Font family for the editor</span>
            </label>
            <select
              id="font-family"
              class="setting-select"
              value={localFontFamily}
              onchange={(e) => handleFontFamilyChange(e.currentTarget.value)}
            >
              {#each settings.fontFamilies as font}
                <option value={font.value}>{font.label}</option>
              {/each}
            </select>
          </div>
        </section>

        <!-- Behavior Section -->
        <section class="settings-section">
          <h3>Behavior</h3>

          <div class="setting-row">
            <label class="setting-label" for="auto-save">
              <span class="label-text">Auto-save Interval</span>
              <span class="label-hint">How often to automatically save (0 = disabled)</span>
            </label>
            <select
              id="auto-save"
              class="setting-select"
              value={localAutoSave}
              onchange={(e) => handleAutoSaveChange(parseInt(e.currentTarget.value))}
            >
              <option value={0}>Disabled</option>
              <option value={15}>15 seconds</option>
              <option value={30}>30 seconds</option>
              <option value={60}>1 minute</option>
              <option value={300}>5 minutes</option>
            </select>
          </div>

          <div class="setting-row">
            <label class="setting-label setting-toggle">
              <span class="label-content">
                <span class="label-text">Confirm before deleting</span>
                <span class="label-hint">Show confirmation when deleting items</span>
              </span>
              <input
                type="checkbox"
                class="toggle-input"
                checked={localConfirmDelete}
                onchange={(e) => handleConfirmDeleteChange(e.currentTarget.checked)}
              />
              <span class="toggle-slider"></span>
            </label>
          </div>

          <div class="setting-row">
            <label class="setting-label setting-toggle">
              <span class="label-content">
                <span class="label-text">Start collapsed</span>
                <span class="label-hint">Collapse all items when opening a document</span>
              </span>
              <input
                type="checkbox"
                class="toggle-input"
                checked={localStartCollapsed}
                onchange={(e) => handleStartCollapsedChange(e.currentTarget.checked)}
              />
              <span class="toggle-slider"></span>
            </label>
          </div>
        </section>

        <!-- Keyboard Shortcuts Section -->
        <section class="settings-section">
          <h3>Keyboard Shortcuts</h3>
          <p class="section-hint">
            Press <kbd>?</kbd> or <kbd>Ctrl+/</kbd> to view all keyboard shortcuts.
          </p>
        </section>

        <!-- Data Section -->
        <section class="settings-section">
          <h3>Data</h3>
          <div class="setting-row data-dir-row">
            <label class="setting-label">
              <span class="label-text">Data Directory</span>
              <span class="label-hint">Where your documents are stored</span>
            </label>
            <div class="data-dir-controls">
              {#if dataDirLoading}
                <span class="data-dir-loading">Loading...</span>
              {:else if dataDir}
                <code class="data-dir-path" title={dataDir.current}>{dataDir.current}</code>
                <div class="data-dir-buttons">
                  <button
                    class="btn-browse"
                    onclick={handleBrowseDataDir}
                    title="Choose a different directory"
                  >
                    Browse...
                  </button>
                  {#if dataDir.is_custom}
                    <button
                      class="btn-reset-dir"
                      onclick={handleResetDataDir}
                      title="Reset to default directory"
                    >
                      Reset
                    </button>
                  {/if}
                </div>
              {:else}
                <span class="data-dir-error">Unable to load</span>
              {/if}
            </div>
          </div>
          {#if dataDirError}
            <div class="data-dir-error-msg">{dataDirError}</div>
          {/if}
          {#if needsRestart}
            <div class="data-dir-restart-notice">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span>Restart the app to use the new data directory.</span>
            </div>
          {/if}
        </section>
      </div>

      <div class="modal-footer">
        <button class="btn-reset" onclick={handleReset}>
          Reset to Defaults
        </button>
        <button class="btn-close" onclick={onClose}>
          Close
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 60px;
    z-index: 1000;
  }

  .modal {
    background: var(--bg-primary);
    border-radius: 12px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    width: 520px;
    max-width: 90vw;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border-primary);
  }

  .modal-header h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    color: var(--text-secondary);
  }

  .close-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .close-btn svg {
    width: 20px;
    height: 20px;
  }

  .modal-content {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
  }

  .settings-section {
    margin-bottom: 24px;
  }

  .settings-section:last-child {
    margin-bottom: 0;
  }

  .settings-section h3 {
    margin: 0 0 16px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .section-hint {
    margin: 0;
    font-size: 13px;
    color: var(--text-secondary);
  }

  .setting-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 0;
    border-bottom: 1px solid var(--border-secondary);
  }

  .setting-row:last-child {
    border-bottom: none;
  }

  .setting-label {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .label-text {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
  }

  .label-hint {
    font-size: 12px;
    color: var(--text-tertiary);
  }

  .setting-select {
    padding: 8px 12px;
    font-size: 13px;
    border: 1px solid var(--border-primary);
    border-radius: 6px;
    background: var(--bg-secondary);
    color: var(--text-primary);
    cursor: pointer;
    min-width: 140px;
  }

  .setting-select:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  /* Toggle switch */
  .setting-toggle {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    cursor: pointer;
  }

  .label-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .toggle-input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-slider {
    position: relative;
    width: 44px;
    height: 24px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: 12px;
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .toggle-slider::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    background: white;
    border-radius: 50%;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    transition: transform 0.2s;
  }

  .toggle-input:checked + .toggle-slider {
    background: var(--accent-primary);
    border-color: var(--accent-primary);
  }

  .toggle-input:checked + .toggle-slider::after {
    transform: translateX(20px);
  }

  /* Data directory controls */
  .data-dir-row {
    flex-direction: column;
    gap: 12px;
  }

  .data-dir-controls {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
  }

  .data-dir-path {
    padding: 8px 12px;
    font-size: 13px;
    font-family: 'SF Mono', Monaco, monospace;
    background: var(--bg-secondary);
    border: 1px solid var(--border-primary);
    border-radius: 6px;
    color: var(--text-secondary);
    word-break: break-all;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .data-dir-buttons {
    display: flex;
    gap: 8px;
  }

  .btn-browse,
  .btn-reset-dir {
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 500;
    border-radius: 4px;
    cursor: pointer;
    border: 1px solid var(--border-primary);
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .btn-browse:hover,
  .btn-reset-dir:hover {
    background: var(--bg-tertiary);
  }

  .data-dir-loading {
    color: var(--text-tertiary);
    font-size: 13px;
  }

  .data-dir-error {
    color: var(--danger);
    font-size: 13px;
  }

  .data-dir-error-msg {
    color: var(--danger);
    font-size: 12px;
    padding: 8px;
    background: rgba(239, 68, 68, 0.1);
    border-radius: 4px;
    margin-top: 4px;
  }

  .data-dir-restart-notice {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    font-size: 13px;
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid rgba(245, 158, 11, 0.3);
    border-radius: 6px;
    color: var(--warning, #d97706);
    margin-top: 8px;
  }

  .data-dir-restart-notice svg {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  kbd {
    background: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: 4px;
    padding: 2px 6px;
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 11px;
  }

  .modal-footer {
    display: flex;
    justify-content: space-between;
    padding: 12px 20px;
    border-top: 1px solid var(--border-primary);
    background: var(--bg-secondary);
    border-radius: 0 0 12px 12px;
  }

  .btn-reset,
  .btn-close {
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 500;
    border-radius: 6px;
    cursor: pointer;
    border: none;
  }

  .btn-reset {
    background: transparent;
    color: var(--text-secondary);
  }

  .btn-reset:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .btn-close {
    background: var(--accent-primary);
    color: white;
  }

  .btn-close:hover {
    opacity: 0.9;
  }
</style>
