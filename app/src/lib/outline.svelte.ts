import type { DocumentState, Node, NodeChanges, TreeNode, UndoEntry, UndoAction } from './types';
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
let zoomedNodeId = $state<string | null>(null);  // Zoom/focus mode: show only this subtree

// Lock to prevent concurrent position-changing operations
let isMoving = false;

// Undo/Redo stacks
const MAX_UNDO_STACK_SIZE = 100;
let undoStack: UndoEntry[] = [];
let redoStack: UndoEntry[] = [];

// Push an entry to the undo stack, clearing redo stack
function pushUndo(entry: UndoEntry) {
  undoStack.push(entry);
  if (undoStack.length > MAX_UNDO_STACK_SIZE) {
    undoStack.shift(); // Remove oldest entry
  }
  redoStack = []; // Clear redo stack on new action
}

// Cached indexes - rebuilt when nodes change
let cachedNodes: Node[] = [];
let cachedNodesById: Map<string, Node> = new Map();
let cachedChildrenByParent: Map<string | null, Node[]> = new Map();

// Cached tree - rebuilt when nodes, filter, hideCompleted, or zoomedNodeId changes
let cachedTree: TreeNode[] = [];
let cachedTreeNodes: Node[] = [];
let cachedTreeFilter: string | null = null;
let cachedTreeHideCompleted: boolean = false;
let cachedTreeZoomedNodeId: string | null = null;

// Change tracking for surgical cache invalidation
// Tracks which parent IDs need their children array rebuilt
let dirtyParentIds: Set<string | null> = new Set();
// Tracks if we need a full rebuild (e.g., large change or first load)
let needsFullRebuild = true;

// Compute diff between old and new node arrays
// Returns the set of parent IDs that were affected
function computeChangedParents(oldNodes: Node[], newNodes: Node[]): Set<string | null> {
  const affectedParents = new Set<string | null>();

  // Build maps for efficient lookup
  const oldById = new Map(oldNodes.map(n => [n.id, n]));
  const newById = new Map(newNodes.map(n => [n.id, n]));

  // Find deleted nodes - their parent needs rebuild
  for (const oldNode of oldNodes) {
    if (!newById.has(oldNode.id)) {
      affectedParents.add(oldNode.parent_id ?? null);
    }
  }

  // Find added or modified nodes
  for (const newNode of newNodes) {
    const oldNode = oldById.get(newNode.id);
    if (!oldNode) {
      // New node - parent needs rebuild
      affectedParents.add(newNode.parent_id ?? null);
    } else {
      // Check if parent changed (move operation)
      if (oldNode.parent_id !== newNode.parent_id) {
        affectedParents.add(oldNode.parent_id ?? null);
        affectedParents.add(newNode.parent_id ?? null);
      }
      // Check if position changed within same parent
      else if (oldNode.position !== newNode.position) {
        affectedParents.add(newNode.parent_id ?? null);
      }
    }
  }

  return affectedParents;
}

let rebuildCallCount = 0;

function rebuildIndexes() {
  if (cachedNodes === nodes) return; // No change
  rebuildCallCount++;

  const startTime = performance.now();

  // If we can do a surgical update (have dirty parents and existing cache)
  if (!needsFullRebuild && dirtyParentIds.size > 0 && cachedNodesById.size > 0) {
    // Surgical update: only rebuild affected parent's children arrays
    // First, save old children for deletion detection
    const oldChildrenByParent = new Map<string | null, Node[]>();
    for (const parentId of dirtyParentIds) {
      oldChildrenByParent.set(parentId, cachedChildrenByParent.get(parentId) ?? []);
    }

    // Update the node map incrementally and rebuild children arrays
    const newNodesById = new Map(cachedNodesById);

    for (const parentId of dirtyParentIds) {
      // Collect children for this parent from the new nodes array
      const children: Node[] = [];
      for (const node of nodes) {
        if ((node.parent_id ?? null) === parentId) {
          children.push(node);
          // Update node in map (might have new content, position, etc.)
          newNodesById.set(node.id, node);
        }
      }
      children.sort((a, b) => a.position - b.position);
      cachedChildrenByParent.set(parentId, children);

      // Handle deleted nodes - remove from map if not in new children
      const newChildIds = new Set(children.map(n => n.id));
      const oldChildren = oldChildrenByParent.get(parentId) ?? [];
      for (const oldChild of oldChildren) {
        if (!newChildIds.has(oldChild.id)) {
          newNodesById.delete(oldChild.id);
        }
      }
    }

    cachedNodesById = newNodesById;
    cachedNodes = nodes;
    const numDirty = dirtyParentIds.size;
    dirtyParentIds.clear();
    needsFullRebuild = true; // Reset for next change

    const elapsed = performance.now() - startTime;
    if (elapsed > 2) {
      console.log(`[perf] rebuildIndexes (surgical, ${numDirty} parents): ${elapsed.toFixed(1)}ms`);
    }
    return;
  }

  // Full rebuild
  const mapStart = performance.now();
  cachedNodes = nodes;
  cachedNodesById = new Map(nodes.map(n => [n.id, n]));
  const mapTime = performance.now() - mapStart;

  // Build children index - group by parent_id
  const groupStart = performance.now();
  const childrenMap = new Map<string | null, Node[]>();
  for (const node of nodes) {
    const parentId = node.parent_id ?? null;
    let children = childrenMap.get(parentId);
    if (!children) {
      children = [];
      childrenMap.set(parentId, children);
    }
    children.push(node);
  }
  const groupTime = performance.now() - groupStart;

  // Sort each children array by position
  const sortStart = performance.now();
  for (const children of childrenMap.values()) {
    children.sort((a, b) => a.position - b.position);
  }
  const sortTime = performance.now() - sortStart;

  cachedChildrenByParent = childrenMap;
  dirtyParentIds.clear();
  needsFullRebuild = true; // Reset for next change

  const elapsed = performance.now() - startTime;
  if (elapsed > 5) {
    console.log(`[perf] rebuildIndexes (full) call#${rebuildCallCount}: ${elapsed.toFixed(1)}ms for ${nodes.length} nodes (map=${mapTime.toFixed(1)}ms, group=${groupTime.toFixed(1)}ms, sort=${sortTime.toFixed(1)}ms)`);
  }
}

// Derived: nodes indexed by ID
function nodesById(): Map<string, Node> {
  rebuildIndexes();
  return cachedNodesById;
}

// Derived: root nodes (no parent)
function rootNodes(): Node[] {
  rebuildIndexes();
  return cachedChildrenByParent.get(null) ?? [];
}

// Derived: children of a node
function childrenOf(parentId: string): Node[] {
  rebuildIndexes();
  return cachedChildrenByParent.get(parentId) ?? [];
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

// Performance tracking
let lastBuildTreeTime = 0;
let buildTreeCallCount = 0;

// Build tree structure for rendering - optimized version
// For large flat lists, this avoids unnecessary recursive calls
function buildTree(parentId: string | null, depth: number, filteredIds?: Set<string>, excludeCompleted: boolean = false): TreeNode[] {
  const isRoot = parentId === null;
  // Get children first (may trigger rebuildIndexes) before measuring tree building time
  const children = parentId === null ? rootNodes() : childrenOf(parentId);
  const startTime = isRoot ? performance.now() : 0;

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

  // Optimization: pre-fetch the children map to avoid repeated lookups
  const childrenByParent = cachedChildrenByParent;

  const result = visibleChildren.map(node => {
    // Direct lookup from cache instead of function call
    const nodeChildren = childrenByParent.get(node.id) ?? [];
    // When filtering, check if any children are visible
    let hasVisibleChildren = nodeChildren.length > 0;
    if (filteredIds) {
      hasVisibleChildren = nodeChildren.some(c => filteredIds.has(c.id));
    }
    if (excludeCompleted) {
      hasVisibleChildren = hasVisibleChildren && nodeChildren.some(c => !c.is_checked);
    }

    // Skip recursive call if no children (common case for leaf nodes)
    let childTree: TreeNode[] = [];
    if (hasVisibleChildren && (filteredIds || !node.collapsed)) {
      childTree = buildTree(node.id, depth + 1, filteredIds, excludeCompleted);
    }

    return {
      node,
      depth,
      hasChildren: hasVisibleChildren,
      children: childTree
    };
  });

  if (isRoot) {
    lastBuildTreeTime = performance.now() - startTime;
    buildTreeCallCount++;
    if (lastBuildTreeTime > 10) {
      console.log(`[perf] buildTree: ${lastBuildTreeTime.toFixed(1)}ms (call #${buildTreeCallCount}, ${nodes.length} nodes)`);
    }
  }

  return result;
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
  // Compute which parents are affected by this change
  if (nodes.length > 0 && state.nodes.length > 0) {
    const changedParents = computeChangedParents(nodes, state.nodes);
    if (changedParents.size > 0 && changedParents.size < nodes.length / 10) {
      // Small change - use surgical update
      dirtyParentIds = changedParents;
      needsFullRebuild = false;
    } else {
      // Large change or first load - full rebuild
      needsFullRebuild = true;
    }
  }
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

  // --- Zoom/Focus Mode ---

  get zoomedNodeId() { return zoomedNodeId; },

  // Zoom into a subtree (show only this node and its descendants)
  zoomTo(nodeId: string) {
    const node = nodesById().get(nodeId);
    if (!node) return;
    zoomedNodeId = nodeId;
    // Focus the zoomed node
    focusedId = nodeId;
  },

  // Zoom out one level (to parent of current zoom)
  zoomOut() {
    if (!zoomedNodeId) return;
    const node = nodesById().get(zoomedNodeId);
    if (!node) {
      // Node was deleted, zoom all the way out
      zoomedNodeId = null;
      return;
    }
    // Zoom to parent, or all the way out if at root
    zoomedNodeId = node.parent_id;
  },

  // Zoom all the way out (show full document)
  zoomReset() {
    zoomedNodeId = null;
  },

  // Get breadcrumb path from root to zoomed node
  getZoomBreadcrumbs(): Node[] {
    if (!zoomedNodeId) return [];
    const path: Node[] = [];
    let currentId: string | null = zoomedNodeId;
    while (currentId) {
      const node = nodesById().get(currentId);
      if (!node) break;
      path.unshift(node); // Add to front
      currentId = node.parent_id;
    }
    return path;
  },

  // Build tree for rendering (respects active filter, hideCompleted, and zoom)
  getTree(): TreeNode[] {
    // Check if cached tree is still valid
    if (cachedTreeNodes === nodes &&
        cachedTreeFilter === filterQuery &&
        cachedTreeHideCompleted === hideCompleted &&
        cachedTreeZoomedNodeId === zoomedNodeId) {
      return cachedTree;
    }

    const filteredIds = filterQuery ? getFilteredNodeIds(filterQuery) : undefined;
    // When zoomed, start tree from zoomed node instead of root
    const rootId = zoomedNodeId;
    cachedTree = buildTree(rootId, 0, filteredIds, hideCompleted);
    cachedTreeNodes = nodes;
    cachedTreeFilter = filterQuery;
    cachedTreeHideCompleted = hideCompleted;
    cachedTreeZoomedNodeId = zoomedNodeId;
    return cachedTree;
  },

  // Get visible nodes in order (respects active filter, hideCompleted, and zoom)
  getVisibleNodes(): Node[] {
    const filteredIds = filterQuery ? getFilteredNodeIds(filterQuery) : undefined;
    const rootId = zoomedNodeId;
    return flattenTree(buildTree(rootId, 0, filteredIds, hideCompleted));
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
  // If no node is focused (or focused node is not visible), select the first visible node
  moveToNext(): string | null {
    const visible = this.getVisibleNodes();
    if (visible.length === 0) return null;

    const idx = focusedId ? visible.findIndex(n => n.id === focusedId) : -1;

    // If no node is focused or focused node is not in visible list, select first
    if (idx < 0) {
      focusedId = visible[0].id;
      return focusedId;
    }

    // Move to next visible node
    if (idx < visible.length - 1) {
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

      // Get the newly created node for undo
      const newNode = nodesById().get(result.id);
      if (newNode) {
        pushUndo({
          description: 'Create item',
          undo: { type: 'delete', id: result.id },
          redo: { type: 'create', node: { ...newNode } },
          timestamp: Date.now(),
        });
      }

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
    const deleteStart = performance.now();
    const visible = this.getVisibleNodes();
    const idx = visible.findIndex(n => n.id === nodeId);

    // Don't delete the last node
    if (visible.length <= 1) return null;

    // Save node data for undo before deleting
    const nodeToDelete = nodesById().get(nodeId);
    if (!nodeToDelete) return null;
    const savedNode = { ...nodeToDelete };

    startOperation();
    try {
      const apiStart = performance.now();
      const state = await api.deleteNode(nodeId);
      const apiTime = performance.now() - apiStart;

      const updateStart = performance.now();
      updateFromState(state);
      const updateTime = performance.now() - updateStart;

      // Push undo entry
      pushUndo({
        description: 'Delete item',
        undo: { type: 'create', node: savedNode },
        redo: { type: 'delete', id: nodeId },
        timestamp: Date.now(),
      });

      // Focus previous or next
      const newFocusId = visible[idx - 1]?.id || visible[idx + 1]?.id;
      if (newFocusId) {
        focusedId = newFocusId;
      }

      const totalTime = performance.now() - deleteStart;
      console.log(`[perf] deleteNode: total=${totalTime.toFixed(1)}ms, api=${apiTime.toFixed(1)}ms, updateState=${updateTime.toFixed(1)}ms`);

      return newFocusId || null;
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

    // If checking an item while hideCompleted is on, find next item to focus BEFORE hiding
    let nextFocusId: string | null = null;
    if (!node.is_checked && hideCompleted && focusedId === nodeId) {
      const visible = this.getVisibleNodes();
      const idx = visible.findIndex(n => n.id === nodeId);
      // Prefer next item, fall back to previous
      if (idx >= 0 && idx < visible.length - 1) {
        nextFocusId = visible[idx + 1].id;
      } else if (idx > 0) {
        nextFocusId = visible[idx - 1].id;
      }
    }

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

      // Move focus to next item if the completed item is now hidden
      if (nextFocusId) {
        focusedId = nextFocusId;
      }

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
  },

  // DEV ONLY: Generate test nodes for performance testing
  _generateTestNodes(count: number) {
    const startTime = performance.now();
    const testNodes: Node[] = [];
    const now = new Date().toISOString();

    // Create flat list of nodes for simplicity
    for (let i = 0; i < count; i++) {
      testNodes.push({
        id: `test-${i}`,
        parent_id: null,
        position: i,
        content: `Test item ${i + 1} - Lorem ipsum dolor sit amet`,
        node_type: 'bullet',
        collapsed: false,
        is_checked: false,
        created_at: now,
        updated_at: now,
      });
    }

    // Replace all nodes
    nodes = testNodes;
    focusedId = testNodes[0]?.id || null;

    console.log(`[perf] Generated ${count} test nodes in ${(performance.now() - startTime).toFixed(1)}ms`);
  },

  // DEV ONLY: Measure tree rendering time
  _measureRender() {
    const startTime = performance.now();
    const tree = this.getTree();
    const buildTime = performance.now() - startTime;
    console.log(`[perf] getTree: ${buildTime.toFixed(1)}ms, ${nodes.length} nodes, ${tree.length} root items`);
    return tree;
  },

  // Collapse a specific node (set collapsed=true)
  async collapseNode(nodeId: string) {
    const node = nodesById().get(nodeId);
    if (!node || node.collapsed) return;

    const children = childrenOf(nodeId);
    if (children.length === 0) return;

    startOperation();
    try {
      const state = await api.updateNode(nodeId, { collapsed: true });
      updateFromState(state);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      endOperation();
    }
  },

  // Expand a specific node (set collapsed=false)
  async expandNode(nodeId: string) {
    const node = nodesById().get(nodeId);
    if (!node || !node.collapsed) return;

    startOperation();
    try {
      const state = await api.updateNode(nodeId, { collapsed: false });
      updateFromState(state);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      endOperation();
    }
  },

  // Collapse all nodes that have children
  async collapseAll() {
    const nodesToCollapse = nodes.filter(n => {
      if (n.collapsed) return false;
      return childrenOf(n.id).length > 0;
    });

    if (nodesToCollapse.length === 0) return;

    startOperation();
    try {
      // Update each node - the API returns full state each time
      let state: DocumentState | null = null;
      for (const node of nodesToCollapse) {
        state = await api.updateNode(node.id, { collapsed: true });
      }
      if (state) {
        updateFromState(state);
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      endOperation();
    }
  },

  // Expand all collapsed nodes
  async expandAll() {
    const nodesToExpand = nodes.filter(n => n.collapsed);

    if (nodesToExpand.length === 0) return;

    startOperation();
    try {
      let state: DocumentState | null = null;
      for (const node of nodesToExpand) {
        state = await api.updateNode(node.id, { collapsed: false });
      }
      if (state) {
        updateFromState(state);
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      endOperation();
    }
  },

  // Expand all nodes up to a specific depth level (1-based)
  // Level 1 = show root items only (collapse all)
  // Level 2 = show root + their direct children
  // etc.
  async expandToLevel(level: number) {
    // Calculate depth of each node
    const nodeDepths = new Map<string, number>();

    function getDepth(nodeId: string): number {
      const cached = nodeDepths.get(nodeId);
      if (cached !== undefined) return cached;

      const node = nodesById().get(nodeId);
      if (!node || !node.parent_id) {
        nodeDepths.set(nodeId, 1);
        return 1;
      }

      const depth = getDepth(node.parent_id) + 1;
      nodeDepths.set(nodeId, depth);
      return depth;
    }

    // Calculate depths for all nodes
    for (const node of nodes) {
      getDepth(node.id);
    }

    // Determine which nodes need to change
    const changes: { id: string; collapsed: boolean }[] = [];

    for (const node of nodes) {
      const hasChildren = childrenOf(node.id).length > 0;
      if (!hasChildren) continue;

      const depth = nodeDepths.get(node.id) || 1;
      // Nodes at depth < level should be expanded (collapsed=false)
      // Nodes at depth >= level should be collapsed (collapsed=true)
      const shouldBeCollapsed = depth >= level;

      if (node.collapsed !== shouldBeCollapsed) {
        changes.push({ id: node.id, collapsed: shouldBeCollapsed });
      }
    }

    if (changes.length === 0) return;

    startOperation();
    try {
      let state: DocumentState | null = null;
      for (const change of changes) {
        state = await api.updateNode(change.id, { collapsed: change.collapsed });
      }
      if (state) {
        updateFromState(state);
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      endOperation();
    }
  },

  // Collapse all siblings of the focused node
  async collapseSiblings(nodeId: string) {
    const node = nodesById().get(nodeId);
    if (!node) return;

    const siblings = getSiblings(nodeId);
    const siblingsToCollapse = siblings.filter(s =>
      s.id !== nodeId &&
      !s.collapsed &&
      childrenOf(s.id).length > 0
    );

    if (siblingsToCollapse.length === 0) return;

    startOperation();
    try {
      let state: DocumentState | null = null;
      for (const sibling of siblingsToCollapse) {
        state = await api.updateNode(sibling.id, { collapsed: true });
      }
      if (state) {
        updateFromState(state);
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      endOperation();
    }
  },

  // Check if a node has children (useful for UI)
  hasChildren(nodeId: string): boolean {
    return childrenOf(nodeId).length > 0;
  },

  // Check if a node is collapsed
  isCollapsed(nodeId: string): boolean {
    const node = nodesById().get(nodeId);
    return node?.collapsed ?? false;
  },

  // --- Undo/Redo ---

  get canUndo() { return undoStack.length > 0; },
  get canRedo() { return redoStack.length > 0; },

  // Perform undo
  async undo(): Promise<boolean> {
    if (pendingOperations > 0) return false; // Can't undo while saving
    const entry = undoStack.pop();
    if (!entry) return false;

    const success = await this._executeUndoAction(entry.undo);
    if (success) {
      redoStack.push(entry);
    } else {
      // Restore to undo stack if failed
      undoStack.push(entry);
    }
    return success;
  },

  // Perform redo
  async redo(): Promise<boolean> {
    if (pendingOperations > 0) return false; // Can't redo while saving
    const entry = redoStack.pop();
    if (!entry) return false;

    const success = await this._executeUndoAction(entry.redo);
    if (success) {
      undoStack.push(entry);
    } else {
      // Restore to redo stack if failed
      redoStack.push(entry);
    }
    return success;
  },

  // Execute an undo action without adding to undo stack
  async _executeUndoAction(action: UndoAction): Promise<boolean> {
    startOperation();
    try {
      switch (action.type) {
        case 'create': {
          // Recreate a deleted node
          const result = await api.createNodeWithId(
            action.node.id,
            action.node.parent_id,
            action.node.position,
            action.node.content,
            action.node.node_type
          );
          // Apply additional properties
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
          focusedId = action.node.id;
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
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      return false;
    } finally {
      endOperation();
    }
  },

  // Clear undo/redo stacks (called on sync/reload)
  clearUndoHistory() {
    undoStack = [];
    redoStack = [];
  }
};

// Expose to window for dev testing
if (typeof window !== 'undefined') {
  (window as any).outline = outline;
}
