import { create } from 'zustand';
import type { Node, TreeNode } from '../lib/types';

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

  // Cached indexes (rebuilt when nodes change)
  _nodesById: Map<string, Node>;
  _childrenByParent: Map<string | null, Node[]>;

  // Actions
  setNodes: (nodes: Node[]) => void;
  setFocusedId: (id: string | null) => void;

  // Computed
  getTree: () => TreeNode[];
  getFlatList: () => FlatItem[];
  getNode: (id: string) => Node | undefined;
  hasChildren: (id: string) => boolean;
}

// Build tree structure from flat nodes
function buildTree(
  nodes: Node[],
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
        ? buildTree(nodes, childrenByParent, node.id, depth + 1)
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

export const useOutlineStore = create<OutlineState>((set, get) => ({
  nodes: [],
  focusedId: null,
  loading: false,
  error: null,
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

  getTree: () => {
    const { nodes, _childrenByParent } = get();
    return buildTree(nodes, _childrenByParent, null, 0);
  },

  getFlatList: () => {
    const { _childrenByParent } = get();
    return flattenTree(_childrenByParent, null, 0);
  },

  getNode: (id) => get()._nodesById.get(id),

  hasChildren: (id) => {
    const children = get()._childrenByParent.get(id);
    return children !== undefined && children.length > 0;
  },
}));
