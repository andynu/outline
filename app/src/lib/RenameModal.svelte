<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    isOpen: boolean;
    currentName: string;
    onRename: (newName: string) => void;
    onClose: () => void;
  }

  let { isOpen, currentName, onRename, onClose }: Props = $props();

  let inputValue = $state('');
  let inputElement: HTMLInputElement | undefined = $state();

  $effect(() => {
    if (isOpen) {
      inputValue = currentName;
      // Focus input after a tick
      setTimeout(() => {
        inputElement?.focus();
        inputElement?.select();
      }, 0);
    }
  });

  function handleSubmit(e: Event) {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (trimmed && trimmed !== currentName) {
      onRename(trimmed);
    }
    onClose();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="modal-backdrop" onclick={handleBackdropClick} onkeydown={handleKeyDown}>
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="rename-title">
      <h3 id="rename-title">Rename Document</h3>
      <form onsubmit={handleSubmit}>
        <input
          bind:this={inputElement}
          type="text"
          bind:value={inputValue}
          onkeydown={handleKeyDown}
          placeholder="Document name"
          class="rename-input"
        />
        <div class="modal-buttons">
          <button type="button" class="btn-cancel" onclick={onClose}>Cancel</button>
          <button type="submit" class="btn-rename" disabled={!inputValue.trim()}>Rename</button>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: var(--bg-primary);
    border-radius: 8px;
    padding: 20px;
    width: 360px;
    max-width: 90vw;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
  }

  h3 {
    margin: 0 0 16px;
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .rename-input {
    width: 100%;
    padding: 10px 12px;
    font-size: 14px;
    border: 1px solid var(--border-primary);
    border-radius: 6px;
    background: var(--bg-secondary);
    color: var(--text-primary);
    outline: none;
    box-sizing: border-box;
  }

  .rename-input:focus {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px rgba(var(--accent-primary-rgb), 0.2);
  }

  .modal-buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
  }

  button {
    padding: 8px 16px;
    font-size: 13px;
    border-radius: 6px;
    cursor: pointer;
    border: none;
    font-weight: 500;
  }

  .btn-cancel {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .btn-cancel:hover {
    background: var(--bg-secondary);
  }

  .btn-rename {
    background: var(--accent-primary);
    color: white;
  }

  .btn-rename:hover:not(:disabled) {
    opacity: 0.9;
  }

  .btn-rename:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
