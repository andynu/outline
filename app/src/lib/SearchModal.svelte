<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import * as api from './api';
  import type { SearchResult } from './api';
  import { outline } from './outline.svelte';

  interface Props {
    isOpen: boolean;
    documentScope?: string; // If set, search only within this document
    initialQuery?: string; // Pre-fill search query
    onClose: () => void;
    onNavigate: (nodeId: string, documentId: string) => void;
  }

  let { isOpen, documentScope, initialQuery = '', onClose, onNavigate }: Props = $props();

  let query = $state(initialQuery);

  // Update query when initialQuery changes (e.g., hashtag click)
  $effect(() => {
    if (initialQuery && isOpen) {
      query = initialQuery;
    }
  });
  let results = $state<SearchResult[]>([]);
  let selectedIndex = $state(0);
  let loading = $state(false);
  let inputElement: HTMLInputElement | undefined = $state();

  // Search when query changes
  let searchTimeout: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    if (query.trim().length > 0) {
      // Debounce search
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(async () => {
        loading = true;
        try {
          results = await api.search(query, documentScope);
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

  // Focus input when modal opens
  $effect(() => {
    if (isOpen && inputElement) {
      setTimeout(() => inputElement?.focus(), 50);
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
        if (results[selectedIndex]) {
          selectResult(results[selectedIndex]);
        }
        break;
      case 'Escape':
        event.preventDefault();
        handleClose();
        break;
    }
  }

  function selectResult(result: SearchResult) {
    onNavigate(result.node_id, result.document_id);
    handleClose();
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
      const element = document.querySelector(`[data-search-index="${selectedIndex}"]`);
      element?.scrollIntoView({ block: 'nearest' });
    }
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={handleBackdropClick}>
    <div class="modal">
      <div class="search-input-wrapper">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          bind:this={inputElement}
          type="text"
          class="search-input"
          placeholder={documentScope ? "Search in this document..." : "Search all documents..."}
          bind:value={query}
        />
        {#if loading}
          <span class="loading-indicator">...</span>
        {/if}
      </div>

      <div class="results">
        {#if results.length === 0 && query.trim().length > 0 && !loading}
          <div class="no-results">No results found</div>
        {:else}
          {#each results as result, index}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="result"
              class:selected={index === selectedIndex}
              data-search-index={index}
              onclick={() => selectResult(result)}
            >
              <div class="result-content">
                {@html result.snippet}
              </div>
              {#if result.note}
                <div class="result-note">{result.note}</div>
              {/if}
            </div>
          {/each}
        {/if}
      </div>

      <div class="modal-footer">
        <span class="hint">
          <kbd>↑↓</kbd> Navigate
          <kbd>Enter</kbd> Select
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
    padding-top: 100px;
    z-index: 1000;
  }

  .modal {
    background: white;
    border-radius: 12px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    width: 600px;
    max-width: 90vw;
    max-height: 70vh;
    display: flex;
    flex-direction: column;
  }

  .search-input-wrapper {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    border-bottom: 1px solid var(--border-primary);
  }

  .search-icon {
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

  .loading-indicator {
    color: var(--text-secondary);
    font-size: 14px;
  }

  .results {
    flex: 1;
    overflow-y: auto;
    max-height: 400px;
  }

  .no-results {
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

  .result-note {
    font-size: 12px;
    color: var(--text-secondary);
    margin-top: 4px;
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
