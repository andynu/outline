import { useEffect, useState, useMemo, useCallback, useRef, useDeferredValue, useTransition } from 'react';
import { useOutlineStore } from './store/outlineStore';
import { useSelectionStore } from './store/selectionStore';
import { useZoomStore, reapplyZoom } from './store/zoomStore';
import { OutlineItem } from './components/outline-item';
import { OutlineItemStatic } from './components/OutlineItemStatic';
import { Sidebar, SidebarRef } from './components/Sidebar';
import { MenuDropdown, type MenuEntry } from './components/ui/MenuDropdown';
import { KeyboardShortcutsModal } from './components/ui/KeyboardShortcutsModal';
import { SettingsModal } from './components/ui/SettingsModal';
import { SearchModal } from './components/ui/SearchModal';
import { DateViewsPanel } from './components/ui/DateViewsPanel';
import { TodayPanel } from './components/ui/TodayPanel';
import { TagsPanel } from './components/ui/TagsPanel';
import { QuickNavigator } from './components/ui/QuickNavigator';
import { QuickMove } from './components/ui/QuickMove';
import { QuickCaptureModal } from './components/ui/QuickCaptureModal';
import { ToastContainer } from './components/ui/ToastContainer';
import { showToast } from './store/toastStore';
import { useSettingsStore, NOTE_DISPLAY_OPTIONS } from './store/settingsStore';
import { useBookmarkStore } from './store/bookmarkStore';
import { useCustomEmojiStore } from './store/customEmojiStore';
import { FilterBar } from './components/ui/FilterBar';
import { ZoomBreadcrumbs } from './components/ui/ZoomBreadcrumbs';
import { BacklinksPanel } from './components/ui/BacklinksPanel';
import { NoteEditor } from './components/NoteEditor';
import { ArticleView } from './components/ArticleView';
import { ZoomedLeafNoteEditor } from './components/ZoomedLeafNoteEditor';
import { DocumentTitle } from './components/DocumentTitle';
import { BookmarkBar } from './components/BookmarkBar';
import {
  loadSessionState,
  saveSessionState,
  savePerDocumentState,
  flushSessionState,
  getDocumentState,
} from './lib/sessionState';
import type { Node, TreeNode } from './lib/types';
import * as api from './lib/api';
import React from 'react';

// Note: Tree building is now handled by the store's getTree() method
// which properly handles hideCompleted, filterQuery, and zoomedNodeId

/**
 * Smart renderer that uses OutlineItemStatic for unfocused items
 * and full OutlineItem only for the focused item (where TipTap editor is needed).
 * This dramatically reduces hook count: ~5 hooks per unfocused item vs ~40+ for OutlineItem.
 *
 * Each TreeItemRenderer subscribes to just its own focus state to avoid prop drilling
 * and unnecessary re-renders when focusedId changes.
 */
interface TreeItemRendererProps {
  item: TreeNode;
  onNavigateToNode?: (nodeId: string) => void;
  onOpenBulkQuickMove?: () => void;
  isInFocusedSubtree?: boolean;
}

const TreeItemRenderer = React.memo(function TreeItemRenderer({
  item,
  onNavigateToNode,
  onOpenBulkQuickMove,
  isInFocusedSubtree = false,
}: TreeItemRendererProps) {
  // Subscribe to just whether this specific item is focused (boolean selector for efficient updates)
  const isFocused = useOutlineStore(state => state.focusedId === item.node.id);
  const keyboardMode = useOutlineStore(state => state.keyboardMode);
  // For focused items, read fresh content from store to avoid stale data from useDeferredValue
  // Use content string as selector return to avoid object reference changes causing re-renders
  const freshContent = useOutlineStore(state =>
    isFocused ? state.nodes.find(n => n.id === item.node.id)?.content ?? null : null
  );
  const { hasChildren, children } = item;
  // Use fresh content for focused item, or fall back to tree data
  const node = freshContent != null ? { ...item.node, content: freshContent } : item.node;

  // Build children slot for recursive rendering
  const childrenSlot = hasChildren && !node.collapsed ? (
    <div className="children-wrapper">
      <div className="indent-guide"></div>
      <div className="children">
        {children.map(child => (
          <TreeItemRenderer
            key={child.node.id}
            item={child}
            onNavigateToNode={onNavigateToNode}
            onOpenBulkQuickMove={onOpenBulkQuickMove}
            isInFocusedSubtree={isFocused || isInFocusedSubtree}
          />
        ))}
      </div>
    </div>
  ) : null;

  // Focused item in edit mode gets full OutlineItem with TipTap editor
  // In navigate mode, even the focused item uses OutlineItemStatic (no editor)
  if (isFocused && keyboardMode === 'edit') {
    return (
      <OutlineItem
        item={{ ...item, node }}
        onNavigateToNode={onNavigateToNode}
        onOpenBulkQuickMove={onOpenBulkQuickMove}
        isInFocusedSubtree={isInFocusedSubtree}
        flat={true}
        childrenSlot={childrenSlot}
      />
    );
  }

  // Unfocused items (and focused items in navigate mode) use lightweight OutlineItemStatic
  return (
    <OutlineItemStatic
      item={item}
      onNavigateToNode={onNavigateToNode}
      isInFocusedSubtree={isInFocusedSubtree}
      childrenSlot={childrenSlot}
      onOpenBulkQuickMove={onOpenBulkQuickMove}
    />
  );
});

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
  const [showBookmarkBar, setShowBookmarkBar] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('outline-bookmark-bar');
      return saved !== 'false'; // default to true
    }
    return true;
  });
  const [currentDocumentId, setCurrentDocumentId] = useState<string | undefined>();
  // The store knows the loaded doc id (Rust populates it; mock uses a stable
  // sentinel). We prefer the local `currentDocumentId` for UI semantics, but
  // fall back to the store id so per-document session persistence works even
  // when no explicit selection has happened yet (initial load / browser mock).
  const storeDocumentId = useOutlineStore(state => state.documentId);
  const effectiveDocumentId = currentDocumentId ?? storeDocumentId ?? undefined;
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.getAttribute('data-theme') === 'dark';
    }
    return false;
  });

  // Modal state
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDateViews, setShowDateViews] = useState(false);
  const [showTodayPanel, setShowTodayPanel] = useState(false);
  const [showTagsPanel, setShowTagsPanel] = useState(false);
  const [showQuickNavigator, setShowQuickNavigator] = useState(false);
  const [quickNavigatorMode, setQuickNavigatorMode] = useState<'files' | 'items'>('files');
  const [showQuickMove, setShowQuickMove] = useState(false);
  const [quickMoveBulkMode, setQuickMoveBulkMode] = useState(false);
  const [showQuickCapture, setShowQuickCapture] = useState(false);
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
  const expandToLevel = useOutlineStore(state => state.expandToLevel);
  const collapseSiblings = useOutlineStore(state => state.collapseSiblings);
  const toggleFocusedCollapse = useOutlineStore(state => state.toggleFocusedCollapse);
  const hideCompleted = useOutlineStore(state => state.hideCompleted);
  const toggleHideCompleted = useOutlineStore(state => state.toggleHideCompleted);
  const hideDeferred = useOutlineStore(state => state.hideDeferred);
  const toggleHideDeferred = useOutlineStore(state => state.toggleHideDeferred);
  const filterQuery = useOutlineStore(state => state.filterQuery);
  const setFilterQuery = useOutlineStore(state => state.setFilterQuery);
  const clearFilter = useOutlineStore(state => state.clearFilter);
  const zoomedNodeId = useOutlineStore(state => state.zoomedNodeId);
  const undo = useOutlineStore(state => state.undo);
  const redo = useOutlineStore(state => state.redo);
  const canUndo = useOutlineStore(state => state.canUndo);
  const canRedo = useOutlineStore(state => state.canRedo);
  const selectedIds = useSelectionStore(state => state.selectedIds);
  const deleteSelectedNodes = useSelectionStore(state => state.deleteSelectedNodes);
  const toggleSelectedCheckboxes = useSelectionStore(state => state.toggleSelectedCheckboxes);
  const indentSelectedNodes = useSelectionStore(state => state.indentSelectedNodes);
  const outdentSelectedNodes = useSelectionStore(state => state.outdentSelectedNodes);
  const copySelectedAsMarkdown = useSelectionStore(state => state.copySelectedAsMarkdown);
  const copyTreeAsMarkdown = useSelectionStore(state => state.copyTreeAsMarkdown);
  const selectSiblings = useSelectionStore(state => state.selectSiblings);
  const progressiveSelectAll = useSelectionStore(state => state.progressiveSelectAll);
  const clearSelection = useSelectionStore(state => state.clearSelection);
  const zoomReset = useOutlineStore(state => state.zoomReset);
  const zoomToParent = useOutlineStore(state => state.zoomToParent);
  const zoomTo = useOutlineStore(state => state.zoomTo);
  const noteEditorNodeId = useOutlineStore(state => state.noteEditorNodeId);
  const openNoteEditor = useOutlineStore(state => state.openNoteEditor);
  const closeNoteEditor = useOutlineStore(state => state.closeNoteEditor);
  const zoomGoBack = useOutlineStore(state => state.zoomGoBack);
  const zoomGoForward = useOutlineStore(state => state.zoomGoForward);
  const canZoomGoBack = useOutlineStore(state => state.canZoomGoBack);
  const canZoomGoForward = useOutlineStore(state => state.canZoomGoForward);
  const focusedId = useOutlineStore(state => state.focusedId);
  const keyboardMode = useOutlineStore(state => state.keyboardMode);
  const enterNavigateMode = useOutlineStore(state => state.enterNavigateMode);
  const enterEditMode = useOutlineStore(state => state.enterEditMode);
  const addSiblingAfter = useOutlineStore(state => state.addSiblingAfter);
  const addSiblingBefore = useOutlineStore(state => state.addSiblingBefore);
  const swapWithPrevious = useOutlineStore(state => state.swapWithPrevious);
  const swapWithNext = useOutlineStore(state => state.swapWithNext);
  const extendSelection = useSelectionStore(state => state.extendSelection);
  const deleteNode = useOutlineStore(state => state.deleteNode);
  const toggleCheckbox = useOutlineStore(state => state.toggleCheckbox);
  const indentNode = useOutlineStore(state => state.indentNode);
  const outdentNode = useOutlineStore(state => state.outdentNode);
  const focusedNodeContent = useOutlineStore(state => {
    if (!state.focusedId) return '';
    const node = state.nodes.find(n => n.id === state.focusedId);
    return node?.content ?? '';
  });
  const setFocusedId = useOutlineStore(state => state.setFocusedId);
  const getTree = useOutlineStore(state => state.getTree);
  const getArticleTree = useOutlineStore(state => state.getArticleTree);
  // Vim-style navigation
  const moveToParent = useOutlineStore(state => state.moveToParent);
  const moveToFirstChild = useOutlineStore(state => state.moveToFirstChild);
  const moveToNextSibling = useOutlineStore(state => state.moveToNextSibling);
  const moveToPrevSibling = useOutlineStore(state => state.moveToPrevSibling);
  // Linear navigation (for arrow keys when no editor is focused)
  const moveToPrevious = useOutlineStore(state => state.moveToPrevious);
  const moveToNext = useOutlineStore(state => state.moveToNext);
  const moveToFirst = useOutlineStore(state => state.moveToFirst);
  const moveToLast = useOutlineStore(state => state.moveToLast);
  const getVisibleNodes = useOutlineStore(state => state.getVisibleNodes);

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
      const docIdToLoad = session?.documentId;
      if (docIdToLoad) {
        setCurrentDocumentId(docIdToLoad);
        await load(docIdToLoad);
      } else {
        await load();
      }

      // Get the store state to validate node IDs
      const store = useOutlineStore.getState();

      // Look up per-document state for the doc we just loaded. When the session
      // didn't know which doc to open (first run), fall back to whatever doc the
      // store settled on (the backend's default doc).
      const loadedDocId = docIdToLoad ?? store.documentId ?? undefined;
      const perDoc = getDocumentState(session, loadedDocId);

      // Restore zoom state after document loads (only if node exists)
      if (perDoc.zoomedNodeId && store.getNode(perDoc.zoomedNodeId)) {
        zoomTo(perDoc.zoomedNodeId);
      }

      // Restore focus state after document loads (only if node exists)
      if (perDoc.focusedNodeId && store.getNode(perDoc.focusedNodeId)) {
        setFocusedId(perDoc.focusedNodeId);
      }

      // Restore scroll position after a brief delay for DOM to settle
      if (perDoc.scrollTop !== undefined && contentAreaRef.current) {
        const scrollTop = perDoc.scrollTop;
        setTimeout(() => {
          if (contentAreaRef.current) {
            contentAreaRef.current.scrollTop = scrollTop || 0;
          }
        }, 100);
      }

      sessionRestored.current = true;

      // Ensure the loaded doc id gets persisted even if effectiveDocumentId
      // didn't change after the sessionRestored flip (initial mount case).
      if (loadedDocId) {
        saveSessionState({ documentId: loadedDocId });
      }
    };

    restoreSession();
    useBookmarkStore.getState().load();
    useCustomEmojiStore.getState().load();
  }, [load, zoomTo, setFocusedId]);

  // Toggle theme
  const toggleTheme = useCallback(() => {
    const newDark = !isDark;
    setIsDark(newDark);
    document.documentElement.setAttribute('data-theme', newDark ? 'dark' : 'light');
    localStorage.setItem('theme', newDark ? 'dark' : 'light');
  }, [isDark]);

  // Initialize theme from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('theme');
    if (stored === 'dark') {
      setIsDark(true);
      document.documentElement.setAttribute('data-theme', 'dark');
    } else if (stored === 'light') {
      setIsDark(false);
      document.documentElement.setAttribute('data-theme', 'light');
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
    if (effectiveDocumentId) {
      saveSessionState({ documentId: effectiveDocumentId });
    }
  }, [effectiveDocumentId]);

  // Save session state when focus changes (per-document)
  useEffect(() => {
    if (!sessionRestored.current) return;
    if (!effectiveDocumentId) return;
    savePerDocumentState(effectiveDocumentId, { focusedNodeId: focusedId ?? undefined });
  }, [focusedId, effectiveDocumentId]);

  // Save session state when zoom changes (per-document)
  useEffect(() => {
    if (!sessionRestored.current) return;
    if (!effectiveDocumentId) return;
    savePerDocumentState(effectiveDocumentId, { zoomedNodeId: zoomedNodeId ?? undefined });
  }, [zoomedNodeId, effectiveDocumentId]);

  // Track scroll position with debounce (per-document)
  useEffect(() => {
    const contentArea = contentAreaRef.current;
    if (!contentArea) return;

    let scrollTimeout: ReturnType<typeof setTimeout> | null = null;

    const handleScroll = () => {
      if (!sessionRestored.current) return;
      if (!effectiveDocumentId) return;

      // Debounce scroll saves by 300ms
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }
      scrollTimeout = setTimeout(() => {
        savePerDocumentState(effectiveDocumentId, { scrollTop: contentArea.scrollTop });
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
  }, [effectiveDocumentId]);

  // Global drag/drop hardening. Prevent the webview from navigating away
  // when the user drops a URL / file / text onto the app. Without this, a
  // drag-paste of a URL onto any region without a preventDefault'ing drop
  // handler causes the Tauri webview (or plain browser) to navigate to the
  // dropped URL, which looks like a "full page reload" and loses unsaved
  // state. Specific drop targets (drag handles, bookmark bar) can opt out
  // by calling stopPropagation in their own handlers.
  useEffect(() => {
    const preventDefaultDrag = (e: DragEvent) => {
      e.preventDefault();
    };
    window.addEventListener('dragover', preventDefaultDrag);
    window.addEventListener('drop', preventDefaultDrag);
    return () => {
      window.removeEventListener('dragover', preventDefaultDrag);
      window.removeEventListener('drop', preventDefaultDrag);
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

  // Toggle bookmark bar
  const toggleBookmarkBar = useCallback(() => {
    setShowBookmarkBar(prev => {
      const newValue = !prev;
      localStorage.setItem('outline-bookmark-bar', String(newValue));
      return newValue;
    });
  }, []);

  // Switch to a different document while preserving per-document session
  // state. This is the single gateway used by all doc-switch call sites so
  // that:
  //   1. Pending focus/zoom/scroll writes for the outgoing doc are flushed
  //      before the new doc takes over the "live" values.
  //   2. After the new doc loads, its previously saved focus/zoom/scroll are
  //      restored (if the referenced nodes still exist).
  //
  // `afterLoad` runs after the new doc's state has been loaded and restored,
  // so callers can override focus (e.g. navigate to a specific node).
  const switchDocument = useCallback(async (
    newDocId: string,
    afterLoad?: () => void,
  ) => {
    // Flush any pending per-doc writes for the outgoing document.
    flushSessionState();

    setCurrentDocumentId(newDocId);
    await load(newDocId);

    // Restore the new doc's saved state (if any).
    const session = loadSessionState();
    const perDoc = getDocumentState(session, newDocId);
    const store = useOutlineStore.getState();

    if (perDoc.zoomedNodeId && store.getNode(perDoc.zoomedNodeId)) {
      store.zoomTo(perDoc.zoomedNodeId);
    } else {
      store.zoomReset();
    }

    if (perDoc.focusedNodeId && store.getNode(perDoc.focusedNodeId)) {
      store.setFocusedId(perDoc.focusedNodeId);
    }

    if (perDoc.scrollTop !== undefined && contentAreaRef.current) {
      const scrollTop = perDoc.scrollTop;
      setTimeout(() => {
        if (contentAreaRef.current) {
          contentAreaRef.current.scrollTop = scrollTop || 0;
        }
      }, 100);
    }

    if (afterLoad) afterLoad();
  }, [load]);

  // Handle save
  const handleSave = useCallback(async () => {
    setSaveStatus('saving');
    try {
      await api.compactDocument();
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (e) {
      console.error('Save failed:', e);
      showToast('Save failed. Changes are preserved locally.');
      setSaveStatus('idle');
    }
  }, []);

  // Handle document selection
  const handleSelectDocument = useCallback(async (docId: string) => {
    await switchDocument(docId);
  }, [switchDocument]);

  // Handle new document
  const handleNewDocument = useCallback(async () => {
    try {
      const newId = await api.createDocument();
      await switchDocument(newId);
      sidebarRef.current?.refresh();
    } catch (e) {
      console.error('Failed to create document:', e);
      showToast('Failed to create document');
    }
  }, [switchDocument]);

  // Handle document deletion - switch to another document or create new
  const handleDeleteDocument = useCallback(async (deletedDocId: string) => {
    try {
      const docs = await api.listDocuments();
      const remaining = docs.filter((d) => d.id !== deletedDocId);
      if (remaining.length > 0) {
        await switchDocument(remaining[0].id);
      } else {
        await handleNewDocument();
      }
    } catch (e) {
      console.error('Failed to switch after delete:', e);
      await handleNewDocument();
    }
  }, [switchDocument, handleNewDocument]);

  // Handle search navigation
  const handleSearchNavigate = useCallback(async (nodeId: string, documentId: string) => {
    if (documentId !== currentDocumentId) {
      await switchDocument(documentId, () => {
        useOutlineStore.getState().setFocusedId(nodeId);
      });
    } else {
      useOutlineStore.getState().setFocusedId(nodeId);
    }
    setShowSearchModal(false);
  }, [currentDocumentId, switchDocument]);

  // Handle date views navigation (cross-document)
  const handleDateViewNavigate = useCallback(async (nodeId: string, documentId: string) => {
    if (documentId !== currentDocumentId) {
      await switchDocument(documentId, () => {
        useOutlineStore.getState().setFocusedId(nodeId);
      });
    } else {
      useOutlineStore.getState().setFocusedId(nodeId);
    }
    setShowDateViews(false);
  }, [currentDocumentId, switchDocument]);

  // Handle today panel navigation (cross-document, keeps panel open)
  const handleTodayNavigate = useCallback(async (nodeId: string, documentId: string) => {
    if (documentId !== currentDocumentId) {
      await switchDocument(documentId, () => {
        useOutlineStore.getState().setFocusedId(nodeId);
      });
    } else {
      useOutlineStore.getState().setFocusedId(nodeId);
    }
  }, [currentDocumentId, switchDocument]);

  // Handle tags panel navigation (same document only)
  const handleTagsNavigate = useCallback((nodeId: string) => {
    useOutlineStore.getState().setFocusedId(nodeId);
    setShowTagsPanel(false);
  }, []);

  // Handle backlinks panel navigation (cross-document)
  const handleBacklinksNavigate = useCallback(async (nodeId: string, documentId: string) => {
    if (documentId !== currentDocumentId) {
      await switchDocument(documentId, () => {
        useOutlineStore.getState().setFocusedId(nodeId);
      });
    } else {
      useOutlineStore.getState().setFocusedId(nodeId);
    }
  }, [currentDocumentId, switchDocument]);

  // Handle bookmark navigation (cross-document)
  const handleBookmarkNavigate = useCallback(async (nodeId: string, documentId: string) => {
    if (documentId !== currentDocumentId) {
      await switchDocument(documentId, () => {
        useOutlineStore.getState().setFocusedId(nodeId);
      });
    } else {
      useOutlineStore.getState().setFocusedId(nodeId);
    }
  }, [currentDocumentId, switchDocument]);

  // Handle tag search from tags panel - use filter instead of search
  const handleTagSearch = useCallback((tag: string) => {
    setFilterQuery(`#${tag}`);
    setShowTagsPanel(false);
  }, [setFilterQuery]);

  // Handle quick navigator navigation
  const handleQuickNavigate = useCallback(async (nodeId: string, documentId: string) => {
    if (documentId && documentId !== currentDocumentId) {
      await switchDocument(documentId, () => {
        if (nodeId) {
          useOutlineStore.getState().setFocusedId(nodeId);
        }
      });
    } else if (nodeId) {
      useOutlineStore.getState().setFocusedId(nodeId);
    }
    setShowQuickNavigator(false);
  }, [currentDocumentId, switchDocument]);

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
      showToast('Export failed');
    }
  }, [nodes]);

  const handleExportMarkdown = useCallback(async () => {
    try {
      const title = nodes.find(n => !n.parent_id)?.content?.replace(/<[^>]*>/g, '') || 'Outline';
      const content = await api.exportMarkdown();
      await api.saveToFileWithDialog(content, `${title}.md`, 'md');
    } catch (e) {
      console.error('Export Markdown failed:', e);
      showToast('Export failed');
    }
  }, [nodes]);

  const handleExportJson = useCallback(async () => {
    try {
      const title = nodes.find(n => !n.parent_id)?.content?.replace(/<[^>]*>/g, '') || 'Outline';
      const content = await api.exportJson();
      await api.saveToFileWithDialog(content, `${title}.json`, 'json');
    } catch (e) {
      console.error('Export JSON failed:', e);
      showToast('Export failed');
    }
  }, [nodes]);

  const handleExportHtml = useCallback(async () => {
    try {
      const title = nodes.find(n => !n.parent_id)?.content?.replace(/<[^>]*>/g, '') || 'Outline';
      const content = await api.exportHtml(title, false);
      await api.saveToFileWithDialog(content, `${title}.html`, 'html');
    } catch (e) {
      console.error('Export HTML failed:', e);
      showToast('Export failed');
    }
  }, [nodes]);

  const handleExportHtmlDark = useCallback(async () => {
    try {
      const title = nodes.find(n => !n.parent_id)?.content?.replace(/<[^>]*>/g, '') || 'Outline';
      const content = await api.exportHtml(title, true);
      await api.saveToFileWithDialog(content, `${title}.html`, 'html');
    } catch (e) {
      console.error('Export HTML (Dark) failed:', e);
      showToast('Export failed');
    }
  }, [nodes]);

  const handleExportIcal = useCallback(async () => {
    try {
      const title = nodes.find(n => !n.parent_id)?.content?.replace(/<[^>]*>/g, '') || 'Outline';
      const content = await api.generateIcalFeed();
      await api.saveToFileWithDialog(content, `${title}.ics`, 'ics');
    } catch (e) {
      console.error('Export iCal failed:', e);
      showToast('Export failed');
    }
  }, [nodes]);

  const handleImportOpml = useCallback(async () => {
    try {
      const result = await api.importOpmlFromPicker();
      if (result) {
        // Navigate to the newly imported document
        await switchDocument(result.doc_id);
        // Refresh sidebar
        sidebarRef.current?.refresh();
      }
    } catch (e) {
      console.error('Import OPML failed:', e);
      showToast('Import failed');
    }
  }, [switchDocument]);

  const handleImportOpmlMerge = useCallback(async () => {
    try {
      const file = await api.pickAndReadFile([{ name: 'OPML', extensions: ['opml', 'xml'] }]);
      if (!file) return;
      await api.importOpml(file.content);
      // Reload current document to reflect merged content
      await load(currentDocumentId);
      showToast('OPML imported into current document');
    } catch (e) {
      console.error('Import OPML (merge) failed:', e);
      showToast('Import failed');
    }
  }, [load, currentDocumentId]);

  const handleImportJson = useCallback(async () => {
    try {
      const file = await api.pickAndReadFile([{ name: 'JSON', extensions: ['json'] }]);
      if (!file) return;
      await api.importJson(file.content);
      // Reload current document to reflect imported content
      await load(currentDocumentId);
      showToast('JSON imported into current document');
    } catch (e) {
      console.error('Import JSON failed:', e);
      showToast('Import failed');
    }
  }, [load, currentDocumentId]);

  // File menu items
  const fileMenuItems: MenuEntry[] = useMemo(() => [
    { label: 'New Document', shortcut: 'Ctrl+N', action: handleNewDocument, separator: false },
    { separator: true },
    { label: 'Save', shortcut: 'Ctrl+S', action: handleSave, separator: false },
    { separator: true },
    { label: 'Export OPML', action: handleExportOpml, separator: false },
    { label: 'Export Markdown', action: handleExportMarkdown, separator: false },
    { label: 'Export JSON', action: handleExportJson, separator: false },
    { label: 'Export HTML', action: handleExportHtml, separator: false },
    { label: 'Export HTML (Dark)', action: handleExportHtmlDark, separator: false },
    { label: 'Export iCal', action: handleExportIcal, separator: false },
    { separator: true },
    { label: 'Import OPML as New Document...', action: handleImportOpml, separator: false },
    { label: 'Import OPML into Current Document...', action: handleImportOpmlMerge, separator: false },
    { label: 'Import JSON into Current Document...', action: handleImportJson, separator: false },
  ], [handleNewDocument, handleSave, handleExportOpml, handleExportMarkdown, handleExportJson, handleExportHtml, handleExportHtmlDark, handleExportIcal, handleImportOpml, handleImportOpmlMerge, handleImportJson]);

  // Edit menu items
  const deleteAllCompleted = useOutlineStore(state => state.deleteAllCompleted);
  const hasCompletedItems = useMemo(() => nodes.some(n => n.is_checked), [nodes]);
  const editMenuItems: MenuEntry[] = useMemo(() => [
    { label: 'Undo', shortcut: 'Ctrl+Z', action: undo, disabled: !canUndo(), separator: false },
    { label: 'Redo', shortcut: 'Ctrl+Shift+Z', action: redo, disabled: !canRedo(), separator: false },
    { separator: true },
    { label: 'Delete Completed Items', action: deleteAllCompleted, disabled: !hasCompletedItems, separator: false },
  ], [undo, redo, canUndo, canRedo, deleteAllCompleted, hasCompletedItems]);

  // View menu items
  const showShortIds = useSettingsStore(state => state.showShortIds);
  const viewMode = useSettingsStore(state => state.viewMode);
  const noteDisplayMode = useSettingsStore(state => state.noteDisplayMode);
  const updateSettings = useSettingsStore(state => state.updateSettings);
  const toggleShortIds = useCallback(() => updateSettings({ showShortIds: !showShortIds }), [showShortIds, updateSettings]);
  const toggleViewMode = useCallback(() => updateSettings({ viewMode: viewMode === 'outline' ? 'article' : 'outline' }), [viewMode, updateSettings]);
  const cycleNoteDisplayMode = useCallback(() => {
    const next = noteDisplayMode === 'none' ? 'one-line'
               : noteDisplayMode === 'one-line' ? 'full'
               : 'none';
    updateSettings({ noteDisplayMode: next });
  }, [noteDisplayMode, updateSettings]);
  const isArticleView = viewMode === 'article';
  const viewMenuItems: MenuEntry[] = useMemo(() => [
    { label: 'Toggle Sidebar', shortcut: 'Ctrl+\\', action: toggleSidebar, separator: false },
    { label: 'Toggle Bookmark Bar', shortcut: 'Ctrl+Shift+B', action: toggleBookmarkBar, checked: showBookmarkBar, separator: false },
    { separator: true },
    { label: 'Article View', shortcut: 'Ctrl+Shift+R', action: toggleViewMode, checked: isArticleView, separator: false },
    { label: hideCompleted ? 'Show Completed' : 'Hide Completed', shortcut: 'Ctrl+Shift+H', action: toggleHideCompleted, separator: false },
    { label: hideDeferred ? 'Show Deferred' : 'Hide Deferred', shortcut: 'Ctrl+Shift+D', action: toggleHideDeferred, separator: false },
    { label: 'Show Short IDs', action: toggleShortIds, checked: showShortIds, separator: false },
    { label: 'Collapse All', shortcut: 'Ctrl+Shift+.', action: collapseAll, disabled: isArticleView, separator: false },
    { label: 'Expand All', shortcut: 'Ctrl+Shift+,', action: expandAll, disabled: isArticleView, separator: false },
    { label: 'Collapse Siblings', action: () => focusedId && collapseSiblings(focusedId), disabled: isArticleView, separator: false },
    { separator: true },
    { label: 'Expand to Level 1', action: () => expandToLevel(1), disabled: isArticleView, separator: false },
    { label: 'Expand to Level 2', action: () => expandToLevel(2), disabled: isArticleView, separator: false },
    { label: 'Expand to Level 3', action: () => expandToLevel(3), disabled: isArticleView, separator: false },
    { label: 'Expand to Level 4', action: () => expandToLevel(4), disabled: isArticleView, separator: false },
    { separator: true },
    { label: 'Zoom In', shortcut: 'Ctrl++', action: zoomIn, separator: false },
    { label: 'Zoom Out', shortcut: 'Ctrl+-', action: zoomOut, separator: false },
    { label: 'Reset Zoom', shortcut: 'Ctrl+0', action: resetZoom, separator: false },
    { separator: true },
    { label: isDark ? 'Light Mode' : 'Dark Mode', action: toggleTheme, separator: false },
  ], [toggleSidebar, toggleBookmarkBar, showBookmarkBar, toggleTheme, isDark, collapseAll, expandAll, expandToLevel, collapseSiblings, focusedId, hideCompleted, toggleHideCompleted, hideDeferred, toggleHideDeferred, zoomIn, zoomOut, resetZoom, showShortIds, toggleShortIds, toggleViewMode, isArticleView]);

  // Help menu items
  const helpMenuItems: MenuEntry[] = useMemo(() => [
    { label: 'Keyboard Shortcuts', shortcut: 'Ctrl+/', action: () => setShowKeyboardShortcuts(true), separator: false },
    { separator: true },
    { label: 'Settings', shortcut: 'Ctrl+,', action: () => setShowSettings(true), separator: false },
  ], []);

  // Global keyboard shortcuts
  useEffect(() => {
    // Tracks whether the outline editor's text was fully selected at the moment
    // the current Ctrl+A keydown fired (captured BEFORE ProseMirror's selectAll
    // command runs during the bubble phase).
    let editorFullySelectedAtKeydown = false;

    const handleKeydownCapture = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key === 'a' && !event.shiftKey) {
        const active = document.activeElement;
        const editorEl = active?.closest('.outline-editor') as HTMLElement | null;
        editorFullySelectedAtKeydown = false;
        if (editorEl) {
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
            const txt = editorEl.textContent ?? '';
            if (txt.length > 0 && sel.toString().length === txt.length) {
              editorFullySelectedAtKeydown = true;
            }
          }
        }
      }
    };

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

      // Copy as Markdown (Ctrl+Shift+C): bulk selection, or focused item tree
      if (mod && event.shiftKey && event.key === 'C') {
        if (selectedIds.size > 0) {
          event.preventDefault();
          copySelectedAsMarkdown();
          return;
        } else if (focusedId) {
          event.preventDefault();
          copyTreeAsMarkdown(focusedId);
          return;
        }
      }

      // Progressive Select all (Ctrl+A) - Dynalist-style cascade.
      // Works both inside and outside the outline editor. Inside inputs/textareas
      // (other than our outline editor), keep native Ctrl+A behavior.
      if (mod && event.key === 'a' && !event.shiftKey) {
        const activeElement = document.activeElement;
        const inOutlineEditor = !!activeElement?.closest('.outline-editor');
        const inOtherInput = !inOutlineEditor && (!!activeElement?.closest('input') || !!activeElement?.closest('textarea'));
        if (inOtherInput) {
          // Let the browser do its thing in non-outline inputs (search, note field, etc.)
          // and reset the cascade state.
          useSelectionStore.getState().resetCtrlACascade();
          return;
        }

        // `editorFullySelectedAtKeydown` is set by the capture-phase listener
        // BEFORE ProseMirror's default selectAll handler runs, so it reflects
        // the selection state at the moment the user pressed Ctrl+A.
        const editorFullySelected = inOutlineEditor && editorFullySelectedAtKeydown;

        const result = progressiveSelectAll({ editorFullySelected, inEditor: inOutlineEditor });
        if (result === 'text-select') {
          // Let TipTap/browser handle selecting all text in the editor.
          return;
        }
        // For 'advanced' or 'noop', we override native Ctrl+A behavior.
        event.preventDefault();
        return;
      }

      // Select siblings (Ctrl+Shift+A) - only when not in an input/editor
      if (mod && event.key === 'A' && event.shiftKey) {
        const activeElement = document.activeElement;
        if (!activeElement?.closest('.outline-editor') && !activeElement?.closest('input') && !activeElement?.closest('textarea')) {
          event.preventDefault();
          selectSiblings();
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

      // Toggle bookmark bar (Ctrl+Shift+B)
      if (mod && event.shiftKey && event.key === 'B') {
        event.preventDefault();
        toggleBookmarkBar();
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

      // Today panel (Ctrl+Shift+Y for todaY)
      if (mod && event.shiftKey && event.key === 'Y') {
        event.preventDefault();
        setShowTodayPanel(prev => !prev);
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

      // Quick Capture (Ctrl+Shift+Q or Ctrl+Shift+I)
      if (mod && event.shiftKey && (event.key === 'Q' || event.key === 'I')) {
        event.preventDefault();
        setShowQuickCapture(true);
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

      // Toggle Article View (Ctrl+Shift+R)
      if (mod && event.shiftKey && event.key === 'R') {
        event.preventDefault();
        toggleViewMode();
        return;
      }

      // Hide Completed (Ctrl+Shift+H)
      if (mod && event.shiftKey && event.key === 'H') {
        event.preventDefault();
        toggleHideCompleted();
        return;
      }

      // Hide Deferred (Ctrl+Shift+D)
      if (mod && event.shiftKey && event.key === 'D') {
        event.preventDefault();
        toggleHideDeferred();
        return;
      }

      // Toggle collapse on focused item (Ctrl+.)
      if (mod && event.key === '.') {
        event.preventDefault();
        toggleFocusedCollapse();
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

      // Reset Zoom (Ctrl+0) — only when no item is focused (Ctrl+0 in editor resets heading level)
      if (mod && event.key === '0' && !focusedId) {
        event.preventDefault();
        resetZoom();
        return;
      }

      // Zoom navigation history (Alt+Left/Right, browser-style)
      if (event.altKey && !mod && !event.shiftKey) {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          zoomGoBack();
          return;
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          zoomGoForward();
          return;
        }
      }

      // Vim-style hierarchy navigation (Alt+H/J/K/L)
      // Works everywhere since Alt+letter doesn't conflict with typing
      if (event.altKey && !mod && !event.shiftKey) {
        // Alt+H: Move to parent
        if (event.key === 'h') {
          event.preventDefault();
          moveToParent();
          return;
        }
        // Alt+L: Move to first child
        if (event.key === 'l') {
          event.preventDefault();
          moveToFirstChild();
          return;
        }
        // Alt+J: Move to next sibling
        if (event.key === 'j') {
          event.preventDefault();
          moveToNextSibling();
          return;
        }
        // Alt+K: Move to previous sibling
        if (event.key === 'k') {
          event.preventDefault();
          moveToPrevSibling();
          return;
        }
      }

      // Ctrl+Home: Jump to first item in document
      if (mod && event.key === 'Home') {
        event.preventDefault();
        moveToFirst();
        return;
      }

      // Ctrl+End: Jump to last item in document
      if (mod && event.key === 'End') {
        event.preventDefault();
        moveToLast();
        return;
      }

      // Ctrl+Q: Quit application (Tauri only)
      if (mod && event.key === 'q') {
        event.preventDefault();
        // Use dynamic import to check if we're in Tauri
        import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
          getCurrentWindow().close();
        }).catch(() => {
          // Not in Tauri, ignore
        });
        return;
      }

      // Arrow key navigation when focusedId points to an invisible node (e.g., zoomed-in node)
      // Also handles ArrowDown when there's no focus at all (select first visible item)
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !mod && !event.shiftKey) {
        const visible = getVisibleNodes();
        const focusedIsVisible = visible.some(n => n.id === focusedId);

        // No focus at all - select first visible item on ArrowDown
        if (!focusedId && event.key === 'ArrowDown' && visible.length > 0) {
          event.preventDefault();
          event.stopPropagation();
          moveToFirst();
          return;
        }

        // Focused node is not visible (e.g., zoomed-in parent)
        if (!focusedIsVisible && focusedId) {
          event.preventDefault();
          event.stopPropagation();
          if (event.key === 'ArrowDown') {
            moveToNext();
          } else {
            moveToPrevious();
          }
          return;
        }
      }

      // Ctrl+[ : zoom out to parent level
      if (event.key === '[' && mod) {
        event.preventDefault();
        zoomToParent();
        return;
      }

      // Ctrl+Shift+Enter : open note editor for focused node
      if (mod && event.shiftKey && event.key === 'Enter' && focusedId && selectedIds.size === 0) {
        event.preventDefault();
        openNoteEditor(focusedId);
        return;
      }

      // Escape: edit mode → navigate mode → clear selection → clear filter → exit zoom
      if (event.key === 'Escape' && !showSearchModal && !showQuickNavigator && !showQuickMove && !showQuickCapture && !showDateViews && !showTodayPanel && !showTagsPanel && !showKeyboardShortcuts && !showSettings) {
        // First exit edit mode into navigate mode (only when focus is in the outline area, not in modals/note editors)
        const eventTarget = event.target as HTMLElement;
        const targetInNonOutlineArea = eventTarget?.closest('.modal, .sidebar, .note-input');
        if (keyboardMode === 'edit' && focusedId && !targetInNonOutlineArea) {
          event.preventDefault();
          enterNavigateMode();
          return;
        }
        // Then clear selection if any, then filter, then zoom
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

      // Navigate mode: Ctrl+Arrow moves item(s) up/down
      if (keyboardMode === 'navigate' && focusedId && mod && !event.shiftKey) {
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          swapWithPrevious(focusedId);
          return;
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          swapWithNext(focusedId);
          return;
        }
      }

      // Navigate mode: Delete/Backspace deletes focused item or all selected
      if (keyboardMode === 'navigate' && focusedId && !mod && (event.key === 'Delete' || event.key === 'Backspace')) {
        event.preventDefault();
        if (selectedIds.size > 0) {
          deleteSelectedNodes();
        } else {
          deleteNode(focusedId);
        }
        return;
      }

      // Navigate mode: Space toggles checkbox on focused/selected items
      if (keyboardMode === 'navigate' && focusedId && event.key === ' ') {
        event.preventDefault();
        if (selectedIds.size > 0) {
          toggleSelectedCheckboxes();
        } else {
          // Determine next/prev visible node before toggling (item may vanish if hide-completed is on)
          const visible = getVisibleNodes();
          const idx = visible.findIndex(n => n.id === focusedId);
          const nextId = idx >= 0 && idx < visible.length - 1 ? visible[idx + 1].id
                       : idx > 0 ? visible[idx - 1].id
                       : null;
          toggleCheckbox(focusedId);
          if (nextId) {
            useOutlineStore.setState({ focusedId: nextId });
          }
        }
        return;
      }

      // Navigate mode: Tab/Shift+Tab indent/outdent focused item (when no selection)
      if (keyboardMode === 'navigate' && focusedId && selectedIds.size === 0) {
        if (event.key === 'Tab' && !event.shiftKey) {
          event.preventDefault();
          indentNode(focusedId);
          return;
        }
        if (event.key === 'Tab' && event.shiftKey) {
          event.preventDefault();
          outdentNode(focusedId);
          return;
        }
      }

      // Navigate mode keys
      if (keyboardMode === 'navigate' && focusedId && !mod && !event.shiftKey) {
        // Arrow keys: move focus between items (stay in navigate mode)
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          moveToNext();
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          moveToPrevious();
          return;
        }
        // Enter, a: enter edit mode on focused item, cursor at end
        if (event.key === 'Enter' || event.key === 'a') {
          event.preventDefault();
          enterEditMode(focusedId);
          return;
        }
        // o: create sibling below and enter edit mode
        if (event.key === 'o') {
          event.preventDefault();
          addSiblingAfter(focusedId);
          return;
        }
      }
      // Navigate mode Shift+Arrow: extend selection
      if (keyboardMode === 'navigate' && focusedId && !mod && event.shiftKey) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          extendSelection('down');
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          extendSelection('up');
          return;
        }
      }

      // A (shift+a) and O (shift+o) need shiftKey check
      if (keyboardMode === 'navigate' && focusedId && !mod && event.shiftKey) {
        // A: enter edit mode (same as a — cursor at end)
        if (event.key === 'A') {
          event.preventDefault();
          enterEditMode(focusedId);
          return;
        }
        // O: create sibling above and enter edit mode
        if (event.key === 'O') {
          event.preventDefault();
          addSiblingBefore(focusedId);
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

    window.addEventListener('keydown', handleKeydownCapture, true);
    window.addEventListener('keydown', handleKeydown);
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', handleKeydownCapture, true);
      window.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('wheel', handleWheel);
    };
  }, [currentDocumentId, handleSave, toggleSidebar, toggleBookmarkBar, collapseAll, expandAll, toggleFocusedCollapse, toggleHideCompleted, toggleHideDeferred, toggleViewMode, filterQuery, clearFilter, zoomedNodeId, zoomReset, zoomToParent, zoomGoBack, zoomGoForward, showSearchModal, showQuickNavigator, showQuickMove, showQuickCapture, showDateViews, showTodayPanel, showTagsPanel, showKeyboardShortcuts, showSettings, undo, redo, selectedIds, deleteSelectedNodes, toggleSelectedCheckboxes, indentSelectedNodes, outdentSelectedNodes, copySelectedAsMarkdown, copyTreeAsMarkdown, selectSiblings, progressiveSelectAll, zoomIn, zoomOut, resetZoom, moveToParent, moveToFirstChild, moveToNextSibling, moveToPrevSibling, moveToPrevious, moveToNext, moveToFirst, moveToLast, getVisibleNodes, focusedId, openNoteEditor, keyboardMode, enterNavigateMode, enterEditMode, addSiblingAfter, addSiblingBefore, swapWithPrevious, swapWithNext, extendSelection, deleteNode, toggleCheckbox, indentNode, outdentNode]);

  // Compute tree from nodes with useMemo for performance
  // Use store's getTree() which handles hideCompleted, filterQuery, and zoomedNodeId
  const rawTree = useMemo(() => getTree(), [getTree, nodes, hideCompleted, hideDeferred, filterQuery, zoomedNodeId]);
  // Article tree ignores collapsed state so all content is visible as prose
  const rawArticleTree = useMemo(
    () => isArticleView ? getArticleTree() : [],
    [getArticleTree, nodes, hideCompleted, hideDeferred, filterQuery, zoomedNodeId, isArticleView]
  );
  // Defer tree updates to keep UI responsive during large changes (expand/collapse)
  const tree = useDeferredValue(rawTree);
  const articleTree = useDeferredValue(rawArticleTree);
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
            className={`toolbar-btn ${showTodayPanel ? 'active' : ''}`}
            onClick={() => setShowTodayPanel(prev => !prev)}
            title="Today (Ctrl+Shift+Y)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
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
            className={`toolbar-btn toolbar-collapsible hide-completed-toggle ${hideCompleted ? 'active' : ''}`}
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
            className={`toolbar-btn toolbar-collapsible short-ids-toggle ${showShortIds ? 'active' : ''}`}
            onClick={toggleShortIds}
            title={showShortIds ? "Hide short IDs" : "Show short IDs"}
            aria-label={showShortIds ? "Hide short IDs" : "Show short IDs"}
          >
            {showShortIds ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="4" y1="9" x2="20" y2="9"/>
                <line x1="4" y1="15" x2="20" y2="15"/>
                <line x1="10" y1="3" x2="8" y2="21"/>
                <line x1="16" y1="3" x2="14" y2="21"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="4" y1="9" x2="20" y2="9"/>
                <line x1="4" y1="15" x2="20" y2="15"/>
                <line x1="10" y1="3" x2="8" y2="21"/>
                <line x1="16" y1="3" x2="14" y2="21"/>
                <line x1="2" y1="2" x2="22" y2="22"/>
              </svg>
            )}
          </button>
          <button
            className={`toolbar-btn toolbar-collapsible note-display-toggle ${noteDisplayMode !== 'none' ? 'active' : ''}`}
            onClick={cycleNoteDisplayMode}
            title={`Notes: ${NOTE_DISPLAY_OPTIONS.find(o => o.value === noteDisplayMode)?.label ?? noteDisplayMode}. Click to cycle.`}
            aria-label={`Notes: ${NOTE_DISPLAY_OPTIONS.find(o => o.value === noteDisplayMode)?.label ?? noteDisplayMode}. Click to cycle note display mode.`}
            data-note-display-mode={noteDisplayMode}
          >
            {noteDisplayMode === 'none' ? (
              // Crossed-out dot: "hidden"
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
                <line x1="4" y1="20" x2="20" y2="4"/>
              </svg>
            ) : noteDisplayMode === 'one-line' ? (
              // Single dot: "one line"
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
              </svg>
            ) : (
              // Three dots (ellipsis): "full"
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="6" cy="12" r="1.5" fill="currentColor"/>
                <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
                <circle cx="18" cy="12" r="1.5" fill="currentColor"/>
              </svg>
            )}
          </button>
          <button
            className="toolbar-btn toolbar-collapsible"
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
            className="toolbar-btn toolbar-collapsible"
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
          <div className="toolbar-separator toolbar-collapsible"></div>
          <button
            className="toolbar-btn toolbar-collapsible-narrow"
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
            className="toolbar-btn toolbar-collapsible-narrow settings-btn"
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
          onDeleteDocument={handleDeleteDocument}
          onApplySavedSearch={setFilterQuery}
          onNavigateToBookmark={handleBookmarkNavigate}
        />

        {/* Content Column: bookmark bar + main content */}
        <div className="content-column">
          {showBookmarkBar && (
            <BookmarkBar
              currentDocumentId={currentDocumentId}
              onNavigate={handleBookmarkNavigate}
            />
          )}

          {/* Main Content Area */}
          <main className="content-area" ref={contentAreaRef}>
          {noteEditorNodeId ? (
            <NoteEditor
              nodeId={noteEditorNodeId}
              onClose={closeNoteEditor}
            />
          ) : (
            <>
              <ZoomBreadcrumbs />
              <FilterBar />
              {loading ? (
                <div className="loading">Loading...</div>
              ) : error ? (
                <div className="error">Error: {error}</div>
              ) : (
                <>
                  {isArticleView ? (
                    <ArticleView tree={articleTree} />
                  ) : (
                    <>
                      {!zoomedNodeId && tree.length > 0 && (
                        <DocumentTitle
                          node={tree[0].node}
                          onTitleChange={() => sidebarRef.current?.refresh()}
                        />
                      )}
                      {zoomedNodeId && tree.length === 0 ? (
                        <ZoomedLeafNoteEditor nodeId={zoomedNodeId} />
                      ) : (
                        <div className="outline-container">
                          {(zoomedNodeId ? tree : tree.slice(1)).map(item => (
                            <TreeItemRenderer
                              key={item.node.id}
                              item={item}
                              onOpenBulkQuickMove={() => {
                                setQuickMoveBulkMode(true);
                                setShowQuickMove(true);
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  <BacklinksPanel
                    nodeId={focusedId}
                    nodeContent={focusedNodeContent}
                    onNavigate={handleBacklinksNavigate}
                  />
                </>
              )}
            </>
          )}
        </main>
        </div>

        <TodayPanel
          isOpen={showTodayPanel}
          onClose={() => setShowTodayPanel(false)}
          onNavigate={handleTodayNavigate}
          currentDocumentId={currentDocumentId}
        />
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
          {hideDeferred && (
            <span className="filter-indicator" title="Click to show deferred items">
              (hiding deferred)
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
        onFilter={(query) => { setFilterQuery(query); setShowSearchModal(false); setSearchInitialQuery(''); }}
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

      <QuickCaptureModal
        isOpen={showQuickCapture}
        onClose={() => setShowQuickCapture(false)}
        currentDocumentId={currentDocumentId}
      />

      <ToastContainer />
    </div>
  );
}

export default App;
