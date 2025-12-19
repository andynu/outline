<script lang="ts">
  import { onMount } from 'svelte';
  import { parseNaturalDate, formatISODate, formatDateRelative } from './dateUtils';

  interface Props {
    query: string;
    position: { x: number; y: number };
    onSelect: (date: string) => void;
    onClose: () => void;
  }

  let { query, position, onSelect, onClose }: Props = $props();

  let selectedIndex = $state(0);

  // Quick date suggestions
  const quickDates = [
    { label: 'Today', offset: 0 },
    { label: 'Tomorrow', offset: 1 },
    { label: 'Next week', offset: 7 },
    { label: 'In 2 weeks', offset: 14 },
    { label: 'Next month', offset: 30 },
  ];

  function getDateFromOffset(offset: number): string {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return formatISODate(date);
  }

  // Parse query and build suggestions
  let suggestions = $derived(() => {
    const items: Array<{ label: string; date: string; preview: string }> = [];

    // If query is provided, try to parse it
    if (query) {
      const parsed = parseNaturalDate(query);
      if (parsed) {
        const displayDate = formatDateRelative(parsed);
        items.push({
          label: query,
          date: parsed,
          preview: displayDate,
        });
      }
    }

    // Add quick date suggestions, filtered by query if provided
    for (const quick of quickDates) {
      const date = getDateFromOffset(quick.offset);
      const preview = formatDateRelative(date);

      // If query provided, filter by it
      if (query) {
        const queryLower = query.toLowerCase();
        if (
          quick.label.toLowerCase().includes(queryLower) ||
          preview.toLowerCase().includes(queryLower)
        ) {
          // Avoid duplicates if the parsed date matches
          if (!items.some(item => item.date === date)) {
            items.push({
              label: quick.label,
              date,
              preview,
            });
          }
        }
      } else {
        items.push({
          label: quick.label,
          date,
          preview,
        });
      }
    }

    return items.slice(0, 6);
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
      case 'Tab':
        event.preventDefault();
        event.stopPropagation();
        if (items[selectedIndex]) {
          onSelect(items[selectedIndex].date);
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
  {#if suggestions().length === 0}
    <div class="hint">Type a date: today, +3d, jan 15...</div>
  {:else}
    {#each suggestions() as item, index}
      <div
        class="suggestion-item"
        class:selected={index === selectedIndex}
        onclick={() => onSelect(item.date)}
        onmouseenter={() => selectedIndex = index}
      >
        <span class="date-label">{item.label}</span>
        <span class="date-preview">{item.preview}</span>
      </div>
    {/each}
  {/if}

  <div class="hints">
    <span>today</span>
    <span>+3d</span>
    <span>mon</span>
    <span>jan 15</span>
  </div>
</div>

<style>
  .suggestion-popup {
    position: fixed;
    background: var(--bg-elevated);
    border: 1px solid var(--border-primary);
    border-radius: 8px;
    box-shadow: 0 4px 12px var(--modal-overlay);
    width: 220px;
    max-height: 280px;
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
    background: var(--date-today-bg);
  }

  .date-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--date-today);
  }

  .date-preview {
    font-size: 11px;
    color: var(--text-tertiary);
    background: var(--bg-tertiary);
    padding: 2px 8px;
    border-radius: 10px;
  }

  .hints {
    display: flex;
    gap: 6px;
    padding: 8px 12px;
    border-top: 1px solid var(--border-primary);
    flex-wrap: wrap;
  }

  .hints span {
    font-size: 10px;
    color: var(--text-tertiary);
    background: var(--bg-tertiary);
    padding: 2px 6px;
    border-radius: 3px;
  }
</style>
