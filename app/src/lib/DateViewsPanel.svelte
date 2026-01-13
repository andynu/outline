<script lang="ts">
  import { outline } from './outline.svelte';
  import { getTodayISO, getDateStatus, formatDateRelative } from './dateUtils';
  import DateBadge from './DateBadge.svelte';
  import { stripHtml } from './utils';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
    onNavigate: (nodeId: string) => void;
  }

  let { isOpen, onClose, onNavigate }: Props = $props();

  type ViewType = 'today' | 'upcoming' | 'overdue' | 'all';
  let activeView = $state<ViewType>('today');

  // Get all nodes with dates
  let nodesWithDates = $derived(
    outline.nodes.filter(n => n.date)
  );

  // Filter by view type
  let filteredNodes = $derived(() => {
    const today = getTodayISO();
    const todayDate = new Date(today);
    todayDate.setHours(0, 0, 0, 0);

    const weekFromNow = new Date(todayDate);
    weekFromNow.setDate(weekFromNow.getDate() + 7);
    const weekIso = weekFromNow.toISOString().split('T')[0];

    return nodesWithDates.filter(node => {
      if (!node.date) return false;

      const status = getDateStatus(node.date, node.is_checked);

      switch (activeView) {
        case 'today':
          return status === 'today';
        case 'upcoming':
          return status === 'today' || status === 'urgent' || status === 'soon';
        case 'overdue':
          return status === 'overdue';
        case 'all':
          return true;
        default:
          return false;
      }
    }).sort((a, b) => {
      // Sort by date ascending
      if (a.date && b.date) {
        return a.date.localeCompare(b.date);
      }
      return 0;
    });
  });

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if ((e.target as Element).classList.contains('modal-backdrop')) {
      onClose();
    }
  }

  function handleNodeClick(nodeId: string) {
    onNavigate(nodeId);
    onClose();
  }

  const viewCounts = $derived({
    today: nodesWithDates.filter(n => n.date && getDateStatus(n.date, n.is_checked) === 'today').length,
    upcoming: nodesWithDates.filter(n => n.date && ['today', 'urgent', 'soon'].includes(getDateStatus(n.date, n.is_checked))).length,
    overdue: nodesWithDates.filter(n => n.date && getDateStatus(n.date, n.is_checked) === 'overdue').length,
    all: nodesWithDates.length,
  });
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <div class="modal-backdrop" onclick={handleBackdropClick} onkeydown={handleKeyDown} role="dialog" aria-modal="true">
    <div class="modal">
      <div class="modal-header">
        <h2>Date Views</h2>
        <button class="close-btn" onclick={onClose} aria-label="Close">×</button>
      </div>

      <div class="view-tabs">
        <button
          class="view-tab"
          class:active={activeView === 'today'}
          onclick={() => activeView = 'today'}
        >
          Today
          {#if viewCounts.today > 0}
            <span class="count">{viewCounts.today}</span>
          {/if}
        </button>
        <button
          class="view-tab"
          class:active={activeView === 'upcoming'}
          onclick={() => activeView = 'upcoming'}
        >
          Upcoming
          {#if viewCounts.upcoming > 0}
            <span class="count">{viewCounts.upcoming}</span>
          {/if}
        </button>
        <button
          class="view-tab"
          class:active={activeView === 'overdue'}
          onclick={() => activeView = 'overdue'}
        >
          Overdue
          {#if viewCounts.overdue > 0}
            <span class="count overdue">{viewCounts.overdue}</span>
          {/if}
        </button>
        <button
          class="view-tab"
          class:active={activeView === 'all'}
          onclick={() => activeView = 'all'}
        >
          All Dates
          {#if viewCounts.all > 0}
            <span class="count">{viewCounts.all}</span>
          {/if}
        </button>
      </div>

      <div class="results">
        {#if filteredNodes().length === 0}
          <div class="empty-state">
            {#if activeView === 'today'}
              No tasks due today
            {:else if activeView === 'upcoming'}
              No upcoming tasks
            {:else if activeView === 'overdue'}
              No overdue tasks
            {:else}
              No dated items
            {/if}
          </div>
        {:else}
          {#each filteredNodes() as node (node.id)}
            <button
              class="result-item"
              class:checked={node.is_checked}
              onclick={() => handleNodeClick(node.id)}
            >
              <div class="result-content">
                {#if node.node_type === 'checkbox'}
                  <span class="checkbox-indicator" class:checked={node.is_checked}>
                    {node.is_checked ? '✓' : ''}
                  </span>
                {/if}
                <span class="content-text" class:strikethrough={node.is_checked}>
                  {stripHtml(node.content) || 'Untitled'}
                </span>
              </div>
              {#if node.date}
                <DateBadge
                  date={node.date}
                  isChecked={node.is_checked}
                />
              {/if}
            </button>
          {/each}
        {/if}
      </div>

      <div class="modal-footer">
        <span class="hint">Press Escape to close</span>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 80px;
    z-index: 1000;
  }

  .modal {
    background: var(--bg-elevated);
    border-radius: 12px;
    box-shadow: 0 8px 32px var(--modal-overlay);
    width: 100%;
    max-width: 500px;
    max-height: calc(100vh - 160px);
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
    background: none;
    border: none;
    font-size: 24px;
    color: var(--text-secondary);
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }

  .close-btn:hover {
    color: var(--text-primary);
  }

  .view-tabs {
    display: flex;
    gap: 4px;
    padding: 12px 20px;
    border-bottom: 1px solid var(--border-primary);
    background: var(--bg-tertiary);
  }

  .view-tab {
    padding: 8px 12px;
    border: none;
    border-radius: 6px;
    background: transparent;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.15s;
  }

  .view-tab:hover {
    background: rgba(0, 0, 0, 0.05);
  }

  .view-tab.active {
    background: var(--bg-elevated);
    color: var(--text-primary);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .count {
    background: var(--btn-secondary-bg);
    color: var(--text-secondary);
    padding: 1px 6px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 600;
  }

  .count.overdue {
    background: var(--date-overdue-bg);
    color: var(--date-overdue);
  }

  .results {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  .empty-state {
    padding: 40px 20px;
    text-align: center;
    color: var(--text-tertiary);
    font-size: 14px;
  }

  .result-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 10px 12px;
    border: none;
    border-radius: 6px;
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
  }

  .result-item:hover {
    background: var(--bg-tertiary);
  }

  .result-content {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
  }

  .checkbox-indicator {
    width: 16px;
    height: 16px;
    border: 2px solid var(--checkbox-border);
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    color: transparent;
    flex-shrink: 0;
  }

  .checkbox-indicator.checked {
    background: var(--checkbox-checked-bg);
    border-color: var(--checkbox-checked-bg);
    color: white;
  }

  .content-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
    color: var(--text-primary);
  }

  .content-text.strikethrough {
    text-decoration: line-through;
    color: var(--text-tertiary);
  }

  .modal-footer {
    padding: 12px 20px;
    border-top: 1px solid var(--border-primary);
    text-align: center;
  }

  .hint {
    font-size: 12px;
    color: var(--text-tertiary);
  }
</style>
