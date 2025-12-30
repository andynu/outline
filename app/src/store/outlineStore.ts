import { create } from 'zustand';
import type { Node, TreeNode, DocumentState, UndoEntry, UndoAction, NodeChanges } from '../lib/types';
import * as api from '../lib/api';

// Constants
const MAX_UNDO_STACK_SIZE = 100;
const NOTE_UPDATE_DEBOUNCE_MS = 300;

// Debounce timer for note updates (stored outside Zustand to avoid re-renders)
const pendingNoteUpdates = new Map<string, ReturnType<typeof setTimeout>>();

// Flat item for virtual list rendering
export interface FlatItem {
  node: Node;
  depth: number;
  hasChildren: boolean;
}

interface OutlineState {
  // Core state
  nodes: Node[];
  focusedId: string | null;
  selectedIds: Set<string>;  // Multi-selection (empty = single-selection mode)
  loading: boolean;
  error: string | null;
  pendingOperations: number;
  hideCompleted: boolean;
  filterQuery: string | null;  // Hashtag filter, e.g., "#project"
  zoomedNodeId: string | null;  // Subtree zoom - show only this node's children
  draggedId: string | null;  // Currently dragged node ID

  // Undo/Redo stacks
  _undoStack: UndoEntry[];
  _redoStack: UndoEntry[];

  // Cached indexes (rebuilt when nodes change)
  _nodesById: Map<string, Node>;
  _childrenByParent: Map<string | null, Node[]>;

  // Actions - State setters
  setNodes: (nodes: Node[]) => void;
  setFocusedId: (id: string | null) => void;
  updateFromState: (state: DocumentState) => void;
  toggleHideCompleted: () => void;
  setHideCompleted: (hide: boolean) => void;
  setFilterQuery: (query: string | null) => void;
  clearFilter: () => void;
  zoomTo: (nodeId: string | null) => void;
  zoomToParent: () => void;  // Zoom out to parent level
  zoomReset: () => void;
  getZoomBreadcrumbs: () => { id: string | null; title: string }[];

  // Computed
  getTree: () => TreeNode[];
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
  load: (docId?: string) => Promise<void>;
  addSiblingAfter: (nodeId: string) => Promise<string | null>;
  splitNode: (nodeId: string, beforeContent: string, afterContent: string) => Promise<string | null>;
  mergeWithNextSibling: (nodeId: string) => Promise<{ cursorPos: number } | null>;
  updateContent: (nodeId: string, content: string) => Promise<void>;
  updateNote: (nodeId: string, note: string) => void;  // Debounced
  deleteNode: (nodeId: string) => Promise<string | null>;
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
  convertToCheckbox: (nodeId: string, isChecked: boolean) => Promise<boolean>;
  moveNodeTo: (nodeId: string, newParentId: string | null, newPosition: number) => Promise<boolean>;
  createItemsFromMarkdown: (afterNodeId: string, items: Array<{ content: string; nodeType: 'bullet' | 'checkbox'; isChecked: boolean; indent: number }>) => Promise<string | null>;

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

  // Multi-selection
  isSelected: (nodeId: string) => boolean;
  toggleSelection: (nodeId: string) => void;
  selectRange: (toId: string) => void;
  clearSelection: () => void;
  selectAll: () => void;
  selectSiblings: () => void;
  selectChildren: () => void;
  invertSelection: () => void;
  getSelectedNodes: () => Node[];

  // Bulk operations on selection
  deleteSelectedNodes: () => Promise<string | null>;
  toggleSelectedCheckboxes: () => Promise<boolean>;
  completeSelectedNodes: () => Promise<boolean>;
  uncompleteSelectedNodes: () => Promise<boolean>;
  convertSelectedToCheckbox: () => Promise<boolean>;
  convertSelectedToBullet: () => Promise<boolean>;
  indentSelectedNodes: () => Promise<boolean>;
  outdentSelectedNodes: () => Promise<boolean>;
  moveSelectedToTop: () => Promise<boolean>;
  moveSelectedToBottom: () => Promise<boolean>;
  copySelectedAsMarkdown: () => Promise<boolean>;
  copySelectedAsPlainText: () => Promise<boolean>;
  exportSelectedToFile: () => Promise<boolean>;
  exportSelection: () => Promise<boolean>;
}

// Check if a node matches the filter query
function nodeMatchesFilter(node: Node, filterQuery: string | null): boolean {
  if (!filterQuery) return true;
  // Check if content contains the hashtag
  return node.content.toLowerCase().includes(filterQuery.toLowerCase());
}

// Check if a node or any of its descendants match the filter
function hasMatchingDescendant(
  nodeId: string,
  childrenByParent: Map<string | null, Node[]>,
  filterQuery: string | null,
  nodesById: Map<string, Node>
): boolean {
  const children = childrenByParent.get(nodeId) ?? [];
  for (const child of children) {
    if (nodeMatchesFilter(child, filterQuery)) return true;
    if (hasMatchingDescendant(child.id, childrenByParent, filterQuery, nodesById)) return true;
  }
  return false;
}

// Build tree structure from flat nodes
function buildTree(
  childrenByParent: Map<string | null, Node[]>,
  parentId: string | null,
  depth: number,
  hideCompleted: boolean = false,
  filterQuery: string | null = null,
  nodesById: Map<string, Node> = new Map(),
  zoomedNodeId: string | null = null
): TreeNode[] {
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

  // If filtering, only show nodes that match OR have matching descendants
  if (filterQuery) {
    visibleChildren = visibleChildren.filter(n =>
      nodeMatchesFilter(n, filterQuery) ||
      hasMatchingDescendant(n.id, childrenByParent, filterQuery, nodesById)
    );
  }

  return visibleChildren.map(node => {
    const nodeChildren = childrenByParent.get(node.id) ?? [];
    // Check if there are visible children (accounting for hideCompleted and filter)
    let visibleNodeChildren = hideCompleted
      ? nodeChildren.filter(n => !n.is_checked)
      : nodeChildren;
    if (filterQuery) {
      visibleNodeChildren = visibleNodeChildren.filter(n =>
        nodeMatchesFilter(n, filterQuery) ||
        hasMatchingDescendant(n.id, childrenByParent, filterQuery, nodesById)
      );
    }
    const hasChildren = visibleNodeChildren.length > 0;

    return {
      node,
      depth,
      hasChildren,
      // When filtering, expand all nodes to show matches
      children: hasChildren && (!node.collapsed || filterQuery)
        ? buildTree(childrenByParent, node.id, depth + 1, hideCompleted, filterQuery, nodesById, null)
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
  zoomedNodeId: string | null = null
): FlatItem[] {
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

  // If filtering, only show nodes that match OR have matching descendants
  if (filterQuery) {
    visibleChildren = visibleChildren.filter(n =>
      nodeMatchesFilter(n, filterQuery) ||
      hasMatchingDescendant(n.id, childrenByParent, filterQuery, nodesById)
    );
  }

  for (const node of visibleChildren) {
    const nodeChildren = childrenByParent.get(node.id) ?? [];
    let visibleNodeChildren = hideCompleted
      ? nodeChildren.filter(n => !n.is_checked)
      : nodeChildren;
    if (filterQuery) {
      visibleNodeChildren = visibleNodeChildren.filter(n =>
        nodeMatchesFilter(n, filterQuery) ||
        hasMatchingDescendant(n.id, childrenByParent, filterQuery, nodesById)
      );
    }
    const hasChildren = visibleNodeChildren.length > 0;

    result.push({ node, depth, hasChildren });

    // Recursively add children if not collapsed (always expand when filtering)
    if (hasChildren && (!node.collapsed || filterQuery)) {
      result.push(...flattenTree(childrenByParent, node.id, depth + 1, hideCompleted, filterQuery, nodesById, null));
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
  selectedIds: new Set<string>(),
  loading: false,
  error: null,
  pendingOperations: 0,
  hideCompleted: typeof localStorage !== 'undefined'
    ? localStorage.getItem('outline-hide-completed') === 'true'
    : false,
  filterQuery: null,
  zoomedNodeId: null,
  draggedId: null,
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

  setFocusedId: (id) => set({ focusedId: id }),

  updateFromState: (state: DocumentState) => {
    const { nodesById, childrenByParent } = rebuildIndexes(state.nodes);
    set({
      nodes: state.nodes,
      _nodesById: nodesById,
      _childrenByParent: childrenByParent
    });
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

  setFilterQuery: (query: string | null) => {
    set({ filterQuery: query });
  },

  clearFilter: () => {
    set({ filterQuery: null });
  },

  zoomTo: (nodeId: string | null) => {
    set({ zoomedNodeId: nodeId });
  },

  zoomToParent: () => {
    const { zoomedNodeId, _nodesById } = get();
    if (!zoomedNodeId) return;  // Already at root

    const zoomedNode = _nodesById.get(zoomedNodeId);
    if (!zoomedNode) return;

    // Zoom to parent (or null if parent is root)
    set({ zoomedNodeId: zoomedNode.parent_id });
  },

  zoomReset: () => {
    set({ zoomedNodeId: null });
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

  // === Computed getters ===

  getTree: () => {
    const { _childrenByParent, _nodesById, hideCompleted, filterQuery, zoomedNodeId, nodes } = get();

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

    return buildTree(_childrenByParent, null, 0, hideCompleted, filterQuery, _nodesById, zoomedNodeId);
  },

  getFlatList: () => {
    const { _childrenByParent, _nodesById, hideCompleted, filterQuery, zoomedNodeId } = get();
    return flattenTree(_childrenByParent, null, 0, hideCompleted, filterQuery, _nodesById, zoomedNodeId);
  },

  getVisibleNodes: () => {
    const tree = get().getTree();
    return getVisibleNodesFromTree(tree);
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
    return node.parent_id === null
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
    const { focusedId, childrenOf, getNode, hideCompleted, filterQuery, _nodesById, _childrenByParent } = get();
    if (!focusedId) return null;
    const node = getNode(focusedId);
    if (!node || node.collapsed) return null;

    let children = childrenOf(focusedId);
    // Filter hidden completed items
    if (hideCompleted) {
      children = children.filter(n => !n.is_checked);
    }
    // Filter by search query if active
    if (filterQuery) {
      children = children.filter(n =>
        nodeMatchesFilter(n, filterQuery) ||
        hasMatchingDescendant(n.id, _childrenByParent, filterQuery, _nodesById)
      );
    }
    if (children.length > 0) {
      set({ focusedId: children[0].id });
      return children[0].id;
    }
    return null;
  },

  moveToNextSibling: () => {
    const { focusedId, getSiblings, hideCompleted, filterQuery, _nodesById, _childrenByParent } = get();
    if (!focusedId) return null;
    let siblings = getSiblings(focusedId);
    // Filter hidden completed items
    if (hideCompleted) {
      siblings = siblings.filter(n => !n.is_checked);
    }
    // Filter by search query if active
    if (filterQuery) {
      siblings = siblings.filter(n =>
        nodeMatchesFilter(n, filterQuery) ||
        hasMatchingDescendant(n.id, _childrenByParent, filterQuery, _nodesById)
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
    const { focusedId, getSiblings, hideCompleted, filterQuery, _nodesById, _childrenByParent } = get();
    if (!focusedId) return null;
    let siblings = getSiblings(focusedId);
    // Filter hidden completed items
    if (hideCompleted) {
      siblings = siblings.filter(n => !n.is_checked);
    }
    // Filter by search query if active
    if (filterQuery) {
      siblings = siblings.filter(n =>
        nodeMatchesFilter(n, filterQuery) ||
        hasMatchingDescendant(n.id, _childrenByParent, filterQuery, _nodesById)
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

  load: async (docId?: string) => {
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
    const newPosition = idx + 1;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      // Shift siblings after insertion point
      for (let i = idx + 1; i < siblings.length; i++) {
        await api.moveNode(siblings[i].id, node.parent_id, i + 1);
      }

      const result = await api.createNode(node.parent_id, newPosition, '');
      updateFromState(result.state);
      set({ focusedId: result.id });

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

  createItemsFromMarkdown: async (afterNodeId: string, items: Array<{ content: string; nodeType: 'bullet' | 'checkbox'; isChecked: boolean; indent: number }>) => {
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

      // Shift siblings after insertion point
      for (let i = anchorIdx + 1; i < siblings.length; i++) {
        await api.moveNode(siblings[i].id, anchorNode.parent_id, siblings[i].position + topLevelCount);
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
    const { getNode, getSiblings, childrenOf, updateFromState, zoomedNodeId } = get();
    const node = getNode(nodeId);
    if (!node) return null;

    const siblings = getSiblings(nodeId);
    const idx = siblings.findIndex(n => n.id === nodeId);
    const newPosition = idx + 1;

    // Get children to move to new node
    const children = childrenOf(nodeId);

    // Check if we're zoomed into the node being split and it has children
    // If so, we need to zoom out after the split to avoid an empty view
    const wasZoomedIntoSplitNode = zoomedNodeId === nodeId && children.length > 0;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      // Update current node with "before" content
      await api.updateNode(nodeId, { content: beforeContent });

      // Shift siblings after insertion point
      for (let i = idx + 1; i < siblings.length; i++) {
        await api.moveNode(siblings[i].id, node.parent_id, i + 1);
      }

      // Create new node with "after" content
      const result = await api.createNode(node.parent_id, newPosition, afterContent);

      // Move children from original node to new node
      for (let i = 0; i < children.length; i++) {
        await api.moveNode(children[i].id, result.id, i);
      }

      // Reload to get final state after all moves
      const finalState = await api.loadDocument();
      updateFromState(finalState);

      set({ focusedId: result.id });

      // If we were zoomed into the split node, zoom out to its parent
      // This prevents an empty view since the original node's children moved away
      if (wasZoomedIntoSplitNode) {
        set({ zoomedNodeId: node.parent_id });
      }

      // Note: Undo for split is complex (would need to restore content and move children back)
      // For now, we don't add undo support for split
      // TODO: Add proper undo support for split

      return result.id;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return null;
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  mergeWithNextSibling: async (nodeId: string) => {
    const { getNode, getSiblings, childrenOf, updateFromState } = get();
    const node = getNode(nodeId);
    if (!node) return null;

    const siblings = getSiblings(nodeId);
    const idx = siblings.findIndex(n => n.id === nodeId);

    // Check if there's a next sibling
    if (idx < 0 || idx >= siblings.length - 1) return null;
    const nextSibling = siblings[idx + 1];

    // Calculate cursor position (end of current content, before merge)
    // Strip HTML tags to get text length
    const plainTextLength = node.content.replace(/<[^>]*>/g, '').length;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      // Merge content: append next sibling's content to current node
      const mergedContent = node.content + nextSibling.content;
      await api.updateNode(nodeId, { content: mergedContent });

      // Move next sibling's children to current node (after current's children)
      const currentChildren = childrenOf(nodeId);
      const nextChildren = childrenOf(nextSibling.id);
      for (let i = 0; i < nextChildren.length; i++) {
        await api.moveNode(nextChildren[i].id, nodeId, currentChildren.length + i);
      }

      // Delete the next sibling (now empty)
      await api.deleteNode(nextSibling.id);

      // Reload state
      const state = await api.loadDocument();
      updateFromState(state);

      // Note: Undo for merge is complex (would need to restore split content and move children back)
      // TODO: Add proper undo support for merge

      return { cursorPos: plainTextLength };
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

  deleteNode: async (nodeId: string) => {
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

      // Focus previous or next
      const newFocusId = visible[idx - 1]?.id || visible[idx + 1]?.id;
      if (newFocusId) {
        set({ focusedId: newFocusId });
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

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
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
      const matchingNodes = nodes.filter(n => nodeMatchesFilter(n, filterQuery));
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
    const grandparentChildren = parent.parent_id === null
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
      // Swap positions
      await api.moveNode(nodeId, node.parent_id, prevNodeOldPosition);
      const state = await api.moveNode(prevNode.id, prevNode.parent_id, nodeOldPosition);
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
      // Swap positions
      await api.moveNode(nodeId, node.parent_id, nextNodeOldPosition);
      const state = await api.moveNode(nextNode.id, nextNode.parent_id, nodeOldPosition);
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

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      const state = await api.updateNode(nodeId, { is_checked: newIsChecked });
      updateFromState(state);

      // Push undo entry
      _pushUndo({
        description: newIsChecked ? 'Complete item' : 'Uncomplete item',
        undo: { type: 'update', id: nodeId, changes: { is_checked: oldIsChecked } },
        redo: { type: 'update', id: nodeId, changes: { is_checked: newIsChecked } },
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

      if (asChild) {
        // Drop as first child of target
        newParentId = targetId;
        newPosition = 0;
        // Shift existing children down
        const existingChildren = childrenOf(targetId);
        for (const child of existingChildren) {
          await api.moveNode(child.id, newParentId, child.position + 1);
        }
      } else {
        // Drop as sibling after target
        newParentId = targetNode.parent_id;
        const siblings = newParentId === null ? rootNodes() : childrenOf(newParentId);
        const targetIdx = siblings.findIndex(n => n.id === targetId);
        newPosition = targetIdx + 1;
        // Shift siblings after insertion point
        for (let i = targetIdx + 1; i < siblings.length; i++) {
          if (siblings[i].id !== nodeIdToDrop) {
            await api.moveNode(siblings[i].id, newParentId, siblings[i].position + 1);
          }
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
              is_checked: action.node.is_checked,
              collapsed: action.node.collapsed,
              color: action.node.color,
              tags: action.node.tags,
            });
          }
          const state = await api.loadDocument();
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
          // Swap two nodes' positions
          const node = _nodesById.get(action.id);
          const otherNode = _nodesById.get(action.otherId);
          if (!node || !otherNode) return false;
          // Move both nodes to their target positions
          await api.moveNode(action.id, node.parent_id, action.position);
          const state = await api.moveNode(action.otherId, otherNode.parent_id, action.otherPosition);
          updateFromState(state);
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

  // === Multi-Selection ===

  isSelected: (nodeId: string) => get().selectedIds.has(nodeId),

  toggleSelection: (nodeId: string) => {
    const { selectedIds, focusedId } = get();
    const newSet = new Set(selectedIds);
    if (newSet.has(nodeId)) {
      newSet.delete(nodeId);
    } else {
      newSet.add(nodeId);
    }
    set({ selectedIds: newSet, focusedId: nodeId });
  },

  selectRange: (toId: string) => {
    const { focusedId, getVisibleNodes } = get();
    const visible = getVisibleNodes();

    if (!focusedId) {
      // No current focus, just select the target
      set({ selectedIds: new Set([toId]), focusedId: toId });
      return;
    }

    const fromIdx = visible.findIndex(n => n.id === focusedId);
    const toIdx = visible.findIndex(n => n.id === toId);

    if (fromIdx < 0 || toIdx < 0) {
      // One of the nodes isn't visible, just select the target
      set({ selectedIds: new Set([toId]), focusedId: toId });
      return;
    }

    // Select all nodes in the range
    const startIdx = Math.min(fromIdx, toIdx);
    const endIdx = Math.max(fromIdx, toIdx);
    const newSet = new Set<string>();
    for (let i = startIdx; i <= endIdx; i++) {
      newSet.add(visible[i].id);
    }
    set({ selectedIds: newSet, focusedId: toId });
  },

  clearSelection: () => {
    const { selectedIds } = get();
    if (selectedIds.size > 0) {
      set({ selectedIds: new Set<string>() });
    }
  },

  selectAll: () => {
    const visible = get().getVisibleNodes();
    set({ selectedIds: new Set(visible.map(n => n.id)) });
  },

  selectSiblings: () => {
    const { focusedId, selectedIds, getSiblings, getVisibleNodes } = get();
    const visible = getVisibleNodes();
    const visibleIds = new Set(visible.map(n => n.id));

    // Get target node(s): selected nodes or focused node
    let targetIds: string[] = [];
    if (selectedIds.size > 0) {
      targetIds = Array.from(selectedIds);
    } else if (focusedId) {
      targetIds = [focusedId];
    }

    if (targetIds.length === 0) return;

    // Collect all siblings of target nodes
    const newSelection = new Set<string>();
    for (const nodeId of targetIds) {
      const siblings = getSiblings(nodeId);
      for (const sibling of siblings) {
        if (visibleIds.has(sibling.id)) {
          newSelection.add(sibling.id);
        }
      }
    }

    set({ selectedIds: newSelection });
  },

  selectChildren: () => {
    const { selectedIds, childrenOf, getVisibleNodes } = get();
    if (selectedIds.size === 0) return;

    const visible = getVisibleNodes();
    const visibleIds = new Set(visible.map(n => n.id));

    // Collect all children of selected nodes
    const newSelection = new Set<string>(selectedIds);
    const addChildren = (nodeId: string) => {
      const children = childrenOf(nodeId);
      for (const child of children) {
        if (visibleIds.has(child.id)) {
          newSelection.add(child.id);
          // Recursively add descendants
          addChildren(child.id);
        }
      }
    };

    for (const nodeId of selectedIds) {
      addChildren(nodeId);
    }

    set({ selectedIds: newSelection });
  },

  invertSelection: () => {
    const { selectedIds, getVisibleNodes } = get();
    const visible = getVisibleNodes();

    // Toggle selection for all visible nodes
    const newSelection = new Set<string>();
    for (const node of visible) {
      if (!selectedIds.has(node.id)) {
        newSelection.add(node.id);
      }
    }

    set({ selectedIds: newSelection });
  },

  getSelectedNodes: () => {
    const { selectedIds, getVisibleNodes } = get();
    if (selectedIds.size === 0) return [];
    const visible = getVisibleNodes();
    return visible.filter(n => selectedIds.has(n.id));
  },

  // === Bulk Operations on Selection ===

  deleteSelectedNodes: async () => {
    const { getSelectedNodes, getVisibleNodes, updateFromState, selectedIds } = get();
    const selected = getSelectedNodes();
    if (selected.length === 0) return null;

    const visible = getVisibleNodes();

    // Don't delete if it would leave no nodes
    const remainingCount = visible.length - selected.length;
    if (remainingCount <= 0) return null;

    // Find the first non-selected node to focus after deletion
    const selectedSet = new Set(selected.map(n => n.id));
    let newFocusId: string | null = null;
    for (const node of visible) {
      if (!selectedSet.has(node.id)) {
        newFocusId = node.id;
      }
    }

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      // Delete nodes in reverse order to maintain valid indices
      const sortedSelected = [...selected].reverse();
      for (const node of sortedSelected) {
        await api.deleteNode(node.id);
      }

      // Reload state after all deletions
      const state = await api.loadDocument();
      updateFromState(state);

      // Clear selection and set focus
      set({
        selectedIds: new Set<string>(),
        focusedId: newFocusId,
      });

      return newFocusId;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return null;
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  toggleSelectedCheckboxes: async () => {
    const { getSelectedNodes, updateFromState } = get();
    const selected = getSelectedNodes();
    if (selected.length === 0) return false;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      // Determine what the toggle should do:
      // If any are unchecked (or not checkbox type), check them all; otherwise uncheck them all
      const anyUnchecked = selected.some(n => n.node_type !== 'checkbox' || !n.is_checked);
      const newState = anyUnchecked;

      for (const node of selected) {
        // Always set checkbox type and checked state
        await api.updateNode(node.id, {
          node_type: 'checkbox',
          is_checked: newState
        });
      }

      // Reload state
      const state = await api.loadDocument();
      updateFromState(state);

      // Keep selection after toggle completion to allow toggling back
      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  completeSelectedNodes: async () => {
    const { getSelectedNodes, updateFromState } = get();
    const selected = getSelectedNodes();
    if (selected.length === 0) return false;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      for (const node of selected) {
        // Convert to checkbox if needed and mark complete
        await api.updateNode(node.id, {
          node_type: 'checkbox',
          is_checked: true
        });
      }

      // Reload state
      const state = await api.loadDocument();
      updateFromState(state);

      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  uncompleteSelectedNodes: async () => {
    const { getSelectedNodes, updateFromState } = get();
    const selected = getSelectedNodes();
    if (selected.length === 0) return false;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      for (const node of selected) {
        // Only uncheck if it's a checkbox
        if (node.node_type === 'checkbox') {
          await api.updateNode(node.id, { is_checked: false });
        }
      }

      // Reload state
      const state = await api.loadDocument();
      updateFromState(state);

      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  convertSelectedToCheckbox: async () => {
    const { getSelectedNodes, updateFromState } = get();
    const selected = getSelectedNodes();
    if (selected.length === 0) return false;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      for (const node of selected) {
        if (node.node_type !== 'checkbox') {
          await api.updateNode(node.id, {
            node_type: 'checkbox',
            is_checked: false
          });
        }
      }

      // Reload state
      const state = await api.loadDocument();
      updateFromState(state);

      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  convertSelectedToBullet: async () => {
    const { getSelectedNodes, updateFromState } = get();
    const selected = getSelectedNodes();
    if (selected.length === 0) return false;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      for (const node of selected) {
        if (node.node_type !== 'bullet') {
          await api.updateNode(node.id, {
            node_type: 'bullet',
            is_checked: false
          });
        }
      }

      // Reload state
      const state = await api.loadDocument();
      updateFromState(state);

      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  indentSelectedNodes: async () => {
    const { getSelectedNodes, getSiblings, childrenOf, updateFromState, selectedIds } = get();
    const selected = getSelectedNodes();
    if (selected.length === 0) return false;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      // Process nodes in order - indent each one
      for (const node of selected) {
        const siblings = getSiblings(node.id);
        const idx = siblings.findIndex(n => n.id === node.id);

        // Can't indent first child
        if (idx === 0) continue;

        const newParent = siblings[idx - 1];
        // Skip if new parent is also selected (would cause issues)
        if (selectedIds.has(newParent.id)) continue;

        const newPosition = childrenOf(newParent.id).length;
        await api.moveNode(node.id, newParent.id, newPosition);

        // Uncollapse new parent
        if (newParent.collapsed) {
          await api.updateNode(newParent.id, { collapsed: false });
        }
      }

      // Reload state
      const state = await api.loadDocument();
      updateFromState(state);

      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  outdentSelectedNodes: async () => {
    const { getSelectedNodes, getParent, rootNodes, childrenOf, updateFromState } = get();
    const selected = getSelectedNodes();
    if (selected.length === 0) return false;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      // Process nodes in reverse order to avoid index shifting issues
      const reversed = [...selected].reverse();
      for (const node of reversed) {
        if (!node.parent_id) continue; // Can't outdent root nodes

        const parent = getParent(node.id);
        if (!parent) continue;

        // Position after parent in grandparent's children
        const grandparentChildren = parent.parent_id === null
          ? rootNodes()
          : childrenOf(parent.parent_id);
        const parentIdx = grandparentChildren.findIndex(n => n.id === parent.id);
        const newPosition = parentIdx + 1;

        await api.moveNode(node.id, parent.parent_id, newPosition);
      }

      // Reload state
      const state = await api.loadDocument();
      updateFromState(state);

      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  moveSelectedToTop: async () => {
    const { getSelectedNodes, getSiblings, updateFromState } = get();
    const selected = getSelectedNodes();
    if (selected.length === 0) return false;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      // Group nodes by parent
      const nodesByParent = new Map<string | null, typeof selected>();
      for (const node of selected) {
        const parentId = node.parent_id;
        if (!nodesByParent.has(parentId)) {
          nodesByParent.set(parentId, []);
        }
        nodesByParent.get(parentId)!.push(node);
      }

      // Move each group to top of its parent's children
      for (const [parentId, nodes] of nodesByParent) {
        // Sort nodes by their current position to maintain relative order
        nodes.sort((a, b) => a.position - b.position);

        // Move each node to top, in reverse order to maintain relative order
        for (let i = nodes.length - 1; i >= 0; i--) {
          await api.moveNode(nodes[i].id, parentId, 0);
        }
      }

      // Reload state
      const state = await api.loadDocument();
      updateFromState(state);

      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  moveSelectedToBottom: async () => {
    const { getSelectedNodes, getSiblings, childrenOf, rootNodes, updateFromState } = get();
    const selected = getSelectedNodes();
    if (selected.length === 0) return false;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      // Group nodes by parent
      const nodesByParent = new Map<string | null, typeof selected>();
      for (const node of selected) {
        const parentId = node.parent_id;
        if (!nodesByParent.has(parentId)) {
          nodesByParent.set(parentId, []);
        }
        nodesByParent.get(parentId)!.push(node);
      }

      // Move each group to bottom of its parent's children
      for (const [parentId, nodes] of nodesByParent) {
        // Sort nodes by their current position to maintain relative order
        nodes.sort((a, b) => a.position - b.position);

        // Get total siblings count for this parent
        const siblings = parentId === null ? rootNodes() : childrenOf(parentId);
        let bottomPosition = siblings.length;

        // Move each node to bottom
        for (const node of nodes) {
          await api.moveNode(node.id, parentId, bottomPosition);
        }
      }

      // Reload state
      const state = await api.loadDocument();
      updateFromState(state);

      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  copySelectedAsMarkdown: async () => {
    const { selectedIds } = get();
    if (selectedIds.size === 0) return false;

    try {
      const nodeIds = Array.from(selectedIds);
      const markdown = await api.exportSelectionMarkdown(nodeIds, true);
      await navigator.clipboard.writeText(markdown);
      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return false;
    }
  },

  copySelectedAsPlainText: async () => {
    const { selectedIds } = get();
    if (selectedIds.size === 0) return false;

    try {
      const nodeIds = Array.from(selectedIds);
      const plainText = await api.exportSelectionPlainText(nodeIds, true);
      await navigator.clipboard.writeText(plainText);
      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return false;
    }
  },

  exportSelectedToFile: async () => {
    const { selectedIds, nodes } = get();
    if (selectedIds.size === 0) return false;

    try {
      const nodeIds = Array.from(selectedIds);
      const markdown = await api.exportSelectionMarkdown(nodeIds, true);

      // Generate suggested filename from first selected node content
      const firstNodeId = nodeIds[0];
      const firstNode = nodes.find(n => n.id === firstNodeId);
      let suggestedName = 'export';
      if (firstNode) {
        // Strip HTML and limit to 30 chars
        const text = firstNode.content
          .replace(/<[^>]*>/g, '')
          .replace(/[^a-zA-Z0-9 ]/g, '')
          .trim()
          .substring(0, 30);
        if (text) {
          suggestedName = text.replace(/\s+/g, '_');
        }
      }

      await api.saveToFileWithDialog(markdown, `${suggestedName}.md`, 'md');
      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return false;
    }
  },

  exportSelection: async () => {
    const { selectedIds, focusedId } = get();

    // Get nodes to export: selected nodes, or focused node if no selection
    let nodeIds: string[] = [];
    if (selectedIds.size > 0) {
      nodeIds = Array.from(selectedIds);
    } else if (focusedId) {
      nodeIds = [focusedId];
    }

    if (nodeIds.length === 0) return false;

    try {
      const markdown = await api.exportSelectionMarkdown(nodeIds, true);
      await navigator.clipboard.writeText(markdown);
      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return false;
    }
  },
}));
