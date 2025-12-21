import type { DocumentState, Node, NodeChanges, TreeNode } from './types';
import * as api from './api';

// Hashtag pattern - matches #word (letters, numbers, underscores, hyphens)
const HASHTAG_PATTERN = /(?:^|(?<=\s))#([a-zA-Z][a-zA-Z0-9_-]*)/g;

// Mention pattern - matches @word (letters, numbers, underscores, hyphens)
const MENTION_PATTERN = /(?:^|(?<=\s))@([a-zA-Z][a-zA-Z0-9_-]*)/g;

// Extract all hashtags from text
function extractHashtags(text: string): string[] {
  const tags: string[] = [];
  for (const match of text.matchAll(HASHTAG_PATTERN)) {
    tags.push(match[1]); // The tag without #
  }
  return tags;
}

// Extract all mentions from text
function extractMentions(text: string): string[] {
  const mentions: string[] = [];
  for (const match of text.matchAll(MENTION_PATTERN)) {
    mentions.push(match[1]); // The mention without @
  }
  return mentions;
}

// Check if node content matches a filter (hashtag or mention)
function nodeMatchesFilter(node: Node, filter: string): boolean {
  const plainText = node.content.replace(/<[^>]*>/g, '');
  if (filter.startsWith('#')) {
    const tag = filter.slice(1);
    return extractHashtags(plainText).includes(tag);
  } else if (filter.startsWith('@')) {
    const mention = filter.slice(1);
    return extractMentions(plainText).includes(mention);
  }
  return false;
}

// Reactive state
let nodes = $state<Node[]>([]);
let focusedId = $state<string | null>(null);
let loading = $state(true);
let error = $state<string | null>(null);
let draggedId = $state<string | null>(null);
let pendingOperations = $state(0);
let lastSavedAt = $state<Date | null>(null);
let filterQuery = $state<string | null>(null);  // e.g., "#tag" or "@mention"
let hideCompleted = $state(false);  // Hide completed items from view

// Lock to prevent concurrent position-changing operations
let isMoving = false;

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

// Get all ancestor IDs for a node
function getAncestorIds(nodeId: string): string[] {
  const ancestors: string[] = [];
  const nodeMap = nodesById();
  let current = nodeMap.get(nodeId);
  while (current?.parent_id) {
    ancestors.push(current.parent_id);
    current = nodeMap.get(current.parent_id);
  }
  return ancestors;
}

// Build set of visible node IDs when filtering
function getFilteredNodeIds(filter: string): Set<string> {
  const visibleIds = new Set<string>();

  // Find all matching nodes and add them + their ancestors
  for (const node of nodes) {
    if (nodeMatchesFilter(node, filter)) {
      visibleIds.add(node.id);
      // Add all ancestors to make the path visible
      for (const ancestorId of getAncestorIds(node.id)) {
        visibleIds.add(ancestorId);
      }
    }
  }

  return visibleIds;
}

// Build tree structure for rendering
function buildTree(parentId: string | null, depth: number, filteredIds?: Set<string>, excludeCompleted: boolean = false): TreeNode[] {
  const children = parentId === null ? rootNodes() : childrenOf(parentId);

  // Filter children based on active filters
  let visibleChildren = children;

  // Filter by ID set if provided
  if (filteredIds) {
    visibleChildren = visibleChildren.filter(n => filteredIds.has(n.id));
  }

  // Filter out completed items if hideCompleted is active
  if (excludeCompleted) {
    visibleChildren = visibleChildren.filter(n => !n.is_checked);
  }

  return visibleChildren.map(node => {
    const nodeChildren = childrenOf(node.id);
    // When filtering, check if any children are visible
    let hasVisibleChildren = nodeChildren.length > 0;
    if (filteredIds) {
      hasVisibleChildren = nodeChildren.some(c => filteredIds.has(c.id));
    }
    if (excludeCompleted) {
      hasVisibleChildren = hasVisibleChildren && nodeChildren.some(c => !c.is_checked);
    }

    return {
      node,
      depth,
      hasChildren: hasVisibleChildren,
      // When filtering, expand all nodes to show matches; otherwise respect collapsed state
      children: (filteredIds || !node.collapsed) ? buildTree(node.id, depth + 1, filteredIds, excludeCompleted) : []
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

// Track operation start/end for save status
function startOperation() {
  pendingOperations++;
}

function endOperation() {
  pendingOperations--;
  lastSavedAt = new Date();
}

// --- Public API ---

export const outline = {
  // Getters (reactive via $derived would need different approach)
  get nodes() { return nodes; },
  get focusedId() { return focusedId; },
  get loading() { return loading; },
  get error() { return error; },
  get draggedId() { return draggedId; },
  get isSaving() { return pendingOperations > 0; },
  get lastSavedAt() { return lastSavedAt; },
  get filterQuery() { return filterQuery; },
  get hideCompleted() { return hideCompleted; },

  // Set filter (e.g., "#tag" or "@mention")
  setFilter(query: string | null) {
    filterQuery = query;
  },

  // Clear filter
  clearFilter() {
    filterQuery = null;
  },

  // Toggle hiding completed items
  toggleHideCompleted() {
    hideCompleted = !hideCompleted;
    if (typeof window !== 'undefined') {
      localStorage.setItem('outline-hide-completed', String(hideCompleted));
    }
  },

  // Set hideCompleted state (used during initialization)
  setHideCompleted(value: boolean) {
    hideCompleted = value;
  },

  // Build tree for rendering (respects active filter and hideCompleted)
  getTree(): TreeNode[] {
    const filteredIds = filterQuery ? getFilteredNodeIds(filterQuery) : undefined;
    return buildTree(null, 0, filteredIds, hideCompleted);
  },

  // Get visible nodes in order (respects active filter and hideCompleted)
  getVisibleNodes(): Node[] {
    const filteredIds = filterQuery ? getFilteredNodeIds(filterQuery) : undefined;
    return flattenTree(buildTree(null, 0, filteredIds, hideCompleted));
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

    startOperation();
    try {
      // Shift siblings after insertion point
      for (let i = idx + 1; i < siblings.length; i++) {
        await api.moveNode(siblings[i].id, node.parent_id, i + 1);
      }

      const result = await api.createNode(node.parent_id, newPosition, '');
      updateFromState(result.state);
      focusedId = result.id;
      return result.id;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      return null;
    } finally {
      endOperation();
    }
  },

  // Update node content
  async updateContent(nodeId: string, content: string) {
    startOperation();
    try {
      const state = await api.updateNode(nodeId, { content });
      updateFromState(state);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      endOperation();
    }
  },

  // Toggle collapsed state
  async toggleCollapse(nodeId: string) {
    const node = nodesById().get(nodeId);
    if (!node) return;

    // Only collapse if has children
    const children = childrenOf(nodeId);
    if (children.length === 0) return;

    startOperation();
    try {
      const state = await api.updateNode(nodeId, { collapsed: !node.collapsed });
      updateFromState(state);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      endOperation();
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

    startOperation();
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
    } finally {
      endOperation();
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

    startOperation();
    try {
      const state = await api.moveNode(nodeId, parent.parent_id, newPosition);
      updateFromState(state);
      return true;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      return false;
    } finally {
      endOperation();
    }
  },

  // Swap with previous sibling
  async swapWithPrevious(nodeId: string): Promise<boolean> {
    // Prevent concurrent moves
    if (isMoving) return false;

    const node = nodesById().get(nodeId);
    if (!node) return false;

    const siblings = getSiblings(nodeId);
    const idx = siblings.findIndex(n => n.id === nodeId);

    if (idx <= 0) return false;

    const prevNode = siblings[idx - 1];

    isMoving = true;
    startOperation();
    try {
      // Swap positions
      await api.moveNode(nodeId, node.parent_id, prevNode.position);
      const state = await api.moveNode(prevNode.id, prevNode.parent_id, node.position);
      updateFromState(state);
      return true;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      return false;
    } finally {
      isMoving = false;
      endOperation();
    }
  },

  // Swap with next sibling
  async swapWithNext(nodeId: string): Promise<boolean> {
    // Prevent concurrent moves
    if (isMoving) return false;

    const node = nodesById().get(nodeId);
    if (!node) return false;

    const siblings = getSiblings(nodeId);
    const idx = siblings.findIndex(n => n.id === nodeId);

    if (idx < 0 || idx >= siblings.length - 1) return false;

    const nextNode = siblings[idx + 1];

    isMoving = true;
    startOperation();
    try {
      // Swap positions
      await api.moveNode(nodeId, node.parent_id, nextNode.position);
      const state = await api.moveNode(nextNode.id, nextNode.parent_id, node.position);
      updateFromState(state);
      return true;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      return false;
    } finally {
      isMoving = false;
      endOperation();
    }
  },

  // Delete node
  async deleteNode(nodeId: string): Promise<string | null> {
    const visible = this.getVisibleNodes();
    const idx = visible.findIndex(n => n.id === nodeId);

    // Don't delete the last node
    if (visible.length <= 1) return null;

    startOperation();
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
    } finally {
      endOperation();
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

  // Check for and apply external changes (from sync)
  async checkAndReload(): Promise<boolean> {
    try {
      const newState = await api.reloadIfChanged();
      if (newState) {
        updateFromState(newState);
        return true;
      }
      return false;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      return false;
    }
  },

  // Toggle checkbox state
  // For recurring tasks, checking resets the date to the next occurrence
  async toggleCheckbox(nodeId: string): Promise<boolean> {
    const node = nodesById().get(nodeId);
    if (!node) return false;

    startOperation();
    try {
      // If this is a recurring task being checked, calculate next occurrence
      if (!node.is_checked && node.date_recurrence && node.date) {
        // Get next occurrence date
        const nextDate = await api.getNextOccurrence(node.date_recurrence, node.date);
        if (nextDate) {
          // Update date to next occurrence and keep unchecked
          const state = await api.updateNode(nodeId, {
            date: nextDate,
          });
          updateFromState(state);
          return true;
        }
      }

      // Normal toggle for non-recurring or already checked tasks
      const state = await api.updateNode(nodeId, {
        is_checked: !node.is_checked,
      });
      updateFromState(state);
      return true;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      return false;
    } finally {
      endOperation();
    }
  },

  // Toggle node type between bullet and checkbox
  async toggleNodeType(nodeId: string): Promise<boolean> {
    const node = nodesById().get(nodeId);
    if (!node) return false;

    startOperation();
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
    } finally {
      endOperation();
    }
  },

  // Set date on a node (pass null or empty string to clear)
  async setDate(nodeId: string, date: string | null): Promise<boolean> {
    startOperation();
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
    } finally {
      endOperation();
    }
  },

  // Clear date from a node
  async clearDate(nodeId: string): Promise<boolean> {
    return this.setDate(nodeId, '');
  },

  // Set recurrence on a node (pass null or empty string to clear)
  async setRecurrence(nodeId: string, rrule: string | null): Promise<boolean> {
    startOperation();
    try {
      // Empty string signals to backend to clear the recurrence
      const state = await api.updateNode(nodeId, {
        date_recurrence: rrule ?? '',
      });
      updateFromState(state);
      return true;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      return false;
    } finally {
      endOperation();
    }
  },

  // Update note on a node (pass empty string to clear)
  async updateNote(nodeId: string, note: string) {
    startOperation();
    try {
      const state = await api.updateNode(nodeId, { note: note || undefined });
      updateFromState(state);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      endOperation();
    }
  },

  // Get all tags used in the document with counts and associated node IDs
  getAllTags(): Map<string, { count: number; nodeIds: string[] }> {
    const tagMap = new Map<string, { count: number; nodeIds: string[] }>();

    for (const node of nodes) {
      // Extract tags from content (strip HTML first)
      const plainText = node.content.replace(/<[^>]*>/g, '');
      const contentTags = extractHashtags(plainText);

      for (const tag of contentTags) {
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

    return tagMap;
  },

  // Get nodes that have a specific tag
  getNodesWithTag(tag: string): Node[] {
    return nodes.filter(node => {
      const plainText = node.content.replace(/<[^>]*>/g, '');
      const tags = extractHashtags(plainText);
      return tags.includes(tag);
    });
  },

  // Drag and drop support
  startDrag(nodeId: string) {
    draggedId = nodeId;
  },

  endDrag() {
    draggedId = null;
  },

  // Drop a node onto a target (as sibling after target, or as child)
  async dropOnNode(targetId: string, asChild: boolean = false): Promise<boolean> {
    // Capture draggedId locally since it's reactive and could change during async operations
    const nodeIdToDrop = draggedId;

    if (!nodeIdToDrop || nodeIdToDrop === targetId) {
      draggedId = null;
      return false;
    }

    const draggedNode = nodesById().get(nodeIdToDrop);
    const targetNode = nodesById().get(targetId);

    if (!draggedNode || !targetNode) {
      draggedId = null;
      return false;
    }

    // Prevent dropping a node onto its own descendant
    let checkId: string | null = targetId;
    while (checkId) {
      if (checkId === nodeIdToDrop) {
        draggedId = null;
        return false;
      }
      const node = nodesById().get(checkId);
      checkId = node?.parent_id ?? null;
    }

    startOperation();
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
      draggedId = null;
      return true;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      draggedId = null;
      return false;
    } finally {
      endOperation();
    }
  }
};
