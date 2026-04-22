import { create } from 'zustand';
import type { Node, TreeNode, DocumentState, UndoEntry, UndoAction, NodeChanges } from '../lib/types';
import * as api from '../lib/api';
import { formatISODate } from '../lib/dateUtils';
import { parseFilterQuery, nodeMatchesParsedFilter, type ParsedFilter } from '../lib/searchQueryParser';
import { logNav } from '../lib/navLog';

// Constants
const MAX_UNDO_STACK_SIZE = 100;
const NOTE_UPDATE_DEBOUNCE_MS = 300;

// Debounce timer for note updates (stored outside Zustand to avoid re-renders)
const pendingNoteUpdates = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Calculate the next date for a "repeat from completion" recurring task.
 * Parses the RRULE to extract the interval and applies it to the completion date.
 */
function calculateNextDateFromCompletion(rrule: string, completionDate: Date): string | null {
  let freq = '';
  let interval = 1;

  const parts = rrule.split(';');
  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key === 'FREQ') freq = value;
    if (key === 'INTERVAL') interval = parseInt(value, 10) || 1;
  }

  const next = new Date(completionDate);
  switch (freq) {
    case 'DAILY':
      next.setDate(next.getDate() + interval);
      break;
    case 'WEEKLY':
      next.setDate(next.getDate() + interval * 7);
      break;
    case 'MONTHLY':
      next.setMonth(next.getMonth() + interval);
      break;
    case 'YEARLY':
      next.setFullYear(next.getFullYear() + interval);
      break;
    default:
      return null;
  }

  const year = next.getFullYear();
  const month = String(next.getMonth() + 1).padStart(2, '0');
  const day = String(next.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Flat item for virtual list rendering
export interface FlatItem {
  node: Node;
  depth: number;
  hasChildren: boolean;
}

// Snapshot of a zoom "view state" used to restore focus + scroll when navigating
// back/forward in zoom history (otl-5lm0).
export interface ZoomHistoryEntry {
  zoomedNodeId: string | null;
  focusedId: string | null;
  scrollTop: number;
}

// Pluggable scroll provider. App.tsx registers a getter/setter backed by the
// main content-area ref so the store can capture/restore scroll position
// without importing any DOM refs.
type ScrollProvider = {
  getScrollTop: () => number;
  setScrollTop: (top: number) => void;
};

let scrollProvider: ScrollProvider | null = null;

export function registerScrollProvider(provider: ScrollProvider | null): void {
  scrollProvider = provider;
}

function captureScrollTop(): number {
  return scrollProvider ? scrollProvider.getScrollTop() : 0;
}

function restoreScrollTop(top: number): void {
  if (!scrollProvider) return;
  // Restore immediately, then again on next frames. The virtualized list may
  // not have rendered enough rows to reach `top` on the first tick, so we
  // reapply across a few frames to let @tanstack/react-virtual catch up.
  scrollProvider.setScrollTop(top);
  requestAnimationFrame(() => {
    if (scrollProvider) scrollProvider.setScrollTop(top);
    requestAnimationFrame(() => {
      if (scrollProvider) scrollProvider.setScrollTop(top);
    });
  });
}

interface OutlineState {
  // Core state
  nodes: Node[];
  focusedId: string | null;
  pendingCursorPos: number | null;  // Cursor position to set when editor gains focus (null = end)
  loading: boolean;
  error: string | null;
  pendingOperations: number;
  hideCompleted: boolean;
  hideDeferred: boolean;
  filterQuery: string | null;  // Hashtag filter, e.g., "#project"
  zoomedNodeId: string | null;  // Subtree zoom - show only this node's children
  noteEditorNodeId: string | null;  // Node whose note is open in full-screen editor
  draggedId: string | null;  // Currently dragged node ID
  documentId: string | null;  // Currently loaded document ID
  docPrefix: string | null;  // Document prefix for short IDs (e.g., "inbox")
  keyboardMode: 'edit' | 'navigate';  // edit = TipTap active, navigate = item-level operations
  titleFocusRequested: boolean;  // Flag to request focus on the document title editor
  // Zoom navigation history. Each entry captures the full view state so
  // back/forward can restore focused item and scroll position, not just the
  // zoom target (otl-5lm0).
  _zoomHistoryBack: ZoomHistoryEntry[];
  _zoomHistoryForward: ZoomHistoryEntry[];

  // Undo/Redo stacks
  _undoStack: UndoEntry[];
  _redoStack: UndoEntry[];

  // Cached indexes (rebuilt when nodes change)
  _nodesById: Map<string, Node>;
  _childrenByParent: Map<string | null, Node[]>;

  // Actions - State setters
  setNodes: (nodes: Node[]) => void;
  setFocusedId: (id: string | null) => void;
  setPendingCursorPos: (pos: number | null) => void;
  setFocusWithCursor: (id: string | null, cursorPos: number | null) => void;
  updateFromState: (state: DocumentState) => void;
  toggleHideCompleted: () => void;
  setHideCompleted: (hide: boolean) => void;
  toggleHideDeferred: () => void;
  setHideDeferred: (hide: boolean) => void;
  setFilterQuery: (query: string | null) => void;
  clearFilter: () => void;
  zoomTo: (nodeId: string | null) => void;
  zoomToParent: () => void;  // Zoom out to parent level
  zoomReset: () => void;
  zoomGoBack: () => void;    // Navigate back in zoom history
  zoomGoForward: () => void; // Navigate forward in zoom history
  canZoomGoBack: () => boolean;
  canZoomGoForward: () => boolean;
  getZoomBreadcrumbs: () => { id: string | null; title: string }[];
  openNoteEditor: (nodeId: string) => void;
  closeNoteEditor: () => void;
  enterNavigateMode: () => void;
  enterEditMode: (nodeId?: string) => void;
  requestTitleFocus: () => void;
  clearTitleFocusRequest: () => void;

  // Computed
  getTree: () => TreeNode[];
  getArticleTree: () => TreeNode[];  // Like getTree but ignores collapsed state
  getFlatList: () => FlatItem[];
  getVisibleNodes: () => Node[];
  getNode: (id: string) => Node | undefined;
  hasChildren: (id: string) => boolean;
  getParent: (nodeId: string) => Node | null;
  getSiblings: (nodeId: string) => Node[];
  childrenOf: (parentId: string) => Node[];
  rootNodes: () => Node[];

  // Tag utilities
  getAllTags: () => Array<{ tag: string; count: number; nodeIds: string[] }>;
  getNodesWithTag: (tag: string) => Node[];

  // Navigation
  moveToPrevious: () => string | null;
  moveToNext: () => string | null;
  moveToFirst: () => string | null;
  moveToLast: () => string | null;
  // Vim-style hierarchy navigation
  moveToParent: () => string | null;
  moveToFirstChild: () => string | null;
  moveToNextSibling: () => string | null;
  moveToPrevSibling: () => string | null;

  // Document operations
  load: (docId?: string, caller?: string) => Promise<void>;
  addSiblingAfter: (nodeId: string) => Promise<string | null>;
  addSiblingBefore: (nodeId: string) => Promise<string | null>;
  createFirstChild: (parentId: string) => Promise<string | null>;
  splitNode: (nodeId: string, beforeContent: string, afterContent: string) => Promise<string | null>;
  mergeWithNextSibling: (nodeId: string) => Promise<{ cursorPos: number } | null>;
  mergeWithPreviousSibling: (nodeId: string) => Promise<{ cursorPos: number; newFocusId: string } | null>;
  updateContent: (nodeId: string, content: string) => Promise<void>;
  updateNote: (nodeId: string, note: string) => void;  // Debounced
  deleteNode: (nodeId: string, focusDirection?: 'previous' | 'next') => Promise<string | null>;
  deleteAllCompleted: () => Promise<number>;
  toggleCollapse: (nodeId: string) => Promise<void>;
  collapseNode: (nodeId: string) => Promise<void>;
  expandNode: (nodeId: string) => Promise<void>;
  collapseAll: () => Promise<void>;
  expandAll: () => Promise<void>;
  expandToLevel: (level: number) => Promise<void>;
  collapseSiblings: (nodeId: string) => Promise<void>;
  toggleFocusedCollapse: () => Promise<void>;
  indentNode: (nodeId: string) => Promise<boolean>;
  outdentNode: (nodeId: string) => Promise<boolean>;
  swapWithPrevious: (nodeId: string) => Promise<boolean>;
  swapWithNext: (nodeId: string) => Promise<boolean>;
  toggleCheckbox: (nodeId: string) => Promise<boolean>;
  toggleNodeType: (nodeId: string) => Promise<boolean>;
  setNodeTypeTo: (nodeId: string, newType: import('../lib/types').NodeType) => Promise<boolean>;
  setHeadingLevel: (nodeId: string, level: number) => Promise<boolean>;
  clearHeading: (nodeId: string) => Promise<boolean>;
  setNodeColor: (nodeId: string, color: string) => Promise<boolean>;
  convertToCheckbox: (nodeId: string, isChecked: boolean) => Promise<boolean>;
  moveNodeTo: (nodeId: string, newParentId: string | null, newPosition: number) => Promise<boolean>;
  createItemsFromMarkdown: (afterNodeId: string, items: Array<{ content: string; nodeType: 'bullet' | 'checkbox' | 'numbered'; isChecked: boolean; indent: number }>) => Promise<string | null>;

  // Drag and drop
  startDrag: (nodeId: string) => void;
  endDrag: () => void;
  dropOnNode: (targetId: string, asChild: boolean) => Promise<boolean>;

  // Undo/Redo
  canUndo: () => boolean;
  canRedo: () => boolean;
  undo: () => Promise<boolean>;
  redo: () => Promise<boolean>;
  clearUndoHistory: () => void;
  _pushUndo: (entry: UndoEntry) => void;
  _executeUndoAction: (action: UndoAction) => Promise<boolean>;

}

// Check if a node matches a pre-parsed filter
function nodeMatchesFilter(
  node: Node,
  parsed: ParsedFilter,
  childrenByParent?: Map<string | null, Node[]>
): boolean {
  const childCount = childrenByParent ? (childrenByParent.get(node.id) ?? []).length : 0;
  return nodeMatchesParsedFilter(node, parsed, childCount);
}

// Check if a node or any of its descendants match the filter
function hasMatchingDescendant(
  nodeId: string,
  childrenByParent: Map<string | null, Node[]>,
  parsed: ParsedFilter,
  nodesById: Map<string, Node>
): boolean {
  const children = childrenByParent.get(nodeId) ?? [];
  for (const child of children) {
    if (nodeMatchesFilter(child, parsed, childrenByParent)) return true;
    if (hasMatchingDescendant(child.id, childrenByParent, parsed, nodesById)) return true;
  }
  return false;
}

// Check if a node is currently deferred (defer_date is in the future)
function isNodeDeferred(node: Node): boolean {
  if (!node.defer_date) return false;
  const today = formatISODate(new Date());
  return node.defer_date > today;
}

// Build tree structure from flat nodes
function buildTree(
  childrenByParent: Map<string | null, Node[]>,
  parentId: string | null,
  depth: number,
  hideCompleted: boolean = false,
  filterQuery: string | null = null,
  nodesById: Map<string, Node> = new Map(),
  zoomedNodeId: string | null = null,
  hideDeferred: boolean = false,
  ignoreCollapsed: boolean = false,
  _parsedFilter?: ParsedFilter | null
): TreeNode[] {
  // Parse the filter query once at the top level, reuse on recursive calls
  const parsed = _parsedFilter !== undefined ? _parsedFilter : (filterQuery ? parseFilterQuery(filterQuery) : null);

  // When zoomed, start from the zoomed node's children (only at root level)
  let effectiveParentId = parentId;
  if (depth === 0 && zoomedNodeId) {
    // Validate zoomed node exists, fall back to root if not
    if (nodesById.has(zoomedNodeId)) {
      effectiveParentId = zoomedNodeId;
    } else {
      console.warn('[buildTree] Zoomed node not found, falling back to root:', zoomedNodeId);
    }
  }
  const children = childrenByParent.get(effectiveParentId) ?? [];

  // Filter out completed items if hideCompleted is enabled
  let visibleChildren = hideCompleted
    ? children.filter(n => !n.is_checked)
    : children;

  // Filter out deferred items if hideDeferred is enabled
  if (hideDeferred) {
    visibleChildren = visibleChildren.filter(n => !isNodeDeferred(n));
  }

  // If filtering, only show nodes that match OR have matching descendants
  if (parsed) {
    visibleChildren = visibleChildren.filter(n =>
      nodeMatchesFilter(n, parsed, childrenByParent) ||
      hasMatchingDescendant(n.id, childrenByParent, parsed, nodesById)
    );
  }

  return visibleChildren.map(node => {
    const nodeChildren = childrenByParent.get(node.id) ?? [];
    // Check if there are visible children (accounting for hideCompleted, hideDeferred, and filter)
    let visibleNodeChildren = hideCompleted
      ? nodeChildren.filter(n => !n.is_checked)
      : nodeChildren;
    if (hideDeferred) {
      visibleNodeChildren = visibleNodeChildren.filter(n => !isNodeDeferred(n));
    }
    if (parsed) {
      visibleNodeChildren = visibleNodeChildren.filter(n =>
        nodeMatchesFilter(n, parsed, childrenByParent) ||
        hasMatchingDescendant(n.id, childrenByParent, parsed, nodesById)
      );
    }
    const hasChildren = visibleNodeChildren.length > 0;

    return {
      node,
      depth,
      hasChildren,
      // When filtering or in article view, expand all nodes to show matches
      children: hasChildren && (!node.collapsed || filterQuery || ignoreCollapsed)
        ? buildTree(childrenByParent, node.id, depth + 1, hideCompleted, filterQuery, nodesById, null, hideDeferred, ignoreCollapsed, parsed)
        : []
    };
  });
}

// Rebuild indexes from nodes array
function rebuildIndexes(nodes: Node[]) {
  const nodesById = new Map<string, Node>();
  const childrenByParent = new Map<string | null, Node[]>();

  // First pass: build node map
  for (const node of nodes) {
    nodesById.set(node.id, node);
  }

  // Second pass: build children map
  for (const node of nodes) {
    // Normalize undefined to null for root nodes
    const parentId = node.parent_id ?? null;
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(node);
    childrenByParent.set(parentId, siblings);
  }

  // Sort children by position
  for (const [, children] of childrenByParent) {
    children.sort((a, b) => a.position - b.position);
  }

  return { nodesById, childrenByParent };
}

// Flatten tree into a list for virtualization
function flattenTree(
  childrenByParent: Map<string | null, Node[]>,
  parentId: string | null,
  depth: number,
  hideCompleted: boolean = false,
  filterQuery: string | null = null,
  nodesById: Map<string, Node> = new Map(),
  zoomedNodeId: string | null = null,
  hideDeferred: boolean = false,
  _parsedFilter?: ParsedFilter | null
): FlatItem[] {
  // Parse the filter query once at the top level, reuse on recursive calls
  const parsed = _parsedFilter !== undefined ? _parsedFilter : (filterQuery ? parseFilterQuery(filterQuery) : null);

  // When zoomed, start from the zoomed node's children (only at root level)
  let effectiveParentId = parentId;
  if (depth === 0 && zoomedNodeId) {
    // Validate zoomed node exists, fall back to root if not
    if (nodesById.has(zoomedNodeId)) {
      effectiveParentId = zoomedNodeId;
    }
  }
  const children = childrenByParent.get(effectiveParentId) ?? [];
  const result: FlatItem[] = [];

  // Filter out completed items if hideCompleted is enabled
  let visibleChildren = hideCompleted
    ? children.filter(n => !n.is_checked)
    : children;

  // Filter out deferred items if hideDeferred is enabled
  if (hideDeferred) {
    visibleChildren = visibleChildren.filter(n => !isNodeDeferred(n));
  }

  // If filtering, only show nodes that match OR have matching descendants
  if (parsed) {
    visibleChildren = visibleChildren.filter(n =>
      nodeMatchesFilter(n, parsed, childrenByParent) ||
      hasMatchingDescendant(n.id, childrenByParent, parsed, nodesById)
    );
  }

  for (const node of visibleChildren) {
    const nodeChildren = childrenByParent.get(node.id) ?? [];
    let visibleNodeChildren = hideCompleted
      ? nodeChildren.filter(n => !n.is_checked)
      : nodeChildren;
    if (hideDeferred) {
      visibleNodeChildren = visibleNodeChildren.filter(n => !isNodeDeferred(n));
    }
    if (parsed) {
      visibleNodeChildren = visibleNodeChildren.filter(n =>
        nodeMatchesFilter(n, parsed, childrenByParent) ||
        hasMatchingDescendant(n.id, childrenByParent, parsed, nodesById)
      );
    }
    const hasChildren = visibleNodeChildren.length > 0;

    result.push({ node, depth, hasChildren });

    // Recursively add children if not collapsed (always expand when filtering)
    if (hasChildren && (!node.collapsed || filterQuery)) {
      result.push(...flattenTree(childrenByParent, node.id, depth + 1, hideCompleted, filterQuery, nodesById, null, hideDeferred, parsed));
    }
  }

  return result;
}

// Flatten tree to get visible nodes (for navigation)
function getVisibleNodesFromTree(tree: TreeNode[]): Node[] {
  const result: Node[] = [];
  for (const item of tree) {
    result.push(item.node);
    if (!item.node.collapsed) {
      result.push(...getVisibleNodesFromTree(item.children));
    }
  }
  return result;
}

export const useOutlineStore = create<OutlineState>((set, get) => ({
  nodes: [],
  focusedId: null,
  pendingCursorPos: null,
  loading: false,
  error: null,
  pendingOperations: 0,
  hideCompleted: typeof localStorage !== 'undefined'
    ? localStorage.getItem('outline-hide-completed') === 'true'
    : false,
  hideDeferred: typeof localStorage !== 'undefined'
    ? localStorage.getItem('outline-hide-deferred') === 'true'
    : false,
  filterQuery: null,
  zoomedNodeId: null,
  noteEditorNodeId: null,
  draggedId: null,
  documentId: null,
  docPrefix: null,
  keyboardMode: 'edit' as const,
  titleFocusRequested: false,
  _zoomHistoryBack: [],
  _zoomHistoryForward: [],
  _undoStack: [],
  _redoStack: [],
  _nodesById: new Map(),
  _childrenByParent: new Map(),

  setNodes: (nodes) => {
    const { nodesById, childrenByParent } = rebuildIndexes(nodes);
    set({
      nodes,
      _nodesById: nodesById,
      _childrenByParent: childrenByParent
    });
  },

  setFocusedId: (id) => set({ focusedId: id, keyboardMode: 'edit' }),

  setPendingCursorPos: (pos) => set({ pendingCursorPos: pos }),

  setFocusWithCursor: (id, cursorPos) => set({ focusedId: id, pendingCursorPos: cursorPos, keyboardMode: 'edit' }),

  updateFromState: (state: DocumentState) => {
    const { nodesById, childrenByParent } = rebuildIndexes(state.nodes);
    const updates: Partial<OutlineState> = {
      nodes: state.nodes,
      _nodesById: nodesById,
      _childrenByParent: childrenByParent,
    };
    if (state.doc_id) {
      updates.documentId = state.doc_id;
    }
    if (state.doc_prefix) {
      updates.docPrefix = state.doc_prefix;
    }
    set(updates);
  },

  toggleHideCompleted: () => {
    const newValue = !get().hideCompleted;
    localStorage.setItem('outline-hide-completed', String(newValue));
    set({ hideCompleted: newValue });
  },

  setHideCompleted: (hide: boolean) => {
    localStorage.setItem('outline-hide-completed', String(hide));
    set({ hideCompleted: hide });
  },

  toggleHideDeferred: () => {
    const newValue = !get().hideDeferred;
    localStorage.setItem('outline-hide-deferred', String(newValue));
    set({ hideDeferred: newValue });
  },

  setHideDeferred: (hide: boolean) => {
    localStorage.setItem('outline-hide-deferred', String(hide));
    set({ hideDeferred: hide });
  },

  setFilterQuery: (query: string | null) => {
    set({ filterQuery: query });
  },

  clearFilter: () => {
    set({ filterQuery: null });
  },

  zoomTo: (nodeId: string | null) => {
    const { zoomedNodeId, focusedId, childrenOf, setFocusedId, _zoomHistoryBack } = get();
    // Don't push history if navigating to the same node
    if (nodeId === zoomedNodeId) return;
    // Capture current view state onto back stack, clear forward stack
    const entry: ZoomHistoryEntry = {
      zoomedNodeId,
      focusedId,
      scrollTop: captureScrollTop(),
    };
    set({
      zoomedNodeId: nodeId,
      _zoomHistoryBack: [..._zoomHistoryBack, entry],
      _zoomHistoryForward: [],
    });
    // When zooming into a node, focus its first child if it has children
    if (nodeId) {
      const children = childrenOf(nodeId);
      if (children.length > 0) {
        setFocusedId(children[0].id);
      }
    }
    // Scroll to top on fresh zoom-in (no prior scroll state for new target)
    restoreScrollTop(0);
  },

  zoomToParent: () => {
    const { zoomedNodeId, focusedId, _nodesById, _zoomHistoryBack } = get();
    if (!zoomedNodeId) return;  // Already at root

    const zoomedNode = _nodesById.get(zoomedNodeId);
    if (!zoomedNode) return;

    const parentId = zoomedNode.parent_id ?? null;
    // Capture current view state onto back stack, clear forward stack
    const entry: ZoomHistoryEntry = {
      zoomedNodeId,
      focusedId,
      scrollTop: captureScrollTop(),
    };
    set({
      zoomedNodeId: parentId,
      _zoomHistoryBack: [..._zoomHistoryBack, entry],
      _zoomHistoryForward: [],
    });
  },

  zoomReset: () => {
    const { zoomedNodeId, focusedId, _zoomHistoryBack } = get();
    if (zoomedNodeId == null) return;  // Already at root
    // Capture current view state onto back stack, clear forward stack
    const entry: ZoomHistoryEntry = {
      zoomedNodeId,
      focusedId,
      scrollTop: captureScrollTop(),
    };
    set({
      zoomedNodeId: null,
      _zoomHistoryBack: [..._zoomHistoryBack, entry],
      _zoomHistoryForward: [],
    });
  },

  zoomGoBack: () => {
    const { zoomedNodeId, focusedId, _zoomHistoryBack, _zoomHistoryForward, setFocusedId } = get();
    if (_zoomHistoryBack.length === 0) return;
    const newBack = [..._zoomHistoryBack];
    const target = newBack.pop()!;
    // Capture the current view state onto the forward stack so zoomGoForward
    // can restore the exact focused item + scrollTop the user had just before
    // hitting back.
    const currentEntry: ZoomHistoryEntry = {
      zoomedNodeId,
      focusedId,
      scrollTop: captureScrollTop(),
    };
    set({
      zoomedNodeId: target.zoomedNodeId,
      _zoomHistoryBack: newBack,
      _zoomHistoryForward: [..._zoomHistoryForward, currentEntry],
    });
    // Restore the focused item from the captured entry (falls back to first
    // child if the captured focus node is gone, preserving legacy behavior).
    const restoredFocusId = target.focusedId;
    if (restoredFocusId && get().getNode(restoredFocusId)) {
      setFocusedId(restoredFocusId);
    } else if (target.zoomedNodeId) {
      const children = get().childrenOf(target.zoomedNodeId);
      if (children.length > 0) setFocusedId(children[0].id);
    }
    restoreScrollTop(target.scrollTop);
  },

  zoomGoForward: () => {
    const { zoomedNodeId, focusedId, _zoomHistoryBack, _zoomHistoryForward, setFocusedId } = get();
    if (_zoomHistoryForward.length === 0) return;
    const newForward = [..._zoomHistoryForward];
    const target = newForward.pop()!;
    // Capture the current view state onto the back stack so zoomGoBack can
    // undo the forward navigation precisely.
    const currentEntry: ZoomHistoryEntry = {
      zoomedNodeId,
      focusedId,
      scrollTop: captureScrollTop(),
    };
    set({
      zoomedNodeId: target.zoomedNodeId,
      _zoomHistoryBack: [..._zoomHistoryBack, currentEntry],
      _zoomHistoryForward: newForward,
    });
    const restoredFocusId = target.focusedId;
    if (restoredFocusId && get().getNode(restoredFocusId)) {
      setFocusedId(restoredFocusId);
    } else if (target.zoomedNodeId) {
      const children = get().childrenOf(target.zoomedNodeId);
      if (children.length > 0) setFocusedId(children[0].id);
    }
    restoreScrollTop(target.scrollTop);
  },

  canZoomGoBack: () => {
    return get()._zoomHistoryBack.length > 0;
  },

  canZoomGoForward: () => {
    return get()._zoomHistoryForward.length > 0;
  },

  getZoomBreadcrumbs: () => {
    const { zoomedNodeId, _nodesById } = get();
    if (!zoomedNodeId) return [];

    const breadcrumbs: { id: string | null; title: string }[] = [];

    // Walk up the tree from zoomed node to root
    let currentId: string | null = zoomedNodeId;
    while (currentId) {
      const node = _nodesById.get(currentId);
      if (!node) break;

      // Strip HTML from content for title
      const title = node.content
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .trim();
      const shortTitle = title.length > 25 ? title.substring(0, 25) + '...' : title;

      breadcrumbs.unshift({ id: currentId, title: shortTitle || 'Untitled' });
      currentId = node.parent_id;
    }

    // Add "Home" at the beginning
    breadcrumbs.unshift({ id: null, title: 'Home' });

    return breadcrumbs;
  },

  openNoteEditor: (nodeId: string) => {
    set({ noteEditorNodeId: nodeId });
  },

  closeNoteEditor: () => {
    set({ noteEditorNodeId: null });
  },

  enterNavigateMode: () => {
    set({ keyboardMode: 'navigate' });
  },

  enterEditMode: (nodeId?: string) => {
    const updates: Partial<OutlineState> = { keyboardMode: 'edit' };
    if (nodeId != null) {
      updates.focusedId = nodeId;
    }
    set(updates);
  },

  requestTitleFocus: () => {
    set({ titleFocusRequested: true, focusedId: null });
  },

  clearTitleFocusRequest: () => {
    set({ titleFocusRequested: false });
  },

  // === Computed getters ===

  getTree: () => {
    const { _childrenByParent, _nodesById, hideCompleted, hideDeferred, filterQuery, zoomedNodeId, nodes } = get();

    // Debug: Check for root nodes
    const rootNodes = _childrenByParent.get(null) ?? [];
    if (nodes.length > 0 && rootNodes.length === 0) {
      console.error('[getTree] BUG: No root nodes found! All nodes have parent_id set.');
      console.log('[getTree] Total nodes:', nodes.length);
      console.log('[getTree] Sample node parent_ids:', nodes.slice(0, 5).map(n => ({ id: n.id, parent_id: n.parent_id })));

      // Find orphan roots - nodes whose parent doesn't exist
      const orphanRoots = nodes.filter(n => n.parent_id && !_nodesById.has(n.parent_id));
      if (orphanRoots.length > 0) {
        console.log('[getTree] Found orphan roots (parent missing):', orphanRoots.length);
      }
    }

    return buildTree(_childrenByParent, null, 0, hideCompleted, filterQuery, _nodesById, zoomedNodeId, hideDeferred);
  },

  getArticleTree: () => {
    const { _childrenByParent, _nodesById, hideCompleted, hideDeferred, filterQuery, zoomedNodeId } = get();
    return buildTree(_childrenByParent, null, 0, hideCompleted, filterQuery, _nodesById, zoomedNodeId, hideDeferred, true);
  },

  getFlatList: () => {
    const { _childrenByParent, _nodesById, hideCompleted, hideDeferred, filterQuery, zoomedNodeId } = get();
    return flattenTree(_childrenByParent, null, 0, hideCompleted, filterQuery, _nodesById, zoomedNodeId, hideDeferred);
  },

  getVisibleNodes: () => {
    const { zoomedNodeId } = get();
    const tree = get().getTree();
    // When not zoomed, skip the title node (first root item) since it has its own editor
    const effectiveTree = !zoomedNodeId && tree.length > 0 ? tree.slice(1) : tree;
    return getVisibleNodesFromTree(effectiveTree);
  },

  getNode: (id) => get()._nodesById.get(id),

  hasChildren: (id) => {
    const children = get()._childrenByParent.get(id);
    return children !== undefined && children.length > 0;
  },

  getParent: (nodeId) => {
    const node = get()._nodesById.get(nodeId);
    if (!node?.parent_id) return null;
    return get()._nodesById.get(node.parent_id) ?? null;
  },

  getSiblings: (nodeId) => {
    const node = get()._nodesById.get(nodeId);
    if (!node) return [];
    return node.parent_id == null
      ? get().rootNodes()
      : get().childrenOf(node.parent_id);
  },

  childrenOf: (parentId) => {
    return get()._childrenByParent.get(parentId) ?? [];
  },

  rootNodes: () => {
    return get()._childrenByParent.get(null) ?? [];
  },

  // Tag utilities
  getAllTags: () => {
    const { nodes } = get();
    const tagMap = new Map<string, { count: number; nodeIds: string[] }>();
    const HASHTAG_PATTERN = /(?:^|(?<=\s))#([a-zA-Z][a-zA-Z0-9_-]*)/g;

    for (const node of nodes) {
      const plainText = node.content.replace(/<[^>]*>/g, '');
      for (const match of plainText.matchAll(HASHTAG_PATTERN)) {
        const tag = match[1];
        const existing = tagMap.get(tag);
        if (existing) {
          existing.count++;
          if (!existing.nodeIds.includes(node.id)) {
            existing.nodeIds.push(node.id);
          }
        } else {
          tagMap.set(tag, { count: 1, nodeIds: [node.id] });
        }
      }
    }

    return Array.from(tagMap.entries())
      .map(([tag, data]) => ({ tag, ...data }))
      .sort((a, b) => b.count - a.count);
  },

  getNodesWithTag: (tag: string) => {
    const { nodes } = get();
    const HASHTAG_PATTERN = /(?:^|(?<=\s))#([a-zA-Z][a-zA-Z0-9_-]*)/g;

    return nodes.filter(node => {
      const plainText = node.content.replace(/<[^>]*>/g, '');
      for (const match of plainText.matchAll(HASHTAG_PATTERN)) {
        if (match[1] === tag) return true;
      }
      return false;
    });
  },

  // === Navigation ===

  moveToPrevious: () => {
    const { focusedId, getVisibleNodes } = get();
    const visible = getVisibleNodes();
    const idx = visible.findIndex(n => n.id === focusedId);
    if (idx > 0) {
      const newId = visible[idx - 1].id;
      set({ focusedId: newId });
      return newId;
    }
    // At the first visible item — request focus on title editor
    if (idx === 0) {
      get().requestTitleFocus();
    }
    return null;
  },

  moveToNext: () => {
    const { focusedId, getVisibleNodes } = get();
    const visible = getVisibleNodes();
    if (visible.length === 0) return null;

    const idx = focusedId ? visible.findIndex(n => n.id === focusedId) : -1;

    // If no node is focused or not visible, select first
    if (idx < 0) {
      const newId = visible[0].id;
      set({ focusedId: newId });
      return newId;
    }

    // Move to next visible node
    if (idx < visible.length - 1) {
      const newId = visible[idx + 1].id;
      set({ focusedId: newId });
      return newId;
    }
    return null;
  },

  moveToFirst: () => {
    const visible = get().getVisibleNodes();
    if (visible.length > 0) {
      const newId = visible[0].id;
      set({ focusedId: newId });
      return newId;
    }
    return null;
  },

  moveToLast: () => {
    const visible = get().getVisibleNodes();
    if (visible.length > 0) {
      const newId = visible[visible.length - 1].id;
      set({ focusedId: newId });
      return newId;
    }
    return null;
  },

  // Vim-style hierarchy navigation (Alt+H/L/J/K)
  moveToParent: () => {
    const { focusedId, getParent } = get();
    if (!focusedId) return null;
    const parent = getParent(focusedId);
    if (parent) {
      set({ focusedId: parent.id });
      return parent.id;
    }
    return null;
  },

  moveToFirstChild: () => {
    const { focusedId, childrenOf, getNode, hideCompleted, hideDeferred, filterQuery, _nodesById, _childrenByParent } = get();
    if (!focusedId) return null;
    const node = getNode(focusedId);
    if (!node || node.collapsed) return null;

    let children = childrenOf(focusedId);
    // Filter hidden completed items
    if (hideCompleted) {
      children = children.filter(n => !n.is_checked);
    }
    // Filter hidden deferred items
    if (hideDeferred) {
      children = children.filter(n => !isNodeDeferred(n));
    }
    // Filter by search query if active
    if (filterQuery) {
      const parsed = parseFilterQuery(filterQuery);
      children = children.filter(n =>
        nodeMatchesFilter(n, parsed, _childrenByParent) ||
        hasMatchingDescendant(n.id, _childrenByParent, parsed, _nodesById)
      );
    }
    if (children.length > 0) {
      set({ focusedId: children[0].id });
      return children[0].id;
    }
    return null;
  },

  moveToNextSibling: () => {
    const { focusedId, getSiblings, hideCompleted, hideDeferred, filterQuery, _nodesById, _childrenByParent } = get();
    if (!focusedId) return null;
    let siblings = getSiblings(focusedId);
    // Filter hidden completed items
    if (hideCompleted) {
      siblings = siblings.filter(n => !n.is_checked);
    }
    // Filter hidden deferred items
    if (hideDeferred) {
      siblings = siblings.filter(n => !isNodeDeferred(n));
    }
    // Filter by search query if active
    if (filterQuery) {
      const parsed = parseFilterQuery(filterQuery);
      siblings = siblings.filter(n =>
        nodeMatchesFilter(n, parsed, _childrenByParent) ||
        hasMatchingDescendant(n.id, _childrenByParent, parsed, _nodesById)
      );
    }
    const idx = siblings.findIndex(n => n.id === focusedId);
    if (idx >= 0 && idx < siblings.length - 1) {
      const newId = siblings[idx + 1].id;
      set({ focusedId: newId });
      return newId;
    }
    return null;
  },

  moveToPrevSibling: () => {
    const { focusedId, getSiblings, hideCompleted, hideDeferred, filterQuery, _nodesById, _childrenByParent } = get();
    if (!focusedId) return null;
    let siblings = getSiblings(focusedId);
    // Filter hidden completed items
    if (hideCompleted) {
      siblings = siblings.filter(n => !n.is_checked);
    }
    // Filter hidden deferred items
    if (hideDeferred) {
      siblings = siblings.filter(n => !isNodeDeferred(n));
    }
    // Filter by search query if active
    if (filterQuery) {
      const parsed = parseFilterQuery(filterQuery);
      siblings = siblings.filter(n =>
        nodeMatchesFilter(n, parsed, _childrenByParent) ||
        hasMatchingDescendant(n.id, _childrenByParent, parsed, _nodesById)
      );
    }
    const idx = siblings.findIndex(n => n.id === focusedId);
    if (idx > 0) {
      const newId = siblings[idx - 1].id;
      set({ focusedId: newId });
      return newId;
    }
    return null;
  },

  // === Document Operations ===

  load: async (docId?: string, caller: string = 'unknown') => {
    logNav('store-load', { docId: docId ?? null, caller });
    set({ loading: true, error: null });
    try {
      const state = await api.loadDocument(docId);
      get().updateFromState(state);

      // Focus first node if none focused
      const { focusedId, rootNodes } = get();
      if (!focusedId) {
        const roots = rootNodes();
        if (roots.length > 0) {
          set({ focusedId: roots[0].id });
        }
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      set({ loading: false });
    }
  },

  addSiblingAfter: async (nodeId: string) => {
    const { getNode, getSiblings, updateFromState, _pushUndo } = get();
    const node = getNode(nodeId);
    if (!node) return null;

    const siblings = getSiblings(nodeId);
    const idx = siblings.findIndex(n => n.id === nodeId);
    // Base the new position on the anchor's actual position rather than its
    // array index, so that any pre-existing position gaps or duplicates among
    // siblings cannot cause the new node to collide and sort into the middle.
    // (See otl-o38c regression: Enter on last root landing mid-list.)
    const anchorPos = siblings[idx]?.position ?? idx;
    const newPosition = anchorPos + 1;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      // Batch shift siblings after the insertion point in a single IPC call.
      // Pack them to consecutive positions starting at newPosition + 1 so we
      // never collide with the newly-created node or with each other.
      const now = new Date().toISOString();
      const moveOps = siblings.slice(idx + 1).map((s, i) => ({
        op: 'move' as const,
        id: s.id,
        parent_id: node.parent_id,
        position: newPosition + 1 + i,
        updated_at: now,
      }));
      if (moveOps.length > 0) {
        await api.saveOps(moveOps);
      }

      const result = await api.createNode(node.parent_id, newPosition, '');
      updateFromState(result.state);
      set({ focusedId: result.id, keyboardMode: 'edit' });

      // Get the newly created node for undo
      const newNode = get()._nodesById.get(result.id);
      if (newNode) {
        _pushUndo({
          description: 'Create item',
          undo: { type: 'delete', id: result.id },
          redo: { type: 'create', node: { ...newNode } },
          timestamp: Date.now(),
        });
      }

      return result.id;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return null;
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  addSiblingBefore: async (nodeId: string) => {
    const { getNode, getSiblings, updateFromState, _pushUndo } = get();
    const node = getNode(nodeId);
    if (!node) return null;

    const siblings = getSiblings(nodeId);
    const idx = siblings.findIndex(n => n.id === nodeId);
    // Base the new position on the anchor's actual position rather than the
    // array index; see otl-o38c for why array-index math collides when
    // sibling positions have gaps or duplicates.
    const anchorPos = siblings[idx]?.position ?? idx;
    const newPosition = anchorPos;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      // Batch shift current node and all siblings after it to consecutive
      // positions starting at newPosition + 1, guaranteeing no collision.
      const now = new Date().toISOString();
      const moveOps = siblings.slice(idx).map((s, i) => ({
        op: 'move' as const,
        id: s.id,
        parent_id: node.parent_id,
        position: newPosition + 1 + i,
        updated_at: now,
      }));
      if (moveOps.length > 0) {
        await api.saveOps(moveOps);
      }

      const result = await api.createNode(node.parent_id, newPosition, '');
      updateFromState(result.state);
      set({ focusedId: result.id, keyboardMode: 'edit' });

      const newNode = get()._nodesById.get(result.id);
      if (newNode) {
        _pushUndo({
          description: 'Create item',
          undo: { type: 'delete', id: result.id },
          redo: { type: 'create', node: { ...newNode } },
          timestamp: Date.now(),
        });
      }

      return result.id;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return null;
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  createFirstChild: async (parentId: string) => {
    const { childrenOf, updateFromState, _pushUndo } = get();
    const children = childrenOf(parentId);

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      // Shift all existing children down by 1
      const now = new Date().toISOString();
      const moveOps = children.map((c, i) => ({
        op: 'move' as const,
        id: c.id,
        parent_id: parentId,
        position: i + 1,
        updated_at: now,
      }));
      if (moveOps.length > 0) {
        await api.saveOps(moveOps);
      }

      const result = await api.createNode(parentId, 0, '');
      updateFromState(result.state);
      set({ focusedId: result.id, keyboardMode: 'edit' });

      const newNode = get()._nodesById.get(result.id);
      if (newNode) {
        _pushUndo({
          description: 'Create item',
          undo: { type: 'delete', id: result.id },
          redo: { type: 'create', node: { ...newNode } },
          timestamp: Date.now(),
        });
      }

      return result.id;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return null;
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  createItemsFromMarkdown: async (afterNodeId: string, items: Array<{ content: string; nodeType: 'bullet' | 'checkbox' | 'numbered'; isChecked: boolean; indent: number }>) => {
    if (items.length === 0) return null;

    const { getNode, getSiblings, childrenOf, updateFromState } = get();
    const anchorNode = getNode(afterNodeId);
    if (!anchorNode) return null;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      const siblings = getSiblings(afterNodeId);
      const anchorIdx = siblings.findIndex(n => n.id === afterNodeId);

      // Count top-level items to create
      const topLevelCount = items.filter(i => i.indent === 0).length;

      // Batch shift siblings after insertion point
      const now = new Date().toISOString();
      const moveOps = siblings.slice(anchorIdx + 1).map(s => ({
        op: 'move' as const,
        id: s.id,
        parent_id: anchorNode.parent_id,
        position: s.position + topLevelCount,
        updated_at: now,
      }));
      if (moveOps.length > 0) {
        await api.saveOps(moveOps);
      }

      // Track the most recent node at each indent level
      const lastNodeAtLevel = new Map<number, string>();
      lastNodeAtLevel.set(0, afterNodeId);

      // Track position within each parent
      const positionByParent = new Map<string | null, number>();
      positionByParent.set(anchorNode.parent_id, anchorIdx + 1);
      const existingChildren = childrenOf(afterNodeId);
      positionByParent.set(afterNodeId, existingChildren.length);

      let firstCreatedId: string | null = null;

      for (const item of items) {
        let parentId: string | null;

        if (item.indent === 0) {
          parentId = anchorNode.parent_id;
        } else {
          parentId = lastNodeAtLevel.get(item.indent - 1) ?? anchorNode.parent_id;
        }

        const position = positionByParent.get(parentId) ?? 0;
        const createResult = await api.createNode(parentId, position, item.content);
        let finalState = createResult.state;

        if (item.nodeType === 'checkbox') {
          finalState = await api.updateNode(createResult.id, {
            node_type: 'checkbox',
            is_checked: item.isChecked,
          });
        } else if (item.nodeType === 'numbered') {
          finalState = await api.updateNode(createResult.id, {
            node_type: 'numbered',
          });
        }

        if (!firstCreatedId) {
          firstCreatedId = createResult.id;
        }

        lastNodeAtLevel.set(item.indent, createResult.id);
        for (let level = item.indent + 1; level <= 10; level++) {
          lastNodeAtLevel.delete(level);
        }

        positionByParent.set(parentId, position + 1);
        updateFromState(finalState);
      }

      if (firstCreatedId) {
        set({ focusedId: firstCreatedId });
      }

      return firstCreatedId;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return null;
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  splitNode: async (nodeId: string, beforeContent: string, afterContent: string) => {
    const { getNode, getSiblings, childrenOf, updateFromState, zoomedNodeId, _pushUndo } = get();
    const node = getNode(nodeId);
    if (!node) return null;

    const siblings = getSiblings(nodeId);
    const idx = siblings.findIndex(n => n.id === nodeId);
    // Anchor on the actual sibling position (not array index) to avoid
    // collisions when sibling positions have gaps. See otl-o38c.
    const anchorPos = siblings[idx]?.position ?? idx;
    const newPosition = anchorPos + 1;

    // Get children to move to new node
    const children = childrenOf(nodeId);

    // Capture original content before split for undo
    const originalContent = node.content;

    // Check if we're zoomed into the node being split and it has children
    // If so, we need to zoom out after the split to avoid an empty view
    const wasZoomedIntoSplitNode = zoomedNodeId === nodeId && children.length > 0;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      // Update current node with "before" content
      await api.updateNode(nodeId, { content: beforeContent });

      // Batch shift siblings after insertion point. Pack trailing siblings
      // to newPosition + 1, + 2, ... so they never collide with the newly
      // created node or each other.
      const now = new Date().toISOString();
      const siblingMoveOps = siblings.slice(idx + 1).map((s, i) => ({
        op: 'move' as const,
        id: s.id,
        parent_id: node.parent_id,
        position: newPosition + 1 + i,
        updated_at: now,
      }));
      if (siblingMoveOps.length > 0) {
        await api.saveOps(siblingMoveOps);
      }

      // Create new node with "after" content
      const result = await api.createNode(node.parent_id, newPosition, afterContent);

      // Batch move children from original node to new node
      const childMoveOps = children.map((child, i) => ({
        op: 'move' as const,
        id: child.id,
        parent_id: result.id,
        position: i,
        updated_at: now,
      }));
      if (childMoveOps.length > 0) {
        await api.saveOps(childMoveOps);
      }

      // Reload to get final state after all moves
      logNav('bulk-refresh', { caller: 'outlineStore.splitNode' });
      const finalState = await api.loadDocument(get().documentId ?? undefined);
      updateFromState(finalState);

      set({ focusedId: result.id });

      // If we were zoomed into the split node, zoom out to its parent
      // This prevents an empty view since the original node's children moved away
      if (wasZoomedIntoSplitNode) {
        set({ zoomedNodeId: node.parent_id });
      }

      // Build undo entry for split:
      // Undo: move children back to original node, delete the new node, restore original content
      // Redo: re-split by updating content, creating new node, and moving children
      const undoActions: UndoAction[] = [];
      // Move children back from new node to original node
      for (let i = 0; i < children.length; i++) {
        undoActions.push({ type: 'move', id: children[i].id, parentId: nodeId, position: i });
      }
      // Delete the new split-off node
      undoActions.push({ type: 'delete', id: result.id });
      // Restore the original node's content
      undoActions.push({ type: 'update', id: nodeId, changes: { content: originalContent } });

      const newNode = get().getNode(result.id);
      const redoActions: UndoAction[] = [];
      // Update original node to before content
      redoActions.push({ type: 'update', id: nodeId, changes: { content: beforeContent } });
      // Recreate the split-off node
      if (newNode) {
        redoActions.push({ type: 'create', node: { ...newNode } });
      }
      // Move children to the new node
      for (let i = 0; i < children.length; i++) {
        redoActions.push({ type: 'move', id: children[i].id, parentId: result.id, position: i });
      }

      _pushUndo({
        description: 'Split item',
        undo: { type: 'batch', actions: undoActions, focusId: nodeId },
        redo: { type: 'batch', actions: redoActions, focusId: result.id },
        timestamp: Date.now(),
      });

      return result.id;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return null;
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  mergeWithNextSibling: async (nodeId: string) => {
    const { getNode, getSiblings, childrenOf, updateFromState, _pushUndo } = get();
    const node = getNode(nodeId);
    if (!node) return null;

    const siblings = getSiblings(nodeId);
    const idx = siblings.findIndex(n => n.id === nodeId);

    // Check if there's a next sibling
    if (idx < 0 || idx >= siblings.length - 1) return null;
    const nextSibling = siblings[idx + 1];

    // Capture state before merge for undo
    const originalContent = node.content;
    const nextSiblingContent = nextSibling.content;
    const savedNextSibling = { ...nextSibling };

    // Calculate cursor position (end of current content, before merge)
    // Strip HTML tags to get text length
    const plainTextLength = node.content.replace(/<[^>]*>/g, '').length;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      // Merge content: append next sibling's content to current node
      const mergedContent = node.content + nextSibling.content;
      await api.updateNode(nodeId, { content: mergedContent });

      // Batch move next sibling's children to current node (after current's children)
      const currentChildren = childrenOf(nodeId);
      const nextChildren = childrenOf(nextSibling.id);
      const now = new Date().toISOString();
      const childMoveOps = nextChildren.map((child, i) => ({
        op: 'move' as const,
        id: child.id,
        parent_id: nodeId,
        position: currentChildren.length + i,
        updated_at: now,
      }));
      if (childMoveOps.length > 0) {
        await api.saveOps(childMoveOps);
      }

      // Delete the next sibling (now empty)
      await api.deleteNode(nextSibling.id);

      // Reload state
      logNav('bulk-refresh', { caller: 'outlineStore.mergeWithNextSibling' });
      const state = await api.loadDocument(get().documentId ?? undefined);
      updateFromState(state);

      // Build undo entry for merge:
      // Undo: restore original content, recreate next sibling, move children back
      // Redo: re-merge by updating content, moving children, deleting next sibling
      const undoActions: UndoAction[] = [];
      // Restore original content of surviving node
      undoActions.push({ type: 'update', id: nodeId, changes: { content: originalContent } });
      // Recreate the deleted next sibling
      undoActions.push({ type: 'create', node: savedNextSibling });
      // Move children back to the recreated next sibling
      for (let i = 0; i < nextChildren.length; i++) {
        undoActions.push({ type: 'move', id: nextChildren[i].id, parentId: nextSibling.id, position: i });
      }

      const redoActions: UndoAction[] = [];
      // Re-merge: update surviving node with merged content
      redoActions.push({ type: 'update', id: nodeId, changes: { content: mergedContent } });
      // Move children from next sibling to surviving node
      for (let i = 0; i < nextChildren.length; i++) {
        redoActions.push({ type: 'move', id: nextChildren[i].id, parentId: nodeId, position: currentChildren.length + i });
      }
      // Delete the next sibling again
      redoActions.push({ type: 'delete', id: nextSibling.id });

      _pushUndo({
        description: 'Merge items',
        undo: { type: 'batch', actions: undoActions, focusId: nodeId },
        redo: { type: 'batch', actions: redoActions, focusId: nodeId },
        timestamp: Date.now(),
      });

      return { cursorPos: plainTextLength };
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return null;
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  mergeWithPreviousSibling: async (nodeId: string) => {
    const { getNode, getSiblings, childrenOf, updateFromState, setFocusedId, _pushUndo } = get();
    const node = getNode(nodeId);
    if (!node) return null;

    const siblings = getSiblings(nodeId);
    const idx = siblings.findIndex(n => n.id === nodeId);

    // Check if there's a previous sibling
    if (idx <= 0) return null;
    const prevSibling = siblings[idx - 1];

    // Capture state before merge for undo
    const prevOriginalContent = prevSibling.content;
    const savedCurrentNode = { ...node };

    // Calculate cursor position (end of prev sibling content, before merge)
    // Strip HTML tags to get text length
    const plainTextLength = prevSibling.content.replace(/<[^>]*>/g, '').length;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      // Merge content: append current node's content to previous sibling
      const mergedContent = prevSibling.content + node.content;
      await api.updateNode(prevSibling.id, { content: mergedContent });

      // Batch move current node's children to previous sibling (after prev's children)
      const prevChildren = childrenOf(prevSibling.id);
      const currentChildren = childrenOf(nodeId);
      const now = new Date().toISOString();
      const childMoveOps = currentChildren.map((child, i) => ({
        op: 'move' as const,
        id: child.id,
        parent_id: prevSibling.id,
        position: prevChildren.length + i,
        updated_at: now,
      }));
      if (childMoveOps.length > 0) {
        await api.saveOps(childMoveOps);
      }

      // Delete the current node (now empty)
      await api.deleteNode(nodeId);

      // Reload state
      logNav('bulk-refresh', { caller: 'outlineStore.mergeWithPreviousSibling' });
      const state = await api.loadDocument(get().documentId ?? undefined);
      updateFromState(state);

      // Focus the previous sibling with cursor at merge point
      set({ focusedId: prevSibling.id, pendingCursorPos: plainTextLength });

      // Build undo entry for merge with previous:
      // Undo: restore prev sibling's original content, recreate current node, move children back
      // Redo: re-merge by updating content, moving children, deleting current node
      const undoActions: UndoAction[] = [];
      // Restore previous sibling's original content
      undoActions.push({ type: 'update', id: prevSibling.id, changes: { content: prevOriginalContent } });
      // Recreate the deleted current node
      undoActions.push({ type: 'create', node: savedCurrentNode });
      // Move children back to the recreated current node
      for (let i = 0; i < currentChildren.length; i++) {
        undoActions.push({ type: 'move', id: currentChildren[i].id, parentId: nodeId, position: i });
      }

      const redoActions: UndoAction[] = [];
      // Re-merge: update previous sibling with merged content
      redoActions.push({ type: 'update', id: prevSibling.id, changes: { content: mergedContent } });
      // Move children from current node to previous sibling
      for (let i = 0; i < currentChildren.length; i++) {
        redoActions.push({ type: 'move', id: currentChildren[i].id, parentId: prevSibling.id, position: prevChildren.length + i });
      }
      // Delete the current node again
      redoActions.push({ type: 'delete', id: nodeId });

      _pushUndo({
        description: 'Merge items',
        undo: { type: 'batch', actions: undoActions, focusId: nodeId },
        redo: { type: 'batch', actions: redoActions, focusId: prevSibling.id },
        timestamp: Date.now(),
      });

      return { cursorPos: plainTextLength, newFocusId: prevSibling.id };
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return null;
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  updateContent: async (nodeId: string, content: string) => {
    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      const state = await api.updateNode(nodeId, { content });
      get().updateFromState(state);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  updateNote: (nodeId: string, note: string) => {
    // Cancel any pending update for this node
    const pending = pendingNoteUpdates.get(nodeId);
    if (pending) {
      clearTimeout(pending);
    }

    // Optimistic update - update local state immediately
    set((state) => {
      const nodes = state.nodes.map(n =>
        n.id === nodeId ? { ...n, note: note || undefined } : n
      );
      // Rebuild indexes
      const nodesById = new Map<string, Node>();
      const childrenByParent = new Map<string | null, Node[]>();
      for (const node of nodes) {
        nodesById.set(node.id, node);
        const siblings = childrenByParent.get(node.parent_id) ?? [];
        siblings.push(node);
        childrenByParent.set(node.parent_id, siblings);
      }
      // Sort children by position
      for (const [, children] of childrenByParent) {
        children.sort((a, b) => a.position - b.position);
      }
      return { nodes, _nodesById: nodesById, _childrenByParent: childrenByParent };
    });

    // Debounce the API call
    const timer = setTimeout(async () => {
      pendingNoteUpdates.delete(nodeId);
      set(s => ({ pendingOperations: s.pendingOperations + 1 }));
      try {
        // Send to backend - note field is optional, send undefined to clear
        await api.updateNode(nodeId, { note: note || undefined });
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
      } finally {
        set(s => ({ pendingOperations: s.pendingOperations - 1 }));
      }
    }, NOTE_UPDATE_DEBOUNCE_MS);

    pendingNoteUpdates.set(nodeId, timer);
  },

  deleteNode: async (nodeId: string, focusDirection: 'previous' | 'next' = 'previous') => {
    const { getVisibleNodes, updateFromState, _pushUndo, getNode } = get();
    const visible = getVisibleNodes();
    const idx = visible.findIndex(n => n.id === nodeId);

    // Don't delete the last node
    if (visible.length <= 1) return null;

    // Save node for undo before deleting
    const savedNode = getNode(nodeId);
    if (!savedNode) return null;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      const state = await api.deleteNode(nodeId);
      updateFromState(state);

      // Push undo entry
      _pushUndo({
        description: 'Delete item',
        undo: { type: 'create', node: { ...savedNode } },
        redo: { type: 'delete', id: nodeId },
        timestamp: Date.now(),
      });

      // Focus based on direction preference
      let newFocusId: string | undefined;
      let cursorPos: number | null = null;
      if (focusDirection === 'next') {
        newFocusId = visible[idx + 1]?.id || visible[idx - 1]?.id;
        // When focusing next, cursor should be at start (0)
        cursorPos = visible[idx + 1]?.id ? 0 : null;
      } else {
        newFocusId = visible[idx - 1]?.id || visible[idx + 1]?.id;
        // When focusing previous, cursor should be at end (null means end)
      }
      if (newFocusId) {
        set({ focusedId: newFocusId, pendingCursorPos: cursorPos });
      }
      return newFocusId || null;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return null;
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  deleteAllCompleted: async () => {
    const { nodes, updateFromState, focusedId } = get();

    // Find all completed nodes (is_checked = true)
    const completedNodes = nodes.filter(n => n.is_checked);
    if (completedNodes.length === 0) return 0;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      // Delete each completed node
      // Note: We delete from the list, so child nodes that are also completed
      // will be deleted when their parent is deleted
      let lastState;
      let deletedCount = 0;

      // Get IDs of all completed nodes
      const completedIds = new Set(completedNodes.map(n => n.id));

      // Only delete "root" completed nodes (completed nodes whose parent is NOT completed)
      // This avoids trying to delete nodes that were already deleted as children
      const rootCompletedNodes = completedNodes.filter(n => {
        const parentId = n.parent_id ?? null;
        return !parentId || !completedIds.has(parentId);
      });

      for (const node of rootCompletedNodes) {
        try {
          lastState = await api.deleteNode(node.id);
          deletedCount++;
        } catch {
          // Node may have already been deleted as child of another
        }
      }

      if (lastState) {
        updateFromState(lastState);
      }

      // Clear focus if focused node was deleted
      if (focusedId && completedIds.has(focusedId)) {
        set({ focusedId: null });
      }

      return deletedCount;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return 0;
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  toggleCollapse: async (nodeId: string) => {
    const { getNode, hasChildren, updateFromState, _pushUndo } = get();
    const node = getNode(nodeId);
    if (!node) return;

    // Only collapse if has children
    if (!hasChildren(nodeId)) return;

    const wasCollapsed = node.collapsed;

    // Optimistic update - reflect collapse state immediately so keyboard
    // handlers (e.g., Enter key) see the correct state without waiting for API
    set((state) => {
      const nodes = state.nodes.map(n =>
        n.id === nodeId ? { ...n, collapsed: !wasCollapsed } : n
      );
      const nodesById = new Map(state._nodesById);
      const updated = nodes.find(n => n.id === nodeId);
      if (updated) nodesById.set(nodeId, updated);
      return { nodes, _nodesById: nodesById, pendingOperations: state.pendingOperations + 1 };
    });
    try {
      const state = await api.updateNode(nodeId, { collapsed: !wasCollapsed });
      updateFromState(state);

      // Push undo entry
      _pushUndo({
        description: wasCollapsed ? 'Expand item' : 'Collapse item',
        undo: { type: 'update', id: nodeId, changes: { collapsed: wasCollapsed } },
        redo: { type: 'update', id: nodeId, changes: { collapsed: !wasCollapsed } },
        timestamp: Date.now(),
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  collapseAll: async () => {
    const { nodes, hasChildren, updateFromState } = get();

    // Find all nodes that have children and are not collapsed
    const toCollapse = nodes.filter(n => hasChildren(n.id) && !n.collapsed);
    if (toCollapse.length === 0) return;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      // Collapse all in sequence
      let lastState;
      for (const node of toCollapse) {
        lastState = await api.updateNode(node.id, { collapsed: true });
      }
      if (lastState) {
        updateFromState(lastState);
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  expandAll: async () => {
    const { nodes, hasChildren, updateFromState, filterQuery, _childrenByParent, _nodesById } = get();

    let toExpand: Node[];

    if (filterQuery) {
      // When filtering, expand all ancestors of matching items
      // This ensures that when the filter is cleared, matching items remain visible
      const parsed = parseFilterQuery(filterQuery);
      const matchingNodes = nodes.filter(n => nodeMatchesFilter(n, parsed, _childrenByParent));
      const ancestorIds = new Set<string>();

      // Collect all ancestors of matching nodes
      for (const node of matchingNodes) {
        let currentId = node.parent_id;
        while (currentId) {
          if (ancestorIds.has(currentId)) break; // Already processed this path
          ancestorIds.add(currentId);
          const parent = _nodesById.get(currentId);
          if (!parent) break;
          currentId = parent.parent_id;
        }
      }

      // Also expand matching nodes themselves if they have children
      for (const node of matchingNodes) {
        if (hasChildren(node.id)) {
          ancestorIds.add(node.id);
        }
      }

      // Find collapsed nodes in the ancestor set
      toExpand = nodes.filter(n => ancestorIds.has(n.id) && n.collapsed);
    } else {
      // No filter: expand all collapsed nodes with children
      toExpand = nodes.filter(n => hasChildren(n.id) && n.collapsed);
    }

    if (toExpand.length === 0) return;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      // Expand all in sequence
      let lastState;
      for (const node of toExpand) {
        lastState = await api.updateNode(node.id, { collapsed: false });
      }
      if (lastState) {
        updateFromState(lastState);
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  collapseNode: async (nodeId: string) => {
    const { getNode, hasChildren, updateFromState, _pushUndo } = get();
    const node = getNode(nodeId);
    if (!node) return;
    if (!hasChildren(nodeId)) return;
    if (node.collapsed) return; // Already collapsed

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      const state = await api.updateNode(nodeId, { collapsed: true });
      updateFromState(state);
      _pushUndo({
        description: 'Collapse item',
        undo: { type: 'update', id: nodeId, changes: { collapsed: false } },
        redo: { type: 'update', id: nodeId, changes: { collapsed: true } },
        timestamp: Date.now(),
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  expandNode: async (nodeId: string) => {
    const { getNode, hasChildren, updateFromState, _pushUndo } = get();
    const node = getNode(nodeId);
    if (!node) return;
    if (!hasChildren(nodeId)) return;
    if (!node.collapsed) return; // Already expanded

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      const state = await api.updateNode(nodeId, { collapsed: false });
      updateFromState(state);
      _pushUndo({
        description: 'Expand item',
        undo: { type: 'update', id: nodeId, changes: { collapsed: true } },
        redo: { type: 'update', id: nodeId, changes: { collapsed: false } },
        timestamp: Date.now(),
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  expandToLevel: async (level: number) => {
    const { nodes, hasChildren, updateFromState, _nodesById } = get();

    // Helper to calculate depth of a node
    const getDepth = (nodeId: string | null): number => {
      if (!nodeId) return 0;
      const node = _nodesById.get(nodeId);
      if (!node) return 0;
      return 1 + getDepth(node.parent_id);
    };

    // Find nodes that need to be collapsed (depth > level) or expanded (depth <= level)
    const toCollapse: Node[] = [];
    const toExpand: Node[] = [];

    for (const node of nodes) {
      if (!hasChildren(node.id)) continue;
      const depth = getDepth(node.id);

      if (depth < level && node.collapsed) {
        toExpand.push(node);
      } else if (depth >= level && !node.collapsed) {
        toCollapse.push(node);
      }
    }

    if (toCollapse.length === 0 && toExpand.length === 0) return;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      let lastState;
      for (const node of toExpand) {
        lastState = await api.updateNode(node.id, { collapsed: false });
      }
      for (const node of toCollapse) {
        lastState = await api.updateNode(node.id, { collapsed: true });
      }
      if (lastState) {
        updateFromState(lastState);
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  collapseSiblings: async (nodeId: string) => {
    const { getNode, getSiblings, hasChildren, updateFromState } = get();
    const node = getNode(nodeId);
    if (!node) return;

    // Get all siblings (including self)
    const siblings = getSiblings(nodeId);

    // Find siblings that have children and are not collapsed (excluding self)
    const toCollapse = siblings.filter(s =>
      s.id !== nodeId && hasChildren(s.id) && !s.collapsed
    );

    if (toCollapse.length === 0) return;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      let lastState;
      for (const sibling of toCollapse) {
        lastState = await api.updateNode(sibling.id, { collapsed: true });
      }
      if (lastState) {
        updateFromState(lastState);
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  toggleFocusedCollapse: async () => {
    const { focusedId, toggleCollapse } = get();
    if (!focusedId) return;
    await toggleCollapse(focusedId);
  },

  indentNode: async (nodeId: string) => {
    const { getNode, getSiblings, childrenOf, updateFromState, toggleCollapse, _pushUndo } = get();
    const node = getNode(nodeId);
    if (!node) return false;

    const siblings = getSiblings(nodeId);
    const idx = siblings.findIndex(n => n.id === nodeId);

    // Can't indent first child
    if (idx === 0) return false;

    const oldParentId = node.parent_id;
    const oldPosition = node.position;
    const newParent = siblings[idx - 1];
    const newPosition = childrenOf(newParent.id).length;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      const state = await api.moveNode(nodeId, newParent.id, newPosition);
      updateFromState(state);

      // Push undo entry
      _pushUndo({
        description: 'Indent item',
        undo: { type: 'move', id: nodeId, parentId: oldParentId, position: oldPosition },
        redo: { type: 'move', id: nodeId, parentId: newParent.id, position: newPosition },
        timestamp: Date.now(),
      });

      // Uncollapse new parent so we can see the moved node
      if (newParent.collapsed) {
        await toggleCollapse(newParent.id);
      }

      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  outdentNode: async (nodeId: string) => {
    const { getNode, getParent, rootNodes, childrenOf, updateFromState, _pushUndo } = get();
    const node = getNode(nodeId);
    if (!node || !node.parent_id) return false;

    const parent = getParent(nodeId);
    if (!parent) return false;

    const oldParentId = node.parent_id;
    const oldPosition = node.position;

    // Position after parent in grandparent's children
    const grandparentChildren = parent.parent_id == null
      ? rootNodes()
      : childrenOf(parent.parent_id);
    const parentIdx = grandparentChildren.findIndex(n => n.id === parent.id);
    const newParentId = parent.parent_id;
    const newPosition = parentIdx + 1;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      const state = await api.moveNode(nodeId, newParentId, newPosition);
      updateFromState(state);

      // Push undo entry
      _pushUndo({
        description: 'Outdent item',
        undo: { type: 'move', id: nodeId, parentId: oldParentId, position: oldPosition },
        redo: { type: 'move', id: nodeId, parentId: newParentId, position: newPosition },
        timestamp: Date.now(),
      });

      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  swapWithPrevious: async (nodeId: string) => {
    const { getNode, getSiblings, updateFromState, focusedId, _pushUndo } = get();
    const node = getNode(nodeId);
    if (!node) return false;

    const siblings = getSiblings(nodeId);
    const idx = siblings.findIndex(n => n.id === nodeId);

    if (idx <= 0) return false;

    const prevNode = siblings[idx - 1];
    const nodeOldPosition = node.position;
    const prevNodeOldPosition = prevNode.position;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      // Swap positions in a single batch IPC call
      const now = new Date().toISOString();
      const state = await api.saveOps([
        { op: 'move', id: nodeId, parent_id: node.parent_id, position: prevNodeOldPosition, updated_at: now },
        { op: 'move', id: prevNode.id, parent_id: prevNode.parent_id, position: nodeOldPosition, updated_at: now },
      ]);
      updateFromState(state);

      // Push undo entry - undo swaps them back to original positions
      _pushUndo({
        description: 'Move item up',
        undo: { type: 'swap', id: nodeId, position: nodeOldPosition, otherId: prevNode.id, otherPosition: prevNodeOldPosition },
        redo: { type: 'swap', id: nodeId, position: prevNodeOldPosition, otherId: prevNode.id, otherPosition: nodeOldPosition },
        timestamp: Date.now(),
      });

      // Force focus update after DOM reorder
      set({ focusedId: null });
      await new Promise(resolve => setTimeout(resolve, 0));
      set({ focusedId });

      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  swapWithNext: async (nodeId: string) => {
    const { getNode, getSiblings, updateFromState, focusedId, _pushUndo } = get();
    const node = getNode(nodeId);
    if (!node) return false;

    const siblings = getSiblings(nodeId);
    const idx = siblings.findIndex(n => n.id === nodeId);

    if (idx < 0 || idx >= siblings.length - 1) return false;

    const nextNode = siblings[idx + 1];
    const nodeOldPosition = node.position;
    const nextNodeOldPosition = nextNode.position;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      // Swap positions in a single batch IPC call
      const now = new Date().toISOString();
      const state = await api.saveOps([
        { op: 'move', id: nodeId, parent_id: node.parent_id, position: nextNodeOldPosition, updated_at: now },
        { op: 'move', id: nextNode.id, parent_id: nextNode.parent_id, position: nodeOldPosition, updated_at: now },
      ]);
      updateFromState(state);

      // Push undo entry - undo swaps them back to original positions
      _pushUndo({
        description: 'Move item down',
        undo: { type: 'swap', id: nodeId, position: nodeOldPosition, otherId: nextNode.id, otherPosition: nextNodeOldPosition },
        redo: { type: 'swap', id: nodeId, position: nextNodeOldPosition, otherId: nextNode.id, otherPosition: nodeOldPosition },
        timestamp: Date.now(),
      });

      // Force focus update after DOM reorder
      set({ focusedId: null });
      await new Promise(resolve => setTimeout(resolve, 0));
      set({ focusedId });

      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  toggleCheckbox: async (nodeId: string) => {
    const { getNode, updateFromState, _pushUndo } = get();
    const node = getNode(nodeId);
    if (!node) return false;

    const oldIsChecked = node.is_checked;
    const newIsChecked = !oldIsChecked;

    // Check if this is a recurring task being completed
    const recurrence = node.recurrence ?? node.date_recurrence;
    const isRecurringCompletion = newIsChecked && recurrence && node.date;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      if (isRecurringCompletion) {
        // Recurring task: advance date and uncheck instead of checking off
        const recurrenceMode = node.recurrence_mode ?? 'schedule';
        const oldDate = node.date!;
        let nextDate: string | null = null;

        if (recurrenceMode === 'complete') {
          // "After completion" mode: calculate next date from today + interval
          nextDate = calculateNextDateFromCompletion(recurrence, new Date());
        } else {
          // "On schedule" mode: calculate next occurrence from the current due date
          nextDate = await api.getNextOccurrence(recurrence, oldDate);
        }

        if (nextDate) {
          // Advance the date and keep unchecked
          const state = await api.updateNode(nodeId, { date: nextDate, is_checked: false });
          updateFromState(state);

          _pushUndo({
            description: 'Advance recurring task',
            undo: { type: 'update', id: nodeId, changes: { date: oldDate, is_checked: false } },
            redo: { type: 'update', id: nodeId, changes: { date: nextDate, is_checked: false } },
            timestamp: Date.now(),
          });
        } else {
          // Fallback: if next date calculation fails, just toggle normally
          const state = await api.updateNode(nodeId, { is_checked: newIsChecked });
          updateFromState(state);

          _pushUndo({
            description: newIsChecked ? 'Complete item' : 'Uncomplete item',
            undo: { type: 'update', id: nodeId, changes: { is_checked: oldIsChecked } },
            redo: { type: 'update', id: nodeId, changes: { is_checked: newIsChecked } },
            timestamp: Date.now(),
          });
        }
      } else {
        // Non-recurring or unchecking: simple toggle
        const state = await api.updateNode(nodeId, { is_checked: newIsChecked });
        updateFromState(state);

        _pushUndo({
          description: newIsChecked ? 'Complete item' : 'Uncomplete item',
          undo: { type: 'update', id: nodeId, changes: { is_checked: oldIsChecked } },
          redo: { type: 'update', id: nodeId, changes: { is_checked: newIsChecked } },
          timestamp: Date.now(),
        });
      }

      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  toggleNodeType: async (nodeId: string) => {
    const { getNode, updateFromState, _pushUndo } = get();
    const node = getNode(nodeId);
    if (!node) return false;

    const oldType = node.node_type;
    const oldIsChecked = node.is_checked;
    const newType = oldType === 'checkbox' ? 'bullet' : 'checkbox';
    const newIsChecked = newType === 'checkbox' ? oldIsChecked : false;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      const state = await api.updateNode(nodeId, {
        node_type: newType,
        is_checked: newIsChecked,
      });
      updateFromState(state);

      // Push undo entry
      _pushUndo({
        description: newType === 'checkbox' ? 'Convert to checkbox' : 'Convert to bullet',
        undo: { type: 'update', id: nodeId, changes: { node_type: oldType, is_checked: oldIsChecked } },
        redo: { type: 'update', id: nodeId, changes: { node_type: newType, is_checked: newIsChecked } },
        timestamp: Date.now(),
      });

      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  setNodeTypeTo: async (nodeId: string, newType: import('../lib/types').NodeType) => {
    const { getNode, updateFromState, _pushUndo } = get();
    const node = getNode(nodeId);
    if (!node) return false;

    const oldType = node.node_type;
    const oldIsChecked = node.is_checked;

    // No-op if already at this type
    if (oldType === newType) return false;

    const newIsChecked = newType === 'checkbox' ? oldIsChecked : false;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      const state = await api.updateNode(nodeId, {
        node_type: newType,
        is_checked: newIsChecked,
      });
      updateFromState(state);

      _pushUndo({
        description: `Convert to ${newType}`,
        undo: { type: 'update', id: nodeId, changes: { node_type: oldType, is_checked: oldIsChecked } },
        redo: { type: 'update', id: nodeId, changes: { node_type: newType, is_checked: newIsChecked } },
        timestamp: Date.now(),
      });

      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  setHeadingLevel: async (nodeId: string, level: number) => {
    const { getNode, updateFromState, _pushUndo } = get();
    const node = getNode(nodeId);
    if (!node) return false;

    const oldType = node.node_type;
    const oldLevel = node.heading_level ?? null;
    const clampedLevel = Math.max(1, Math.min(6, level));

    // No-op if already at this heading level
    if (oldType === 'heading' && oldLevel === clampedLevel) return false;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      const state = await api.updateNode(nodeId, {
        node_type: 'heading',
        heading_level: clampedLevel,
        is_checked: false,
      });
      updateFromState(state);

      _pushUndo({
        description: `Set heading level ${clampedLevel}`,
        undo: { type: 'update', id: nodeId, changes: { node_type: oldType, heading_level: oldLevel as number | undefined, is_checked: node.is_checked } },
        redo: { type: 'update', id: nodeId, changes: { node_type: 'heading', heading_level: clampedLevel, is_checked: false } },
        timestamp: Date.now(),
      });

      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  clearHeading: async (nodeId: string) => {
    const { getNode, updateFromState, _pushUndo } = get();
    const node = getNode(nodeId);
    if (!node) return false;

    // No-op if already a bullet (not a heading)
    if (node.node_type !== 'heading') return false;

    const oldType = node.node_type;
    const oldLevel = node.heading_level ?? null;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      const state = await api.updateNode(nodeId, {
        node_type: 'bullet',
      });
      updateFromState(state);

      _pushUndo({
        description: 'Clear heading',
        undo: { type: 'update', id: nodeId, changes: { node_type: oldType, heading_level: oldLevel as number | undefined } },
        redo: { type: 'update', id: nodeId, changes: { node_type: 'bullet' } },
        timestamp: Date.now(),
      });

      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  setNodeColor: async (nodeId: string, color: string) => {
    const { getNode, updateFromState, _pushUndo } = get();
    const node = getNode(nodeId);
    if (!node) return false;

    const oldColor = node.color || '';

    // No-op if already this color
    if (oldColor === color) return false;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      const state = await api.updateNode(nodeId, { color });
      updateFromState(state);

      _pushUndo({
        description: color ? `Set color to ${color}` : 'Clear color',
        undo: { type: 'update', id: nodeId, changes: { color: oldColor } },
        redo: { type: 'update', id: nodeId, changes: { color } },
        timestamp: Date.now(),
      });

      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  convertToCheckbox: async (nodeId: string, isChecked: boolean) => {
    const { getNode, updateFromState, _pushUndo } = get();
    const node = getNode(nodeId);
    if (!node) return false;

    const oldType = node.node_type;
    const oldIsChecked = node.is_checked;
    const oldContent = node.content;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      const state = await api.updateNode(nodeId, {
        node_type: 'checkbox',
        is_checked: isChecked,
        content: '',  // Clear the [ ] or [x] prefix
      });
      updateFromState(state);

      // Push undo entry
      _pushUndo({
        description: isChecked ? 'Convert to checked checkbox' : 'Convert to checkbox',
        undo: { type: 'update', id: nodeId, changes: { node_type: oldType, is_checked: oldIsChecked, content: oldContent } },
        redo: { type: 'update', id: nodeId, changes: { node_type: 'checkbox', is_checked: isChecked, content: '' } },
        timestamp: Date.now(),
      });

      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  moveNodeTo: async (nodeId: string, newParentId: string | null, newPosition: number) => {
    const { getNode, updateFromState, toggleCollapse, _pushUndo } = get();
    const node = getNode(nodeId);
    if (!node) return false;

    // Don't move if nothing changed
    if (node.parent_id === newParentId && node.position === newPosition) return true;

    const oldParentId = node.parent_id;
    const oldPosition = node.position;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      const state = await api.moveNode(nodeId, newParentId, newPosition);
      updateFromState(state);

      // Push undo entry
      _pushUndo({
        description: 'Move item',
        undo: { type: 'move', id: nodeId, parentId: oldParentId, position: oldPosition },
        redo: { type: 'move', id: nodeId, parentId: newParentId, position: newPosition },
        timestamp: Date.now(),
      });

      // Uncollapse new parent so we can see the moved node
      if (newParentId) {
        const newParent = get().getNode(newParentId);
        if (newParent?.collapsed) {
          await toggleCollapse(newParentId);
        }
      }

      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  // === Drag and Drop ===

  startDrag: (nodeId: string) => {
    set({ draggedId: nodeId });
  },

  endDrag: () => {
    set({ draggedId: null });
  },

  dropOnNode: async (targetId: string, asChild: boolean = false) => {
    const { draggedId, _nodesById, childrenOf, rootNodes, updateFromState, toggleCollapse, _pushUndo } = get();

    // Capture draggedId locally since it's reactive and could change
    const nodeIdToDrop = draggedId;

    if (!nodeIdToDrop || nodeIdToDrop === targetId) {
      set({ draggedId: null });
      return false;
    }

    const draggedNode = _nodesById.get(nodeIdToDrop);
    const targetNode = _nodesById.get(targetId);

    if (!draggedNode || !targetNode) {
      set({ draggedId: null });
      return false;
    }

    // Prevent dropping a node onto its own descendant
    let checkId: string | null = targetId;
    while (checkId) {
      if (checkId === nodeIdToDrop) {
        set({ draggedId: null });
        return false;
      }
      const node = _nodesById.get(checkId);
      checkId = node?.parent_id ?? null;
    }

    // Save original position for undo
    const oldParentId = draggedNode.parent_id;
    const oldPosition = draggedNode.position;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      let newParentId: string | null;
      let newPosition: number;

      const batchNow = new Date().toISOString();
      if (asChild) {
        // Drop as first child of target
        newParentId = targetId;
        newPosition = 0;
        // Batch shift existing children down
        const existingChildren = childrenOf(targetId);
        const shiftOps = existingChildren.map(child => ({
          op: 'move' as const,
          id: child.id,
          parent_id: newParentId,
          position: child.position + 1,
          updated_at: batchNow,
        }));
        if (shiftOps.length > 0) {
          await api.saveOps(shiftOps);
        }
      } else {
        // Drop as sibling after target
        newParentId = targetNode.parent_id;
        const siblings = newParentId === null ? rootNodes() : childrenOf(newParentId);
        const targetIdx = siblings.findIndex(n => n.id === targetId);
        newPosition = targetIdx + 1;
        // Batch shift siblings after insertion point
        const shiftOps = siblings.slice(targetIdx + 1)
          .filter(s => s.id !== nodeIdToDrop)
          .map(s => ({
            op: 'move' as const,
            id: s.id,
            parent_id: newParentId,
            position: s.position + 1,
            updated_at: batchNow,
          }));
        if (shiftOps.length > 0) {
          await api.saveOps(shiftOps);
        }
      }

      const state = await api.moveNode(nodeIdToDrop, newParentId, newPosition);
      updateFromState(state);

      // Push undo entry
      _pushUndo({
        description: 'Move item',
        undo: { type: 'move', id: nodeIdToDrop, parentId: oldParentId, position: oldPosition },
        redo: { type: 'move', id: nodeIdToDrop, parentId: newParentId, position: newPosition },
        timestamp: Date.now(),
      });

      // Uncollapse target if dropping as child
      if (asChild && targetNode.collapsed) {
        await toggleCollapse(targetId);
      }

      set({ draggedId: null });
      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), draggedId: null });
      return false;
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  // === Undo/Redo ===

  canUndo: () => get()._undoStack.length > 0,
  canRedo: () => get()._redoStack.length > 0,

  _pushUndo: (entry: UndoEntry) => {
    set(state => {
      const newStack = [...state._undoStack, entry];
      // Limit stack size
      if (newStack.length > MAX_UNDO_STACK_SIZE) {
        newStack.shift();
      }
      return {
        _undoStack: newStack,
        _redoStack: [], // Clear redo stack on new action
      };
    });
  },

  undo: async () => {
    const { _undoStack, pendingOperations, _executeUndoAction } = get();
    if (pendingOperations > 0) return false; // Can't undo while saving
    if (_undoStack.length === 0) return false;

    // Pop from undo stack
    const entry = _undoStack[_undoStack.length - 1];
    set(state => ({
      _undoStack: state._undoStack.slice(0, -1),
    }));

    const success = await _executeUndoAction(entry.undo);
    if (success) {
      // Push to redo stack
      set(state => ({
        _redoStack: [...state._redoStack, entry],
      }));
    } else {
      // Restore to undo stack if failed
      set(state => ({
        _undoStack: [...state._undoStack, entry],
      }));
    }
    return success;
  },

  redo: async () => {
    const { _redoStack, pendingOperations, _executeUndoAction } = get();
    if (pendingOperations > 0) return false; // Can't redo while saving
    if (_redoStack.length === 0) return false;

    // Pop from redo stack
    const entry = _redoStack[_redoStack.length - 1];
    set(state => ({
      _redoStack: state._redoStack.slice(0, -1),
    }));

    const success = await _executeUndoAction(entry.redo);
    if (success) {
      // Push to undo stack
      set(state => ({
        _undoStack: [...state._undoStack, entry],
      }));
    } else {
      // Restore to redo stack if failed
      set(state => ({
        _redoStack: [...state._redoStack, entry],
      }));
    }
    return success;
  },

  clearUndoHistory: () => {
    set({ _undoStack: [], _redoStack: [] });
  },

  _executeUndoAction: async (action: UndoAction) => {
    const { updateFromState, _nodesById } = get();

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      switch (action.type) {
        case 'create': {
          // Recreate a deleted node
          await api.createNodeWithId(
            action.node.id,
            action.node.parent_id,
            action.node.position,
            action.node.content,
            action.node.node_type
          );
          // Apply additional properties if they exist
          if (action.node.note || action.node.date || action.node.is_checked || action.node.collapsed) {
            await api.updateNode(action.node.id, {
              note: action.node.note,
              date: action.node.date,
              date_recurrence: action.node.date_recurrence,
              recurrence_mode: action.node.recurrence_mode,
              defer_date: action.node.defer_date,
              is_checked: action.node.is_checked,
              collapsed: action.node.collapsed,
              color: action.node.color,
              tags: action.node.tags,
            });
          }
          logNav('bulk-refresh', { caller: 'outlineStore._executeUndoAction' });
          const state = await api.loadDocument(get().documentId ?? undefined);
          updateFromState(state);
          set({ focusedId: action.node.id });
          return true;
        }
        case 'delete': {
          // Delete a node
          const state = await api.deleteNode(action.id);
          updateFromState(state);
          return true;
        }
        case 'update': {
          // Apply a field update
          const state = await api.updateNode(action.id, action.changes);
          updateFromState(state);
          return true;
        }
        case 'move': {
          // Move a node
          const state = await api.moveNode(action.id, action.parentId, action.position);
          updateFromState(state);
          return true;
        }
        case 'swap': {
          // Swap two nodes' positions in a single batch
          const node = _nodesById.get(action.id);
          const otherNode = _nodesById.get(action.otherId);
          if (!node || !otherNode) return false;
          const now = new Date().toISOString();
          const state = await api.saveOps([
            { op: 'move', id: action.id, parent_id: node.parent_id, position: action.position, updated_at: now },
            { op: 'move', id: action.otherId, parent_id: otherNode.parent_id, position: action.otherPosition, updated_at: now },
          ]);
          updateFromState(state);
          return true;
        }
        case 'batch': {
          // Execute multiple actions in sequence
          // Temporarily decrement pendingOperations since each recursive call increments it
          set(s => ({ pendingOperations: s.pendingOperations - 1 }));
          for (const subAction of action.actions) {
            const success = await get()._executeUndoAction(subAction);
            if (!success) {
              set(s => ({ pendingOperations: s.pendingOperations + 1 }));
              return false;
            }
          }
          set(s => ({ pendingOperations: s.pendingOperations + 1 }));
          if (action.focusId) {
            set({ focusedId: action.focusId });
          }
          return true;
        }
        default:
          return false;
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

}));
