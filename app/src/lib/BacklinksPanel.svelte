<script lang="ts">
  import * as api from './api';
  import type { BacklinkResult } from './api';
  import { outline } from './outline.svelte';

  interface Props {
    nodeId: string | null;
    onNavigate: (nodeId: string) => void;
  }

  let { nodeId, onNavigate }: Props = $props();

  let backlinks = $state<BacklinkResult[]>([]);
  let loading = $state(false);
  let expanded = $state(true);

  // Load backlinks when nodeId changes
  $effect(() => {
    if (nodeId) {
      loadBacklinks(nodeId);
    } else {
      backlinks = [];
    }
  });

  async function loadBacklinks(id: string) {
    loading = true;
    try {
      backlinks = await api.getBacklinks(id);
    } catch (e) {
      console.error('Failed to load backlinks:', e);
      backlinks = [];
    } finally {
      loading = false;
    }
  }

  function handleClick(result: BacklinkResult) {
    onNavigate(result.source_node_id);
  }

  function stripHtml(html: string): string {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || '';
  }

  function truncate(text: string, maxLength: number = 60): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
  }
</script>

{#if backlinks.length > 0 || loading}
  <div class="backlinks-panel">
    <button class="panel-header" onclick={() => expanded = !expanded}>
      <span class="expand-icon">{expanded ? '▼' : '▶'}</span>
      <span class="panel-title">
        {#if loading}
          Backlinks...
        {:else}
          {backlinks.length} backlink{backlinks.length !== 1 ? 's' : ''}
        {/if}
      </span>
    </button>

    {#if expanded && !loading}
      <div class="backlinks-list">
        {#each backlinks as link}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="backlink-item" onclick={() => handleClick(link)}>
            {truncate(stripHtml(link.content))}
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .backlinks-panel {
    margin-top: 8px;
    margin-left: 20px;
    font-size: 12px;
    background: #f8f9fa;
    border-radius: 6px;
    border: 1px solid #e0e0e0;
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 8px 12px;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    color: #666;
    font-size: 12px;
  }

  .panel-header:hover {
    background: #f0f0f0;
    border-radius: 6px 6px 0 0;
  }

  .expand-icon {
    font-size: 10px;
    color: #999;
  }

  .panel-title {
    font-weight: 500;
  }

  .backlinks-list {
    border-top: 1px solid #e0e0e0;
    padding: 4px 0;
  }

  .backlink-item {
    padding: 6px 12px 6px 24px;
    cursor: pointer;
    color: #555;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .backlink-item:hover {
    background: #e8f4fd;
    color: #1976d2;
  }
</style>
