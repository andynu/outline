import type { DocumentState, Node, NodeChanges, TreeNode, UndoEntry, UndoAction } from './types';
import type { ParsedItem } from './markdownPaste';
import * as api from './api';
import { stripHtml } from './utils';

// Debounce timers for text updates (content and note)
const pendingTextUpdates = new Map<string, { timer: ReturnType<typeof setTimeout>; field: 'content' | 'note'; value: string }>();
const TEXT_UPDATE_DEBOUNCE_MS = 300;

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
  const plainText = stripHtml(node.content);
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
let selectedIds = $state<Set<string>>(new Set());  // Multi-selection (empty = single selection mode)
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
let cachedTreeVersion: number = -1;  // Version when cache was built (-1 = never built)
let cachedTreeFilter: string | null = null;
let cachedTreeHideCompleted: boolean = false;
let cachedTreeZoomedNodeId: string | null = null;

// Version counter for nodes - incremented on every updateFromState call
// Used to invalidate caches reliably (reference equality fails with Svelte 5 proxies)
// This is a $state so template can react to changes via outline.nodesVersion
let nodesVersion = $state(0);

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

function rebuildIndexes() {
  if (cachedNodes === nodes) return; // No change

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
    dirtyParentIds.clear();
    needsFullRebuild = true; // Reset for next change
    return;
  }

  // Full rebuild
  cachedNodes = nodes;
  cachedNodesById = new Map(nodes.map(n => [n.id, n]));

  // Build children index - group by parent_id
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

  // Sort each children array by position
  for (const children of childrenMap.values()) {
    children.sort((a, b) => a.position - b.position);
  }

  cachedChildrenByParent = childrenMap;
  dirtyParentIds.clear();
  needsFullRebuild = true; // Reset for next change
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

// Build tree structure for rendering - optimized version
// For large flat lists, this avoids unnecessary recursive calls
function buildTree(parentId: string | null, depth: number, filteredIds?: Set<string>, excludeCompleted: boolean = false): TreeNode[] {
  // Get children (may trigger rebuildIndexes)
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

// Update a node in the cached tree in-place (for optimistic text updates)
function updateTreeNodeInPlace(tree: TreeNode[], nodeId: string, updatedNode: Node): boolean {
  for (const item of tree) {
    if (item.node.id === nodeId) {
      item.node = updatedNode;
      return true;
    }
    if (updateTreeNodeInPlace(item.children, nodeId, updatedNode)) {
      return true;
    }
  }
  return false;
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
  nodesVersion++;  // Invalidate all node-dependent caches
}

// Track operation start/end for save status
function startOperation() {
  pendingOperations++;
}

function endOperation() {
  pendingOperations--;
  lastSavedAt = new Date();
}

// Wrapper for async operations that handles startOperation/endOperation and error handling
// Returns null on error, otherwise returns the function's result
async function withOperation<T>(fn: () => Promise<T>): Promise<T | null> {
  startOperation();
  try {
    return await fn();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    return null;
  } finally {
    endOperation();
  }
}

// --- Public API ---

export const outline = {
  // Getters (reactive via $derived would need different approach)
  get nodes() { return nodes; },
  get nodesVersion() { return nodesVersion; },  // For triggering tree re-renders
  get focusedId() { return focusedId; },
  get selectedIds() { return selectedIds; },
  get hasSelection() { return selectedIds.size > 0; },
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
    // Don't zoom into leaf nodes (they have no children to show)
    const children = childrenOf(nodeId);
    if (children.length === 0) return;
    zoomedNodeId = nodeId;
    // Focus the first child since the zoomed node itself isn't shown
    focusedId = children[0].id;
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

  // --- Multi-Selection ---

  // Check if a node is selected
  isSelected(nodeId: string): boolean {
    return selectedIds.has(nodeId);
  },

  // Toggle selection of a single node (Ctrl-click behavior)
  toggleSelection(nodeId: string) {
    const newSet = new Set(selectedIds);
    if (newSet.has(nodeId)) {
      newSet.delete(nodeId);
    } else {
      newSet.add(nodeId);
    }
    selectedIds = newSet;
    // Also update focus to the clicked node
    focusedId = nodeId;
  },

  // Select a range of nodes from current focus to target (Shift-click behavior)
  selectRange(toId: string) {
    const visible = this.getVisibleNodes();
    const fromId = focusedId;

    if (!fromId) {
      // No current focus, just select the target
      selectedIds = new Set([toId]);
      focusedId = toId;
      return;
    }

    const fromIdx = visible.findIndex(n => n.id === fromId);
    const toIdx = visible.findIndex(n => n.id === toId);

    if (fromIdx < 0 || toIdx < 0) {
      // One of the nodes isn't visible, just select the target
      selectedIds = new Set([toId]);
      focusedId = toId;
      return;
    }

    // Select all nodes in the range
    const startIdx = Math.min(fromIdx, toIdx);
    const endIdx = Math.max(fromIdx, toIdx);
    const newSet = new Set<string>();
    for (let i = startIdx; i <= endIdx; i++) {
      newSet.add(visible[i].id);
    }
    selectedIds = newSet;
    // Move focus to the target, keeping the range selected
    focusedId = toId;
  },

  // Clear all selections
  clearSelection() {
    if (selectedIds.size > 0) {
      selectedIds = new Set();
    }
  },

  // Select all visible nodes
  selectAll() {
    const visible = this.getVisibleNodes();
    selectedIds = new Set(visible.map(n => n.id));
  },

  // Get all selected node IDs as an array (in visible order)
  getSelectedNodes(): Node[] {
    if (selectedIds.size === 0) return [];
    const visible = this.getVisibleNodes();
    return visible.filter(n => selectedIds.has(n.id));
  },

  // Build tree for rendering (respects active filter, hideCompleted, and zoom)
  getTree(): TreeNode[] {
    // Check if cached tree is still valid
    // Use version counter instead of reference equality (Svelte 5 proxy references are unreliable)
    if (cachedTreeVersion === nodesVersion &&
        cachedTreeFilter === filterQuery &&
        cachedTreeHideCompleted === hideCompleted &&
        cachedTreeZoomedNodeId === zoomedNodeId) {
      return cachedTree;
    }

    const filteredIds = filterQuery ? getFilteredNodeIds(filterQuery) : undefined;
    // When zoomed, start tree from zoomed node instead of root
    const rootId = zoomedNodeId;
    cachedTree = buildTree(rootId, 0, filteredIds, hideCompleted);
    cachedTreeVersion = nodesVersion;
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

  // Navigation: move to parent node (Alt+H)
  // If at root of zoomed view, zooms out instead
  moveToParent(): string | null {
    if (!focusedId) return null;
    const parent = getParent(focusedId);
    if (parent) {
      focusedId = parent.id;
      return focusedId;
    }
    // No parent - if zoomed in, zoom out
    if (zoomedNodeId) {
      this.zoomOut();
      return focusedId;
    }
    return null;
  },

  // Navigation: move to first child (Alt+L)
  moveToFirstChild(): string | null {
    if (!focusedId) return null;
    const children = childrenOf(focusedId);
    if (children.length > 0) {
      // Only navigate if children are visible (not collapsed)
      const node = nodesById().get(focusedId);
      if (node && !node.collapsed) {
        focusedId = children[0].id;
        return focusedId;
      }
    }
    return null;
  },

  // Navigation: move to next sibling (Alt+J)
  moveToNextSibling(): string | null {
    if (!focusedId) return null;
    const siblings = getSiblings(focusedId);
    const idx = siblings.findIndex(n => n.id === focusedId);
    if (idx >= 0 && idx < siblings.length - 1) {
      focusedId = siblings[idx + 1].id;
      return focusedId;
    }
    return null;
  },

  // Navigation: move to previous sibling (Alt+K)
  moveToPrevSibling(): string | null {
    if (!focusedId) return null;
    const siblings = getSiblings(focusedId);
    const idx = siblings.findIndex(n => n.id === focusedId);
    if (idx > 0) {
      focusedId = siblings[idx - 1].id;
      return focusedId;
    }
    return null;
  },

  // Navigation: move to first visible node (Ctrl+Home)
  moveToFirst(): string | null {
    const visible = this.getVisibleNodes();
    if (visible.length > 0) {
      focusedId = visible[0].id;
      return focusedId;
    }
    return null;
  },

  // Navigation: move to last visible node (Ctrl+End)
  moveToLast(): string | null {
    const visible = this.getVisibleNodes();
    if (visible.length > 0) {
      focusedId = visible[visible.length - 1].id;
      return focusedId;
    }
    return null;
  },

  // Load document from backend
  // If sessionState is provided, restores zoom and focus from it
  async load(docId?: string, sessionState?: { zoomedNodeId?: string; focusedNodeId?: string }) {
    loading = true;
    error = null;
    try {
      const state = await api.loadDocument(docId);
      updateFromState(state);

      // Restore zoom state from session if provided and node exists
      if (sessionState?.zoomedNodeId) {
        const node = nodesById().get(sessionState.zoomedNodeId);
        if (node) {
          zoomedNodeId = sessionState.zoomedNodeId;
        }
      }

      // Restore focused node from session if provided and node exists
      if (sessionState?.focusedNodeId) {
        const node = nodesById().get(sessionState.focusedNodeId);
        if (node) {
          focusedId = sessionState.focusedNodeId;
        }
      }

      // Focus first node if none focused (fallback)
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

    return await withOperation(async () => {
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
    });
  },

  // Create a new sibling before the current node (for Enter at beginning)
  async addSiblingBefore(nodeId: string): Promise<string | null> {
    const node = nodesById().get(nodeId);
    if (!node) return null;

    const siblings = getSiblings(nodeId);
    const idx = siblings.findIndex(n => n.id === nodeId);
    const newPosition = idx;

    return await withOperation(async () => {
      // Shift current node and all siblings after it
      for (let i = idx; i < siblings.length; i++) {
        await api.moveNode(siblings[i].id, node.parent_id, i + 1);
      }

      const result = await api.createNode(node.parent_id, newPosition, '');
      updateFromState(result.state);
      // Keep focus on original node (now at idx + 1), don't move to blank line
      focusedId = nodeId;

      // Get the newly created node for undo
      const newNode = nodesById().get(result.id);
      if (newNode) {
        pushUndo({
          description: 'Create item above',
          undo: { type: 'delete', id: result.id },
          redo: { type: 'create', node: { ...newNode } },
          timestamp: Date.now(),
        });
      }

      return result.id;
    });
  },

  // Split a node at cursor position: update current with beforeContent, create new with afterContent
  // Children of the original node move to the new node (the "continuation")
  async splitNode(nodeId: string, beforeContent: string, afterContent: string): Promise<string | null> {
    const node = nodesById().get(nodeId);
    if (!node) return null;

    const siblings = getSiblings(nodeId);
    const idx = siblings.findIndex(n => n.id === nodeId);
    const newPosition = idx + 1;

    // Get children to move to new node
    const children = childrenOf(nodeId);

    // Check if we're zoomed into the node being split and it has children
    // If so, we need to zoom out after the split to avoid an empty view
    const wasZoomedIntoSplitNode = zoomedNodeId === nodeId && children.length > 0;

    return await withOperation(async () => {
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

      updateFromState(result.state);
      // Reload to get final state after all moves
      const finalState = await api.loadDocument();
      updateFromState(finalState);

      focusedId = result.id;

      // If we were zoomed into the split node, zoom out to its parent
      // This prevents an empty view since the original node's children moved away
      if (wasZoomedIntoSplitNode) {
        zoomedNodeId = node.parent_id;
      }

      // Note: Undo for split is complex (would need to restore content and move children back)
      // For now, we don't add undo support for split
      // TODO: Add proper undo support for split

      return result.id;
    });
  },

  // Create multiple items from parsed markdown list
  // Returns the ID of the first created item, or null on failure
  // Items with indent=0 become siblings after anchorNode
  // Items with indent=1 become children of the anchor node (or the last indent=0 item)
  async createItemsFromMarkdown(
    afterNodeId: string,
    items: ParsedItem[]
  ): Promise<string | null> {
    if (items.length === 0) return null;

    const anchorNode = nodesById().get(afterNodeId);
    if (!anchorNode) return null;

    return await withOperation(async () => {
      // Get siblings and position for insertion
      const siblings = getSiblings(afterNodeId);
      const anchorIdx = siblings.findIndex(n => n.id === afterNodeId);

      // Shift siblings after insertion point to make room
      // Count how many top-level items we'll create (indent 0)
      const topLevelCount = items.filter(i => i.indent === 0).length;
      for (let i = anchorIdx + 1; i < siblings.length; i++) {
        await api.moveNode(siblings[i].id, anchorNode.parent_id, siblings[i].position + topLevelCount);
      }

      // Track the most recent node at each indent level
      // Key: indent level, Value: node ID created at that level
      // For an item at indent N, its parent is lastNodeAtLevel[N-1]
      // Initialize with anchor node at level 0 so that indent=1 items become children of anchor
      const lastNodeAtLevel = new Map<number, string>();
      lastNodeAtLevel.set(0, afterNodeId);

      // Track position within each parent
      const positionByParent = new Map<string | null, number>();
      positionByParent.set(anchorNode.parent_id, anchorIdx + 1);
      // Children of anchor node start at position 0 (or after existing children)
      const existingChildren = childrenOf(afterNodeId);
      positionByParent.set(afterNodeId, existingChildren.length);

      let firstCreatedId: string | null = null;

      for (const item of items) {
        // Determine parent based on indent level
        let parentId: string | null;

        if (item.indent === 0) {
          // Root level - parent is the anchor's parent (sibling of anchor)
          parentId = anchorNode.parent_id;
        } else {
          // Nested item - parent is the last node at the previous indent level
          parentId = lastNodeAtLevel.get(item.indent - 1) ?? anchorNode.parent_id;
        }

        // Get position within parent
        const position = positionByParent.get(parentId) ?? 0;

        // Create the node
        const result = await api.createNode(parentId, position, item.content);

        // Update node type if checkbox
        if (item.nodeType === 'checkbox') {
          await api.updateNode(result.id, {
            node_type: 'checkbox',
            is_checked: item.isChecked,
          });
        }

        // Track the created node
        if (!firstCreatedId) {
          firstCreatedId = result.id;
        }

        // Record this node at its indent level (so future nested items can use it as parent)
        lastNodeAtLevel.set(item.indent, result.id);

        // Clear mappings for deeper indent levels (they're no longer valid after going back up)
        for (let level = item.indent + 1; level <= 10; level++) {
          lastNodeAtLevel.delete(level);
        }

        // Update position tracking
        positionByParent.set(parentId, position + 1);

        // Update state from the result
        updateFromState(result.state);
      }

      // Focus the first created item
      if (firstCreatedId) {
        focusedId = firstCreatedId;
      }

      return firstCreatedId;
    });
  },

  // Update node content
  async updateContent(nodeId: string, content: string) {
    await withOperation(async () => {
      const state = await api.updateNode(nodeId, { content });
      updateFromState(state);
    });
  },

  // Toggle collapsed state
  async toggleCollapse(nodeId: string) {
    const node = nodesById().get(nodeId);
    if (!node) return;

    // Only collapse if has children
    const children = childrenOf(nodeId);
    if (children.length === 0) return;

    // Save old state for undo
    const wasCollapsed = node.collapsed;

    await withOperation(async () => {
      const state = await api.updateNode(nodeId, { collapsed: !wasCollapsed });
      updateFromState(state);

      // Push undo entry
      pushUndo({
        description: wasCollapsed ? 'Expand item' : 'Collapse item',
        undo: { type: 'update', id: nodeId, changes: { collapsed: wasCollapsed } },
        redo: { type: 'update', id: nodeId, changes: { collapsed: !wasCollapsed } },
        timestamp: Date.now(),
      });
    });
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

    // Save old position for undo
    const oldParentId = node.parent_id;
    const oldPosition = node.position;

    const result = await withOperation(async () => {
      const state = await api.moveNode(nodeId, newParent.id, newPosition);
      updateFromState(state);

      // Uncollapse new parent so we can see the moved node
      if (newParent.collapsed) {
        await this.toggleCollapse(newParent.id);
      }

      // Push undo entry
      pushUndo({
        description: 'Indent item',
        undo: { type: 'move', id: nodeId, parentId: oldParentId, position: oldPosition },
        redo: { type: 'move', id: nodeId, parentId: newParent.id, position: newPosition },
        timestamp: Date.now(),
      });

      return true;
    });

    return result ?? false;
  },

  // Outdent node (move to parent's level)
  async outdentNode(nodeId: string): Promise<boolean> {
    const node = nodesById().get(nodeId);
    if (!node || !node.parent_id) return false;

    const parent = getParent(nodeId);
    if (!parent) return false;

    // Save old position for undo
    const oldParentId = node.parent_id;
    const oldPosition = node.position;

    // Position after parent in grandparent's children
    const grandparentChildren = parent.parent_id === null
      ? rootNodes()
      : childrenOf(parent.parent_id);
    const parentIdx = grandparentChildren.findIndex(n => n.id === parent.id);
    const newPosition = parentIdx + 1;
    const newParentId = parent.parent_id;

    const result = await withOperation(async () => {
      const state = await api.moveNode(nodeId, newParentId, newPosition);
      updateFromState(state);

      // Push undo entry
      pushUndo({
        description: 'Outdent item',
        undo: { type: 'move', id: nodeId, parentId: oldParentId, position: oldPosition },
        redo: { type: 'move', id: nodeId, parentId: newParentId, position: newPosition },
        timestamp: Date.now(),
      });

      return true;
    });

    return result ?? false;
  },

  // Move node to a new parent (used by QuickMove, supports undo)
  async moveNodeTo(nodeId: string, newParentId: string | null, newPosition: number): Promise<boolean> {
    const node = nodesById().get(nodeId);
    if (!node) return false;

    // Save old position for undo
    const oldParentId = node.parent_id;
    const oldPosition = node.position;

    // Don't move if nothing changed
    if (oldParentId === newParentId && oldPosition === newPosition) return true;

    const result = await withOperation(async () => {
      const state = await api.moveNode(nodeId, newParentId, newPosition);
      updateFromState(state);

      // Uncollapse new parent so we can see the moved node
      if (newParentId) {
        const newParent = nodesById().get(newParentId);
        if (newParent?.collapsed) {
          await this.toggleCollapse(newParentId);
        }
      }

      // Push undo entry
      pushUndo({
        description: 'Move item',
        undo: { type: 'move', id: nodeId, parentId: oldParentId, position: oldPosition },
        redo: { type: 'move', id: nodeId, parentId: newParentId, position: newPosition },
        timestamp: Date.now(),
      });

      return true;
    });

    return result ?? false;
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

    // Save positions for undo
    const nodeOldPosition = node.position;
    const prevNodeOldPosition = prevNode.position;

    isMoving = true;
    try {
      const result = await withOperation(async () => {
        // Swap positions
        await api.moveNode(nodeId, node.parent_id, prevNodeOldPosition);
        const state = await api.moveNode(prevNode.id, prevNode.parent_id, nodeOldPosition);
        updateFromState(state);

        // Force focus update after DOM reorder - toggle off then on to trigger effect
        const savedFocusId = focusedId;
        focusedId = null;
        // Allow DOM to update, then restore focus
        await new Promise(resolve => setTimeout(resolve, 0));
        focusedId = savedFocusId;

        // Push undo entry - undo swaps them back to original positions
        pushUndo({
          description: 'Move item up',
          undo: { type: 'swap', id: nodeId, position: nodeOldPosition, otherId: prevNode.id, otherPosition: prevNodeOldPosition },
          redo: { type: 'swap', id: nodeId, position: prevNodeOldPosition, otherId: prevNode.id, otherPosition: nodeOldPosition },
          timestamp: Date.now(),
        });

        return true;
      });

      return result ?? false;
    } finally {
      isMoving = false;
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

    // Save positions for undo
    const nodeOldPosition = node.position;
    const nextNodeOldPosition = nextNode.position;

    isMoving = true;
    try {
      const result = await withOperation(async () => {
        // Swap positions
        await api.moveNode(nodeId, node.parent_id, nextNodeOldPosition);
        const state = await api.moveNode(nextNode.id, nextNode.parent_id, nodeOldPosition);
        updateFromState(state);

        // Force focus update after DOM reorder - toggle off then on to trigger effect
        const savedFocusId = focusedId;
        focusedId = null;
        // Allow DOM to update, then restore focus
        await new Promise(resolve => setTimeout(resolve, 0));
        focusedId = savedFocusId;

        // Push undo entry - undo swaps them back to original positions
        pushUndo({
          description: 'Move item down',
          undo: { type: 'swap', id: nodeId, position: nodeOldPosition, otherId: nextNode.id, otherPosition: nextNodeOldPosition },
          redo: { type: 'swap', id: nodeId, position: nextNodeOldPosition, otherId: nextNode.id, otherPosition: nodeOldPosition },
          timestamp: Date.now(),
        });

        return true;
      });

      return result ?? false;
    } finally {
      isMoving = false;
    }
  },

  // Delete node
  async deleteNode(nodeId: string): Promise<string | null> {
    const visible = this.getVisibleNodes();
    const idx = visible.findIndex(n => n.id === nodeId);

    // Don't delete the last node
    if (visible.length <= 1) return null;

    // Save node data for undo before deleting
    const nodeToDelete = nodesById().get(nodeId);
    if (!nodeToDelete) return null;
    const savedNode = { ...nodeToDelete };

    return await withOperation(async () => {
      const state = await api.deleteNode(nodeId);
      updateFromState(state);

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

      return newFocusId || null;
    });
  },

  // Delete all selected nodes
  async deleteSelectedNodes(): Promise<string | null> {
    const selected = this.getSelectedNodes();
    if (selected.length === 0) return null;

    const visible = this.getVisibleNodes();

    // Don't delete if it would leave no nodes
    const remainingCount = visible.length - selected.length;
    if (remainingCount <= 0) return null;

    // Find the first non-selected node to focus after deletion
    // Prefer the node just after the last selected node
    const selectedSet = new Set(selected.map(n => n.id));
    let newFocusId: string | null = null;
    for (const node of visible) {
      if (!selectedSet.has(node.id)) {
        newFocusId = node.id;
        // Keep looking for a node after any selected one
      }
    }

    return await withOperation(async () => {
      // Delete nodes in reverse order to maintain valid indices
      // (deleting from end first)
      const sortedSelected = [...selected].reverse();
      for (const node of sortedSelected) {
        await api.deleteNode(node.id);
      }

      // Reload state after all deletions
      const state = await api.loadDocument();
      updateFromState(state);

      // Clear selection and set focus
      selectedIds = new Set();
      if (newFocusId) {
        focusedId = newFocusId;
      }

      return newFocusId;
    });
  },

  // Merge with next sibling: append next sibling's content and children to current node
  // Used when Delete is pressed at end of item content
  // Returns the cursor position where the merge happened (end of original content)
  async mergeWithNextSibling(nodeId: string): Promise<{ cursorPos: number } | null> {
    const node = nodesById().get(nodeId);
    if (!node) return null;

    const siblings = getSiblings(nodeId);
    const idx = siblings.findIndex(n => n.id === nodeId);

    // Check if there's a next sibling
    if (idx < 0 || idx >= siblings.length - 1) return null;
    const nextSibling = siblings[idx + 1];

    // Calculate cursor position (end of current content, before merge)
    // Strip HTML tags to get text length
    const plainTextLength = stripHtml(node.content).length;

    return await withOperation(async () => {
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
    });
  },

  // Toggle completion on all selected nodes
  async toggleSelectedCheckboxes(): Promise<boolean> {
    const selected = this.getSelectedNodes();
    if (selected.length === 0) return false;

    const result = await withOperation(async () => {
      // Determine what the toggle should do:
      // If any are unchecked, check them all; otherwise uncheck them all
      const anyUnchecked = selected.some(n => !n.is_checked);
      const newState = anyUnchecked;

      for (const node of selected) {
        if (node.is_checked !== newState) {
          await api.updateNode(node.id, { is_checked: newState });
        }
      }

      // Reload state
      const state = await api.loadDocument();
      updateFromState(state);

      return true;
    });

    return result ?? false;
  },

  // Indent all selected nodes
  async indentSelectedNodes(): Promise<boolean> {
    const selected = this.getSelectedNodes();
    if (selected.length === 0) return false;

    const result = await withOperation(async () => {
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
    });

    return result ?? false;
  },

  // Outdent all selected nodes
  async outdentSelectedNodes(): Promise<boolean> {
    const selected = this.getSelectedNodes();
    if (selected.length === 0) return false;

    const result = await withOperation(async () => {
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
    });

    return result ?? false;
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

    // Save state for undo
    const oldIsChecked = node.is_checked;
    const oldDate = node.date;

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

    const result = await withOperation(async () => {
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

          // Push undo entry for recurring date change
          pushUndo({
            description: 'Complete recurring task',
            undo: { type: 'update', id: nodeId, changes: { date: oldDate } },
            redo: { type: 'update', id: nodeId, changes: { date: nextDate } },
            timestamp: Date.now(),
          });

          return true;
        }
      }

      // Normal toggle for non-recurring or already checked tasks
      const newIsChecked = !node.is_checked;
      const state = await api.updateNode(nodeId, {
        is_checked: newIsChecked,
      });
      updateFromState(state);

      // Push undo entry
      pushUndo({
        description: newIsChecked ? 'Complete item' : 'Uncomplete item',
        undo: { type: 'update', id: nodeId, changes: { is_checked: oldIsChecked } },
        redo: { type: 'update', id: nodeId, changes: { is_checked: newIsChecked } },
        timestamp: Date.now(),
      });

      // Move focus to next item if the completed item is now hidden
      if (nextFocusId) {
        focusedId = nextFocusId;
      }

      return true;
    });

    return result ?? false;
  },

  // Toggle node type between bullet and checkbox
  async toggleNodeType(nodeId: string): Promise<boolean> {
    const node = nodesById().get(nodeId);
    if (!node) return false;

    // Save old state for undo
    const oldType = node.node_type;
    const oldIsChecked = node.is_checked;

    const result = await withOperation(async () => {
      const newType = node.node_type === 'checkbox' ? 'bullet' : 'checkbox';
      const newIsChecked = newType === 'checkbox' ? node.is_checked : false;
      const state = await api.updateNode(nodeId, {
        node_type: newType,
        // Reset is_checked when converting back to bullet
        is_checked: newIsChecked,
      });
      updateFromState(state);

      // Push undo entry
      pushUndo({
        description: newType === 'checkbox' ? 'Convert to checkbox' : 'Convert to bullet',
        undo: { type: 'update', id: nodeId, changes: { node_type: oldType, is_checked: oldIsChecked } },
        redo: { type: 'update', id: nodeId, changes: { node_type: newType, is_checked: newIsChecked } },
        timestamp: Date.now(),
      });

      return true;
    });

    return result ?? false;
  },

  // Set date on a node (pass null or empty string to clear)
  async setDate(nodeId: string, date: string | null): Promise<boolean> {
    const node = nodesById().get(nodeId);
    if (!node) return false;

    // Save old state for undo
    const oldDate = node.date;
    const newDate = date ?? '';

    const result = await withOperation(async () => {
      // Empty string signals to backend to clear the date
      const state = await api.updateNode(nodeId, {
        date: newDate,
      });
      updateFromState(state);

      // Push undo entry
      pushUndo({
        description: newDate ? 'Set date' : 'Clear date',
        undo: { type: 'update', id: nodeId, changes: { date: oldDate } },
        redo: { type: 'update', id: nodeId, changes: { date: newDate } },
        timestamp: Date.now(),
      });

      return true;
    });

    return result ?? false;
  },

  // Clear date from a node
  async clearDate(nodeId: string): Promise<boolean> {
    return this.setDate(nodeId, '');
  },

  // Set recurrence on a node (pass null or empty string to clear)
  async setRecurrence(nodeId: string, rrule: string | null): Promise<boolean> {
    const node = nodesById().get(nodeId);
    if (!node) return false;

    // Save old state for undo
    const oldRecurrence = node.date_recurrence;
    const newRecurrence = rrule ?? '';

    const result = await withOperation(async () => {
      // Empty string signals to backend to clear the recurrence
      const state = await api.updateNode(nodeId, {
        date_recurrence: newRecurrence,
      });
      updateFromState(state);

      // Push undo entry
      pushUndo({
        description: newRecurrence ? 'Set recurrence' : 'Clear recurrence',
        undo: { type: 'update', id: nodeId, changes: { date_recurrence: oldRecurrence } },
        redo: { type: 'update', id: nodeId, changes: { date_recurrence: newRecurrence } },
        timestamp: Date.now(),
      });

      return true;
    });

    return result ?? false;
  },

  // Update note on a node (pass empty string to clear)
  // This is debounced to avoid excessive API calls
  updateNote(nodeId: string, note: string) {
    // Cancel any pending update for this node
    const pending = pendingTextUpdates.get(nodeId);
    if (pending) {
      clearTimeout(pending.timer);
    }

    // Optimistic in-place update - modify the node directly in all caches
    const idx = nodes.findIndex(n => n.id === nodeId);
    if (idx !== -1) {
      const updatedNode = { ...nodes[idx], note: note || undefined };
      nodes[idx] = updatedNode;
      // Update the cached map
      cachedNodesById.set(nodeId, updatedNode);
      // Update the node in childrenByParent cache
      const parentId = updatedNode.parent_id;
      const siblings = cachedChildrenByParent.get(parentId) ?? [];
      const siblingIdx = siblings.findIndex(n => n.id === nodeId);
      if (siblingIdx !== -1) {
        siblings[siblingIdx] = updatedNode;
      }
      // Update cached tree if it exists - find and update the TreeNode
      updateTreeNodeInPlace(cachedTree, nodeId, updatedNode);
    }

    // Debounce the API call
    const timer = setTimeout(async () => {
      pendingTextUpdates.delete(nodeId);
      startOperation();
      try {
        // Send to backend - don't update from state since we already have the value
        await api.updateNode(nodeId, { note: note || undefined });
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      } finally {
        endOperation();
      }
    }, TEXT_UPDATE_DEBOUNCE_MS);

    pendingTextUpdates.set(nodeId, { timer, field: 'note', value: note });
  },

  // Get all tags used in the document with counts and associated node IDs
  getAllTags(): Map<string, { count: number; nodeIds: string[] }> {
    const tagMap = new Map<string, { count: number; nodeIds: string[] }>();

    for (const node of nodes) {
      // Extract tags from content (strip HTML first)
      const plainText = stripHtml(node.content);
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
      const plainText = stripHtml(node.content);
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

    const result = await withOperation(async () => {
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
    });

    if (result === null) {
      draggedId = null;
    }
    return result ?? false;
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
    nodesVersion++;  // Invalidate caches
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

    await withOperation(async () => {
      const state = await api.updateNode(nodeId, { collapsed: true });
      updateFromState(state);
    });
  },

  // Expand a specific node (set collapsed=false)
  async expandNode(nodeId: string) {
    const node = nodesById().get(nodeId);
    if (!node || !node.collapsed) return;

    await withOperation(async () => {
      const state = await api.updateNode(nodeId, { collapsed: false });
      updateFromState(state);
    });
  },

  // Collapse all nodes that have children
  // When a filter is active, only collapses nodes in the filtered set
  async collapseAll() {
    // Get the set of node IDs that should be considered for collapsing
    const filteredIds = filterQuery ? getFilteredNodeIds(filterQuery) : null;

    const nodesToCollapse = nodes.filter(n => {
      if (n.collapsed) return false;
      if (childrenOf(n.id).length === 0) return false;
      // If filtering, only collapse nodes in the filtered set
      if (filteredIds && !filteredIds.has(n.id)) return false;
      return true;
    });

    if (nodesToCollapse.length === 0) return;

    await withOperation(async () => {
      // Update each node - the API returns full state each time
      let state: DocumentState | null = null;
      for (const node of nodesToCollapse) {
        state = await api.updateNode(node.id, { collapsed: true });
      }
      if (state) {
        updateFromState(state);
      }
    });
  },

  // Expand all collapsed nodes
  // When a filter is active, only expands nodes in the filtered set
  async expandAll() {
    // Get the set of node IDs that should be considered for expansion
    const filteredIds = filterQuery ? getFilteredNodeIds(filterQuery) : null;

    const nodesToExpand = nodes.filter(n => {
      if (!n.collapsed) return false;
      // If filtering, only expand nodes in the filtered set
      if (filteredIds && !filteredIds.has(n.id)) return false;
      return true;
    });

    if (nodesToExpand.length === 0) return;

    await withOperation(async () => {
      let state: DocumentState | null = null;
      for (const node of nodesToExpand) {
        state = await api.updateNode(node.id, { collapsed: false });
      }
      if (state) {
        updateFromState(state);
      }
    });
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

    await withOperation(async () => {
      let state: DocumentState | null = null;
      for (const change of changes) {
        state = await api.updateNode(change.id, { collapsed: change.collapsed });
      }
      if (state) {
        updateFromState(state);
      }
    });
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

    await withOperation(async () => {
      let state: DocumentState | null = null;
      for (const sibling of siblingsToCollapse) {
        state = await api.updateNode(sibling.id, { collapsed: true });
      }
      if (state) {
        updateFromState(state);
      }
    });
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
    const result = await withOperation(async () => {
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
        case 'swap': {
          // Swap two nodes' positions
          const node = nodesById().get(action.id);
          const otherNode = nodesById().get(action.otherId);
          if (!node || !otherNode) return false;
          // Move both nodes to their target positions
          await api.moveNode(action.id, node.parent_id, action.position);
          const state = await api.moveNode(action.otherId, otherNode.parent_id, action.otherPosition);
          updateFromState(state);
          return true;
        }
      }
    });

    return result ?? false;
  },

  // Clear undo/redo stacks (called on sync/reload)
  clearUndoHistory() {
    undoStack = [];
    redoStack = [];
  },

  // Check if there are any completed items in the document
  hasCompletedItems(): boolean {
    return nodes.some(n => n.is_checked);
  },

  // Delete all completed items in the document
  // Returns the count of items deleted
  async deleteAllCompleted(): Promise<number> {
    // Find all completed items (is_checked = true)
    const completedNodes = nodes.filter(n => n.is_checked);

    if (completedNodes.length === 0) return 0;

    // Ensure at least one node remains after deletion
    const remainingCount = nodes.length - completedNodes.length;
    if (remainingCount <= 0) {
      // Can't delete all nodes - need at least one
      return 0;
    }

    // Get IDs to delete (we'll delete in reverse order of position to maintain tree integrity)
    const idsToDelete = completedNodes.map(n => n.id);

    // If focused node is being deleted, find a new focus target
    let newFocusId: string | null = null;
    if (focusedId && idsToDelete.includes(focusedId)) {
      const visible = this.getVisibleNodes();
      const focusedIdx = visible.findIndex(n => n.id === focusedId);
      // Find first non-deleted node after or before the focused one
      for (let i = focusedIdx + 1; i < visible.length; i++) {
        if (!idsToDelete.includes(visible[i].id)) {
          newFocusId = visible[i].id;
          break;
        }
      }
      if (!newFocusId) {
        for (let i = focusedIdx - 1; i >= 0; i--) {
          if (!idsToDelete.includes(visible[i].id)) {
            newFocusId = visible[i].id;
            break;
          }
        }
      }
    }

    const result = await withOperation(async () => {
      // Delete each completed node
      for (const id of idsToDelete) {
        await api.deleteNode(id);
      }

      // Reload state after all deletions
      const state = await api.loadDocument();
      updateFromState(state);

      // Update focus
      if (newFocusId) {
        focusedId = newFocusId;
      }

      return idsToDelete.length;
    });

    return result ?? 0;
  },

  // Export selected nodes (or focused node) to markdown file
  async exportSelection(includeCompletedChildren: boolean = true): Promise<boolean> {
    // Get nodes to export: either selected nodes or focused node
    let nodeIds: string[] = [];
    if (selectedIds.size > 0) {
      nodeIds = Array.from(selectedIds);
    } else if (focusedId) {
      nodeIds = [focusedId];
    }

    if (nodeIds.length === 0) {
      return false;
    }

    try {
      // Get markdown content from backend
      const markdown = await api.exportSelectionMarkdown(nodeIds, includeCompletedChildren);

      // Generate suggested filename based on first selected node's content
      const firstNode = nodesById().get(nodeIds[0]);
      let suggestedName = 'export';
      if (firstNode) {
        // Strip HTML and use first 30 chars of content
        const plainText = stripHtml(firstNode.content);
        if (plainText) {
          suggestedName = plainText.slice(0, 30).replace(/[^a-zA-Z0-9\s-]/g, '').trim();
        }
      }
      if (nodeIds.length > 1) {
        suggestedName += ` (+${nodeIds.length - 1} more)`;
      }
      suggestedName += '.md';

      // Open save dialog and write file
      const savedPath = await api.saveToFileWithDialog(markdown, suggestedName, 'md');
      return savedPath !== null;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }
};

// Expose to window for dev testing
if (typeof window !== 'undefined') {
  (window as any).outline = outline;
}
