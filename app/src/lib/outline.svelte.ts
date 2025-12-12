import type { DocumentState, Node, NodeChanges, TreeNode } from './types';
import * as api from './api';

// Reactive state
let nodes = $state<Node[]>([]);
let focusedId = $state<string | null>(null);
let loading = $state(true);
let error = $state<string | null>(null);

// Derived: nodes indexed by ID
function nodesById(): Map<string, Node> {
  return new Map(nodes.map(n => [n.id, n]));
}

// Derived: root nodes (no parent)
function rootNodes(): Node[] {
  return nodes
    .filter(n => n.parent_id == null)  // loose equality: matches null OR undefined
    .sort((a, b) => a.position - b.position);
}

// Derived: children of a node
function childrenOf(parentId: string): Node[] {
  return nodes
    .filter(n => n.parent_id === parentId)
    .sort((a, b) => a.position - b.position);
}

// Build tree structure for rendering
function buildTree(parentId: string | null, depth: number): TreeNode[] {
  const children = parentId === null ? rootNodes() : childrenOf(parentId);
  return children.map(node => {
    const nodeChildren = childrenOf(node.id);
    return {
      node,
      depth,
      hasChildren: nodeChildren.length > 0,
      children: node.collapsed ? [] : buildTree(node.id, depth + 1)
    };
  });
}

// Flatten tree for navigation (visible nodes only)
function flattenTree(tree: TreeNode[]): Node[] {
  const result: Node[] = [];
  for (const item of tree) {
    result.push(item.node);
    if (!item.node.collapsed) {
      result.push(...flattenTree(item.children));
    }
  }
  return result;
}

// Get parent of a node
function getParent(nodeId: string): Node | null {
  const node = nodesById().get(nodeId);
  if (!node?.parent_id) return null;
  return nodesById().get(node.parent_id) ?? null;
}

// Get siblings of a node (including itself)
function getSiblings(nodeId: string): Node[] {
  const node = nodesById().get(nodeId);
  if (!node) return [];
  return node.parent_id === null ? rootNodes() : childrenOf(node.parent_id);
}

// Update state from API response
function updateFromState(state: DocumentState) {
  nodes = state.nodes;
}

// --- Public API ---

export const outline = {
  // Getters (reactive via $derived would need different approach)
  get nodes() { return nodes; },
  get focusedId() { return focusedId; },
  get loading() { return loading; },
  get error() { return error; },

  // Build tree for rendering
  getTree(): TreeNode[] {
    return buildTree(null, 0);
  },

  // Get visible nodes in order
  getVisibleNodes(): Node[] {
    return flattenTree(buildTree(null, 0));
  },

  // Get a node by ID
  getNode(id: string): Node | undefined {
    return nodesById().get(id);
  },

  // Focus a node
  focus(nodeId: string) {
    focusedId = nodeId;
  },

  // Navigation: move to previous visible node
  moveToPrevious(): string | null {
    const visible = this.getVisibleNodes();
    const idx = visible.findIndex(n => n.id === focusedId);
    if (idx > 0) {
      focusedId = visible[idx - 1].id;
      return focusedId;
    }
    return null;
  },

  // Navigation: move to next visible node
  moveToNext(): string | null {
    const visible = this.getVisibleNodes();
    const idx = visible.findIndex(n => n.id === focusedId);
    if (idx >= 0 && idx < visible.length - 1) {
      focusedId = visible[idx + 1].id;
      return focusedId;
    }
    return null;
  },

  // Load document from backend
  async load(docId?: string) {
    loading = true;
    error = null;
    try {
      const state = await api.loadDocument(docId);
      updateFromState(state);
      // Focus first node if none focused
      if (!focusedId && nodes.length > 0) {
        const roots = rootNodes();
        if (roots.length > 0) {
          focusedId = roots[0].id;
        }
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  },

  // Create a new sibling after the current node
  async addSiblingAfter(nodeId: string): Promise<string | null> {
    const node = nodesById().get(nodeId);
    if (!node) return null;

    const siblings = getSiblings(nodeId);
    const idx = siblings.findIndex(n => n.id === nodeId);
    const newPosition = idx + 1;

    // Shift siblings after insertion point
    for (let i = idx + 1; i < siblings.length; i++) {
      await api.moveNode(siblings[i].id, node.parent_id, i + 1);
    }

    try {
      const result = await api.createNode(node.parent_id, newPosition, '');
      updateFromState(result.state);
      focusedId = result.id;
      return result.id;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      return null;
    }
  },

  // Update node content
  async updateContent(nodeId: string, content: string) {
    try {
      const state = await api.updateNode(nodeId, { content });
      updateFromState(state);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  },

  // Toggle collapsed state
  async toggleCollapse(nodeId: string) {
    const node = nodesById().get(nodeId);
    if (!node) return;

    // Only collapse if has children
    const children = childrenOf(nodeId);
    if (children.length === 0) return;

    try {
      const state = await api.updateNode(nodeId, { collapsed: !node.collapsed });
      updateFromState(state);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  },

  // Indent node (make child of previous sibling)
  async indentNode(nodeId: string): Promise<boolean> {
    const node = nodesById().get(nodeId);
    if (!node) return false;

    const siblings = getSiblings(nodeId);
    const idx = siblings.findIndex(n => n.id === nodeId);

    // Can't indent first child
    if (idx === 0) return false;

    const newParent = siblings[idx - 1];
    const newPosition = childrenOf(newParent.id).length;

    try {
      const state = await api.moveNode(nodeId, newParent.id, newPosition);
      updateFromState(state);

      // Uncollapse new parent so we can see the moved node
      if (newParent.collapsed) {
        await this.toggleCollapse(newParent.id);
      }

      return true;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      return false;
    }
  },

  // Outdent node (move to parent's level)
  async outdentNode(nodeId: string): Promise<boolean> {
    const node = nodesById().get(nodeId);
    if (!node || !node.parent_id) return false;

    const parent = getParent(nodeId);
    if (!parent) return false;

    // Position after parent in grandparent's children
    const grandparentChildren = parent.parent_id === null
      ? rootNodes()
      : childrenOf(parent.parent_id);
    const parentIdx = grandparentChildren.findIndex(n => n.id === parent.id);
    const newPosition = parentIdx + 1;

    try {
      const state = await api.moveNode(nodeId, parent.parent_id, newPosition);
      updateFromState(state);
      return true;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      return false;
    }
  },

  // Swap with previous sibling
  async swapWithPrevious(nodeId: string): Promise<boolean> {
    const node = nodesById().get(nodeId);
    if (!node) return false;

    const siblings = getSiblings(nodeId);
    const idx = siblings.findIndex(n => n.id === nodeId);

    if (idx <= 0) return false;

    const prevNode = siblings[idx - 1];

    try {
      // Swap positions
      await api.moveNode(nodeId, node.parent_id, prevNode.position);
      const state = await api.moveNode(prevNode.id, prevNode.parent_id, node.position);
      updateFromState(state);
      return true;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      return false;
    }
  },

  // Swap with next sibling
  async swapWithNext(nodeId: string): Promise<boolean> {
    const node = nodesById().get(nodeId);
    if (!node) return false;

    const siblings = getSiblings(nodeId);
    const idx = siblings.findIndex(n => n.id === nodeId);

    if (idx < 0 || idx >= siblings.length - 1) return false;

    const nextNode = siblings[idx + 1];

    try {
      // Swap positions
      await api.moveNode(nodeId, node.parent_id, nextNode.position);
      const state = await api.moveNode(nextNode.id, nextNode.parent_id, node.position);
      updateFromState(state);
      return true;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      return false;
    }
  },

  // Delete node
  async deleteNode(nodeId: string): Promise<string | null> {
    const visible = this.getVisibleNodes();
    const idx = visible.findIndex(n => n.id === nodeId);

    // Don't delete the last node
    if (visible.length <= 1) return null;

    try {
      const state = await api.deleteNode(nodeId);
      updateFromState(state);

      // Focus previous or next
      const newFocusId = visible[idx - 1]?.id || visible[idx + 1]?.id;
      if (newFocusId) {
        focusedId = newFocusId;
        return newFocusId;
      }
      return null;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      return null;
    }
  },

  // Compact (save state.json, clear pending)
  async compact() {
    try {
      await api.compactDocument();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  },

  // Toggle checkbox state
  async toggleCheckbox(nodeId: string): Promise<boolean> {
    const node = nodesById().get(nodeId);
    if (!node) return false;

    try {
      const state = await api.updateNode(nodeId, {
        is_checked: !node.is_checked,
      });
      updateFromState(state);
      return true;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      return false;
    }
  },

  // Toggle node type between bullet and checkbox
  async toggleNodeType(nodeId: string): Promise<boolean> {
    const node = nodesById().get(nodeId);
    if (!node) return false;

    try {
      const newType = node.node_type === 'checkbox' ? 'bullet' : 'checkbox';
      const state = await api.updateNode(nodeId, {
        node_type: newType,
        // Reset is_checked when converting back to bullet
        is_checked: newType === 'checkbox' ? node.is_checked : false,
      });
      updateFromState(state);
      return true;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      return false;
    }
  },

  // Set date on a node (pass null or empty string to clear)
  async setDate(nodeId: string, date: string | null): Promise<boolean> {
    try {
      // Empty string signals to backend to clear the date
      const state = await api.updateNode(nodeId, {
        date: date ?? '',
      });
      updateFromState(state);
      return true;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      return false;
    }
  },

  // Clear date from a node
  async clearDate(nodeId: string): Promise<boolean> {
    return this.setDate(nodeId, '');
  }
};
