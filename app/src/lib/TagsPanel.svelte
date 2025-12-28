<script lang="ts">
  import { outline } from './outline.svelte';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
    onNavigate: (nodeId: string) => void;
    onTagSearch: (tag: string) => void;
  }

  let { isOpen, onClose, onNavigate, onTagSearch }: Props = $props();

  let selectedTag = $state<string | null>(null);

  // Get all tags with counts, sorted by count descending
  let tagsWithCounts = $derived(() => {
    const tagMap = outline.getAllTags();
    const entries = Array.from(tagMap.entries());
    return entries
      .map(([tag, data]) => ({ tag, ...data }))
      .sort((a, b) => b.count - a.count);
  });

  // Get nodes for selected tag
  let nodesForTag = $derived(() => {
    if (!selectedTag) return [];
    return outline.getNodesWithTag(selectedTag);
  });

  // Strip HTML for display
  function stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (selectedTag) {
        selectedTag = null;
      } else {
        onClose();
      }
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if ((e.target as Element).classList.contains('modal-backdrop')) {
      onClose();
    }
  }

  function handleTagClick(tag: string) {
    selectedTag = tag;
  }

  function handleNodeClick(nodeId: string) {
    onNavigate(nodeId);
    onClose();
  }

  function handleSearchTag(tag: string) {
    onTagSearch(tag);
    onClose();
  }

  function handleBack() {
    selectedTag = null;
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <div class="modal-backdrop" onclick={handleBackdropClick} onkeydown={handleKeyDown} role="dialog" aria-modal="true">
    <div class="modal">
      <div class="modal-header">
        {#if selectedTag}
          <button class="back-btn" onclick={handleBack} aria-label="Back">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <h2>#{selectedTag}</h2>
        {:else}
          <h2>Tags</h2>
        {/if}
        <button class="close-btn" onclick={onClose} aria-label="Close">×</button>
      </div>

      <div class="results">
        {#if selectedTag}
          <!-- Show nodes with selected tag -->
          {#if nodesForTag().length === 0}
            <div class="empty-state">No items with this tag</div>
          {:else}
            <div class="tag-header">
              <span class="tag-count">{nodesForTag().length} item{nodesForTag().length === 1 ? '' : 's'}</span>
              <button class="search-btn" onclick={() => handleSearchTag(selectedTag!)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="m21 21-4.35-4.35"/>
                </svg>
                Search all
              </button>
            </div>
            {#each nodesForTag() as node (node.id)}
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
              </button>
            {/each}
          {/if}
        {:else}
          <!-- Show all tags -->
          {#if tagsWithCounts().length === 0}
            <div class="empty-state">
              No tags yet. Use #hashtags in your content to create tags.
            </div>
          {:else}
            {#each tagsWithCounts() as { tag, count } (tag)}
              <button class="tag-item" onclick={() => handleTagClick(tag)}>
                <span class="tag-name">#{tag}</span>
                <span class="tag-count-badge">{count}</span>
              </button>
            {/each}
          {/if}
        {/if}
      </div>

      <div class="modal-footer">
        <span class="hint">
          {#if selectedTag}
            Press Escape to go back
          {:else}
            Press Escape to close
          {/if}
        </span>
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
    max-width: 400px;
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
    gap: 12px;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    flex: 1;
    color: var(--text-primary);
  }

  .back-btn {
    background: none;
    border: none;
    padding: 4px;
    cursor: pointer;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
  }

  .back-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .back-btn svg {
    width: 20px;
    height: 20px;
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

  .tag-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    margin-bottom: 4px;
  }

  .tag-count {
    font-size: 13px;
    color: var(--text-secondary);
  }

  .search-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border: 1px solid var(--border-primary);
    border-radius: 6px;
    background: var(--bg-elevated);
    cursor: pointer;
    font-size: 12px;
    color: var(--text-secondary);
    transition: all 0.15s;
  }

  .search-btn:hover {
    background: var(--bg-tertiary);
    border-color: var(--text-tertiary);
    color: var(--text-primary);
  }

  .search-btn svg {
    width: 14px;
    height: 14px;
  }

  .tag-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 12px 16px;
    border: none;
    border-radius: 8px;
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
  }

  .tag-item:hover {
    background: var(--bg-tertiary);
  }

  .tag-name {
    font-size: 14px;
    font-weight: 500;
    color: var(--hashtag-color);
  }

  .tag-count-badge {
    background: var(--hashtag-bg);
    color: var(--hashtag-color);
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 12px;
    font-weight: 600;
  }

  .result-item {
    display: flex;
    align-items: center;
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
    background: var(--bg-secondary);
    border-radius: 0 0 12px 12px;
    text-align: center;
  }

  .hint {
    font-size: 12px;
    color: var(--text-tertiary);
  }
</style>
