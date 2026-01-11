<script lang="ts">
  interface Props {
    isOpen: boolean;
    onClose: () => void;
  }

  let { isOpen, onClose }: Props = $props();

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
    <div class="modal">
      <div class="modal-header">
        <h2>Keyboard Shortcuts</h2>
        <button class="close-btn" onclick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="shortcut-grid">
        <div class="shortcut-group">
          <h4>Application</h4>
          <ul>
            <li><kbd>Ctrl+S</kbd> Save</li>
            <li><kbd>Ctrl+Z</kbd> Undo</li>
            <li><kbd>Ctrl+Y</kbd> Redo</li>
            <li><kbd>Ctrl+Shift+E</kbd> Export</li>
            <li><kbd>Ctrl+Q</kbd> Quit</li>
            <li><kbd>Ctrl+/</kbd> This help</li>
            <li><kbd>Ctrl+,</kbd> Settings</li>
          </ul>
        </div>
        <div class="shortcut-group">
          <h4>Editing</h4>
          <ul>
            <li><kbd>Enter</kbd> New sibling</li>
            <li><kbd>Shift+Enter</kbd> Edit note</li>
            <li><kbd>Tab</kbd> Indent</li>
            <li><kbd>Shift+Tab</kbd> Outdent</li>
            <li><kbd>Ctrl+Shift+Backspace</kbd> Delete</li>
          </ul>
        </div>
        <div class="shortcut-group">
          <h4>Navigation</h4>
          <ul>
            <li><kbd>↑</kbd> / <kbd>↓</kbd> Move focus</li>
            <li><kbd>Shift+↑</kbd> Move up</li>
            <li><kbd>Shift+↓</kbd> Move down</li>
            <li><kbd>Ctrl+Home</kbd> First item</li>
            <li><kbd>Ctrl+End</kbd> Last item</li>
            <li><kbd>Alt+H</kbd> Go to parent</li>
            <li><kbd>Alt+L</kbd> Go to child</li>
            <li><kbd>Alt+K</kbd> Prev sibling</li>
            <li><kbd>Alt+J</kbd> Next sibling</li>
            <li><kbd>Ctrl+O</kbd> Go to document</li>
            <li><kbd>Ctrl+Shift+O</kbd> Go to item</li>
            <li><kbd>Ctrl+Shift+M</kbd> Move item to...</li>
          </ul>
        </div>
        <div class="shortcut-group">
          <h4>Search & View</h4>
          <ul>
            <li><kbd>Ctrl+F</kbd> Search document</li>
            <li><kbd>Ctrl+Shift+F</kbd> Global search</li>
            <li><kbd>Ctrl+I</kbd> Inbox</li>
            <li><kbd>Ctrl+Shift+H</kbd> Hide completed</li>
            <li><kbd>Ctrl+Shift+#</kbd> Tags panel</li>
            <li><kbd>Ctrl+Shift+G</kbd> Web search</li>
          </ul>
        </div>
        <div class="shortcut-group">
          <h4>View</h4>
          <ul>
            <li><kbd>Ctrl+.</kbd> Toggle collapse</li>
            <li><kbd>Ctrl+Shift+.</kbd> Collapse all</li>
            <li><kbd>Ctrl+Shift+,</kbd> Expand all</li>
            <li><kbd>Ctrl+]</kbd> Zoom into</li>
            <li><kbd>Ctrl+[</kbd> Zoom out</li>
          </ul>
        </div>
        <div class="shortcut-group">
          <h4>Tasks & Dates</h4>
          <ul>
            <li><kbd>Ctrl+Shift+X</kbd> Toggle checkbox</li>
            <li><kbd>Ctrl+Enter</kbd> Check/uncheck</li>
            <li><kbd>Ctrl+D</kbd> Set date</li>
            <li><kbd>Ctrl+Shift+D</kbd> Clear date</li>
            <li><kbd>Ctrl+R</kbd> Set recurrence</li>
            <li><kbd>Ctrl+Shift+T</kbd> Date views</li>
          </ul>
        </div>
        <div class="shortcut-group">
          <h4>Formatting</h4>
          <ul>
            <li><kbd>Ctrl+B</kbd> Bold</li>
            <li><kbd>Ctrl+I</kbd> Italic</li>
            <li><kbd>**text**</kbd> Bold</li>
            <li><kbd>*text*</kbd> Italic</li>
          </ul>
        </div>
      </div>

      <div class="modal-footer">
        <span class="hint">
          <kbd>Esc</kbd> Close
        </span>
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
    padding-top: 80px;
    z-index: 1000;
  }

  .modal {
    background: white;
    border-radius: 12px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    width: 700px;
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

  .shortcut-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 20px;
    padding: 20px;
    overflow-y: auto;
  }

  .shortcut-group h4 {
    margin: 0 0 10px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .shortcut-group ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .shortcut-group li {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
    font-size: 13px;
    color: var(--text-primary);
  }

  kbd {
    background: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: 4px;
    padding: 2px 6px;
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 11px;
    white-space: nowrap;
  }

  .modal-footer {
    padding: 12px 20px;
    border-top: 1px solid var(--border-primary);
    background: var(--bg-secondary);
    border-radius: 0 0 12px 12px;
  }

  .hint {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .hint kbd {
    background: var(--btn-secondary-bg);
    margin-right: 4px;
  }
</style>
