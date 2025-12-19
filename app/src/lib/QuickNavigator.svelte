<script lang="ts">
  import { onMount } from 'svelte';
  import * as api from './api';
  import type { SearchResult, DocumentInfo } from './api';
  import { outline } from './outline.svelte';

  type NavigatorMode = 'files' | 'items';

  interface Props {
    isOpen: boolean;
    mode: NavigatorMode;
    onClose: () => void;
    onNavigate: (nodeId: string, documentId: string) => void;
  }

  let { isOpen, mode, onClose, onNavigate }: Props = $props();

  let query = $state('');
  let fileResults = $state<DocumentInfo[]>([]);
  let itemResults = $state<SearchResult[]>([]);
  let selectedIndex = $state(0);
  let loading = $state(false);
  let inputElement: HTMLInputElement | undefined = $state();
  let allDocuments = $state<DocumentInfo[]>([]);

  // Load documents when opened in file mode
  $effect(() => {
    if (isOpen && mode === 'files') {
      loadDocuments();
    }
  });

  async function loadDocuments() {
    try {
      allDocuments = await api.listDocuments();
      filterFiles();
    } catch (e) {
      console.error('Failed to load documents:', e);
    }
  }

  // Fuzzy filter for file names
  function fuzzyMatch(text: string, pattern: string): boolean {
    if (!pattern) return true;
    const textLower = text.toLowerCase();
    const patternLower = pattern.toLowerCase();

    // Simple substring match for now
    return textLower.includes(patternLower);
  }

  function filterFiles() {
    fileResults = allDocuments.filter(doc => fuzzyMatch(doc.title, query));
    selectedIndex = 0;
  }

  // Search when query changes
  let searchTimeout: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    if (mode === 'files') {
      filterFiles();
    } else if (mode === 'items') {
      if (query.trim().length > 0) {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(async () => {
          loading = true;
          try {
            itemResults = await api.search(query, undefined, 30);
            selectedIndex = 0;
          } finally {
            loading = false;
          }
        }, 150);
      } else {
        itemResults = [];
        selectedIndex = 0;
      }
    }
  });

  // Focus input when modal opens
  $effect(() => {
    if (isOpen && inputElement) {
      setTimeout(() => inputElement?.focus(), 50);
    }
  });

  function getResultCount(): number {
    return mode === 'files' ? fileResults.length : itemResults.length;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!isOpen) return;

    const resultCount = getResultCount();

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, resultCount - 1);
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

  function selectCurrent() {
    if (mode === 'files') {
      const doc = fileResults[selectedIndex];
      if (doc) {
        // Navigate to document (pass empty string for nodeId to indicate document level)
        onNavigate('', doc.id);
        handleClose();
      }
    } else {
      const result = itemResults[selectedIndex];
      if (result) {
        onNavigate(result.node_id, result.document_id);
        handleClose();
      }
    }
  }

  function selectFile(doc: DocumentInfo) {
    onNavigate('', doc.id);
    handleClose();
  }

  function selectItem(result: SearchResult) {
    onNavigate(result.node_id, result.document_id);
    handleClose();
  }

  function handleClose() {
    query = '';
    fileResults = [];
    itemResults = [];
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
    if (getResultCount() > 0) {
      const element = document.querySelector(`[data-nav-index="${selectedIndex}"]`);
      element?.scrollIntoView({ block: 'nearest' });
    }
  });

  function getPlaceholder(): string {
    return mode === 'files' ? 'Go to document...' : 'Go to item...';
  }

  function getModeIcon(): string {
    return mode === 'files' ? 'file' : 'item';
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={handleBackdropClick}>
    <div class="modal">
      <div class="search-input-wrapper">
        {#if mode === 'files'}
          <svg class="mode-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        {:else}
          <svg class="mode-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M8 12h8" />
            <path d="M12 8v8" />
          </svg>
        {/if}
        <input
          bind:this={inputElement}
          type="text"
          class="search-input"
          placeholder={getPlaceholder()}
          bind:value={query}
        />
        {#if loading}
          <span class="loading-indicator">...</span>
        {/if}
      </div>

      <div class="results">
        {#if mode === 'files'}
          {#if fileResults.length === 0}
            <div class="no-results">No documents found</div>
          {:else}
            {#each fileResults as doc, index}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="result"
                class:selected={index === selectedIndex}
                data-nav-index={index}
                onclick={() => selectFile(doc)}
              >
                <div class="result-title">{doc.title}</div>
                <div class="result-meta">{doc.node_count} items</div>
              </div>
            {/each}
          {/if}
        {:else}
          {#if itemResults.length === 0 && query.trim().length > 0 && !loading}
            <div class="no-results">No items found</div>
          {:else if itemResults.length === 0 && query.trim().length === 0}
            <div class="hint-text">Type to search all items...</div>
          {:else}
            {#each itemResults as result, index}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="result"
                class:selected={index === selectedIndex}
                data-nav-index={index}
                onclick={() => selectItem(result)}
              >
                <div class="result-content">
                  {@html result.snippet}
                </div>
              </div>
            {/each}
          {/if}
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
    width: 500px;
    max-width: 90vw;
    max-height: 60vh;
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

  .result-title {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
  }

  .result-meta {
    font-size: 12px;
    color: var(--text-secondary);
    margin-top: 2px;
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
