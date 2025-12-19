<script lang="ts">
  import { onMount } from 'svelte';
  import { listDocuments, type DocumentInfo } from './api';

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

  onMount(() => {
    loadDocuments();
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

  function handleDocumentClick(docId: string) {
    if (docId !== currentDocumentId) {
      onSelectDocument(docId);
    }
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

<style>
  .sidebar {
    width: 260px;
    height: 100%;
    background: #f8f9fa;
    border-right: 1px solid #e0e0e0;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid #e0e0e0;
  }

  .sidebar-header h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #333;
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
    color: #666;
  }

  .sidebar-close-btn:hover {
    background: #e8e8e8;
    color: #333;
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
    color: #666;
    font-size: 13px;
  }

  .sidebar-error {
    color: #dc2626;
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
    background: #e8e8e8;
  }

  .document-item.active {
    background: #e3f2fd;
  }

  .document-icon {
    width: 18px;
    height: 18px;
    color: #666;
    flex-shrink: 0;
  }

  .document-item.active .document-icon {
    color: #1976d2;
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
    color: #333;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .document-item.active .document-title {
    color: #1976d2;
  }

  .document-count {
    font-size: 11px;
    color: #888;
  }

  .sidebar-footer {
    padding: 12px;
    border-top: 1px solid #e0e0e0;
  }

  .new-document-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 10px;
    background: #fff;
    border: 1px dashed #ccc;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    color: #666;
    transition: all 0.1s;
  }

  .new-document-btn:hover {
    background: #f0f0f0;
    border-color: #999;
    color: #333;
  }

  .new-document-btn svg {
    width: 16px;
    height: 16px;
  }
</style>
