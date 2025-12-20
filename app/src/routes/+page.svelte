<script lang="ts">
  import { onMount } from 'svelte';
  import OutlineItem from '$lib/OutlineItem.svelte';
  import SearchModal from '$lib/SearchModal.svelte';
  import QuickNavigator from '$lib/QuickNavigator.svelte';
  import QuickMove from '$lib/QuickMove.svelte';
  import DateViewsPanel from '$lib/DateViewsPanel.svelte';
  import TagsPanel from '$lib/TagsPanel.svelte';
  import InboxPanel from '$lib/InboxPanel.svelte';
  import Sidebar from '$lib/Sidebar.svelte';
  import MenuDropdown from '$lib/MenuDropdown.svelte';
  import { outline } from '$lib/outline.svelte';
  import KeyboardShortcutsModal from '$lib/KeyboardShortcutsModal.svelte';
  import { generateIcalFeed, getInboxCount, createDocument, exportOpml, exportMarkdown, exportJson } from '$lib/api';
  import type { InboxItem } from '$lib/api';
  import { theme } from '$lib/theme.svelte';
  import { zoom } from '$lib/zoom.svelte';

  let showSearchModal = $state(false);
  let searchDocumentScope: string | undefined = $state(undefined);
  let searchInitialQuery = $state('');

  let showQuickNav = $state(false);
  let quickNavMode: 'files' | 'items' = $state('files');

  let showQuickMove = $state(false);

  let showDateViews = $state(false);

  let showTags = $state(false);

  let showInbox = $state(false);
  let inboxCount = $state(0);
  let processingInboxItem: InboxItem | null = $state(null);

  let showKeyboardShortcuts = $state(false);

  let saveStatus: 'idle' | 'saving' | 'saved' = $state('idle');

  // Sidebar state - persisted in localStorage
  let sidebarOpen = $state(false);
  let currentDocumentId = $state<string | undefined>(undefined);

  // Initialize sidebar state from localStorage
  function initSidebarState() {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('outline-sidebar-open');
      sidebarOpen = stored === 'true';
    }
  }

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
    if (typeof window !== 'undefined') {
      localStorage.setItem('outline-sidebar-open', String(sidebarOpen));
    }
  }

  async function handleSelectDocument(docId: string) {
    currentDocumentId = docId;
    await outline.load(docId);
  }

  async function handleNewDocument() {
    try {
      const newId = await createDocument();
      currentDocumentId = newId;
      await outline.load(newId);
    } catch (e) {
      console.error('Failed to create document:', e);
    }
  }

  onMount(() => {
    theme.init();
    zoom.init();
    initSidebarState();
    outline.load();
    refreshInboxCount();
    // Poll inbox count every 30 seconds
    const inboxInterval = setInterval(refreshInboxCount, 30000);

    // Poll for external changes (sync) every 5 seconds
    const syncInterval = setInterval(() => {
      outline.checkAndReload();
    }, 5000);

    // Also check on window focus (user returns to app)
    const handleFocus = () => {
      outline.checkAndReload();
      refreshInboxCount();
    };
    window.addEventListener('focus', handleFocus);

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

    // Handle hashtag clicks - filter document to matching items
    const handleHashtagSearch = (event: Event) => {
      const { tag } = (event as CustomEvent).detail;
      outline.setFilter(`#${tag}`);
    };
    window.addEventListener('hashtag-search', handleHashtagSearch);

    // Handle mention clicks - filter document to matching items
    const handleMentionSearch = (event: Event) => {
      const { mention } = (event as CustomEvent).detail;
      outline.setFilter(`@${mention}`);
    };
    window.addEventListener('mention-search', handleMentionSearch);

    return () => {
      clearInterval(inboxInterval);
      clearInterval(syncInterval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('keydown', handleTabKey, { capture: true });
      window.removeEventListener('hashtag-search', handleHashtagSearch);
      window.removeEventListener('mention-search', handleMentionSearch);
    };
  });

  async function refreshInboxCount() {
    try {
      inboxCount = await getInboxCount();
    } catch (e) {
      console.error('Failed to get inbox count:', e);
    }
  }

  async function handleSave() {
    if (saveStatus === 'saving') return;

    saveStatus = 'saving';
    try {
      await outline.compact();
      saveStatus = 'saved';
      // Reset to idle after a brief delay
      setTimeout(() => {
        if (saveStatus === 'saved') {
          saveStatus = 'idle';
        }
      }, 2000);
    } catch (e) {
      console.error('Failed to save:', e);
      saveStatus = 'idle';
    }
  }

  async function handleQuit() {
    // Compact before quitting to ensure changes are saved
    try {
      await outline.compact();
    } catch (e) {
      console.error('Failed to save before quit:', e);
    }

    // Use Tauri API to close window if available
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const currentWindow = getCurrentWindow();
      await currentWindow.close();
    } catch (e) {
      // Not in Tauri, or API not available - just close the browser tab
      window.close();
    }
  }

  function handleGlobalKeydown(event: KeyboardEvent) {
    // Ctrl+S / Cmd+S: Save (compact)
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key === 's') {
      event.preventDefault();
      handleSave();
      return;
    }
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
    // Ctrl+Shift+G: Show tags panel
    else if (event.ctrlKey && event.shiftKey && event.key === 'G') {
      event.preventDefault();
      showTags = true;
    }
    // Ctrl+/ or ?: Show keyboard shortcuts
    else if ((event.ctrlKey && event.key === '/') || (event.key === '?' && !event.ctrlKey && !event.altKey)) {
      event.preventDefault();
      showKeyboardShortcuts = true;
    }
    // Ctrl+Q: Quit application
    else if (event.ctrlKey && !event.shiftKey && event.key === 'q') {
      event.preventDefault();
      handleQuit();
    }
    // Escape: Clear filter if one is active (only when no modal is open)
    else if (event.key === 'Escape' && outline.filterQuery && !showSearchModal && !showQuickNav && !showQuickMove && !showDateViews && !showTags && !showInbox && !showKeyboardShortcuts) {
      event.preventDefault();
      outline.clearFilter();
    }
    // Ctrl+= or Ctrl++: Zoom in
    else if (event.ctrlKey && (event.key === '=' || event.key === '+')) {
      event.preventDefault();
      zoom.zoomIn();
    }
    // Ctrl+-: Zoom out
    else if (event.ctrlKey && event.key === '-') {
      event.preventDefault();
      zoom.zoomOut();
    }
    // Ctrl+0: Reset zoom
    else if (event.ctrlKey && event.key === '0') {
      event.preventDefault();
      zoom.reset();
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
      downloadFile(icalContent, 'outline-tasks.ics', 'text/calendar;charset=utf-8');
    } catch (e) {
      console.error('Failed to export calendar:', e);
    }
  }

  async function handleExportOpml() {
    try {
      const opmlContent = await exportOpml('Outline Export');
      downloadFile(opmlContent, 'outline-export.opml', 'text/xml;charset=utf-8');
    } catch (e) {
      console.error('Failed to export OPML:', e);
    }
  }

  async function handleExportMarkdown() {
    try {
      const mdContent = await exportMarkdown();
      downloadFile(mdContent, 'outline-export.md', 'text/markdown;charset=utf-8');
    } catch (e) {
      console.error('Failed to export Markdown:', e);
    }
  }

  async function handleExportJson() {
    try {
      const jsonContent = await exportJson();
      downloadFile(jsonContent, 'outline-backup.json', 'application/json;charset=utf-8');
    } catch (e) {
      console.error('Failed to export JSON:', e);
    }
  }

  function downloadFile(content: string, filename: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Menu dropdown state
  let openMenu = $state<string | null>(null);

  function openMenuDropdown(menu: string) {
    openMenu = menu;
  }

  function closeMenuDropdown() {
    openMenu = null;
  }

  // File menu items
  const fileMenuItems = [
    { label: 'Save', shortcut: 'Ctrl+S', action: handleSave, separator: false as const },
    { separator: true as const },
    { label: 'Export as OPML...', action: handleExportOpml, separator: false as const },
    { label: 'Export as Markdown...', action: handleExportMarkdown, separator: false as const },
    { label: 'Export as JSON Backup...', action: handleExportJson, separator: false as const },
    { label: 'Download iCal Feed...', action: handleExportCalendar, separator: false as const },
    { separator: true as const },
    { label: 'Quit', shortcut: 'Ctrl+Q', action: handleQuit, separator: false as const },
  ];

  // View menu items
  const viewMenuItems = $derived([
    {
      label: theme.isDark ? 'Light Mode' : 'Dark Mode',
      action: () => theme.toggle(),
      separator: false as const
    },
  ]);

  // Help menu items
  const helpMenuItems = [
    { label: 'Keyboard Shortcuts', shortcut: 'Ctrl+/', action: () => { showKeyboardShortcuts = true; }, separator: false as const },
  ];
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<svelte:head>
  <title>Outline</title>
</svelte:head>

<div class="app-chrome">
  <!-- Menu Bar -->
  <nav class="menu-bar">
    <MenuDropdown
      label="File"
      items={fileMenuItems}
      isOpen={openMenu === 'file'}
      onOpen={() => openMenuDropdown('file')}
      onClose={closeMenuDropdown}
    />
    <button class="menu-item">Edit</button>
    <MenuDropdown
      label="View"
      items={viewMenuItems}
      isOpen={openMenu === 'view'}
      onOpen={() => openMenuDropdown('view')}
      onClose={closeMenuDropdown}
    />
    <MenuDropdown
      label="Help"
      items={helpMenuItems}
      isOpen={openMenu === 'help'}
      onOpen={() => openMenuDropdown('help')}
      onClose={closeMenuDropdown}
    />
  </nav>

  <!-- Icon Toolbar -->
  <div class="toolbar">
    <div class="toolbar-left">
      <button
        class="toolbar-btn sidebar-toggle"
        class:active={sidebarOpen}
        onclick={toggleSidebar}
        title="Toggle sidebar"
        aria-label="Toggle sidebar"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <line x1="9" y1="3" x2="9" y2="21"/>
        </svg>
      </button>
      <div class="toolbar-separator"></div>
      <button
        class="toolbar-btn"
        class:saving={saveStatus === 'saving'}
        class:saved={saveStatus === 'saved'}
        onclick={handleSave}
        title="Save (Ctrl+S)"
        disabled={saveStatus === 'saving'}
      >
        {#if saveStatus === 'saving'}
          <svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32"/>
          </svg>
        {:else if saveStatus === 'saved'}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        {:else}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
            <polyline points="7 3 7 8 15 8"/>
          </svg>
        {/if}
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
        onclick={() => { showTags = true; }}
        title="Tags (Ctrl+Shift+G)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
          <line x1="7" y1="7" x2="7.01" y2="7"/>
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
      <button
        class="toolbar-btn theme-toggle"
        onclick={() => theme.toggle()}
        title={theme.isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {#if theme.isDark}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="5"/>
            <line x1="12" y1="1" x2="12" y2="3"/>
            <line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/>
            <line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
        {:else}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        {/if}
      </button>
      <div class="toolbar-separator"></div>
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

  <!-- Main Area with Sidebar -->
  <div class="main-wrapper">
    <Sidebar
      isOpen={sidebarOpen}
      {currentDocumentId}
      onToggle={toggleSidebar}
      onSelectDocument={handleSelectDocument}
      onNewDocument={handleNewDocument}
    />

    <!-- Main Content Area -->
    <main class="content-area">
      {#if outline.loading}
        <div class="loading">Loading...</div>
      {:else if outline.error}
        <div class="error">Error: {outline.error}</div>
      {:else}
        {#if outline.filterQuery}
          <div class="filter-bar">
            <span class="filter-label">Filtering by:</span>
            <span class="filter-query">{outline.filterQuery}</span>
            <button class="filter-clear" onclick={() => outline.clearFilter()} title="Clear filter (Escape)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        {/if}
        <div class="outline-container">
          {#each outline.getTree() as item (item.node.id)}
            <OutlineItem {item} />
          {/each}
        </div>
      {/if}
    </main>
  </div>

  <!-- Status Bar -->
  <footer class="status-bar">
    <span class="status-left">
      {#if outline.loading}
        Loading...
      {:else}
        {outline.nodes.length} items
      {/if}
    </span>
    <span class="status-right">
      {#if zoom.level !== 1}
        <span class="zoom-status">{zoom.percentage}%</span>
      {/if}
      {#if outline.isSaving}
        <span class="save-status saving">Saving...</span>
      {:else if outline.lastSavedAt}
        <span class="save-status saved">Saved</span>
      {/if}
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

<TagsPanel
  isOpen={showTags}
  onClose={() => showTags = false}
  onNavigate={(nodeId) => outline.focus(nodeId)}
  onTagSearch={(tag) => {
    showTags = false;
    outline.setFilter(`#${tag}`);
  }}
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
    background: var(--bg-primary);
    color: var(--text-primary);
    --zoom-level: 1;
  }

  /* App Chrome - Full viewport flex layout */
  .app-chrome {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
    font-size: calc(14px * var(--zoom-level));
  }

  /* Menu Bar */
  .menu-bar {
    display: flex;
    gap: 0;
    padding: 0 8px;
    background: var(--chrome-bg);
    border-bottom: 1px solid var(--chrome-border);
    flex-shrink: 0;
  }

  .menu-item {
    padding: 6px 12px;
    background: transparent;
    border: none;
    font-size: 13px;
    color: var(--text-primary);
    cursor: pointer;
    border-radius: 4px;
    margin: 2px 0;
  }

  .menu-item:hover {
    background: var(--bg-tertiary);
  }

  /* Icon Toolbar */
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 12px;
    background: var(--bg-elevated);
    border-bottom: 1px solid var(--chrome-border);
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
    color: var(--text-secondary);
    transition: all 0.1s;
  }

  .toolbar-btn:hover {
    background: var(--toolbar-btn-hover-bg);
    border-color: var(--border-secondary);
    color: var(--text-primary);
  }

  .toolbar-btn svg {
    width: 18px;
    height: 18px;
  }

  .toolbar-btn.saving {
    color: var(--save-status-saving);
    cursor: wait;
  }

  .toolbar-btn.saved {
    color: var(--save-status-saved);
  }

  .toolbar-btn svg.spin {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .toolbar-badge {
    position: absolute;
    top: 2px;
    right: 2px;
    min-width: 14px;
    height: 14px;
    padding: 0 4px;
    background: var(--badge-bg);
    color: var(--badge-text);
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
    background: var(--border-primary);
    margin: 0 4px;
  }

  .toolbar-search {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-secondary);
    border-radius: 6px;
    width: 200px;
  }

  .toolbar-search .search-icon {
    width: 16px;
    height: 16px;
    color: var(--text-tertiary);
    flex-shrink: 0;
  }

  .toolbar-search input {
    flex: 1;
    border: none;
    background: transparent;
    font-size: 13px;
    color: var(--text-primary);
    outline: none;
    cursor: pointer;
    min-width: 0;
  }

  .toolbar-search input::placeholder {
    color: var(--text-tertiary);
  }

  /* Main wrapper - holds sidebar and content */
  .main-wrapper {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  /* Main Content Area - Flex grow and scroll */
  .content-area {
    flex: 1;
    overflow-y: auto;
    background: var(--bg-elevated);
  }

  /* Sidebar toggle button active state */
  .toolbar-btn.sidebar-toggle.active {
    background: var(--sidebar-active-bg);
    color: var(--sidebar-active-text);
  }

  .outline-container {
    padding: 16px;
  }

  /* Filter bar */
  .filter-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: var(--accent-primary-lighter);
    border-bottom: 1px solid var(--accent-primary-light);
  }

  .filter-label {
    color: var(--text-secondary);
    font-size: 13px;
  }

  .filter-query {
    color: var(--accent-primary);
    font-weight: 600;
    font-size: 13px;
  }

  .filter-clear {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    color: var(--text-tertiary);
    margin-left: auto;
  }

  .filter-clear:hover {
    background: var(--accent-primary-light);
    color: var(--accent-primary);
  }

  .filter-clear svg {
    width: 14px;
    height: 14px;
  }

  .loading, .error {
    padding: 40px;
    text-align: center;
    color: var(--text-secondary);
  }

  .error {
    color: var(--status-error);
  }

  /* Status Bar */
  .status-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 12px;
    background: var(--statusbar-bg);
    border-top: 1px solid var(--chrome-border);
    font-size: 12px;
    color: var(--statusbar-text);
    flex-shrink: 0;
  }

  .status-left, .status-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .save-status {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
  }

  .save-status.saving {
    color: var(--save-status-saving);
  }

  .save-status.saved {
    color: var(--save-status-saved);
  }

  .zoom-status {
    font-size: 11px;
    color: var(--text-tertiary);
    background: var(--bg-tertiary);
    padding: 2px 6px;
    border-radius: 3px;
  }
</style>
