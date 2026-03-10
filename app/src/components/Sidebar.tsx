import React, { useState, useEffect, useCallback, useMemo, useRef, useImperativeHandle, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import {
  listDocuments,
  updateNode,
  getFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  deleteDocument,
  moveDocumentToFolder,
  reorderFolders,
  type DocumentInfo,
  type Folder,
  type FolderState,
} from '../lib/api';
import { RenameModal } from './ui/RenameModal';
import { closeAllContextMenus, CLOSE_ALL_CONTEXT_MENUS } from './ui/ContextMenu';
import { showToast } from '../store/toastStore';
import { useSettingsStore } from '../store/settingsStore';
import { useSavedSearchStore, type SavedSearch } from '../store/savedSearchStore';
import { useBookmarkStore } from '../store/bookmarkStore';
import { EmojiPicker } from './ui/EmojiPicker';
import { CustomEmojiManager } from './ui/CustomEmojiManager';
import type { Bookmark } from '../lib/api';

interface SidebarProps {
  isOpen: boolean;
  currentDocumentId?: string;
  onToggle: () => void;
  onSelectDocument: (docId: string) => void;
  onNewDocument: () => void;
  onDeleteDocument: (docId: string) => void;
  onApplySavedSearch?: (query: string) => void;
  onNavigateToBookmark?: (nodeId: string, documentId: string) => void;
}

export interface SidebarRef {
  refresh: () => void;
}

type ContextMenuTarget = { type: 'document'; doc: DocumentInfo } | { type: 'folder'; folder: Folder } | null;

interface DragItem {
  type: 'document' | 'folder';
  id: string;
}

interface DropTarget {
  type: 'folder' | 'root';
  id?: string;
}

interface FolderDropTarget {
  folderId: string;
  position: 'before' | 'after';
}

export const Sidebar = forwardRef<SidebarRef, SidebarProps>(function Sidebar(
  { isOpen, currentDocumentId, onToggle, onSelectDocument, onNewDocument, onDeleteDocument, onApplySavedSearch, onNavigateToBookmark },
  ref
) {
  const confirmDelete = useSettingsStore((s) => s.confirmDelete);
  const savedSearches = useSavedSearchStore((s) => s.savedSearches);
  const removeSavedSearch = useSavedSearchStore((s) => s.removeSavedSearch);
  const bookmarks = useBookmarkStore((s) => s.bookmarks);
  const isBookmarked = useBookmarkStore((s) => s.isBookmarked);
  const removeBookmark = useBookmarkStore((s) => s.remove);
  const addBookmark = useBookmarkStore((s) => s.add);
  const updateBookmarkEmoji = useBookmarkStore((s) => s.updateEmoji);

  // Bookmark context menu state
  const [bookmarkContextMenu, setBookmarkContextMenu] = useState<{ bookmark: Bookmark; x: number; y: number } | null>(null);
  const [emojiPickerBookmark, setEmojiPickerBookmark] = useState<{ bookmark: Bookmark; x: number; y: number } | null>(null);
  const [showCustomEmojiManager, setShowCustomEmojiManager] = useState(false);

  // Saved search context menu state
  const [savedSearchContextMenu, setSavedSearchContextMenu] = useState<{ search: SavedSearch; x: number; y: number } | null>(null);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [folderState, setFolderState] = useState<FolderState>({ folders: [], document_folders: {}, document_order: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Context menu state
  const [contextMenuTarget, setContextMenuTarget] = useState<ContextMenuTarget>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });

  // Rename modal state
  const [renameDoc, setRenameDoc] = useState<DocumentInfo | null>(null);
  const [renameFolder, setRenameFolder] = useState<Folder | null>(null);

  // New folder input state
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  // Drag and drop state
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  // Folder reorder drag-drop state
  const [folderDropTarget, setFolderDropTarget] = useState<FolderDropTarget | null>(null);

  // Load documents and folders
  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [docs, folders] = await Promise.all([listDocuments(), getFolders()]);
      setDocuments(docs);
      setFolderState(folders);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load documents');
      console.error('Failed to load documents:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Expose refresh function via ref
  useImperativeHandle(ref, () => ({
    refresh: loadAll
  }), [loadAll]);

  // Initial load
  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Close context menus on click elsewhere or when another context menu opens
  useEffect(() => {
    function handleGlobalClick() {
      setContextMenuTarget(null);
      setSavedSearchContextMenu(null);
      setBookmarkContextMenu(null);
    }
    function handleCloseAll() {
      setContextMenuTarget(null);
      setSavedSearchContextMenu(null);
      setBookmarkContextMenu(null);
    }
    document.addEventListener('click', handleGlobalClick);
    document.addEventListener(CLOSE_ALL_CONTEXT_MENUS, handleCloseAll);
    return () => {
      document.removeEventListener('click', handleGlobalClick);
      document.removeEventListener(CLOSE_ALL_CONTEXT_MENUS, handleCloseAll);
    };
  }, []);

  // Focus new folder input when shown
  useEffect(() => {
    if (showNewFolderInput && newFolderInputRef.current) {
      newFolderInputRef.current.focus();
    }
  }, [showNewFolderInput]);

  // Computed: documents organized by folder
  const organizedItems = useMemo(() => {
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
  }, [documents, folderState]);

  // Event handlers
  const handleDocumentClick = useCallback((docId: string) => {
    if (docId !== currentDocumentId) {
      onSelectDocument(docId);
    }
  }, [currentDocumentId, onSelectDocument]);

  const handleDocumentContextMenu = useCallback((e: React.MouseEvent, doc: DocumentInfo) => {
    e.preventDefault();
    e.stopPropagation();
    closeAllContextMenus();
    setContextMenuTarget({ type: 'document', doc });
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
  }, []);

  const handleFolderContextMenu = useCallback((e: React.MouseEvent, folder: Folder) => {
    e.preventDefault();
    e.stopPropagation();
    closeAllContextMenus();
    setContextMenuTarget({ type: 'folder', folder });
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
  }, []);

  const handleRenameDocClick = useCallback(() => {
    if (contextMenuTarget?.type === 'document') {
      setRenameDoc(contextMenuTarget.doc);
      setContextMenuTarget(null);
    }
  }, [contextMenuTarget]);

  const handleRenameFolderClick = useCallback(() => {
    if (contextMenuTarget?.type === 'folder') {
      setRenameFolder(contextMenuTarget.folder);
      setContextMenuTarget(null);
    }
  }, [contextMenuTarget]);

  const handleDeleteFolderClick = useCallback(async () => {
    if (contextMenuTarget?.type === 'folder') {
      const folder = contextMenuTarget.folder;
      setContextMenuTarget(null);
      try {
        await deleteFolder(folder.id);
        await loadAll();
      } catch (e) {
        console.error('Failed to delete folder:', e);
        showToast('Failed to delete folder');
      }
    }
  }, [contextMenuTarget, loadAll]);

  const handleDeleteDocumentClick = useCallback(async () => {
    if (contextMenuTarget?.type === 'document') {
      const doc = contextMenuTarget.doc;
      setContextMenuTarget(null);
      if (confirmDelete && !window.confirm(`Delete "${doc.title || 'Untitled'}"? This cannot be undone.`)) {
        return;
      }
      try {
        await deleteDocument(doc.id);
        if (doc.id === currentDocumentId) {
          onDeleteDocument(doc.id);
        }
        await loadAll();
      } catch (e) {
        console.error('Failed to delete document:', e);
        showToast('Failed to delete document');
      }
    }
  }, [contextMenuTarget, confirmDelete, currentDocumentId, onDeleteDocument, loadAll]);

  const handleMoveToRootClick = useCallback(async () => {
    if (contextMenuTarget?.type === 'document') {
      const doc = contextMenuTarget.doc;
      setContextMenuTarget(null);
      try {
        await moveDocumentToFolder(doc.id, null);
        await loadAll();
      } catch (e) {
        console.error('Failed to move document:', e);
        showToast('Failed to move document');
      }
    }
  }, [contextMenuTarget, loadAll]);

  const handleRenameDoc = useCallback(async (newName: string) => {
    if (!renameDoc?.title_node_id) return;

    try {
      await updateNode(renameDoc.title_node_id, { content: newName });
      await loadAll();
    } catch (e) {
      console.error('Failed to rename document:', e);
      showToast('Failed to rename document');
    }
  }, [renameDoc, loadAll]);

  const handleRenameFolder = useCallback(async (newName: string) => {
    if (!renameFolder) return;

    try {
      await updateFolder(renameFolder.id, newName);
      await loadAll();
    } catch (e) {
      console.error('Failed to rename folder:', e);
      showToast('Failed to rename folder');
    }
  }, [renameFolder, loadAll]);

  const handleDocDoubleClick = useCallback((e: React.MouseEvent, doc: DocumentInfo) => {
    e.preventDefault();
    e.stopPropagation();
    setRenameDoc(doc);
  }, []);

  const handleFolderDoubleClick = useCallback((e: React.MouseEvent, folder: Folder) => {
    e.preventDefault();
    e.stopPropagation();
    setRenameFolder(folder);
  }, []);

  const toggleFolderCollapse = useCallback(async (folder: Folder) => {
    try {
      await updateFolder(folder.id, undefined, !folder.collapsed);
      // Update local state immediately for responsiveness
      setFolderState(prev => ({
        ...prev,
        folders: prev.folders.map(f =>
          f.id === folder.id ? { ...f, collapsed: !folder.collapsed } : f
        )
      }));
    } catch (e) {
      console.error('Failed to toggle folder collapse:', e);
    }
  }, []);

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) return;

    try {
      await createFolder(newFolderName.trim());
      setNewFolderName('');
      setShowNewFolderInput(false);
      await loadAll();
    } catch (e) {
      console.error('Failed to create folder:', e);
      showToast('Failed to create folder');
    }
  }, [newFolderName, loadAll]);

  const handleNewFolderKeydown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCreateFolder();
    } else if (e.key === 'Escape') {
      setShowNewFolderInput(false);
      setNewFolderName('');
    }
  }, [handleCreateFolder]);

  const handleMoveToFolder = useCallback(async (folderId: string) => {
    if (contextMenuTarget?.type === 'document') {
      const doc = contextMenuTarget.doc;
      setContextMenuTarget(null);
      await moveDocumentToFolder(doc.id, folderId);
      await loadAll();
    }
  }, [contextMenuTarget, loadAll]);

  // Drag and drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, type: 'document' | 'folder', id: string) => {
    setDragItem({ type, id });
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
    }
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragItem(null);
    setDropTarget(null);
    setFolderDropTarget(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
  }, []);

  const handleFolderDragEnter = useCallback((e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    if (dragItem?.type === 'document') {
      setDropTarget({ type: 'folder', id: folderId });
    }
  }, [dragItem]);

  const handleRootDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (dragItem?.type === 'document') {
      setDropTarget({ type: 'root' });
    }
  }, [dragItem]);

  const handleDrop = useCallback(async (e: React.DragEvent, targetType: 'folder' | 'root', folderId?: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!dragItem) return;

    if (dragItem.type === 'document') {
      try {
        await moveDocumentToFolder(dragItem.id, targetType === 'folder' ? folderId! : null);
        await loadAll();
      } catch (err) {
        console.error('Failed to move document:', err);
        showToast('Failed to move document');
      }
    }

    setDragItem(null);
    setDropTarget(null);
  }, [dragItem, loadAll]);

  // Folder reorder: drag over a folder to determine insertion position (above/below midpoint)
  const handleFolderReorderDragOver = useCallback((e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    if (dragItem?.type !== 'folder' || dragItem.id === folderId) {
      return;
    }
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position = e.clientY < midY ? 'before' : 'after';
    setFolderDropTarget({ folderId, position });
  }, [dragItem]);

  // Folder reorder: drop handler
  const handleFolderReorderDrop = useCallback(async (e: React.DragEvent, targetFolderId: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!dragItem || dragItem.type !== 'folder' || dragItem.id === targetFolderId) {
      setFolderDropTarget(null);
      return;
    }

    const currentFolderIds = organizedItems.folders.map(({ folder }) => folder.id);
    const dragIndex = currentFolderIds.indexOf(dragItem.id);
    const targetIndex = currentFolderIds.indexOf(targetFolderId);

    if (dragIndex === -1 || targetIndex === -1) {
      setFolderDropTarget(null);
      return;
    }

    // Build new order: remove dragged folder, insert at target position
    const newOrder = currentFolderIds.filter((id) => id !== dragItem.id);
    const insertIndex = folderDropTarget?.position === 'before'
      ? newOrder.indexOf(targetFolderId)
      : newOrder.indexOf(targetFolderId) + 1;
    newOrder.splice(insertIndex, 0, dragItem.id);

    setDragItem(null);
    setDropTarget(null);
    setFolderDropTarget(null);

    try {
      await reorderFolders(newOrder);
      await loadAll();
    } catch (err) {
      console.error('Failed to reorder folders:', err);
      showToast('Failed to reorder folders');
    }
  }, [dragItem, organizedItems.folders, folderDropTarget, loadAll]);

  if (!isOpen) {
    return null;
  }

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>Documents</h2>
          <button
            className="sidebar-close-btn"
            onClick={onToggle}
            title="Close sidebar"
            aria-label="Close sidebar"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 19l-7-7 7-7M4 12h16" />
            </svg>
          </button>
        </div>

        <div className="sidebar-content">
          {loading ? (
            <div className="sidebar-loading">Loading...</div>
          ) : error ? (
            <div className="sidebar-error">{error}</div>
          ) : (
            <div className="document-list">
              {/* Folders */}
              {organizedItems.folders.map(({ folder, docs }) => (
                <div key={folder.id} className={`folder-section${folderDropTarget?.folderId === folder.id && dragItem?.type === 'folder' ? ` folder-reorder-${folderDropTarget.position}` : ''}`}>
                  <div
                    className={`folder-header ${dropTarget?.type === 'folder' && dropTarget.id === folder.id ? 'drop-target' : ''} ${dragItem?.type === 'folder' && dragItem.id === folder.id ? 'dragging' : ''}`}
                    role="button"
                    tabIndex={0}
                    draggable="true"
                    onDoubleClick={(e) => handleFolderDoubleClick(e, folder)}
                    onContextMenu={(e) => handleFolderContextMenu(e, folder)}
                    onDragStart={(e) => handleDragStart(e, 'folder', folder.id)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => {
                      if (dragItem?.type === 'folder') {
                        handleFolderReorderDragOver(e, folder.id);
                      } else {
                        handleDragOver(e);
                      }
                    }}
                    onDragEnter={(e) => {
                      if (dragItem?.type === 'document') {
                        handleFolderDragEnter(e, folder.id);
                      }
                    }}
                    onDragLeave={(e) => {
                      // Only clear if leaving the folder-header entirely (not entering a child)
                      if (dragItem?.type === 'folder' && !e.currentTarget.contains(e.relatedTarget as Node)) {
                        setFolderDropTarget(null);
                      }
                    }}
                    onDrop={(e) => {
                      if (dragItem?.type === 'folder') {
                        handleFolderReorderDrop(e, folder.id);
                      } else {
                        handleDrop(e, 'folder', folder.id);
                      }
                    }}
                  >
                    <button
                      className="folder-collapse-btn"
                      onClick={(e) => { e.stopPropagation(); toggleFolderCollapse(folder); }}
                      title={folder.collapsed ? 'Expand folder' : 'Collapse folder'}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className={folder.collapsed ? 'collapsed' : ''}
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                    <svg className="folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                    <span className="folder-name">{folder.name}</span>
                    <span className="folder-count">{docs.length}</span>
                  </div>

                  {!folder.collapsed && (
                    <div className="folder-contents">
                      {docs.map((doc) => (
                        <button
                          key={doc.id}
                          className={`document-item in-folder ${doc.id === currentDocumentId ? 'active' : ''}`}
                          draggable="true"
                          onClick={() => handleDocumentClick(doc.id)}
                          onDoubleClick={(e) => handleDocDoubleClick(e, doc)}
                          onContextMenu={(e) => handleDocumentContextMenu(e, doc)}
                          onDragStart={(e) => handleDragStart(e, 'document', doc.id)}
                          onDragEnd={handleDragEnd}
                        >
                          <svg className="document-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                            <polyline points="10 9 9 9 8 9" />
                          </svg>
                          <div className="document-info">
                            <span className="document-title">{doc.title || 'Untitled'}</span>
                            <span className="document-count">{doc.node_count} items</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {/* Root level documents */}
              <div
                className={`root-documents ${dropTarget?.type === 'root' ? 'drop-target' : ''}`}
                onDragOver={handleDragOver}
                onDragEnter={handleRootDragEnter}
                onDrop={(e) => handleDrop(e, 'root')}
              >
                {organizedItems.rootDocs.map((doc) => (
                  <button
                    key={doc.id}
                    className={`document-item ${doc.id === currentDocumentId ? 'active' : ''}`}
                    draggable="true"
                    onClick={() => handleDocumentClick(doc.id)}
                    onDoubleClick={(e) => handleDocDoubleClick(e, doc)}
                    onContextMenu={(e) => handleDocumentContextMenu(e, doc)}
                    onDragStart={(e) => handleDragStart(e, 'document', doc.id)}
                    onDragEnd={handleDragEnd}
                  >
                    <svg className="document-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                      <polyline points="10 9 9 9 8 9" />
                    </svg>
                    <div className="document-info">
                      <span className="document-title">{doc.title || 'Untitled'}</span>
                      <span className="document-count">{doc.node_count} items</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {bookmarks.length > 0 && (
          <div className="bookmarks-section">
            <div className="bookmarks-header">Bookmarks</div>
            <div className="bookmarks-list">
              {bookmarks.map((bm) => (
                <div
                  key={bm.node_id}
                  className="bookmark-item"
                  onClick={() => onNavigateToBookmark?.(bm.node_id, bm.document_id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    closeAllContextMenus();
                    setBookmarkContextMenu({ bookmark: bm, x: e.clientX, y: e.clientY });
                  }}
                  title={bm.label}
                >
                  <span className="bookmark-emoji">{bm.emoji || '\u2606'}</span>
                  <span className="bookmark-label">{bm.label}</span>
                  <button
                    className="bookmark-remove"
                    onClick={(e) => { e.stopPropagation(); removeBookmark(bm.node_id); }}
                    title="Remove bookmark"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {savedSearches.length > 0 && (
          <div className="saved-searches-section">
            <div className="saved-searches-header">Saved Searches</div>
            <div className="saved-searches-list">
              {savedSearches.map((search) => (
                <button
                  key={search.id}
                  className="saved-search-item"
                  onClick={() => onApplySavedSearch?.(search.query)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    closeAllContextMenus();
                    setSavedSearchContextMenu({ search, x: e.clientX, y: e.clientY });
                  }}
                  title={search.query}
                >
                  <svg className="saved-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.35-4.35" />
                  </svg>
                  <span className="saved-search-name">{search.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="sidebar-footer">
          {showNewFolderInput ? (
            <div className="new-folder-input-container">
              <input
                ref={newFolderInputRef}
                type="text"
                className="new-folder-input"
                placeholder="Folder name..."
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={handleNewFolderKeydown}
              />
              <button
                className="new-folder-confirm"
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </button>
              <button
                className="new-folder-cancel"
                onClick={() => { setShowNewFolderInput(false); setNewFolderName(''); }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="footer-buttons">
              <button className="new-folder-btn" onClick={() => setShowNewFolderInput(true)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  <line x1="12" y1="11" x2="12" y2="17" />
                  <line x1="9" y1="14" x2="15" y2="14" />
                </svg>
                <span>New Folder</span>
              </button>
              <button className="new-document-btn" onClick={onNewDocument}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>New Document</span>
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Context menu for document actions */}
      {contextMenuTarget?.type === 'document' && createPortal(
        <div className="context-menu" style={{ left: contextMenuPosition.x, top: contextMenuPosition.y }}>
          <button className="context-menu-item" onClick={handleRenameDocClick}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Rename
          </button>
          {contextMenuTarget.doc.title_node_id && (
            <button
              className="context-menu-item"
              onClick={() => {
                const doc = contextMenuTarget!.doc;
                const nodeId = doc.title_node_id!;
                if (isBookmarked(nodeId)) {
                  removeBookmark(nodeId);
                } else {
                  addBookmark(nodeId, doc.id, doc.title || 'Untitled');
                }
                setContextMenuTarget(null);
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              {isBookmarked(contextMenuTarget.doc.title_node_id) ? 'Remove Bookmark' : 'Bookmark'}
            </button>
          )}
          {folderState.document_folders[contextMenuTarget.doc.id] && (
            <button className="context-menu-item" onClick={handleMoveToRootClick}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              Move to Root
            </button>
          )}
          {organizedItems.folders.length > 0 && (
            <>
              <div className="context-menu-divider"></div>
              <div className="context-menu-label">Move to folder:</div>
              {organizedItems.folders.map(({ folder }) => {
                if (folderState.document_folders[contextMenuTarget.doc.id] === folder.id) {
                  return null;
                }
                return (
                  <button
                    key={folder.id}
                    className="context-menu-item"
                    onClick={() => handleMoveToFolder(folder.id)}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                    {folder.name}
                  </button>
                );
              })}
            </>
          )}
          <div className="context-menu-divider"></div>
          <button className="context-menu-item context-menu-item-danger" onClick={handleDeleteDocumentClick}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            Delete Document
          </button>
        </div>,
        document.body
      )}

      {/* Context menu for folder actions */}
      {contextMenuTarget?.type === 'folder' && createPortal(
        <div className="context-menu" style={{ left: contextMenuPosition.x, top: contextMenuPosition.y }}>
          <button className="context-menu-item" onClick={handleRenameFolderClick}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Rename
          </button>
          <button className="context-menu-item context-menu-item-danger" onClick={handleDeleteFolderClick}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            Delete Folder
          </button>
        </div>,
        document.body
      )}

      {/* Rename document modal */}
      <RenameModal
        isOpen={renameDoc !== null}
        currentName={renameDoc?.title || ''}
        itemType="document"
        onRename={handleRenameDoc}
        onClose={() => setRenameDoc(null)}
      />

      {/* Rename folder modal */}
      <RenameModal
        isOpen={renameFolder !== null}
        currentName={renameFolder?.name || ''}
        itemType="folder"
        onRename={handleRenameFolder}
        onClose={() => setRenameFolder(null)}
      />

      {/* Bookmark context menu */}
      {bookmarkContextMenu && createPortal(
        <div className="context-menu" style={{ left: bookmarkContextMenu.x, top: bookmarkContextMenu.y }}>
          <button
            className="context-menu-item"
            onClick={(e) => {
              e.stopPropagation();
              const bm = bookmarkContextMenu.bookmark;
              setBookmarkContextMenu(null);
              setEmojiPickerBookmark({ bookmark: bm, x: bookmarkContextMenu.x, y: bookmarkContextMenu.y });
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              <line x1="9" y1="9" x2="9.01" y2="9" />
              <line x1="15" y1="9" x2="15.01" y2="9" />
            </svg>
            Change Emoji
          </button>
          {bookmarkContextMenu.bookmark.emoji != null && (
            <button
              className="context-menu-item"
              onClick={(e) => {
                e.stopPropagation();
                const bm = bookmarkContextMenu.bookmark;
                setBookmarkContextMenu(null);
                updateBookmarkEmoji(bm.node_id, null);
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              Remove Emoji
            </button>
          )}
          <button
            className="context-menu-item context-menu-item-danger"
            onClick={(e) => {
              e.stopPropagation();
              const bm = bookmarkContextMenu.bookmark;
              setBookmarkContextMenu(null);
              removeBookmark(bm.node_id);
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            Remove Bookmark
          </button>
        </div>,
        document.body
      )}

      {/* Emoji picker for bookmark */}
      {emojiPickerBookmark && createPortal(
        <EmojiPicker
          position={{ x: emojiPickerBookmark.x, y: emojiPickerBookmark.y }}
          onSelect={(emoji) => {
            updateBookmarkEmoji(emojiPickerBookmark.bookmark.node_id, emoji);
            setEmojiPickerBookmark(null);
          }}
          onClose={() => setEmojiPickerBookmark(null)}
          onOpenCustomEmojiManager={() => setShowCustomEmojiManager(true)}
        />,
        document.body
      )}

      {/* Custom emoji manager modal */}
      <CustomEmojiManager
        isOpen={showCustomEmojiManager}
        onClose={() => setShowCustomEmojiManager(false)}
      />

      {/* Saved search context menu */}
      {savedSearchContextMenu && createPortal(
        <div className="context-menu" style={{ left: savedSearchContextMenu.x, top: savedSearchContextMenu.y }}>
          <button
            className="context-menu-item context-menu-item-danger"
            onClick={() => {
              removeSavedSearch(savedSearchContextMenu.search.id);
              setSavedSearchContextMenu(null);
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            Delete
          </button>
        </div>,
        document.body
      )}
    </>
  );
});

export default Sidebar;
