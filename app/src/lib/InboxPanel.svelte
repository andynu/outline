<script lang="ts">
  import { onMount } from 'svelte';
  import * as api from './api';
  import type { InboxItem } from './api';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
    onProcess: (item: InboxItem) => void;
  }

  let { isOpen, onClose, onProcess }: Props = $props();

  let items = $state<InboxItem[]>([]);
  let loading = $state(false);
  let selectedIndex = $state(0);

  // Group items by capture_date
  let groupedItems = $derived(() => {
    const groups: Record<string, InboxItem[]> = {};
    for (const item of items) {
      const date = item.capture_date || 'Unknown';
      if (!groups[date]) groups[date] = [];
      groups[date].push(item);
    }
    // Sort dates descending
    const sortedDates = Object.keys(groups).sort().reverse();
    return sortedDates.map(date => ({ date, items: groups[date] }));
  });

  // Flat list for keyboard navigation
  let flatItems = $derived(items);

  $effect(() => {
    if (isOpen) {
      loadInbox();
    }
  });

  async function loadInbox() {
    loading = true;
    try {
      items = await api.getInbox();
      selectedIndex = 0;
    } finally {
      loading = false;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!isOpen) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, flatItems.length - 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        break;
      case 'Enter':
        event.preventDefault();
        processSelected();
        break;
      case 'Delete':
      case 'Backspace':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          dismissSelected();
        }
        break;
      case 'Escape':
        event.preventDefault();
        onClose();
        break;
    }
  }

  function processSelected() {
    const item = flatItems[selectedIndex];
    if (item) {
      onProcess(item);
    }
  }

  async function dismissSelected() {
    const item = flatItems[selectedIndex];
    if (item) {
      await api.clearInboxItems([item.id]);
      await loadInbox();
    }
  }

  async function dismissItem(item: InboxItem) {
    await api.clearInboxItems([item.id]);
    await loadInbox();
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const itemDate = new Date(dateStr);
    itemDate.setHours(0, 0, 0, 0);

    const diffDays = Math.floor((today.getTime() - itemDate.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;

    return itemDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function formatTime(isoStr: string): string {
    return new Date(isoStr).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  // Get flat index for a given item
  function getFlatIndex(item: InboxItem): number {
    return flatItems.findIndex(i => i.id === item.id);
  }

  $effect(() => {
    if (flatItems.length > 0 && selectedIndex >= flatItems.length) {
      selectedIndex = Math.max(0, flatItems.length - 1);
    }
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={handleBackdropClick}>
    <div class="modal">
      <div class="modal-header">
        <h2>Inbox</h2>
        <span class="badge">{items.length}</span>
      </div>

      <div class="items-container">
        {#if loading}
          <div class="loading">Loading...</div>
        {:else if items.length === 0}
          <div class="empty">
            <p>No items in inbox</p>
            <p class="hint">Capture items from mobile at /outline/capture</p>
          </div>
        {:else}
          {#each groupedItems() as group}
            <div class="date-group">
              <div class="date-header">{formatDate(group.date)}</div>
              {#each group.items as item}
                {@const flatIdx = getFlatIndex(item)}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="inbox-item"
                  class:selected={flatIdx === selectedIndex}
                  onclick={() => { selectedIndex = flatIdx; }}
                  ondblclick={() => onProcess(item)}
                >
                  <div class="item-content">{item.content}</div>
                  {#if item.note}
                    <div class="item-note">{item.note}</div>
                  {/if}
                  <div class="item-meta">
                    <span class="item-time">{formatTime(item.captured_at)}</span>
                    {#if item.source}
                      <span class="item-source">via {item.source}</span>
                    {/if}
                    <button class="dismiss-btn" onclick={(e) => { e.stopPropagation(); dismissItem(item); }} title="Dismiss">
                      &times;
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          {/each}
        {/if}
      </div>

      <div class="modal-footer">
        <span class="hint">
          <kbd>↑↓</kbd> Select
          <kbd>Enter</kbd> Move to... (Ctrl+Shift+M)
          <kbd>Ctrl+Del</kbd> Dismiss
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
    width: 500px;
    max-width: 90vw;
    max-height: 70vh;
    display: flex;
    flex-direction: column;
  }

  .modal-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border-primary);
  }

  .modal-header h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .badge {
    background: var(--accent-primary);
    color: white;
    font-size: 12px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 10px;
  }

  .items-container {
    flex: 1;
    overflow-y: auto;
    max-height: 450px;
  }

  .loading, .empty {
    padding: 40px 20px;
    text-align: center;
    color: var(--text-secondary);
  }

  .empty .hint {
    font-size: 13px;
    color: var(--text-tertiary);
    margin-top: 8px;
  }

  .date-group {
    border-bottom: 1px solid var(--border-secondary);
  }

  .date-header {
    padding: 8px 20px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    background: var(--bg-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .inbox-item {
    padding: 12px 20px;
    cursor: pointer;
    border-bottom: 1px solid var(--border-secondary);
  }

  .inbox-item:last-child {
    border-bottom: none;
  }

  .inbox-item:hover {
    background: var(--bg-tertiary);
  }

  .inbox-item.selected {
    background: var(--selection-bg-strong);
  }

  .item-content {
    font-size: 14px;
    line-height: 1.5;
    color: var(--text-primary);
  }

  .item-note {
    font-size: 13px;
    color: var(--text-secondary);
    margin-top: 4px;
  }

  .item-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 6px;
    font-size: 12px;
    color: var(--text-tertiary);
  }

  .item-source {
    background: var(--bg-tertiary);
    padding: 1px 6px;
    border-radius: 3px;
  }

  .dismiss-btn {
    margin-left: auto;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-tertiary);
    font-size: 16px;
    padding: 0 4px;
    opacity: 0.5;
  }

  .dismiss-btn:hover {
    opacity: 1;
    color: var(--status-error);
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
    padding: 2px 6px;
    border-radius: 4px;
    font-family: inherit;
    font-size: 11px;
    margin-right: 4px;
  }
</style>
