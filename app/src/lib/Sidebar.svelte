<script lang="ts">
  import { onMount } from 'svelte';
  import { listDocuments, updateNode, type DocumentInfo } from './api';
  import RenameModal from './RenameModal.svelte';

  interface Props {
    isOpen: boolean;
    currentDocumentId?: string;
    onToggle: () => void;
    onSelectDocument: (docId: string) => void;
    onNewDocument: () => void;
  }

  let { isOpen, currentDocumentId, onToggle, onSelectDocument, onNewDocument }: Props = $props();

  let documents: DocumentInfo[] = $state([]);
  let loading = $state(true);
  let error = $state('');

  // Context menu state
  let contextMenuDoc: DocumentInfo | null = $state(null);
  let contextMenuPosition = $state({ x: 0, y: 0 });

  // Rename modal state
  let renameDoc: DocumentInfo | null = $state(null);

  onMount(() => {
    loadDocuments();

    // Close context menu on click elsewhere
    function handleGlobalClick() {
      contextMenuDoc = null;
    }
    document.addEventListener('click', handleGlobalClick);
    return () => document.removeEventListener('click', handleGlobalClick);
  });

  async function loadDocuments() {
    loading = true;
    error = '';
    try {
      documents = await listDocuments();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load documents';
      console.error('Failed to load documents:', e);
    } finally {
      loading = false;
    }
  }

  // Expose refresh function for external callers
  export function refresh() {
    loadDocuments();
  }

  function handleDocumentClick(docId: string) {
    if (docId !== currentDocumentId) {
      onSelectDocument(docId);
    }
  }

  function handleContextMenu(e: MouseEvent, doc: DocumentInfo) {
    e.preventDefault();
    e.stopPropagation();
    contextMenuDoc = doc;
    contextMenuPosition = { x: e.clientX, y: e.clientY };
  }

  function handleRenameClick() {
    if (contextMenuDoc) {
      renameDoc = contextMenuDoc;
      contextMenuDoc = null;
    }
  }

  async function handleRename(newName: string) {
    if (!renameDoc?.title_node_id) return;

    try {
      // Update the first root node's content (which is the document title)
      await updateNode(renameDoc.title_node_id, { content: newName });
      // Refresh the document list
      await loadDocuments();
    } catch (e) {
      console.error('Failed to rename document:', e);
    }
  }

  function handleDoubleClick(e: MouseEvent, doc: DocumentInfo) {
    e.preventDefault();
    e.stopPropagation();
    renameDoc = doc;
  }
</script>

{#if isOpen}
  <aside class="sidebar">
    <div class="sidebar-header">
      <h2>Documents</h2>
      <button
        class="sidebar-close-btn"
        onclick={onToggle}
        title="Close sidebar"
        aria-label="Close sidebar"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 19l-7-7 7-7M4 12h16"/>
        </svg>
      </button>
    </div>

    <div class="sidebar-content">
      {#if loading}
        <div class="sidebar-loading">Loading...</div>
      {:else if error}
        <div class="sidebar-error">{error}</div>
      {:else}
        <div class="document-list">
          {#each documents as doc (doc.id)}
            <button
              class="document-item"
              class:active={doc.id === currentDocumentId}
              onclick={() => handleDocumentClick(doc.id)}
              ondblclick={(e) => handleDoubleClick(e, doc)}
              oncontextmenu={(e) => handleContextMenu(e, doc)}
            >
              <svg class="document-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
              <div class="document-info">
                <span class="document-title">{doc.title || 'Untitled'}</span>
                <span class="document-count">{doc.node_count} items</span>
              </div>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <div class="sidebar-footer">
      <button class="new-document-btn" onclick={onNewDocument}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        <span>New Document</span>
      </button>
    </div>
  </aside>
{/if}

<!-- Context menu for document actions -->
{#if contextMenuDoc}
  <div
    class="context-menu"
    style="left: {contextMenuPosition.x}px; top: {contextMenuPosition.y}px;"
  >
    <button class="context-menu-item" onclick={handleRenameClick}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
      Rename
    </button>
  </div>
{/if}

<!-- Rename modal -->
<RenameModal
  isOpen={renameDoc !== null}
  currentName={renameDoc?.title || ''}
  onRename={handleRename}
  onClose={() => renameDoc = null}
/>

<style>
  .sidebar {
    width: 260px;
    height: 100%;
    background: var(--bg-secondary);
    border-right: 1px solid var(--border-primary);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-primary);
  }

  .sidebar-header h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .sidebar-close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    color: var(--text-secondary);
  }

  .sidebar-close-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .sidebar-close-btn svg {
    width: 16px;
    height: 16px;
  }

  .sidebar-content {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  .sidebar-loading,
  .sidebar-error {
    padding: 16px;
    text-align: center;
    color: var(--text-secondary);
    font-size: 13px;
  }

  .sidebar-error {
    color: var(--status-error);
  }

  .document-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .document-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 12px;
    background: transparent;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    text-align: left;
    transition: background-color 0.1s;
  }

  .document-item:hover {
    background: var(--bg-tertiary);
  }

  .document-item.active {
    background: var(--sidebar-active-bg);
  }

  .document-icon {
    width: 18px;
    height: 18px;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .document-item.active .document-icon {
    color: var(--sidebar-active-text);
  }

  .document-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .document-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .document-item.active .document-title {
    color: var(--sidebar-active-text);
  }

  .document-count {
    font-size: 11px;
    color: var(--text-tertiary);
  }

  .sidebar-footer {
    padding: 12px;
    border-top: 1px solid var(--border-primary);
  }

  .new-document-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 10px;
    background: var(--bg-elevated);
    border: 1px dashed var(--border-primary);
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    color: var(--text-secondary);
    transition: all 0.1s;
  }

  .new-document-btn:hover {
    background: var(--bg-tertiary);
    border-color: var(--text-tertiary);
    color: var(--text-primary);
  }

  .new-document-btn svg {
    width: 16px;
    height: 16px;
  }

  /* Context menu */
  .context-menu {
    position: fixed;
    background: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    padding: 4px;
    z-index: 1000;
    min-width: 140px;
  }

  .context-menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    color: var(--text-primary);
    text-align: left;
  }

  .context-menu-item:hover {
    background: var(--bg-tertiary);
  }

  .context-menu-item svg {
    width: 14px;
    height: 14px;
    color: var(--text-secondary);
  }
</style>
