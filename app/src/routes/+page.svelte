<script lang="ts">
  import { onMount } from 'svelte';
  import OutlineItem from '$lib/OutlineItem.svelte';
  import SearchModal from '$lib/SearchModal.svelte';
  import QuickNavigator from '$lib/QuickNavigator.svelte';
  import QuickMove from '$lib/QuickMove.svelte';
  import DateViewsPanel from '$lib/DateViewsPanel.svelte';
  import { outline } from '$lib/outline.svelte';
  import { generateIcalFeed } from '$lib/api';

  let showSearchModal = $state(false);
  let searchDocumentScope: string | undefined = $state(undefined);

  let showQuickNav = $state(false);
  let quickNavMode: 'files' | 'items' = $state('files');

  let showQuickMove = $state(false);

  let showDateViews = $state(false);

  onMount(() => {
    outline.load();
  });

  function handleGlobalKeydown(event: KeyboardEvent) {
    // Ctrl+Shift+F: Global search
    if (event.ctrlKey && event.shiftKey && event.key === 'F') {
      event.preventDefault();
      searchDocumentScope = undefined;
      showSearchModal = true;
    }
    // Ctrl+F: Search in current document
    else if (event.ctrlKey && !event.shiftKey && event.key === 'f') {
      event.preventDefault();
      // TODO: Get current document ID when multi-document is fully implemented
      searchDocumentScope = undefined; // For now, search globally
      showSearchModal = true;
    }
    // Ctrl+O: File finder (document switcher)
    else if (event.ctrlKey && !event.shiftKey && event.key === 'o') {
      event.preventDefault();
      quickNavMode = 'files';
      showQuickNav = true;
    }
    // Ctrl+Shift+O: Item finder (search all nodes)
    else if (event.ctrlKey && event.shiftKey && event.key === 'O') {
      event.preventDefault();
      quickNavMode = 'items';
      showQuickNav = true;
    }
    // Ctrl+Shift+T: Show date views (Tasks)
    else if (event.ctrlKey && event.shiftKey && event.key === 'T') {
      event.preventDefault();
      showDateViews = true;
    }
    // Ctrl+Shift+M: Quick move (relocate item)
    else if (event.ctrlKey && event.shiftKey && event.key === 'M') {
      event.preventDefault();
      if (outline.focusedId) {
        showQuickMove = true;
      }
    }
  }

  function handleSearchNavigate(nodeId: string, documentId: string) {
    // Focus the node
    outline.focus(nodeId);
    // TODO: If documentId differs from current, switch documents first
  }

  function handleQuickNavNavigate(nodeId: string, documentId: string) {
    if (nodeId) {
      // Navigate to specific node
      outline.focus(nodeId);
    }
    // TODO: Switch documents when multi-document is fully implemented
  }

  async function handleExportCalendar() {
    try {
      const icalContent = await generateIcalFeed();
      // Create a blob and download
      const blob = new Blob([icalContent], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'outline-tasks.ics';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to export calendar:', e);
    }
  }
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<svelte:head>
  <title>Outline</title>
</svelte:head>

<main>
  <header>
    <h1>Outline</h1>
    <div class="header-buttons">
      <button class="header-btn" onclick={handleExportCalendar} title="Export iCalendar">
        📅 Export
      </button>
      <button class="compact-btn" onclick={() => outline.compact()}>
        Save
      </button>
    </div>
  </header>

  {#if outline.loading}
    <div class="loading">Loading...</div>
  {:else if outline.error}
    <div class="error">Error: {outline.error}</div>
  {:else}
    <div class="outline-container">
      {#each outline.getTree() as item (item.node.id)}
        <OutlineItem {item} />
      {/each}
    </div>
  {/if}

  <div class="shortcuts">
    <details>
      <summary>Keyboard Shortcuts</summary>
      <div class="shortcut-grid">
        <div class="shortcut-group">
          <h4>Editing</h4>
          <ul>
            <li><kbd>Enter</kbd> New sibling</li>
            <li><kbd>Tab</kbd> Indent</li>
            <li><kbd>Shift+Tab</kbd> Outdent</li>
            <li><kbd>Ctrl+Shift+Backspace</kbd> Delete</li>
          </ul>
        </div>
        <div class="shortcut-group">
          <h4>Navigation</h4>
          <ul>
            <li><kbd>↑</kbd> / <kbd>↓</kbd> Move focus</li>
            <li><kbd>Ctrl+↑</kbd> Swap up</li>
            <li><kbd>Ctrl+↓</kbd> Swap down</li>
            <li><kbd>Ctrl+O</kbd> Go to document</li>
            <li><kbd>Ctrl+Shift+O</kbd> Go to item</li>
            <li><kbd>Ctrl+Shift+M</kbd> Move item to...</li>
          </ul>
        </div>
        <div class="shortcut-group">
          <h4>Search</h4>
          <ul>
            <li><kbd>Ctrl+F</kbd> Search document</li>
            <li><kbd>Ctrl+Shift+F</kbd> Global search</li>
          </ul>
        </div>
        <div class="shortcut-group">
          <h4>Collapse</h4>
          <ul>
            <li><kbd>Ctrl+.</kbd> Toggle collapse</li>
          </ul>
        </div>
        <div class="shortcut-group">
          <h4>Tasks & Dates</h4>
          <ul>
            <li><kbd>Ctrl+Shift+C</kbd> Toggle checkbox</li>
            <li><kbd>Ctrl+Enter</kbd> Check/uncheck</li>
            <li><kbd>Ctrl+D</kbd> Set date</li>
            <li><kbd>Ctrl+Shift+D</kbd> Clear date</li>
            <li><kbd>Ctrl+R</kbd> Set recurrence</li>
            <li><kbd>Ctrl+Shift+T</kbd> Date views</li>
          </ul>
        </div>
        <div class="shortcut-group">
          <h4>Formatting</h4>
          <ul>
            <li><kbd>Ctrl+B</kbd> Bold</li>
            <li><kbd>Ctrl+I</kbd> Italic</li>
            <li><kbd>**text**</kbd> Bold</li>
            <li><kbd>*text*</kbd> Italic</li>
          </ul>
        </div>
      </div>
    </details>
  </div>
</main>

<SearchModal
  isOpen={showSearchModal}
  documentScope={searchDocumentScope}
  onClose={() => showSearchModal = false}
  onNavigate={handleSearchNavigate}
/>

<QuickNavigator
  isOpen={showQuickNav}
  mode={quickNavMode}
  onClose={() => showQuickNav = false}
  onNavigate={handleQuickNavNavigate}
/>

<DateViewsPanel
  isOpen={showDateViews}
  onClose={() => showDateViews = false}
  onNavigate={(nodeId) => outline.focus(nodeId)}
/>

<QuickMove
  isOpen={showQuickMove}
  onClose={() => showQuickMove = false}
/>

<style>
  :global(body) {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #fafafa;
    color: #333;
  }

  main {
    max-width: 900px;
    margin: 0 auto;
    padding: 20px;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid #e0e0e0;
  }

  h1 {
    margin: 0;
    font-size: 24px;
    font-weight: 600;
  }

  .header-buttons {
    display: flex;
    gap: 8px;
  }

  .header-btn {
    padding: 8px 16px;
    background: #f5f5f5;
    color: #333;
    border: 1px solid #ddd;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.1s;
  }

  .header-btn:hover {
    background: #e0e0e0;
    border-color: #ccc;
  }

  .compact-btn {
    padding: 8px 16px;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
  }

  .compact-btn:hover {
    background: #1d4ed8;
  }

  .loading, .error {
    padding: 40px;
    text-align: center;
    color: #666;
  }

  .error {
    color: #dc2626;
  }

  .outline-container {
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 16px;
    min-height: 300px;
  }

  .shortcuts {
    margin-top: 24px;
    font-size: 13px;
  }

  .shortcuts summary {
    cursor: pointer;
    color: #666;
    user-select: none;
  }

  .shortcuts h4 {
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 600;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .shortcut-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 16px;
    margin-top: 12px;
    padding: 16px;
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
  }

  .shortcut-group ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .shortcut-group li {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  kbd {
    background: #f0f0f0;
    border: 1px solid #d0d0d0;
    border-radius: 4px;
    padding: 2px 6px;
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 11px;
    white-space: nowrap;
  }
</style>
