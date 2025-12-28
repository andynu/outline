<script lang="ts">
  import * as api from './api';
  import type { SearchResult } from './api';
  import { outline } from './outline.svelte';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
  }

  let { isOpen, onClose }: Props = $props();

  let query = $state('');
  let results = $state<SearchResult[]>([]);
  let selectedIndex = $state(0);
  let loading = $state(false);
  let moving = $state(false);
  let inputElement: HTMLInputElement | undefined = $state();

  // The node we're moving
  $effect(() => {
    if (isOpen) {
      query = '';
      results = [];
      selectedIndex = 0;
      setTimeout(() => inputElement?.focus(), 50);
    }
  });

  // Search when query changes
  let searchTimeout: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    if (query.trim().length > 0) {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(async () => {
        loading = true;
        try {
          results = await api.search(query, undefined, 30);
          selectedIndex = 0;
        } finally {
          loading = false;
        }
      }, 150);
    } else {
      results = [];
      selectedIndex = 0;
    }
  });

  function handleKeydown(event: KeyboardEvent) {
    if (!isOpen) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        break;
      case 'Enter':
        event.preventDefault();
        selectCurrent();
        break;
      case 'Escape':
        event.preventDefault();
        handleClose();
        break;
    }
  }

  async function selectCurrent() {
    const result = results[selectedIndex];
    if (result) {
      await moveToNode(result.node_id);
    }
  }

  async function moveToNode(targetNodeId: string) {
    const sourceId = outline.focusedId;
    if (!sourceId || sourceId === targetNodeId) {
      handleClose();
      return;
    }

    moving = true;
    try {
      // Move the focused node to be a child of the target node
      // Position it at the end of the target's children
      const targetChildren = outline.nodes.filter(n => n.parent_id === targetNodeId);
      const newPosition = targetChildren.length;

      await outline.moveNodeTo(sourceId, targetNodeId, newPosition);

      handleClose();
    } catch (e) {
      console.error('Failed to move node:', e);
    } finally {
      moving = false;
    }
  }

  function selectItem(result: SearchResult) {
    moveToNode(result.node_id);
  }

  function handleClose() {
    query = '';
    results = [];
    selectedIndex = 0;
    onClose();
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      handleClose();
    }
  }

  // Scroll selected result into view
  $effect(() => {
    if (results.length > 0) {
      const element = document.querySelector(`[data-move-index="${selectedIndex}"]`);
      element?.scrollIntoView({ block: 'nearest' });
    }
  });

  function getSourceNodeContent(): string {
    const sourceId = outline.focusedId;
    if (!sourceId) return '';
    const node = outline.getNode(sourceId);
    if (!node) return '';
    // Strip HTML tags for display
    const div = document.createElement('div');
    div.innerHTML = node.content;
    const text = div.textContent || div.innerText || '';
    return text.length > 40 ? text.substring(0, 40) + '...' : text;
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={handleBackdropClick}>
    <div class="modal">
      <div class="header-info">
        <span class="move-label">Move:</span>
        <span class="source-node">{getSourceNodeContent()}</span>
      </div>

      <div class="search-input-wrapper">
        <svg class="mode-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M5 9l7 7 7-7" />
        </svg>
        <input
          bind:this={inputElement}
          type="text"
          class="search-input"
          placeholder="Move to..."
          bind:value={query}
          disabled={moving}
        />
        {#if loading}
          <span class="loading-indicator">...</span>
        {/if}
        {#if moving}
          <span class="loading-indicator">Moving...</span>
        {/if}
      </div>

      <div class="results">
        {#if results.length === 0 && query.trim().length > 0 && !loading}
          <div class="no-results">No items found</div>
        {:else if results.length === 0 && query.trim().length === 0}
          <div class="hint-text">Search for a destination node...</div>
        {:else}
          {#each results as result, index}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="result"
              class:selected={index === selectedIndex}
              data-move-index={index}
              onclick={() => selectItem(result)}
            >
              <div class="result-content">
                {@html result.snippet}
              </div>
            </div>
          {/each}
        {/if}
      </div>

      <div class="modal-footer">
        <span class="hint">
          <kbd>↑↓</kbd> Navigate
          <kbd>Enter</kbd> Move here
          <kbd>Esc</kbd> Cancel
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
    padding-top: 100px;
    z-index: 1000;
  }

  .modal {
    background: var(--bg-elevated);
    border-radius: 12px;
    box-shadow: 0 25px 50px -12px var(--modal-overlay);
    width: 500px;
    max-width: 90vw;
    max-height: 60vh;
    display: flex;
    flex-direction: column;
  }

  .header-info {
    padding: 12px 16px;
    background: var(--accent-primary-lighter);
    border-bottom: 1px solid var(--border-primary);
    border-radius: 12px 12px 0 0;
    font-size: 13px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .move-label {
    color: var(--text-secondary);
    font-weight: 500;
  }

  .source-node {
    color: var(--accent-primary);
    font-weight: 500;
  }

  .search-input-wrapper {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    border-bottom: 1px solid var(--border-primary);
  }

  .mode-icon {
    width: 20px;
    height: 20px;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .search-input {
    flex: 1;
    border: none;
    outline: none;
    font-size: 16px;
    background: transparent;
    color: var(--text-primary);
  }

  .search-input::placeholder {
    color: var(--text-tertiary);
  }

  .search-input:disabled {
    opacity: 0.6;
  }

  .loading-indicator {
    color: var(--text-secondary);
    font-size: 14px;
  }

  .results {
    flex: 1;
    overflow-y: auto;
    max-height: 350px;
  }

  .no-results, .hint-text {
    padding: 24px;
    text-align: center;
    color: var(--text-secondary);
  }

  .result {
    padding: 12px 16px;
    cursor: pointer;
    border-bottom: 1px solid var(--border-secondary);
  }

  .result:last-child {
    border-bottom: none;
  }

  .result:hover,
  .result.selected {
    background: var(--bg-tertiary);
  }

  .result.selected {
    background: var(--selection-bg-strong);
  }

  .result-content {
    font-size: 14px;
    line-height: 1.5;
    color: var(--text-primary);
  }

  .result-content :global(mark) {
    background: var(--highlight-bg);
    color: inherit;
    padding: 0 2px;
    border-radius: 2px;
  }

  .modal-footer {
    padding: 12px 16px;
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
    padding: 2px 6px;
    border-radius: 4px;
    font-family: inherit;
    font-size: 11px;
    margin-right: 4px;
  }
</style>
