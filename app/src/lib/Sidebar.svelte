<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    listDocuments,
    updateNode,
    getFolders,
    createFolder,
    updateFolder,
    deleteFolder,
    moveDocumentToFolder,
    type DocumentInfo,
    type Folder,
    type FolderState,
  } from './api';
  import RenameModal from './RenameModal.svelte';

  // Tauri event listener types
  type UnlistenFn = () => void;

  interface Props {
    isOpen: boolean;
    currentDocumentId?: string;
    onToggle: () => void;
    onSelectDocument: (docId: string) => void;
    onNewDocument: () => void;
  }

  let { isOpen, currentDocumentId, onToggle, onSelectDocument, onNewDocument }: Props = $props();

  let documents: DocumentInfo[] = $state([]);
  let folderState: FolderState = $state({ folders: [], document_folders: {}, document_order: {} });
  let loading = $state(true);
  let error = $state('');

  // Context menu state
  type ContextMenuTarget = { type: 'document'; doc: DocumentInfo } | { type: 'folder'; folder: Folder } | null;
  let contextMenuTarget: ContextMenuTarget = $state(null);
  let contextMenuPosition = $state({ x: 0, y: 0 });

  // Rename modal state
  let renameDoc: DocumentInfo | null = $state(null);
  let renameFolder: Folder | null = $state(null);

  // New folder input state
  let showNewFolderInput = $state(false);
  let newFolderName = $state('');

  // Drag and drop state
  let dragItem: { type: 'document' | 'folder'; id: string } | null = $state(null);
  let dropTarget: { type: 'folder' | 'root'; id?: string } | null = $state(null);

  // Computed: documents organized by folder
  let organizedItems = $derived.by(() => {
    const docsById = new Map(documents.map((d) => [d.id, d]));
    const result: {
      rootDocs: DocumentInfo[];
      folders: Array<{ folder: Folder; docs: DocumentInfo[] }>;
    } = {
      rootDocs: [],
      folders: [],
    };

    // Get root documents (not in any folder)
    const rootDocIds = folderState.document_order['__root__'] || [];
    for (const docId of rootDocIds) {
      const doc = docsById.get(docId);
      if (doc) {
        result.rootDocs.push(doc);
        docsById.delete(docId);
      }
    }

    // Get folders and their documents
    for (const folder of folderState.folders) {
      const folderDocIds = folderState.document_order[folder.id] || [];
      const folderDocs: DocumentInfo[] = [];
      for (const docId of folderDocIds) {
        const doc = docsById.get(docId);
        if (doc) {
          folderDocs.push(doc);
          docsById.delete(docId);
        }
      }
      result.folders.push({ folder, docs: folderDocs });
    }

    // Any remaining documents (not assigned to any folder or root order) go to root
    for (const doc of docsById.values()) {
      result.rootDocs.push(doc);
    }

    return result;
  });

  // Store unlisten function for cleanup
  let unlistenDocumentsChanged: UnlistenFn | null = null;
  let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

  // Debounced refresh to avoid rapid reloads
  function debouncedRefresh() {
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }
    debounceTimeout = setTimeout(() => {
      console.log('[Sidebar] Refreshing documents list due to filesystem change');
      loadAll();
      debounceTimeout = null;
    }, 500);
  }

  onMount(() => {
    loadAll();

    // Close context menu on click elsewhere
    function handleGlobalClick() {
      contextMenuTarget = null;
    }
    document.addEventListener('click', handleGlobalClick);

    // Listen for documents-changed events from Tauri
    (async () => {
      try {
        // Check if we're in Tauri environment
        if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
          const { listen } = await import('@tauri-apps/api/event');
          unlistenDocumentsChanged = await listen('documents-changed', (_event) => {
            console.log('[Sidebar] Received documents-changed event');
            debouncedRefresh();
          });
          console.log('[Sidebar] Documents change listener registered');
        }
      } catch (e) {
        console.error('[Sidebar] Failed to set up documents-changed listener:', e);
      }
    })();

    return () => {
      document.removeEventListener('click', handleGlobalClick);
      if (unlistenDocumentsChanged) {
        unlistenDocumentsChanged();
      }
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
    };
  });

  async function loadAll() {
    loading = true;
    error = '';
    try {
      const [docs, folders] = await Promise.all([listDocuments(), getFolders()]);
      documents = docs;
      folderState = folders;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load documents';
      console.error('Failed to load documents:', e);
    } finally {
      loading = false;
    }
  }

  // Expose refresh function for external callers
  export function refresh() {
    loadAll();
  }

  function handleDocumentClick(docId: string) {
    if (docId !== currentDocumentId) {
      onSelectDocument(docId);
    }
  }

  function handleDocumentContextMenu(e: MouseEvent, doc: DocumentInfo) {
    e.preventDefault();
    e.stopPropagation();
    contextMenuTarget = { type: 'document', doc };
    contextMenuPosition = { x: e.clientX, y: e.clientY };
  }

  function handleFolderContextMenu(e: MouseEvent, folder: Folder) {
    e.preventDefault();
    e.stopPropagation();
    contextMenuTarget = { type: 'folder', folder };
    contextMenuPosition = { x: e.clientX, y: e.clientY };
  }

  function handleRenameDocClick() {
    if (contextMenuTarget?.type === 'document') {
      renameDoc = contextMenuTarget.doc;
      contextMenuTarget = null;
    }
  }

  function handleRenameFolderClick() {
    if (contextMenuTarget?.type === 'folder') {
      renameFolder = contextMenuTarget.folder;
      contextMenuTarget = null;
    }
  }

  async function handleDeleteFolderClick() {
    if (contextMenuTarget?.type === 'folder') {
      const folder = contextMenuTarget.folder;
      contextMenuTarget = null;
      try {
        await deleteFolder(folder.id);
        await loadAll();
      } catch (e) {
        console.error('Failed to delete folder:', e);
      }
    }
  }

  async function handleMoveToRootClick() {
    if (contextMenuTarget?.type === 'document') {
      const doc = contextMenuTarget.doc;
      contextMenuTarget = null;
      try {
        await moveDocumentToFolder(doc.id, null);
        await loadAll();
      } catch (e) {
        console.error('Failed to move document:', e);
      }
    }
  }

  async function handleRenameDoc(newName: string) {
    if (!renameDoc?.title_node_id) return;

    try {
      await updateNode(renameDoc.title_node_id, { content: newName });
      await loadAll();
    } catch (e) {
      console.error('Failed to rename document:', e);
    }
  }

  async function handleRenameFolder(newName: string) {
    if (!renameFolder) return;

    try {
      await updateFolder(renameFolder.id, newName);
      await loadAll();
    } catch (e) {
      console.error('Failed to rename folder:', e);
    }
  }

  function handleDocDoubleClick(e: MouseEvent, doc: DocumentInfo) {
    e.preventDefault();
    e.stopPropagation();
    renameDoc = doc;
  }

  function handleFolderDoubleClick(e: MouseEvent, folder: Folder) {
    e.preventDefault();
    e.stopPropagation();
    renameFolder = folder;
  }

  async function toggleFolderCollapse(folder: Folder) {
    try {
      await updateFolder(folder.id, undefined, !folder.collapsed);
      // Update local state immediately for responsiveness
      const idx = folderState.folders.findIndex((f) => f.id === folder.id);
      if (idx !== -1) {
        folderState.folders[idx] = { ...folderState.folders[idx], collapsed: !folder.collapsed };
      }
    } catch (e) {
      console.error('Failed to toggle folder collapse:', e);
    }
  }

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return;

    try {
      await createFolder(newFolderName.trim());
      newFolderName = '';
      showNewFolderInput = false;
      await loadAll();
    } catch (e) {
      console.error('Failed to create folder:', e);
    }
  }

  function handleNewFolderKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      handleCreateFolder();
    } else if (e.key === 'Escape') {
      showNewFolderInput = false;
      newFolderName = '';
    }
  }

  // Drag and drop handlers
  function handleDragStart(e: DragEvent, type: 'document' | 'folder', id: string) {
    dragItem = { type, id };
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
    }
  }

  function handleDragEnd() {
    dragItem = null;
    dropTarget = null;
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
  }

  function handleFolderDragEnter(e: DragEvent, folderId: string) {
    e.preventDefault();
    if (dragItem?.type === 'document') {
      dropTarget = { type: 'folder', id: folderId };
    }
  }

  function handleRootDragEnter(e: DragEvent) {
    e.preventDefault();
    if (dragItem?.type === 'document') {
      dropTarget = { type: 'root' };
    }
  }

  function handleDragLeave() {
    // Only clear if leaving the drop zone entirely
    // (handled by checking in handleDrop)
  }

  async function handleDrop(e: DragEvent, targetType: 'folder' | 'root', folderId?: string) {
    e.preventDefault();
    e.stopPropagation();

    if (!dragItem) return;

    if (dragItem.type === 'document') {
      try {
        await moveDocumentToFolder(dragItem.id, targetType === 'folder' ? folderId! : null);
        await loadAll();
      } catch (err) {
        console.error('Failed to move document:', err);
      }
    }

    dragItem = null;
    dropTarget = null;
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
          <path d="M11 19l-7-7 7-7M4 12h16" />
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
          <!-- Folders -->
          {#each organizedItems.folders as { folder, docs } (folder.id)}
            <div class="folder-section">
              <div
                class="folder-header"
                role="button"
                tabindex="0"
                class:drop-target={dropTarget?.type === 'folder' && dropTarget.id === folder.id}
                ondblclick={(e) => handleFolderDoubleClick(e, folder)}
                oncontextmenu={(e) => handleFolderContextMenu(e, folder)}
                ondragover={handleDragOver}
                ondragenter={(e) => handleFolderDragEnter(e, folder.id)}
                ondrop={(e) => handleDrop(e, 'folder', folder.id)}
              >
                <button
                  class="folder-collapse-btn"
                  onclick={(e) => { e.stopPropagation(); toggleFolderCollapse(folder); }}
                  title={folder.collapsed ? 'Expand folder' : 'Collapse folder'}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    class:collapsed={folder.collapsed}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                <svg class="folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path
                    d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
                  />
                </svg>
                <span class="folder-name">{folder.name}</span>
                <span class="folder-count">{docs.length}</span>
              </div>

              {#if !folder.collapsed}
                <div class="folder-contents">
                  {#each docs as doc (doc.id)}
                    <button
                      class="document-item in-folder"
                      class:active={doc.id === currentDocumentId}
                      draggable="true"
                      onclick={() => handleDocumentClick(doc.id)}
                      ondblclick={(e) => handleDocDoubleClick(e, doc)}
                      oncontextmenu={(e) => handleDocumentContextMenu(e, doc)}
                      ondragstart={(e) => handleDragStart(e, 'document', doc.id)}
                      ondragend={handleDragEnd}
                    >
                      <svg
                        class="document-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
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
          {/each}

          <!-- Root level documents (not in any folder) -->
          <div
            class="root-documents"
            class:drop-target={dropTarget?.type === 'root'}
            ondragover={handleDragOver}
            ondragenter={handleRootDragEnter}
            ondrop={(e) => handleDrop(e, 'root')}
          >
            {#each organizedItems.rootDocs as doc (doc.id)}
              <button
                class="document-item"
                class:active={doc.id === currentDocumentId}
                draggable="true"
                onclick={() => handleDocumentClick(doc.id)}
                ondblclick={(e) => handleDocDoubleClick(e, doc)}
                oncontextmenu={(e) => handleDocumentContextMenu(e, doc)}
                ondragstart={(e) => handleDragStart(e, 'document', doc.id)}
                ondragend={handleDragEnd}
              >
                <svg
                  class="document-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
                <div class="document-info">
                  <span class="document-title">{doc.title || 'Untitled'}</span>
                  <span class="document-count">{doc.node_count} items</span>
                </div>
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    <div class="sidebar-footer">
      {#if showNewFolderInput}
        <div class="new-folder-input-container">
          <input
            type="text"
            class="new-folder-input"
            placeholder="Folder name..."
            bind:value={newFolderName}
            onkeydown={handleNewFolderKeydown}
            autofocus
          />
          <button class="new-folder-confirm" onclick={handleCreateFolder} disabled={!newFolderName.trim()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
          <button class="new-folder-cancel" onclick={() => { showNewFolderInput = false; newFolderName = ''; }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      {:else}
        <div class="footer-buttons">
          <button class="new-folder-btn" onclick={() => (showNewFolderInput = true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path
                d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
              />
              <line x1="12" y1="11" x2="12" y2="17" />
              <line x1="9" y1="14" x2="15" y2="14" />
            </svg>
            <span>New Folder</span>
          </button>
          <button class="new-document-btn" onclick={onNewDocument}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>New Document</span>
          </button>
        </div>
      {/if}
    </div>
  </aside>
{/if}

<!-- Context menu for document actions -->
{#if contextMenuTarget?.type === 'document'}
  <div class="context-menu" style="left: {contextMenuPosition.x}px; top: {contextMenuPosition.y}px;">
    <button class="context-menu-item" onclick={handleRenameDocClick}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
      Rename
    </button>
    {#if folderState.document_folders[contextMenuTarget.doc.id]}
      <button class="context-menu-item" onclick={handleMoveToRootClick}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        Move to Root
      </button>
    {/if}
    {#if organizedItems.folders.length > 0}
      <div class="context-menu-divider"></div>
      <div class="context-menu-label">Move to folder:</div>
      {#each organizedItems.folders as { folder }}
        {#if folderState.document_folders[contextMenuTarget.doc.id] !== folder.id}
          <button
            class="context-menu-item"
            onclick={async () => {
              if (contextMenuTarget?.type === 'document') {
                const doc = contextMenuTarget.doc;
                contextMenuTarget = null;
                await moveDocumentToFolder(doc.id, folder.id);
                await loadAll();
              }
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path
                d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
              />
            </svg>
            {folder.name}
          </button>
        {/if}
      {/each}
    {/if}
  </div>
{/if}

<!-- Context menu for folder actions -->
{#if contextMenuTarget?.type === 'folder'}
  <div class="context-menu" style="left: {contextMenuPosition.x}px; top: {contextMenuPosition.y}px;">
    <button class="context-menu-item" onclick={handleRenameFolderClick}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
      Rename
    </button>
    <button class="context-menu-item context-menu-item-danger" onclick={handleDeleteFolderClick}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
      Delete Folder
    </button>
  </div>
{/if}

<!-- Rename document modal -->
<RenameModal
  isOpen={renameDoc !== null}
  currentName={renameDoc?.title || ''}
  onRename={handleRenameDoc}
  onClose={() => (renameDoc = null)}
/>

<!-- Rename folder modal -->
<RenameModal
  isOpen={renameFolder !== null}
  currentName={renameFolder?.name || ''}
  onRename={handleRenameFolder}
  onClose={() => (renameFolder = null)}
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

  /* Folder styles */
  .folder-section {
    margin-bottom: 4px;
  }

  .folder-header {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 8px 10px;
    background: transparent;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    text-align: left;
    transition: background-color 0.1s;
  }

  .folder-header:hover {
    background: var(--bg-tertiary);
  }

  .folder-header.drop-target {
    background: var(--status-info-bg, rgba(59, 130, 246, 0.15));
    outline: 2px dashed var(--status-info, #3b82f6);
  }

  .folder-collapse-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    color: var(--text-tertiary);
    flex-shrink: 0;
  }

  .folder-collapse-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-secondary);
  }

  .folder-collapse-btn svg {
    width: 14px;
    height: 14px;
    transition: transform 0.15s ease;
  }

  .folder-collapse-btn svg.collapsed {
    transform: rotate(-90deg);
  }

  .folder-icon {
    width: 16px;
    height: 16px;
    color: var(--text-tertiary);
    flex-shrink: 0;
  }

  .folder-name {
    flex: 1;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .folder-count {
    font-size: 11px;
    color: var(--text-tertiary);
    padding: 2px 6px;
    background: var(--bg-tertiary);
    border-radius: 10px;
    flex-shrink: 0;
  }

  .folder-contents {
    margin-left: 8px;
    padding-left: 12px;
    border-left: 1px solid var(--border-primary);
  }

  .root-documents {
    min-height: 20px;
    padding: 4px;
    border-radius: 6px;
    transition: background-color 0.1s;
  }

  .root-documents.drop-target {
    background: var(--status-info-bg, rgba(59, 130, 246, 0.15));
    outline: 2px dashed var(--status-info, #3b82f6);
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

  .document-item.in-folder {
    padding: 8px 10px;
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

  .document-item.in-folder .document-icon {
    width: 16px;
    height: 16px;
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

  .document-item.in-folder .document-title {
    font-size: 12px;
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

  .footer-buttons {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .new-folder-btn,
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

  .new-folder-btn:hover,
  .new-document-btn:hover {
    background: var(--bg-tertiary);
    border-color: var(--text-tertiary);
    color: var(--text-primary);
  }

  .new-folder-btn svg,
  .new-document-btn svg {
    width: 16px;
    height: 16px;
  }

  .new-folder-input-container {
    display: flex;
    gap: 6px;
  }

  .new-folder-input {
    flex: 1;
    padding: 8px 10px;
    background: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: 6px;
    font-size: 13px;
    color: var(--text-primary);
  }

  .new-folder-input:focus {
    outline: none;
    border-color: var(--text-tertiary);
  }

  .new-folder-confirm,
  .new-folder-cancel {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    background: var(--bg-elevated);
    border: 1px solid var(--border-primary);
    border-radius: 6px;
    cursor: pointer;
    color: var(--text-secondary);
  }

  .new-folder-confirm:hover:not(:disabled) {
    background: var(--status-success-bg, rgba(34, 197, 94, 0.15));
    border-color: var(--status-success, #22c55e);
    color: var(--status-success, #22c55e);
  }

  .new-folder-confirm:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .new-folder-cancel:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .new-folder-confirm svg,
  .new-folder-cancel svg {
    width: 14px;
    height: 14px;
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
    min-width: 160px;
    max-height: 300px;
    overflow-y: auto;
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

  .context-menu-item-danger {
    color: var(--status-error);
  }

  .context-menu-item-danger:hover {
    background: var(--status-error-bg, rgba(239, 68, 68, 0.15));
  }

  .context-menu-item svg {
    width: 14px;
    height: 14px;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .context-menu-item-danger svg {
    color: var(--status-error);
  }

  .context-menu-divider {
    height: 1px;
    background: var(--border-primary);
    margin: 4px 0;
  }

  .context-menu-label {
    padding: 4px 12px;
    font-size: 11px;
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
</style>
