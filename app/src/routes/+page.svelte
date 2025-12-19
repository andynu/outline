<script lang="ts">
  import { onMount } from 'svelte';
  import OutlineItem from '$lib/OutlineItem.svelte';
  import SearchModal from '$lib/SearchModal.svelte';
  import QuickNavigator from '$lib/QuickNavigator.svelte';
  import QuickMove from '$lib/QuickMove.svelte';
  import DateViewsPanel from '$lib/DateViewsPanel.svelte';
  import InboxPanel from '$lib/InboxPanel.svelte';
  import { outline } from '$lib/outline.svelte';
  import KeyboardShortcutsModal from '$lib/KeyboardShortcutsModal.svelte';
  import { generateIcalFeed, getInboxCount } from '$lib/api';
  import type { InboxItem } from '$lib/api';

  let showSearchModal = $state(false);
  let searchDocumentScope: string | undefined = $state(undefined);
  let searchInitialQuery = $state('');

  let showQuickNav = $state(false);
  let quickNavMode: 'files' | 'items' = $state('files');

  let showQuickMove = $state(false);

  let showDateViews = $state(false);

  let showInbox = $state(false);
  let inboxCount = $state(0);
  let processingInboxItem: InboxItem | null = $state(null);

  let showKeyboardShortcuts = $state(false);

  onMount(() => {
    outline.load();
    refreshInboxCount();
    // Poll inbox count every 30 seconds
    const interval = setInterval(refreshInboxCount, 30000);

    // Handle Tab for indent/outdent at document level
    // This ensures Tab works even if the editor's internal handler doesn't capture it
    const handleTabKey = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        // Only handle Tab when an outline item is focused
        const focusedId = outline.focusedId;
        if (focusedId) {
          event.preventDefault();
          event.stopPropagation();
          if (event.shiftKey) {
            outline.outdentNode(focusedId);
          } else {
            outline.indentNode(focusedId);
          }
        }
      }
    };
    document.addEventListener('keydown', handleTabKey, { capture: true });

    // Handle hashtag clicks - open search with tag
    const handleHashtagSearch = (event: Event) => {
      const { tag } = (event as CustomEvent).detail;
      searchInitialQuery = `#${tag}`;
      searchDocumentScope = undefined;
      showSearchModal = true;
    };
    window.addEventListener('hashtag-search', handleHashtagSearch);

    return () => {
      clearInterval(interval);
      document.removeEventListener('keydown', handleTabKey, { capture: true });
      window.removeEventListener('hashtag-search', handleHashtagSearch);
    };
  });

  async function refreshInboxCount() {
    try {
      inboxCount = await getInboxCount();
    } catch (e) {
      console.error('Failed to get inbox count:', e);
    }
  }

  function handleGlobalKeydown(event: KeyboardEvent) {
    // Ctrl+Shift+F: Global search
    if (event.ctrlKey && event.shiftKey && event.key === 'F') {
      event.preventDefault();
      searchDocumentScope = undefined;
      searchInitialQuery = '';
      showSearchModal = true;
    }
    // Ctrl+F: Search in current document
    else if (event.ctrlKey && !event.shiftKey && event.key === 'f') {
      event.preventDefault();
      // TODO: Get current document ID when multi-document is fully implemented
      searchDocumentScope = undefined; // For now, search globally
      searchInitialQuery = '';
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
    // Ctrl+I: Show inbox
    else if (event.ctrlKey && !event.shiftKey && event.key === 'i') {
      event.preventDefault();
      showInbox = true;
    }
    // ?: Show keyboard shortcuts
    else if (event.key === '?' && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      showKeyboardShortcuts = true;
    }
  }

  // Handle processing an inbox item - creates a node and opens Quick Move
  async function handleProcessInboxItem(item: InboxItem) {
    showInbox = false;
    processingInboxItem = item;

    // Create a new root node with the inbox content
    try {
      const result = await import('$lib/api').then(api =>
        api.createNode(null, 0, item.content)
      );

      // Focus the new node
      outline.focus(result.id);

      // Update state
      // @ts-ignore - accessing internal
      outline.nodes = result.state.nodes;

      // Open Quick Move to relocate it
      setTimeout(() => {
        showQuickMove = true;
      }, 100);
    } catch (e) {
      console.error('Failed to create node from inbox:', e);
    }
  }

  // Called when Quick Move closes - clear the inbox item if we were processing one
  async function handleQuickMoveClose() {
    showQuickMove = false;
    if (processingInboxItem) {
      // Clear the processed inbox item
      try {
        const api = await import('$lib/api');
        await api.clearInboxItems([processingInboxItem.id]);
        processingInboxItem = null;
        await refreshInboxCount();
      } catch (e) {
        console.error('Failed to clear inbox item:', e);
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

<div class="app-chrome">
  <!-- Menu Bar -->
  <nav class="menu-bar">
    <button class="menu-item">File</button>
    <button class="menu-item">Edit</button>
    <button class="menu-item">View</button>
    <button class="menu-item">Help</button>
  </nav>

  <!-- Icon Toolbar -->
  <div class="toolbar">
    <div class="toolbar-left">
      <button
        class="toolbar-btn"
        onclick={() => outline.compact()}
        title="Save (Compact)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
          <polyline points="17 21 17 13 7 13 7 21"/>
          <polyline points="7 3 7 8 15 8"/>
        </svg>
      </button>
      <button
        class="toolbar-btn"
        onclick={() => showInbox = true}
        title="Inbox (Ctrl+I)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
          <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
        </svg>
        {#if inboxCount > 0}
          <span class="toolbar-badge">{inboxCount}</span>
        {/if}
      </button>
      <button
        class="toolbar-btn"
        onclick={() => { showDateViews = true; }}
        title="Date Views (Ctrl+Shift+T)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      </button>
      <button
        class="toolbar-btn"
        onclick={handleExportCalendar}
        title="Export iCalendar"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </button>
      <div class="toolbar-separator"></div>
      <button
        class="toolbar-btn"
        onclick={() => showKeyboardShortcuts = true}
        title="Keyboard Shortcuts (?)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      </button>
    </div>
    <div class="toolbar-right">
      <div class="toolbar-search">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          type="text"
          placeholder="Search (Ctrl+F)"
          readonly
          onclick={() => { searchDocumentScope = undefined; searchInitialQuery = ''; showSearchModal = true; }}
        />
      </div>
    </div>
  </div>

  <!-- Main Content Area -->
  <main class="content-area">
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
  </main>

  <!-- Status Bar -->
  <footer class="status-bar">
    <span class="status-left">
      {#if outline.loading}
        Loading...
      {:else}
        {Object.keys(outline.nodes).length} items
      {/if}
    </span>
    <span class="status-right">
      Outline
    </span>
  </footer>
</div>

<SearchModal
  isOpen={showSearchModal}
  documentScope={searchDocumentScope}
  initialQuery={searchInitialQuery}
  onClose={() => { showSearchModal = false; searchInitialQuery = ''; }}
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
  onClose={handleQuickMoveClose}
/>

<InboxPanel
  isOpen={showInbox}
  onClose={() => { showInbox = false; refreshInboxCount(); }}
  onProcess={handleProcessInboxItem}
/>

<KeyboardShortcutsModal
  isOpen={showKeyboardShortcuts}
  onClose={() => showKeyboardShortcuts = false}
/>

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    height: 100%;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #fafafa;
    color: #333;
  }

  /* App Chrome - Full viewport flex layout */
  .app-chrome {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }

  /* Menu Bar */
  .menu-bar {
    display: flex;
    gap: 0;
    padding: 0 8px;
    background: #f8f8f8;
    border-bottom: 1px solid #e0e0e0;
    flex-shrink: 0;
  }

  .menu-item {
    padding: 6px 12px;
    background: transparent;
    border: none;
    font-size: 13px;
    color: #333;
    cursor: pointer;
    border-radius: 4px;
    margin: 2px 0;
  }

  .menu-item:hover {
    background: #e8e8e8;
  }

  /* Icon Toolbar */
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 12px;
    background: #fff;
    border-bottom: 1px solid #e0e0e0;
    flex-shrink: 0;
  }

  .toolbar-left, .toolbar-right {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .toolbar-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    width: 32px;
    height: 32px;
    padding: 0;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    cursor: pointer;
    color: #555;
    transition: all 0.1s;
  }

  .toolbar-btn:hover {
    background: #f0f0f0;
    border-color: #ddd;
    color: #333;
  }

  .toolbar-btn svg {
    width: 18px;
    height: 18px;
  }

  .toolbar-badge {
    position: absolute;
    top: 2px;
    right: 2px;
    min-width: 14px;
    height: 14px;
    padding: 0 4px;
    background: #ef4444;
    color: white;
    font-size: 10px;
    font-weight: 600;
    border-radius: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .toolbar-separator {
    width: 1px;
    height: 24px;
    background: #e0e0e0;
    margin: 0 4px;
  }

  .toolbar-search {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: #f5f5f5;
    border: 1px solid #ddd;
    border-radius: 6px;
    width: 200px;
  }

  .toolbar-search .search-icon {
    width: 16px;
    height: 16px;
    color: #888;
    flex-shrink: 0;
  }

  .toolbar-search input {
    flex: 1;
    border: none;
    background: transparent;
    font-size: 13px;
    color: #333;
    outline: none;
    cursor: pointer;
    min-width: 0;
  }

  .toolbar-search input::placeholder {
    color: #888;
  }

  /* Main Content Area - Flex grow and scroll */
  .content-area {
    flex: 1;
    overflow-y: auto;
    background: #fff;
  }

  .outline-container {
    padding: 16px;
  }

  .loading, .error {
    padding: 40px;
    text-align: center;
    color: #666;
  }

  .error {
    color: #dc2626;
  }

  /* Status Bar */
  .status-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 12px;
    background: #f0f0f0;
    border-top: 1px solid #e0e0e0;
    font-size: 12px;
    color: #666;
    flex-shrink: 0;
  }

  .status-left, .status-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }
</style>
