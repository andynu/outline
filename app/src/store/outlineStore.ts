import { create } from 'zustand';
import type { Node, TreeNode, DocumentState } from '../lib/types';
import * as api from '../lib/api';

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
  loading: boolean;
  error: string | null;
  pendingOperations: number;
  hideCompleted: boolean;
  filterQuery: string | null;  // Hashtag filter, e.g., "#project"
  zoomedNodeId: string | null;  // Subtree zoom - show only this node's children

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

  // Navigation
  moveToPrevious: () => string | null;
  moveToNext: () => string | null;
  moveToFirst: () => string | null;
  moveToLast: () => string | null;

  // Document operations
  load: (docId?: string) => Promise<void>;
  addSiblingAfter: (nodeId: string) => Promise<string | null>;
  updateContent: (nodeId: string, content: string) => Promise<void>;
  deleteNode: (nodeId: string) => Promise<string | null>;
  toggleCollapse: (nodeId: string) => Promise<void>;
  collapseAll: () => Promise<void>;
  expandAll: () => Promise<void>;
  indentNode: (nodeId: string) => Promise<boolean>;
  outdentNode: (nodeId: string) => Promise<boolean>;
  swapWithPrevious: (nodeId: string) => Promise<boolean>;
  swapWithNext: (nodeId: string) => Promise<boolean>;
  toggleCheckbox: (nodeId: string) => Promise<boolean>;
  toggleNodeType: (nodeId: string) => Promise<boolean>;
  moveNodeTo: (nodeId: string, newParentId: string | null, newPosition: number) => Promise<boolean>;
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
  loading: false,
  error: null,
  pendingOperations: 0,
  hideCompleted: typeof localStorage !== 'undefined'
    ? localStorage.getItem('outline-hide-completed') === 'true'
    : false,
  filterQuery: null,
  zoomedNodeId: null,
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
    const { getNode, getSiblings, updateFromState } = get();
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
      return result.id;
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

  deleteNode: async (nodeId: string) => {
    const { getVisibleNodes, updateFromState } = get();
    const visible = getVisibleNodes();
    const idx = visible.findIndex(n => n.id === nodeId);

    // Don't delete the last node
    if (visible.length <= 1) return null;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      const state = await api.deleteNode(nodeId);
      updateFromState(state);

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

  toggleCollapse: async (nodeId: string) => {
    const { getNode, hasChildren, updateFromState } = get();
    const node = getNode(nodeId);
    if (!node) return;

    // Only collapse if has children
    if (!hasChildren(nodeId)) return;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      const state = await api.updateNode(nodeId, { collapsed: !node.collapsed });
      updateFromState(state);
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

  indentNode: async (nodeId: string) => {
    const { getNode, getSiblings, childrenOf, updateFromState, toggleCollapse } = get();
    const node = getNode(nodeId);
    if (!node) return false;

    const siblings = getSiblings(nodeId);
    const idx = siblings.findIndex(n => n.id === nodeId);

    // Can't indent first child
    if (idx === 0) return false;

    const newParent = siblings[idx - 1];
    const newPosition = childrenOf(newParent.id).length;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      const state = await api.moveNode(nodeId, newParent.id, newPosition);
      updateFromState(state);

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
    const { getNode, getParent, rootNodes, childrenOf, updateFromState } = get();
    const node = getNode(nodeId);
    if (!node || !node.parent_id) return false;

    const parent = getParent(nodeId);
    if (!parent) return false;

    // Position after parent in grandparent's children
    const grandparentChildren = parent.parent_id === null
      ? rootNodes()
      : childrenOf(parent.parent_id);
    const parentIdx = grandparentChildren.findIndex(n => n.id === parent.id);
    const newPosition = parentIdx + 1;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      const state = await api.moveNode(nodeId, parent.parent_id, newPosition);
      updateFromState(state);
      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  swapWithPrevious: async (nodeId: string) => {
    const { getNode, getSiblings, updateFromState, focusedId } = get();
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
    const { getNode, getSiblings, updateFromState, focusedId } = get();
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
    const { getNode, updateFromState } = get();
    const node = getNode(nodeId);
    if (!node) return false;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      const state = await api.updateNode(nodeId, { is_checked: !node.is_checked });
      updateFromState(state);
      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  toggleNodeType: async (nodeId: string) => {
    const { getNode, updateFromState } = get();
    const node = getNode(nodeId);
    if (!node) return false;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      const newType = node.node_type === 'checkbox' ? 'bullet' : 'checkbox';
      const state = await api.updateNode(nodeId, {
        node_type: newType,
        is_checked: newType === 'checkbox' ? node.is_checked : false,
      });
      updateFromState(state);
      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      set(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  moveNodeTo: async (nodeId: string, newParentId: string | null, newPosition: number) => {
    const { getNode, updateFromState, toggleCollapse } = get();
    const node = getNode(nodeId);
    if (!node) return false;

    // Don't move if nothing changed
    if (node.parent_id === newParentId && node.position === newPosition) return true;

    set(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      const state = await api.moveNode(nodeId, newParentId, newPosition);
      updateFromState(state);

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
}));
