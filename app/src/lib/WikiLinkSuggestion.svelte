<script lang="ts">
  import { onMount } from 'svelte';
  import * as api from './api';
  import type { SearchResult } from './api';

  interface Props {
    query: string;
    position: { x: number; y: number };
    onSelect: (nodeId: string, displayText: string) => void;
    onClose: () => void;
  }

  let { query, position, onSelect, onClose }: Props = $props();

  let results = $state<SearchResult[]>([]);
  let selectedIndex = $state(0);
  let loading = $state(false);

  // Search when query changes
  let searchTimeout: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    if (query.length > 0) {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(async () => {
        loading = true;
        try {
          results = await api.search(query, undefined, 10);
          selectedIndex = 0;
        } finally {
          loading = false;
        }
      }, 100);
    } else {
      results = [];
      selectedIndex = 0;
    }
  });

  function handleKeydown(event: KeyboardEvent) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        event.stopPropagation();
        selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        event.stopPropagation();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        break;
      case 'Enter':
        event.preventDefault();
        event.stopPropagation();
        if (results[selectedIndex]) {
          selectResult(results[selectedIndex]);
        }
        break;
      case 'Tab':
        event.preventDefault();
        event.stopPropagation();
        if (results[selectedIndex]) {
          selectResult(results[selectedIndex]);
        }
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        onClose();
        break;
    }
  }

  function selectResult(result: SearchResult) {
    // Get first line of content as display text
    const displayText = stripHtml(result.content).split('\n')[0].trim() || result.node_id;
    onSelect(result.node_id, displayText);
  }

  function stripHtml(html: string): string {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || '';
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="suggestion-popup"
  style="left: {position.x}px; top: {position.y}px"
>
  {#if loading && results.length === 0}
    <div class="loading">Searching...</div>
  {:else if results.length === 0 && query.length > 0}
    <div class="no-results">No matches found</div>
  {:else if results.length === 0}
    <div class="hint">Type to search for items to link...</div>
  {:else}
    {#each results as result, index}
      <div
        class="suggestion-item"
        class:selected={index === selectedIndex}
        onclick={() => selectResult(result)}
        onmouseenter={() => selectedIndex = index}
      >
        <div class="suggestion-text">
          {@html result.snippet}
        </div>
      </div>
    {/each}
  {/if}
</div>

<style>
  .suggestion-popup {
    position: fixed;
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    width: 320px;
    max-height: 250px;
    overflow-y: auto;
    z-index: 1000;
  }

  .loading, .no-results, .hint {
    padding: 12px 16px;
    color: #666;
    font-size: 13px;
  }

  .suggestion-item {
    padding: 8px 12px;
    cursor: pointer;
    border-bottom: 1px solid #f0f0f0;
  }

  .suggestion-item:last-child {
    border-bottom: none;
  }

  .suggestion-item:hover,
  .suggestion-item.selected {
    background: #f5f5f5;
  }

  .suggestion-item.selected {
    background: #e3f2fd;
  }

  .suggestion-text {
    font-size: 13px;
    line-height: 1.4;
    color: #333;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .suggestion-text :global(mark) {
    background: #fff59d;
    color: inherit;
    padding: 0 2px;
    border-radius: 2px;
  }
</style>
