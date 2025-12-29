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

  // Cached indexes (rebuilt when nodes change)
  _nodesById: Map<string, Node>;
  _childrenByParent: Map<string | null, Node[]>;

  // Actions - State setters
  setNodes: (nodes: Node[]) => void;
  setFocusedId: (id: string | null) => void;
  updateFromState: (state: DocumentState) => void;

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
  indentNode: (nodeId: string) => Promise<boolean>;
  outdentNode: (nodeId: string) => Promise<boolean>;
  swapWithPrevious: (nodeId: string) => Promise<boolean>;
  swapWithNext: (nodeId: string) => Promise<boolean>;
  toggleCheckbox: (nodeId: string) => Promise<boolean>;
  toggleNodeType: (nodeId: string) => Promise<boolean>;
}

// Build tree structure from flat nodes
function buildTree(
  childrenByParent: Map<string | null, Node[]>,
  parentId: string | null,
  depth: number
): TreeNode[] {
  const children = childrenByParent.get(parentId) ?? [];

  return children.map(node => {
    const nodeChildren = childrenByParent.get(node.id) ?? [];
    const hasChildren = nodeChildren.length > 0;

    return {
      node,
      depth,
      hasChildren,
      children: hasChildren && !node.collapsed
        ? buildTree(childrenByParent, node.id, depth + 1)
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
    const parentId = node.parent_id;
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
  depth: number
): FlatItem[] {
  const children = childrenByParent.get(parentId) ?? [];
  const result: FlatItem[] = [];

  for (const node of children) {
    const nodeChildren = childrenByParent.get(node.id) ?? [];
    const hasChildren = nodeChildren.length > 0;

    result.push({ node, depth, hasChildren });

    // Recursively add children if not collapsed
    if (hasChildren && !node.collapsed) {
      result.push(...flattenTree(childrenByParent, node.id, depth + 1));
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

  // === Computed getters ===

  getTree: () => {
    const { _childrenByParent } = get();
    return buildTree(_childrenByParent, null, 0);
  },

  getFlatList: () => {
    const { _childrenByParent } = get();
    return flattenTree(_childrenByParent, null, 0);
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
}));
