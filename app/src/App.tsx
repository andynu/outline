import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useOutlineStore } from './store/outlineStore';
import { useZoomStore, reapplyZoom } from './store/zoomStore';
import { OutlineItem } from './components/OutlineItem';
import { VirtualOutlineList } from './components/VirtualOutlineList';
import { Sidebar, SidebarRef } from './components/Sidebar';
import { MenuDropdown, type MenuEntry } from './components/ui/MenuDropdown';
import { KeyboardShortcutsModal } from './components/ui/KeyboardShortcutsModal';
import { SettingsModal } from './components/ui/SettingsModal';
import { SearchModal } from './components/ui/SearchModal';
import { DateViewsPanel } from './components/ui/DateViewsPanel';
import { TagsPanel } from './components/ui/TagsPanel';
import { InboxPanel } from './components/ui/InboxPanel';
import { QuickNavigator } from './components/ui/QuickNavigator';
import { QuickMove } from './components/ui/QuickMove';
import { FilterBar } from './components/ui/FilterBar';
import { ZoomBreadcrumbs } from './components/ui/ZoomBreadcrumbs';
import { loadSessionState, saveSessionState } from './lib/sessionState';
import type { InboxItem } from './lib/api';
import type { Node, TreeNode } from './lib/types';
import * as api from './lib/api';
import React from 'react';

// Note: Tree building is now handled by the store's getTree() method
// which properly handles hideCompleted, filterQuery, and zoomedNodeId

// Calculate document statistics
function calculateDocumentStats(nodes: Node[]) {
  let totalWords = 0;
  let contentWords = 0;
  let noteWords = 0;

  for (const node of nodes) {
    // Strip HTML and count words in content
    const contentText = (node.content || '').replace(/<[^>]*>/g, '');
    const cWords = contentText.split(/\s+/).filter(w => w.length > 0).length;
    contentWords += cWords;
    totalWords += cWords;

    // Count words in notes
    const noteText = (node.note || '').replace(/<[^>]*>/g, '');
    const nWords = noteText.split(/\s+/).filter(w => w.length > 0).length;
    noteWords += nWords;
    totalWords += nWords;
  }

  return {
    totalWords,
    contentWords,
    noteWords,
    itemCount: nodes.length,
  };
}

function App() {
  // UI state
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('outline-sidebar-open') === 'true';
    }
    return false;
  });
  const [currentDocumentId, setCurrentDocumentId] = useState<string | undefined>();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return false;
  });

  // Modal state
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDateViews, setShowDateViews] = useState(false);
  const [showTagsPanel, setShowTagsPanel] = useState(false);
  const [showInboxPanel, setShowInboxPanel] = useState(false);
  const [inboxCount, setInboxCount] = useState(0);
  const [showQuickNavigator, setShowQuickNavigator] = useState(false);
  const [quickNavigatorMode, setQuickNavigatorMode] = useState<'files' | 'items'>('files');
  const [showQuickMove, setShowQuickMove] = useState(false);
  const [quickMoveBulkMode, setQuickMoveBulkMode] = useState(false);
  const [searchDocumentScope, setSearchDocumentScope] = useState<string | undefined>();
  const [searchInitialQuery, setSearchInitialQuery] = useState('');

  // Save state
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Store state and actions
  const loading = useOutlineStore(state => state.loading);
  const error = useOutlineStore(state => state.error);
  const nodes = useOutlineStore(state => state.nodes);
  const load = useOutlineStore(state => state.load);
  const collapseAll = useOutlineStore(state => state.collapseAll);
  const expandAll = useOutlineStore(state => state.expandAll);
  const hideCompleted = useOutlineStore(state => state.hideCompleted);
  const toggleHideCompleted = useOutlineStore(state => state.toggleHideCompleted);
  const filterQuery = useOutlineStore(state => state.filterQuery);
  const setFilterQuery = useOutlineStore(state => state.setFilterQuery);
  const clearFilter = useOutlineStore(state => state.clearFilter);
  const zoomedNodeId = useOutlineStore(state => state.zoomedNodeId);
  const undo = useOutlineStore(state => state.undo);
  const redo = useOutlineStore(state => state.redo);
  const selectedIds = useOutlineStore(state => state.selectedIds);
  const deleteSelectedNodes = useOutlineStore(state => state.deleteSelectedNodes);
  const toggleSelectedCheckboxes = useOutlineStore(state => state.toggleSelectedCheckboxes);
  const indentSelectedNodes = useOutlineStore(state => state.indentSelectedNodes);
  const outdentSelectedNodes = useOutlineStore(state => state.outdentSelectedNodes);
  const selectAll = useOutlineStore(state => state.selectAll);
  const clearSelection = useOutlineStore(state => state.clearSelection);
  const zoomReset = useOutlineStore(state => state.zoomReset);
  const zoomTo = useOutlineStore(state => state.zoomTo);
  const focusedId = useOutlineStore(state => state.focusedId);
  const setFocusedId = useOutlineStore(state => state.setFocusedId);
  const getTree = useOutlineStore(state => state.getTree);

  // Zoom store
  const zoomLevel = useZoomStore(state => state.percentage);
  const zoomIn = useZoomStore(state => state.zoomIn);
  const zoomOut = useZoomStore(state => state.zoomOut);
  const resetZoom = useZoomStore(state => state.reset);
  const initZoom = useZoomStore(state => state.init);

  // Ref for scroll position tracking
  const contentAreaRef = useRef<HTMLElement>(null);
  const sessionRestored = useRef(false);

  // Sidebar ref for refresh
  const sidebarRef = React.useRef<SidebarRef>(null);

  // Load document on mount - restore from session state if available
  useEffect(() => {
    const restoreSession = async () => {
      const session = loadSessionState();

      // Load document (from session or default)
      if (session?.documentId) {
        setCurrentDocumentId(session.documentId);
        await load(session.documentId);
      } else {
        await load();
      }

      // Get the store state to validate node IDs
      const store = useOutlineStore.getState();

      // Restore zoom state after document loads (only if node exists)
      if (session?.zoomedNodeId && store.getNode(session.zoomedNodeId)) {
        zoomTo(session.zoomedNodeId);
      }

      // Restore focus state after document loads (only if node exists)
      if (session?.focusedNodeId && store.getNode(session.focusedNodeId)) {
        setFocusedId(session.focusedNodeId);
      }

      // Restore scroll position after a brief delay for DOM to settle
      if (session?.scrollTop !== undefined && contentAreaRef.current) {
        setTimeout(() => {
          if (contentAreaRef.current) {
            contentAreaRef.current.scrollTop = session.scrollTop || 0;
          }
        }, 100);
      }

      sessionRestored.current = true;
    };

    restoreSession();
  }, [load, zoomTo, setFocusedId]);

  // Toggle theme
  const toggleTheme = useCallback(() => {
    const newDark = !isDark;
    setIsDark(newDark);
    document.documentElement.classList.toggle('dark', newDark);
    localStorage.setItem('theme', newDark ? 'dark' : 'light');
  }, [isDark]);

  // Initialize theme from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('theme');
    if (stored === 'dark') {
      setIsDark(true);
      document.documentElement.classList.add('dark');
    } else if (stored === 'light') {
      setIsDark(false);
      document.documentElement.classList.remove('dark');
    }
  }, []);

  // Initialize zoom from localStorage
  useEffect(() => {
    initZoom();
  }, [initZoom]);

  // Reapply zoom when content loads (ensures container exists)
  useEffect(() => {
    if (!loading) {
      // Small delay to ensure DOM has rendered
      const timer = setTimeout(reapplyZoom, 100);
      return () => clearTimeout(timer);
    }
  }, [loading]);

  // Save session state when document changes
  useEffect(() => {
    if (!sessionRestored.current) return;
    if (currentDocumentId) {
      saveSessionState({ documentId: currentDocumentId });
    }
  }, [currentDocumentId]);

  // Save session state when focus changes
  useEffect(() => {
    if (!sessionRestored.current) return;
    saveSessionState({ focusedNodeId: focusedId ?? undefined });
  }, [focusedId]);

  // Save session state when zoom changes
  useEffect(() => {
    if (!sessionRestored.current) return;
    saveSessionState({ zoomedNodeId: zoomedNodeId ?? undefined });
  }, [zoomedNodeId]);

  // Track scroll position with debounce
  useEffect(() => {
    const contentArea = contentAreaRef.current;
    if (!contentArea) return;

    let scrollTimeout: ReturnType<typeof setTimeout> | null = null;

    const handleScroll = () => {
      if (!sessionRestored.current) return;

      // Debounce scroll saves by 300ms
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }
      scrollTimeout = setTimeout(() => {
        saveSessionState({ scrollTop: contentArea.scrollTop });
        scrollTimeout = null;
      }, 300);
    };

    contentArea.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      contentArea.removeEventListener('scroll', handleScroll);
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }
    };
  }, []);

  // Poll for external changes (Dropbox/Syncthing sync)
  useEffect(() => {
    const updateFromState = useOutlineStore.getState().updateFromState;

    const checkForChanges = async () => {
      try {
        const newState = await api.reloadIfChanged();
        if (newState) {
          console.log('[Sync] External changes detected, reloading...');
          updateFromState(newState);
        }
      } catch (e) {
        console.error('[Sync] Error checking for changes:', e);
      }
    };

    // Poll every 5 seconds
    const pollInterval = setInterval(checkForChanges, 5000);

    // Also check when window gains focus
    const handleFocus = () => {
      checkForChanges();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(pollInterval);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  // Toggle sidebar
  const toggleSidebar = useCallback(() => {
    setSidebarOpen(prev => {
      const newValue = !prev;
      localStorage.setItem('outline-sidebar-open', String(newValue));
      return newValue;
    });
  }, []);

  // Handle save
  const handleSave = useCallback(async () => {
    setSaveStatus('saving');
    try {
      await api.compactDocument();
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (e) {
      console.error('Save failed:', e);
      setSaveStatus('idle');
    }
  }, []);

  // Handle document selection
  const handleSelectDocument = useCallback(async (docId: string) => {
    setCurrentDocumentId(docId);
    await load(docId);
  }, [load]);

  // Handle new document
  const handleNewDocument = useCallback(async () => {
    try {
      const newId = await api.createDocument();
      setCurrentDocumentId(newId);
      await load(newId);
      sidebarRef.current?.refresh();
    } catch (e) {
      console.error('Failed to create document:', e);
    }
  }, [load]);

  // Handle search navigation
  const handleSearchNavigate = useCallback((nodeId: string, documentId: string) => {
    if (documentId !== currentDocumentId) {
      setCurrentDocumentId(documentId);
      load(documentId);
    }
    // Focus the node
    useOutlineStore.getState().setFocusedId(nodeId);
    setShowSearchModal(false);
  }, [currentDocumentId, load]);

  // Handle date views navigation (same document only)
  const handleDateViewNavigate = useCallback((nodeId: string) => {
    useOutlineStore.getState().setFocusedId(nodeId);
    setShowDateViews(false);
  }, []);

  // Handle tags panel navigation (same document only)
  const handleTagsNavigate = useCallback((nodeId: string) => {
    useOutlineStore.getState().setFocusedId(nodeId);
    setShowTagsPanel(false);
  }, []);

  // Handle tag search from tags panel - use filter instead of search
  const handleTagSearch = useCallback((tag: string) => {
    setFilterQuery(`#${tag}`);
    setShowTagsPanel(false);
  }, [setFilterQuery]);

  // Load inbox count
  const loadInboxCount = useCallback(async () => {
    try {
      const count = await api.getInboxCount();
      setInboxCount(count);
    } catch (e) {
      console.error('Failed to load inbox count:', e);
    }
  }, []);

  // Load inbox count on mount and periodically
  useEffect(() => {
    loadInboxCount();
    const interval = setInterval(loadInboxCount, 30000); // Every 30 seconds
    return () => clearInterval(interval);
  }, [loadInboxCount]);

  // Reload inbox count when panel closes
  const handleInboxClose = useCallback(() => {
    setShowInboxPanel(false);
    loadInboxCount();
  }, [loadInboxCount]);

  // Handle inbox item processing
  const handleInboxProcess = useCallback((item: InboxItem) => {
    // TODO: Implement QuickMove integration
    // For now, just close the panel
    console.log('Process inbox item:', item);
    setShowInboxPanel(false);
  }, []);

  // Handle quick navigator navigation
  const handleQuickNavigate = useCallback((nodeId: string, documentId: string) => {
    if (documentId !== currentDocumentId) {
      setCurrentDocumentId(documentId);
      load(documentId);
    }
    if (nodeId) {
      useOutlineStore.getState().setFocusedId(nodeId);
    }
    setShowQuickNavigator(false);
  }, [currentDocumentId, load]);

  // Menu dropdown handlers
  const openMenuDropdown = useCallback((menu: string) => {
    setOpenMenu(menu);
  }, []);

  const closeMenuDropdown = useCallback(() => {
    setOpenMenu(null);
  }, []);

  // Export handlers
  const handleExportOpml = useCallback(async () => {
    try {
      const title = nodes.find(n => !n.parent_id)?.content?.replace(/<[^>]*>/g, '') || 'Outline';
      const content = await api.exportOpml(title);
      await api.saveToFileWithDialog(content, `${title}.opml`, 'opml');
    } catch (e) {
      console.error('Export OPML failed:', e);
    }
  }, [nodes]);

  const handleExportMarkdown = useCallback(async () => {
    try {
      const title = nodes.find(n => !n.parent_id)?.content?.replace(/<[^>]*>/g, '') || 'Outline';
      const content = await api.exportMarkdown();
      await api.saveToFileWithDialog(content, `${title}.md`, 'md');
    } catch (e) {
      console.error('Export Markdown failed:', e);
    }
  }, [nodes]);

  const handleExportJson = useCallback(async () => {
    try {
      const title = nodes.find(n => !n.parent_id)?.content?.replace(/<[^>]*>/g, '') || 'Outline';
      const content = await api.exportJson();
      await api.saveToFileWithDialog(content, `${title}.json`, 'json');
    } catch (e) {
      console.error('Export JSON failed:', e);
    }
  }, [nodes]);

  const handleImportOpml = useCallback(async () => {
    try {
      const result = await api.importOpmlFromPicker();
      if (result) {
        // Navigate to the newly imported document
        setCurrentDocumentId(result.doc_id);
        await load(result.doc_id);
        // Refresh sidebar
        sidebarRef.current?.refresh();
      }
    } catch (e) {
      console.error('Import OPML failed:', e);
    }
  }, [load]);

  // File menu items
  const fileMenuItems: MenuEntry[] = useMemo(() => [
    { label: 'New Document', shortcut: 'Ctrl+N', action: handleNewDocument, separator: false },
    { separator: true },
    { label: 'Save', shortcut: 'Ctrl+S', action: handleSave, separator: false },
    { separator: true },
    { label: 'Export OPML', action: handleExportOpml, separator: false },
    { label: 'Export Markdown', action: handleExportMarkdown, separator: false },
    { label: 'Export JSON', action: handleExportJson, separator: false },
    { separator: true },
    { label: 'Import OPML...', action: handleImportOpml, separator: false },
  ], [handleNewDocument, handleSave, handleExportOpml, handleExportMarkdown, handleExportJson, handleImportOpml]);

  // Edit menu items
  const deleteAllCompleted = useOutlineStore(state => state.deleteAllCompleted);
  const editMenuItems: MenuEntry[] = useMemo(() => [
    { label: 'Delete All Completed', action: deleteAllCompleted, separator: false },
  ], [deleteAllCompleted]);

  // View menu items
  const viewMenuItems: MenuEntry[] = useMemo(() => [
    { label: 'Toggle Sidebar', shortcut: 'Ctrl+\\', action: toggleSidebar, separator: false },
    { separator: true },
    { label: hideCompleted ? 'Show Completed' : 'Hide Completed', shortcut: 'Ctrl+Shift+H', action: toggleHideCompleted, separator: false },
    { label: 'Collapse All', shortcut: 'Ctrl+Shift+.', action: collapseAll, separator: false },
    { label: 'Expand All', shortcut: 'Ctrl+Shift+,', action: expandAll, separator: false },
    { separator: true },
    { label: 'Zoom In', shortcut: 'Ctrl++', action: zoomIn, separator: false },
    { label: 'Zoom Out', shortcut: 'Ctrl+-', action: zoomOut, separator: false },
    { label: 'Reset Zoom', shortcut: 'Ctrl+0', action: resetZoom, separator: false },
    { separator: true },
    { label: isDark ? 'Light Mode' : 'Dark Mode', action: toggleTheme, separator: false },
  ], [toggleSidebar, toggleTheme, isDark, collapseAll, expandAll, hideCompleted, toggleHideCompleted, zoomIn, zoomOut, resetZoom]);

  // Help menu items
  const helpMenuItems: MenuEntry[] = useMemo(() => [
    { label: 'Keyboard Shortcuts', shortcut: 'Ctrl+/', action: () => setShowKeyboardShortcuts(true), separator: false },
    { separator: true },
    { label: 'Settings', shortcut: 'Ctrl+,', action: () => setShowSettings(true), separator: false },
  ], []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;

      // Search
      if (mod && event.key === 'f') {
        event.preventDefault();
        setSearchDocumentScope(currentDocumentId);
        setSearchInitialQuery('');
        setShowSearchModal(true);
        return;
      }

      // Global search
      if (mod && event.shiftKey && event.key === 'f') {
        event.preventDefault();
        setSearchDocumentScope(undefined);
        setSearchInitialQuery('');
        setShowSearchModal(true);
        return;
      }

      // Undo
      if (mod && !event.shiftKey && event.key === 'z') {
        event.preventDefault();
        undo();
        return;
      }

      // Redo (Ctrl+Y or Ctrl+Shift+Z)
      if (mod && (event.key === 'y' || (event.shiftKey && event.key === 'Z'))) {
        event.preventDefault();
        redo();
        return;
      }

      // Bulk delete selected (Ctrl+Shift+Backspace)
      if (mod && event.shiftKey && event.key === 'Backspace' && selectedIds.size > 0) {
        event.preventDefault();
        deleteSelectedNodes();
        return;
      }

      // Bulk toggle completion (Ctrl+Enter with selection)
      if (mod && event.key === 'Enter' && selectedIds.size > 0) {
        event.preventDefault();
        toggleSelectedCheckboxes();
        return;
      }

      // Bulk indent (Tab with selection) - only when not in an editor
      if (event.key === 'Tab' && !event.shiftKey && selectedIds.size > 0) {
        const activeElement = document.activeElement;
        if (!activeElement?.closest('.outline-editor') && !activeElement?.closest('input') && !activeElement?.closest('textarea')) {
          event.preventDefault();
          indentSelectedNodes();
          return;
        }
      }

      // Bulk outdent (Shift+Tab with selection) - only when not in an editor
      if (event.key === 'Tab' && event.shiftKey && selectedIds.size > 0) {
        const activeElement = document.activeElement;
        if (!activeElement?.closest('.outline-editor') && !activeElement?.closest('input') && !activeElement?.closest('textarea')) {
          event.preventDefault();
          outdentSelectedNodes();
          return;
        }
      }

      // Select all (Ctrl+A) - only when not in an input/editor
      if (mod && event.key === 'a') {
        const activeElement = document.activeElement;
        if (!activeElement?.closest('.outline-editor') && !activeElement?.closest('input') && !activeElement?.closest('textarea')) {
          event.preventDefault();
          selectAll();
          return;
        }
      }

      // Save
      if (mod && event.key === 's') {
        event.preventDefault();
        handleSave();
        return;
      }

      // Toggle sidebar (Ctrl+\)
      if (mod && event.key === '\\') {
        event.preventDefault();
        toggleSidebar();
        return;
      }

      // Keyboard shortcuts
      if (mod && event.key === '/') {
        event.preventDefault();
        setShowKeyboardShortcuts(true);
        return;
      }

      // Settings
      if (mod && event.key === ',') {
        event.preventDefault();
        setShowSettings(true);
        return;
      }

      // Date Views
      if (mod && event.shiftKey && event.key === 'T') {
        event.preventDefault();
        setShowDateViews(true);
        return;
      }

      // Tags Panel (Ctrl+Shift+3 since # is Shift+3)
      if (mod && event.shiftKey && event.key === '#') {
        event.preventDefault();
        setShowTagsPanel(true);
        return;
      }

      // Inbox (Ctrl+Shift+I) - use Shift to avoid conflict with italic
      if (mod && event.shiftKey && event.key === 'I') {
        event.preventDefault();
        setShowInboxPanel(true);
        return;
      }

      // Quick Navigator - Files (Ctrl+O)
      if (mod && !event.shiftKey && event.key === 'o') {
        event.preventDefault();
        setQuickNavigatorMode('files');
        setShowQuickNavigator(true);
        return;
      }

      // Quick Navigator - Items (Ctrl+Shift+O)
      if (mod && event.shiftKey && event.key === 'O') {
        event.preventDefault();
        setQuickNavigatorMode('items');
        setShowQuickNavigator(true);
        return;
      }

      // Quick Move (Ctrl+Shift+M) - bulk mode if items selected
      if (mod && event.shiftKey && event.key === 'M') {
        event.preventDefault();
        setQuickMoveBulkMode(selectedIds.size > 0);
        setShowQuickMove(true);
        return;
      }

      // Collapse All (Ctrl+Shift+.)
      if (mod && event.shiftKey && event.key === '>') {
        event.preventDefault();
        collapseAll();
        return;
      }

      // Expand All (Ctrl+Shift+,)
      if (mod && event.shiftKey && event.key === '<') {
        event.preventDefault();
        expandAll();
        return;
      }

      // Hide Completed (Ctrl+Shift+H)
      if (mod && event.shiftKey && event.key === 'H') {
        event.preventDefault();
        toggleHideCompleted();
        return;
      }

      // Zoom In (Ctrl+= or Ctrl++)
      if (mod && (event.key === '=' || event.key === '+')) {
        event.preventDefault();
        zoomIn();
        return;
      }

      // Zoom Out (Ctrl+-)
      if (mod && event.key === '-') {
        event.preventDefault();
        zoomOut();
        return;
      }

      // Reset Zoom (Ctrl+0)
      if (mod && event.key === '0') {
        event.preventDefault();
        resetZoom();
        return;
      }

      // Escape clears selection, filter, or exits zoom (when no modal is open)
      if (event.key === 'Escape' && !showSearchModal && !showQuickNavigator && !showQuickMove && !showDateViews && !showTagsPanel && !showInboxPanel && !showKeyboardShortcuts && !showSettings) {
        // First clear selection if any, then filter, then zoom
        if (selectedIds.size > 0) {
          event.preventDefault();
          clearSelection();
          return;
        }
        if (filterQuery) {
          event.preventDefault();
          clearFilter();
          return;
        }
        if (zoomedNodeId) {
          event.preventDefault();
          zoomReset();
          return;
        }
      }
    };

    // Mousewheel zoom (Ctrl+scroll)
    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        if (event.deltaY < 0) {
          zoomIn();
        } else {
          zoomOut();
        }
      }
    };

    window.addEventListener('keydown', handleKeydown);
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('wheel', handleWheel);
    };
  }, [currentDocumentId, handleSave, toggleSidebar, collapseAll, expandAll, toggleHideCompleted, filterQuery, clearFilter, zoomedNodeId, zoomReset, showSearchModal, showQuickNavigator, showQuickMove, showDateViews, showTagsPanel, showInboxPanel, showKeyboardShortcuts, showSettings, undo, redo, selectedIds, deleteSelectedNodes, toggleSelectedCheckboxes, indentSelectedNodes, outdentSelectedNodes, zoomIn, zoomOut, resetZoom]);

  // Compute tree from nodes with useMemo for performance
  // Use store's getTree() which handles hideCompleted, filterQuery, and zoomedNodeId
  const tree = useMemo(() => getTree(), [getTree, nodes, hideCompleted, filterQuery, zoomedNodeId]);
  const visibleCount = useMemo(() => {
    function count(items: TreeNode[]): number {
      return items.reduce((sum, item) => sum + 1 + count(item.children), 0);
    }
    return count(tree);
  }, [tree]);

  // Calculate stats
  const stats = useMemo(() => calculateDocumentStats(nodes), [nodes]);

  return (
    <div className="app-chrome">
      {/* Menu Bar */}
      <nav className="menu-bar">
        <MenuDropdown
          label="File"
          items={fileMenuItems}
          isOpen={openMenu === 'file'}
          onOpen={() => openMenuDropdown('file')}
          onClose={closeMenuDropdown}
        />
        <MenuDropdown
          label="Edit"
          items={editMenuItems}
          isOpen={openMenu === 'edit'}
          onOpen={() => openMenuDropdown('edit')}
          onClose={closeMenuDropdown}
        />
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

      {/* Icon Toolbar */}
      <div className="toolbar">
        <div className="toolbar-left">
          <button
            className={`toolbar-btn sidebar-toggle ${sidebarOpen ? 'active' : ''}`}
            onClick={toggleSidebar}
            title="Toggle sidebar"
            aria-label="Toggle sidebar"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <line x1="9" y1="3" x2="9" y2="21"/>
            </svg>
          </button>
          <div className="toolbar-separator"></div>
          <button
            className={`toolbar-btn ${saveStatus === 'saving' ? 'saving' : ''} ${saveStatus === 'saved' ? 'saved' : ''}`}
            onClick={handleSave}
            title="Save (Ctrl+S)"
            disabled={saveStatus === 'saving'}
          >
            {saveStatus === 'saving' ? (
              <svg className="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="32"/>
              </svg>
            ) : saveStatus === 'saved' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/>
                <polyline points="7 3 7 8 15 8"/>
              </svg>
            )}
          </button>
          <button
            className="toolbar-btn"
            onClick={() => setShowInboxPanel(true)}
            title="Inbox (Ctrl+Shift+I)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
              <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
            </svg>
            {inboxCount > 0 && <span className="toolbar-badge">{inboxCount}</span>}
          </button>
          <button
            className="toolbar-btn"
            onClick={() => setShowDateViews(true)}
            title="Date Views (Ctrl+Shift+T)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </button>
          <button
            className="toolbar-btn"
            onClick={() => setShowTagsPanel(true)}
            title="Tags (Ctrl+Shift+#)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
              <line x1="7" y1="7" x2="7.01" y2="7"/>
            </svg>
          </button>
          <button
            className={`toolbar-btn hide-completed-toggle ${hideCompleted ? 'active' : ''}`}
            onClick={toggleHideCompleted}
            title={hideCompleted ? "Show completed items (Ctrl+Shift+H)" : "Hide completed items (Ctrl+Shift+H)"}
            aria-label={hideCompleted ? "Show completed items" : "Hide completed items"}
          >
            {hideCompleted ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            )}
          </button>
          <button
            className="toolbar-btn"
            onClick={collapseAll}
            title="Collapse All (Ctrl+Shift+.)"
            aria-label="Collapse all items"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 14h16"/>
              <path d="M4 10h16"/>
              <path d="M12 6l-4 4"/>
              <path d="M12 6l4 4"/>
              <path d="M12 18l-4-4"/>
              <path d="M12 18l4-4"/>
            </svg>
          </button>
          <button
            className="toolbar-btn"
            onClick={expandAll}
            title="Expand All (Ctrl+Shift+,)"
            aria-label="Expand all items"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 14h16"/>
              <path d="M4 10h16"/>
              <path d="M12 2l-4 4"/>
              <path d="M12 2l4 4"/>
              <path d="M12 22l-4-4"/>
              <path d="M12 22l4-4"/>
            </svg>
          </button>
          <div className="toolbar-separator"></div>
          <button
            className="toolbar-btn"
            onClick={() => setShowKeyboardShortcuts(true)}
            title="Keyboard Shortcuts (?)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </button>
          <button
            className="toolbar-btn settings-btn"
            onClick={() => setShowSettings(true)}
            title="Settings (Ctrl+,)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
        <div className="toolbar-right">
          <button
            className="toolbar-btn theme-toggle"
            onClick={toggleTheme}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            )}
          </button>
          <div className="toolbar-separator"></div>
          <div className="toolbar-search">
            <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              type="text"
              placeholder="Search (Ctrl+F)"
              readOnly
              onClick={() => {
                setSearchDocumentScope(currentDocumentId);
                setSearchInitialQuery('');
                setShowSearchModal(true);
              }}
            />
          </div>
        </div>
      </div>

      {/* Main Area with Sidebar */}
      <div className="main-wrapper">
        <Sidebar
          ref={sidebarRef}
          isOpen={sidebarOpen}
          currentDocumentId={currentDocumentId}
          onToggle={toggleSidebar}
          onSelectDocument={handleSelectDocument}
          onNewDocument={handleNewDocument}
        />

        {/* Main Content Area */}
        <main className="content-area" ref={contentAreaRef}>
          <ZoomBreadcrumbs />
          <FilterBar />
          {loading ? (
            <div className="loading">Loading...</div>
          ) : error ? (
            <div className="error">Error: {error}</div>
          ) : (
            <>
              <div className="outline-container">
                {tree.map(item => (
                  <OutlineItem
                    key={item.node.id}
                    item={item}
                    onOpenBulkQuickMove={() => {
                      setQuickMoveBulkMode(true);
                      setShowQuickMove(true);
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </main>
      </div>

      {/* Status Bar */}
      <footer className="status-bar">
        <span className="status-left">
          {loading ? (
            'Loading...'
          ) : (
            <>
              <span className="stat-item" title="Total words in document">
                {stats.totalWords.toLocaleString()} words
              </span>
              <span className="stat-separator">•</span>
              <span className="stat-item" title="Words in item content">
                {stats.contentWords.toLocaleString()} in items
              </span>
              <span className="stat-separator">•</span>
              <span className="stat-item" title="Words in notes">
                {stats.noteWords.toLocaleString()} in notes
              </span>
              <span className="stat-separator">•</span>
              <span className="stat-item" title="Total items">
                {stats.itemCount.toLocaleString()} items
              </span>
            </>
          )}
        </span>
        <span className="status-right">
          {hideCompleted && (
            <span className="filter-indicator" title="Click to show completed items">
              (hiding completed)
            </span>
          )}
          <button
            className="zoom-indicator"
            onClick={resetZoom}
            title="Click to reset zoom (Ctrl+0)"
          >
            {zoomLevel}%
          </button>
          {saveStatus === 'saving' && <span className="save-status saving">Saving...</span>}
          {saveStatus === 'saved' && <span className="save-status saved">Saved</span>}
        </span>
      </footer>

      {/* Modals */}
      <SearchModal
        isOpen={showSearchModal}
        documentScope={searchDocumentScope}
        initialQuery={searchInitialQuery}
        onClose={() => { setShowSearchModal(false); setSearchInitialQuery(''); }}
        onNavigate={handleSearchNavigate}
      />

      <KeyboardShortcutsModal
        isOpen={showKeyboardShortcuts}
        onClose={() => setShowKeyboardShortcuts(false)}
      />

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />

      <DateViewsPanel
        isOpen={showDateViews}
        onClose={() => setShowDateViews(false)}
        onNavigate={handleDateViewNavigate}
      />

      <TagsPanel
        isOpen={showTagsPanel}
        onClose={() => setShowTagsPanel(false)}
        onNavigate={handleTagsNavigate}
        onTagSearch={handleTagSearch}
      />

      <InboxPanel
        isOpen={showInboxPanel}
        onClose={handleInboxClose}
        onProcess={handleInboxProcess}
      />

      <QuickNavigator
        isOpen={showQuickNavigator}
        mode={quickNavigatorMode}
        onClose={() => setShowQuickNavigator(false)}
        onNavigate={handleQuickNavigate}
      />

      <QuickMove
        isOpen={showQuickMove}
        onClose={() => setShowQuickMove(false)}
        bulkMode={quickMoveBulkMode}
      />
    </div>
  );
}

export default App;
