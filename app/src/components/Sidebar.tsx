import React, { useState, useEffect, useCallback, useMemo, useRef, useImperativeHandle, forwardRef } from 'react';
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
} from '../lib/api';
import { RenameModal } from './ui/RenameModal';

interface SidebarProps {
  isOpen: boolean;
  currentDocumentId?: string;
  onToggle: () => void;
  onSelectDocument: (docId: string) => void;
  onNewDocument: () => void;
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

export const Sidebar = forwardRef<SidebarRef, SidebarProps>(function Sidebar(
  { isOpen, currentDocumentId, onToggle, onSelectDocument, onNewDocument },
  ref
) {
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

  // Close context menu on click elsewhere
  useEffect(() => {
    function handleGlobalClick() {
      setContextMenuTarget(null);
    }
    document.addEventListener('click', handleGlobalClick);
    return () => document.removeEventListener('click', handleGlobalClick);
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
    setContextMenuTarget({ type: 'document', doc });
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
  }, []);

  const handleFolderContextMenu = useCallback((e: React.MouseEvent, folder: Folder) => {
    e.preventDefault();
    e.stopPropagation();
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
      }
    }
  }, [contextMenuTarget, loadAll]);

  const handleMoveToRootClick = useCallback(async () => {
    if (contextMenuTarget?.type === 'document') {
      const doc = contextMenuTarget.doc;
      setContextMenuTarget(null);
      try {
        await moveDocumentToFolder(doc.id, null);
        await loadAll();
      } catch (e) {
        console.error('Failed to move document:', e);
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
    }
  }, [renameDoc, loadAll]);

  const handleRenameFolder = useCallback(async (newName: string) => {
    if (!renameFolder) return;

    try {
      await updateFolder(renameFolder.id, newName);
      await loadAll();
    } catch (e) {
      console.error('Failed to rename folder:', e);
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
      }
    }

    setDragItem(null);
    setDropTarget(null);
  }, [dragItem, loadAll]);

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
                <div key={folder.id} className="folder-section">
                  <div
                    className={`folder-header ${dropTarget?.type === 'folder' && dropTarget.id === folder.id ? 'drop-target' : ''}`}
                    role="button"
                    tabIndex={0}
                    onDoubleClick={(e) => handleFolderDoubleClick(e, folder)}
                    onContextMenu={(e) => handleFolderContextMenu(e, folder)}
                    onDragOver={handleDragOver}
                    onDragEnter={(e) => handleFolderDragEnter(e, folder.id)}
                    onDrop={(e) => handleDrop(e, 'folder', folder.id)}
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
      {contextMenuTarget?.type === 'document' && (
        <div className="context-menu" style={{ left: contextMenuPosition.x, top: contextMenuPosition.y }}>
          <button className="context-menu-item" onClick={handleRenameDocClick}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Rename
          </button>
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
        </div>
      )}

      {/* Context menu for folder actions */}
      {contextMenuTarget?.type === 'folder' && (
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
        </div>
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
    </>
  );
});

export default Sidebar;
