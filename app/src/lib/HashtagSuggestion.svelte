<script lang="ts">
  import { outline } from './outline.svelte';

  interface Props {
    query: string;
    position: { x: number; y: number };
    onSelect: (tag: string) => void;
    onClose: () => void;
  }

  let { query, position, onSelect, onClose }: Props = $props();

  let selectedIndex = $state(0);

  // Get all tags and filter by query
  let suggestions = $derived(() => {
    const allTags = outline.getAllTags();
    const entries = Array.from(allTags.entries());

    if (!query) {
      // No query - show most used tags
      return entries
        .map(([tag, data]) => ({ tag, count: data.count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);
    }

    // Filter by query (case insensitive prefix match)
    const queryLower = query.toLowerCase();
    return entries
      .filter(([tag]) => tag.toLowerCase().startsWith(queryLower))
      .map(([tag, data]) => ({ tag, count: data.count }))
      .sort((a, b) => {
        // Exact match first, then by count
        const aExact = a.tag.toLowerCase() === queryLower;
        const bExact = b.tag.toLowerCase() === queryLower;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        return b.count - a.count;
      })
      .slice(0, 8);
  });

  // Reset selected index when suggestions change
  $effect(() => {
    suggestions(); // Subscribe to changes
    selectedIndex = 0;
  });

  function handleKeydown(event: KeyboardEvent) {
    const items = suggestions();
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        event.stopPropagation();
        selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        event.stopPropagation();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        break;
      case 'Enter':
        event.preventDefault();
        event.stopPropagation();
        if (items[selectedIndex]) {
          onSelect(items[selectedIndex].tag);
        } else if (query) {
          // Create new tag with the typed text
          onSelect(query);
        }
        break;
      case 'Tab':
        event.preventDefault();
        event.stopPropagation();
        if (items[selectedIndex]) {
          onSelect(items[selectedIndex].tag);
        } else if (query) {
          onSelect(query);
        }
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        onClose();
        break;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="suggestion-popup"
  style="left: {position.x}px; top: {position.y}px"
>
  {#if suggestions().length === 0 && query.length > 0}
    <div
      class="suggestion-item selected"
      onclick={() => onSelect(query)}
    >
      <span class="new-tag-label">Create tag:</span>
      <span class="tag-name">#{query}</span>
    </div>
  {:else if suggestions().length === 0}
    <div class="hint">Type to search or create tags...</div>
  {:else}
    {#each suggestions() as item, index}
      <div
        class="suggestion-item"
        class:selected={index === selectedIndex}
        onclick={() => onSelect(item.tag)}
        onmouseenter={() => selectedIndex = index}
      >
        <span class="tag-name">#{item.tag}</span>
        <span class="tag-count">{item.count}</span>
      </div>
    {/each}
    {#if query && !suggestions().some(s => s.tag.toLowerCase() === query.toLowerCase())}
      <div
        class="suggestion-item create-new"
        class:selected={selectedIndex === suggestions().length}
        onclick={() => onSelect(query)}
        onmouseenter={() => selectedIndex = suggestions().length}
      >
        <span class="new-tag-label">Create:</span>
        <span class="tag-name">#{query}</span>
      </div>
    {/if}
  {/if}
</div>

<style>
  .suggestion-popup {
    position: fixed;
    background: var(--bg-elevated);
    border: 1px solid var(--border-primary);
    border-radius: 8px;
    box-shadow: 0 4px 12px var(--modal-overlay);
    width: 200px;
    max-height: 250px;
    overflow-y: auto;
    z-index: 1000;
  }

  .hint {
    padding: 12px 16px;
    color: var(--text-secondary);
    font-size: 13px;
  }

  .suggestion-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    cursor: pointer;
    border-bottom: 1px solid var(--border-secondary);
  }

  .suggestion-item:last-child {
    border-bottom: none;
  }

  .suggestion-item:hover,
  .suggestion-item.selected {
    background: var(--bg-tertiary);
  }

  .suggestion-item.selected {
    background: var(--hashtag-bg);
  }

  .tag-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--hashtag-color);
  }

  .tag-count {
    font-size: 11px;
    color: var(--text-tertiary);
    background: var(--bg-tertiary);
    padding: 1px 6px;
    border-radius: 10px;
  }

  .new-tag-label {
    font-size: 12px;
    color: var(--text-tertiary);
    margin-right: 4px;
  }

  .create-new {
    border-top: 1px solid var(--border-primary);
  }
</style>
