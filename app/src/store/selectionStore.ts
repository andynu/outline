import { create } from 'zustand';
import type { Node, DocumentState, UndoAction } from '../lib/types';
import * as api from '../lib/api';
import { useOutlineStore } from './outlineStore';

interface SelectionState {
  // State
  selectedIds: Set<string>;
  _selectionAnchorId: string | null;

  // Selection management
  isSelected: (nodeId: string) => boolean;
  toggleSelection: (nodeId: string) => void;
  selectRange: (toId: string) => void;
  clearSelection: () => void;
  selectAll: () => void;
  selectSiblings: () => void;
  selectChildren: () => void;
  invertSelection: () => void;
  getSelectedNodes: () => Node[];
  extendSelection: (direction: 'up' | 'down') => void;

  // Bulk operations on selection
  deleteSelectedNodes: () => Promise<string | null>;
  toggleSelectedCheckboxes: () => Promise<boolean>;
  completeSelectedNodes: () => Promise<boolean>;
  uncompleteSelectedNodes: () => Promise<boolean>;
  convertSelectedToCheckbox: () => Promise<boolean>;
  convertSelectedToBullet: () => Promise<boolean>;
  convertSelectedToNumbered: () => Promise<boolean>;
  indentSelectedNodes: () => Promise<boolean>;
  outdentSelectedNodes: () => Promise<boolean>;
  moveSelectedToTop: () => Promise<boolean>;
  moveSelectedToBottom: () => Promise<boolean>;
  copySelectedAsMarkdown: () => Promise<boolean>;
  copySelectedAsPlainText: () => Promise<boolean>;
  copyTreeAsMarkdown: (nodeId: string) => Promise<boolean>;
  copyTreeAsPlainText: (nodeId: string) => Promise<boolean>;
  exportSelectedToFile: () => Promise<boolean>;
  exportSelectedToFilePlainText: () => Promise<boolean>;
  exportSelection: () => Promise<boolean>;
  groupSelectedUnderNewParent: () => Promise<string | null>;
  setSelectedNodesColor: (color: string) => Promise<boolean>;

  // Sort selected nodes
  _reorderSelectedNodes: (sortedNodes: Node[]) => Promise<boolean>;
  sortSelectedAlphabetical: () => Promise<boolean>;
  sortSelectedReverseAlphabetical: () => Promise<boolean>;
  sortSelectedByDate: () => Promise<boolean>;
  sortSelectedByDateReverse: () => Promise<boolean>;
  sortSelectedByCompletion: () => Promise<boolean>;
  reverseSelectedOrder: () => Promise<boolean>;

  // Sort children of a specific node
  _reorderChildren: (parentId: string, sortedNodes: Node[]) => Promise<boolean>;
  sortChildrenByTitle: (parentId: string) => Promise<boolean>;
  sortChildrenByTitleReverse: (parentId: string) => Promise<boolean>;
  sortChildrenByDate: (parentId: string) => Promise<boolean>;
  sortChildrenByDateReverse: (parentId: string) => Promise<boolean>;
  sortChildrenByUpdated: (parentId: string) => Promise<boolean>;
  sortChildrenByUpdatedReverse: (parentId: string) => Promise<boolean>;
  sortChildrenByCreated: (parentId: string) => Promise<boolean>;
  sortChildrenByCreatedReverse: (parentId: string) => Promise<boolean>;
}

// Helper to access the outline store
const outline = () => useOutlineStore.getState();

export const useSelectionStore = create<SelectionState>((set, get) => ({
  selectedIds: new Set<string>(),
  _selectionAnchorId: null,

  // === Selection Management ===

  isSelected: (nodeId: string) => get().selectedIds.has(nodeId),

  toggleSelection: (nodeId: string) => {
    const { selectedIds } = get();
    const newSet = new Set(selectedIds);
    if (newSet.has(nodeId)) {
      newSet.delete(nodeId);
    } else {
      newSet.add(nodeId);
    }
    set({ selectedIds: newSet });
    useOutlineStore.setState({ focusedId: nodeId });
  },

  selectRange: (toId: string) => {
    const focusedId = outline().focusedId;
    const visible = outline().getVisibleNodes();

    if (!focusedId) {
      set({ selectedIds: new Set([toId]) });
      useOutlineStore.setState({ focusedId: toId });
      return;
    }

    const fromIdx = visible.findIndex(n => n.id === focusedId);
    const toIdx = visible.findIndex(n => n.id === toId);

    if (fromIdx < 0 || toIdx < 0) {
      set({ selectedIds: new Set([toId]) });
      useOutlineStore.setState({ focusedId: toId });
      return;
    }

    const startIdx = Math.min(fromIdx, toIdx);
    const endIdx = Math.max(fromIdx, toIdx);
    const newSet = new Set<string>();
    for (let i = startIdx; i <= endIdx; i++) {
      newSet.add(visible[i].id);
    }
    set({ selectedIds: newSet });
    useOutlineStore.setState({ focusedId: toId });
  },

  clearSelection: () => {
    const { selectedIds } = get();
    if (selectedIds.size > 0) {
      set({ selectedIds: new Set<string>(), _selectionAnchorId: null });
    }
  },

  selectAll: () => {
    const visible = outline().getVisibleNodes();
    set({ selectedIds: new Set(visible.map(n => n.id)) });
  },

  selectSiblings: () => {
    const { selectedIds } = get();
    const { focusedId, getSiblings, getVisibleNodes } = outline();
    const visible = getVisibleNodes();
    const visibleIds = new Set(visible.map(n => n.id));

    let targetIds: string[] = [];
    if (selectedIds.size > 0) {
      targetIds = Array.from(selectedIds);
    } else if (focusedId) {
      targetIds = [focusedId];
    }

    if (targetIds.length === 0) return;

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
    const { selectedIds } = get();
    if (selectedIds.size === 0) return;

    const { childrenOf, getVisibleNodes } = outline();
    const visible = getVisibleNodes();
    const visibleIds = new Set(visible.map(n => n.id));

    const newSelection = new Set<string>(selectedIds);
    const addChildren = (nodeId: string) => {
      const children = childrenOf(nodeId);
      for (const child of children) {
        if (visibleIds.has(child.id)) {
          newSelection.add(child.id);
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
    const { selectedIds } = get();
    const visible = outline().getVisibleNodes();

    const newSelection = new Set<string>();
    for (const node of visible) {
      if (!selectedIds.has(node.id)) {
        newSelection.add(node.id);
      }
    }

    set({ selectedIds: newSelection });
  },

  getSelectedNodes: () => {
    const { selectedIds } = get();
    if (selectedIds.size === 0) return [];
    const visible = outline().getVisibleNodes();
    return visible.filter(n => selectedIds.has(n.id));
  },

  extendSelection: (direction: 'up' | 'down') => {
    const { _selectionAnchorId } = get();
    const { focusedId, getVisibleNodes } = outline();
    if (!focusedId) return;

    const visible = getVisibleNodes();
    const focusIdx = visible.findIndex(n => n.id === focusedId);
    if (focusIdx < 0) return;

    const anchorId = _selectionAnchorId ?? focusedId;
    const anchorIdx = visible.findIndex(n => n.id === anchorId);
    if (anchorIdx < 0) return;

    const newFocusIdx = direction === 'up'
      ? Math.max(0, focusIdx - 1)
      : Math.min(visible.length - 1, focusIdx + 1);

    if (newFocusIdx === focusIdx) return;

    const newFocusId = visible[newFocusIdx].id;

    const startIdx = Math.min(anchorIdx, newFocusIdx);
    const endIdx = Math.max(anchorIdx, newFocusIdx);
    const newSet = new Set<string>();
    for (let i = startIdx; i <= endIdx; i++) {
      newSet.add(visible[i].id);
    }

    set({ selectedIds: newSet, _selectionAnchorId: anchorId });
    useOutlineStore.setState({ focusedId: newFocusId });
  },

  // === Bulk Operations on Selection ===

  deleteSelectedNodes: async () => {
    const { getSelectedNodes } = get();
    const { getVisibleNodes, updateFromState } = outline();
    const selected = getSelectedNodes();
    if (selected.length === 0) return null;

    const visible = getVisibleNodes();

    const remainingCount = visible.length - selected.length;
    if (remainingCount <= 0) return null;

    const selectedSet = new Set(selected.map(n => n.id));
    let newFocusId: string | null = null;
    for (const node of visible) {
      if (!selectedSet.has(node.id)) {
        newFocusId = node.id;
      }
    }

    useOutlineStore.setState(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      const sortedSelected = [...selected].reverse();
      for (const node of sortedSelected) {
        await api.deleteNode(node.id);
      }

      const state = await api.loadDocument();
      updateFromState(state);

      set({ selectedIds: new Set<string>() });
      useOutlineStore.setState({ focusedId: newFocusId });

      return newFocusId;
    } catch (e) {
      useOutlineStore.setState({ error: e instanceof Error ? e.message : String(e) });
      return null;
    } finally {
      useOutlineStore.setState(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  toggleSelectedCheckboxes: async () => {
    const selected = get().getSelectedNodes();
    if (selected.length === 0) return false;

    useOutlineStore.setState(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      const anyUnchecked = selected.some(n => n.node_type !== 'checkbox' || !n.is_checked);
      const newState = anyUnchecked;

      for (const node of selected) {
        await api.updateNode(node.id, {
          node_type: 'checkbox',
          is_checked: newState
        });
      }

      const state = await api.loadDocument();
      outline().updateFromState(state);

      return true;
    } catch (e) {
      useOutlineStore.setState({ error: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      useOutlineStore.setState(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  completeSelectedNodes: async () => {
    const selected = get().getSelectedNodes();
    if (selected.length === 0) return false;

    useOutlineStore.setState(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      for (const node of selected) {
        await api.updateNode(node.id, {
          node_type: 'checkbox',
          is_checked: true
        });
      }

      const state = await api.loadDocument();
      outline().updateFromState(state);

      return true;
    } catch (e) {
      useOutlineStore.setState({ error: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      useOutlineStore.setState(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  uncompleteSelectedNodes: async () => {
    const selected = get().getSelectedNodes();
    if (selected.length === 0) return false;

    useOutlineStore.setState(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      for (const node of selected) {
        if (node.node_type === 'checkbox') {
          await api.updateNode(node.id, { is_checked: false });
        }
      }

      const state = await api.loadDocument();
      outline().updateFromState(state);

      return true;
    } catch (e) {
      useOutlineStore.setState({ error: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      useOutlineStore.setState(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  convertSelectedToCheckbox: async () => {
    const selected = get().getSelectedNodes();
    if (selected.length === 0) return false;

    useOutlineStore.setState(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      for (const node of selected) {
        if (node.node_type !== 'checkbox') {
          await api.updateNode(node.id, {
            node_type: 'checkbox',
            is_checked: false
          });
        }
      }

      const state = await api.loadDocument();
      outline().updateFromState(state);

      return true;
    } catch (e) {
      useOutlineStore.setState({ error: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      useOutlineStore.setState(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  convertSelectedToBullet: async () => {
    const selected = get().getSelectedNodes();
    if (selected.length === 0) return false;

    useOutlineStore.setState(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      for (const node of selected) {
        if (node.node_type !== 'bullet') {
          await api.updateNode(node.id, {
            node_type: 'bullet',
            is_checked: false
          });
        }
      }

      const state = await api.loadDocument();
      outline().updateFromState(state);

      return true;
    } catch (e) {
      useOutlineStore.setState({ error: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      useOutlineStore.setState(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  convertSelectedToNumbered: async () => {
    const selected = get().getSelectedNodes();
    if (selected.length === 0) return false;

    useOutlineStore.setState(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      for (const node of selected) {
        if (node.node_type !== 'numbered') {
          await api.updateNode(node.id, {
            node_type: 'numbered',
            is_checked: false
          });
        }
      }

      const state = await api.loadDocument();
      outline().updateFromState(state);

      return true;
    } catch (e) {
      useOutlineStore.setState({ error: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      useOutlineStore.setState(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  indentSelectedNodes: async () => {
    const { getSelectedNodes, selectedIds } = get();
    const selected = getSelectedNodes();
    if (selected.length === 0) return false;

    const { getSiblings, childrenOf, updateFromState } = outline();

    useOutlineStore.setState(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      for (const node of selected) {
        const siblings = getSiblings(node.id);
        const idx = siblings.findIndex(n => n.id === node.id);

        if (idx === 0) continue;

        const newParent = siblings[idx - 1];
        if (selectedIds.has(newParent.id)) continue;

        const newPosition = childrenOf(newParent.id).length;
        await api.moveNode(node.id, newParent.id, newPosition);

        if (newParent.collapsed) {
          await api.updateNode(newParent.id, { collapsed: false });
        }
      }

      const state = await api.loadDocument();
      updateFromState(state);

      return true;
    } catch (e) {
      useOutlineStore.setState({ error: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      useOutlineStore.setState(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  outdentSelectedNodes: async () => {
    const selected = get().getSelectedNodes();
    if (selected.length === 0) return false;

    const { getParent, rootNodes, childrenOf, updateFromState } = outline();

    useOutlineStore.setState(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      const reversed = [...selected].reverse();
      for (const node of reversed) {
        if (!node.parent_id) continue;

        const parent = getParent(node.id);
        if (!parent) continue;

        const grandparentChildren = parent.parent_id === null
          ? rootNodes()
          : childrenOf(parent.parent_id);
        const parentIdx = grandparentChildren.findIndex(n => n.id === parent.id);
        const newPosition = parentIdx + 1;

        await api.moveNode(node.id, parent.parent_id, newPosition);
      }

      const state = await api.loadDocument();
      updateFromState(state);

      return true;
    } catch (e) {
      useOutlineStore.setState({ error: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      useOutlineStore.setState(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  moveSelectedToTop: async () => {
    const selected = get().getSelectedNodes();
    if (selected.length === 0) return false;

    useOutlineStore.setState(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      const nodesByParent = new Map<string | null, typeof selected>();
      for (const node of selected) {
        const parentId = node.parent_id;
        if (!nodesByParent.has(parentId)) {
          nodesByParent.set(parentId, []);
        }
        nodesByParent.get(parentId)!.push(node);
      }

      const batchNow = new Date().toISOString();
      const allOps: Array<{ op: 'move'; id: string; parent_id: string | null; position: number; updated_at: string }> = [];
      for (const [parentId, nodes] of nodesByParent) {
        nodes.sort((a, b) => a.position - b.position);

        for (let i = nodes.length - 1; i >= 0; i--) {
          allOps.push({ op: 'move', id: nodes[i].id, parent_id: parentId, position: 0, updated_at: batchNow });
        }
      }
      if (allOps.length > 0) {
        await api.saveOps(allOps);
      }

      const state = await api.loadDocument();
      outline().updateFromState(state);

      return true;
    } catch (e) {
      useOutlineStore.setState({ error: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      useOutlineStore.setState(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  moveSelectedToBottom: async () => {
    const selected = get().getSelectedNodes();
    if (selected.length === 0) return false;

    const { rootNodes, childrenOf, updateFromState } = outline();

    useOutlineStore.setState(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      const nodesByParent = new Map<string | null, typeof selected>();
      for (const node of selected) {
        const parentId = node.parent_id;
        if (!nodesByParent.has(parentId)) {
          nodesByParent.set(parentId, []);
        }
        nodesByParent.get(parentId)!.push(node);
      }

      for (const [parentId, nodes] of nodesByParent) {
        nodes.sort((a, b) => a.position - b.position);

        const siblings = parentId === null ? rootNodes() : childrenOf(parentId);
        let bottomPosition = siblings.length;

        const batchNow = new Date().toISOString();
        const moveOps = nodes.map((node, i) => ({
          op: 'move' as const,
          id: node.id,
          parent_id: parentId,
          position: bottomPosition + i,
          updated_at: batchNow,
        }));
        if (moveOps.length > 0) {
          await api.saveOps(moveOps);
        }
      }

      const state = await api.loadDocument();
      updateFromState(state);

      return true;
    } catch (e) {
      useOutlineStore.setState({ error: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      useOutlineStore.setState(s => ({ pendingOperations: s.pendingOperations - 1 }));
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
      useOutlineStore.setState({ error: e instanceof Error ? e.message : String(e) });
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
      useOutlineStore.setState({ error: e instanceof Error ? e.message : String(e) });
      return false;
    }
  },

  copyTreeAsMarkdown: async (nodeId: string) => {
    try {
      const markdown = await api.exportSelectionMarkdown([nodeId], true);
      await navigator.clipboard.writeText(markdown);
      return true;
    } catch (e) {
      useOutlineStore.setState({ error: e instanceof Error ? e.message : String(e) });
      return false;
    }
  },

  copyTreeAsPlainText: async (nodeId: string) => {
    try {
      const plainText = await api.exportSelectionPlainText([nodeId], true);
      await navigator.clipboard.writeText(plainText);
      return true;
    } catch (e) {
      useOutlineStore.setState({ error: e instanceof Error ? e.message : String(e) });
      return false;
    }
  },

  exportSelectedToFile: async () => {
    const { selectedIds } = get();
    if (selectedIds.size === 0) return false;

    try {
      const nodeIds = Array.from(selectedIds);
      const markdown = await api.exportSelectionMarkdown(nodeIds, true);

      const firstNodeId = nodeIds[0];
      const firstNode = outline().nodes.find(n => n.id === firstNodeId);
      let suggestedName = 'export';
      if (firstNode) {
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
      useOutlineStore.setState({ error: e instanceof Error ? e.message : String(e) });
      return false;
    }
  },

  exportSelectedToFilePlainText: async () => {
    const { selectedIds } = get();
    if (selectedIds.size === 0) return false;

    try {
      const nodeIds = Array.from(selectedIds);
      const plainText = await api.exportSelectionPlainText(nodeIds, true);

      const firstNodeId = nodeIds[0];
      const firstNode = outline().nodes.find(n => n.id === firstNodeId);
      let suggestedName = 'export';
      if (firstNode) {
        const text = firstNode.content
          .replace(/<[^>]*>/g, '')
          .replace(/[^a-zA-Z0-9 ]/g, '')
          .trim()
          .substring(0, 30);
        if (text) {
          suggestedName = text.replace(/\s+/g, '_');
        }
      }

      await api.saveToFileWithDialog(plainText, `${suggestedName}.txt`, 'txt');
      return true;
    } catch (e) {
      useOutlineStore.setState({ error: e instanceof Error ? e.message : String(e) });
      return false;
    }
  },

  exportSelection: async () => {
    const { selectedIds } = get();
    const focusedId = outline().focusedId;

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
      useOutlineStore.setState({ error: e instanceof Error ? e.message : String(e) });
      return false;
    }
  },

  groupSelectedUnderNewParent: async () => {
    const { selectedIds } = get();
    if (selectedIds.size === 0) return null;

    const { getNode, updateFromState, _pushUndo, setFocusedId } = outline();

    const selectedNodes = Array.from(selectedIds)
      .map(id => getNode(id))
      .filter((n): n is Node => n !== undefined)
      .sort((a, b) => a.position - b.position);

    if (selectedNodes.length === 0) return null;

    const parentId = selectedNodes[0].parent_id;
    const allSameParent = selectedNodes.every(n => n.parent_id === parentId);
    if (!allSameParent) return null;

    const firstPosition = selectedNodes[0].position;

    useOutlineStore.setState(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      const { id: newParentId, state: newParentState } = await api.createNode(parentId, firstPosition, '');
      updateFromState(newParentState);

      const batchNow = new Date().toISOString();
      const moveOps = selectedNodes.map((node, i) => ({
        op: 'move' as const,
        id: node.id,
        parent_id: newParentId,
        position: i,
        updated_at: batchNow,
      }));
      const lastState = moveOps.length > 0
        ? await api.saveOps(moveOps)
        : newParentState;

      updateFromState(lastState);

      set({ selectedIds: new Set<string>() });
      setFocusedId(newParentId);

      const newParentNode = lastState.nodes.find(n => n.id === newParentId);
      if (newParentNode) {
        _pushUndo({
          description: 'Group items under new parent',
          undo: { type: 'delete', id: newParentId },
          redo: { type: 'create', node: { ...newParentNode, parent_id: parentId, position: firstPosition } },
          timestamp: Date.now(),
        });
      }

      return newParentId;
    } catch (e) {
      useOutlineStore.setState({ error: e instanceof Error ? e.message : String(e) });
      return null;
    } finally {
      useOutlineStore.setState(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  setSelectedNodesColor: async (color: string) => {
    const selected = get().getSelectedNodes();
    if (selected.length === 0) return false;

    const { updateFromState, _pushUndo } = outline();

    useOutlineStore.setState(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      const undoActions: UndoAction[] = [];
      const redoActions: UndoAction[] = [];
      let lastState: DocumentState | undefined;

      for (const node of selected) {
        const oldColor = node.color || '';
        if (oldColor === color) continue;

        lastState = await api.updateNode(node.id, { color });
        undoActions.push({ type: 'update', id: node.id, changes: { color: oldColor } });
        redoActions.push({ type: 'update', id: node.id, changes: { color } });
      }

      if (lastState) {
        updateFromState(lastState);
        _pushUndo({
          description: color ? `Set color to ${color} (${selected.length} items)` : `Clear color (${selected.length} items)`,
          undo: { type: 'batch', actions: undoActions },
          redo: { type: 'batch', actions: redoActions },
          timestamp: Date.now(),
        });
      }

      return true;
    } catch (e) {
      useOutlineStore.setState({ error: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      useOutlineStore.setState(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  // === Sort Selected Nodes ===

  _reorderSelectedNodes: async (sortedNodes: Node[]): Promise<boolean> => {
    if (sortedNodes.length === 0) return false;

    const originalPositions = sortedNodes.map(n => n.position).sort((a, b) => a - b);

    useOutlineStore.setState(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      const batchNow = new Date().toISOString();
      const moveOps = sortedNodes
        .map((node, i) => ({ node, newPosition: originalPositions[i] }))
        .filter(({ node, newPosition }) => node.position !== newPosition)
        .map(({ node, newPosition }) => ({
          op: 'move' as const,
          id: node.id,
          parent_id: node.parent_id,
          position: newPosition,
          updated_at: batchNow,
        }));

      if (moveOps.length > 0) {
        const lastState = await api.saveOps(moveOps);
        outline().updateFromState(lastState);
      }
      return true;
    } catch (e) {
      useOutlineStore.setState({ error: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      useOutlineStore.setState(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  sortSelectedAlphabetical: async () => {
    const { selectedIds, _reorderSelectedNodes } = get();
    if (selectedIds.size === 0) return false;

    const selectedNodes = Array.from(selectedIds)
      .map(id => outline().getNode(id))
      .filter((n): n is Node => n !== undefined);

    const parentId = selectedNodes[0]?.parent_id;
    if (!selectedNodes.every(n => n.parent_id === parentId)) return false;

    const sorted = [...selectedNodes].sort((a, b) => {
      const textA = a.content.replace(/<[^>]+>/g, '').toLowerCase();
      const textB = b.content.replace(/<[^>]+>/g, '').toLowerCase();
      return textA.localeCompare(textB);
    });

    return _reorderSelectedNodes(sorted);
  },

  sortSelectedReverseAlphabetical: async () => {
    const { selectedIds, _reorderSelectedNodes } = get();
    if (selectedIds.size === 0) return false;

    const selectedNodes = Array.from(selectedIds)
      .map(id => outline().getNode(id))
      .filter((n): n is Node => n !== undefined);

    const parentId = selectedNodes[0]?.parent_id;
    if (!selectedNodes.every(n => n.parent_id === parentId)) return false;

    const sorted = [...selectedNodes].sort((a, b) => {
      const textA = a.content.replace(/<[^>]+>/g, '').toLowerCase();
      const textB = b.content.replace(/<[^>]+>/g, '').toLowerCase();
      return textB.localeCompare(textA);
    });

    return _reorderSelectedNodes(sorted);
  },

  sortSelectedByDate: async () => {
    const { selectedIds, _reorderSelectedNodes } = get();
    if (selectedIds.size === 0) return false;

    const selectedNodes = Array.from(selectedIds)
      .map(id => outline().getNode(id))
      .filter((n): n is Node => n !== undefined);

    const parentId = selectedNodes[0]?.parent_id;
    if (!selectedNodes.every(n => n.parent_id === parentId)) return false;

    const sorted = [...selectedNodes].sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.localeCompare(b.date);
    });

    return _reorderSelectedNodes(sorted);
  },

  sortSelectedByDateReverse: async () => {
    const { selectedIds, _reorderSelectedNodes } = get();
    if (selectedIds.size === 0) return false;

    const selectedNodes = Array.from(selectedIds)
      .map(id => outline().getNode(id))
      .filter((n): n is Node => n !== undefined);

    const parentId = selectedNodes[0]?.parent_id;
    if (!selectedNodes.every(n => n.parent_id === parentId)) return false;

    const sorted = [...selectedNodes].sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return b.date.localeCompare(a.date);
    });

    return _reorderSelectedNodes(sorted);
  },

  sortSelectedByCompletion: async () => {
    const { selectedIds, _reorderSelectedNodes } = get();
    if (selectedIds.size === 0) return false;

    const selectedNodes = Array.from(selectedIds)
      .map(id => outline().getNode(id))
      .filter((n): n is Node => n !== undefined);

    const parentId = selectedNodes[0]?.parent_id;
    if (!selectedNodes.every(n => n.parent_id === parentId)) return false;

    const sorted = [...selectedNodes].sort((a, b) => {
      const aChecked = a.is_checked && a.node_type === 'checkbox' ? 1 : 0;
      const bChecked = b.is_checked && b.node_type === 'checkbox' ? 1 : 0;
      return aChecked - bChecked;
    });

    return _reorderSelectedNodes(sorted);
  },

  reverseSelectedOrder: async () => {
    const { selectedIds, _reorderSelectedNodes } = get();
    if (selectedIds.size === 0) return false;

    const selectedNodes = Array.from(selectedIds)
      .map(id => outline().getNode(id))
      .filter((n): n is Node => n !== undefined);

    const parentId = selectedNodes[0]?.parent_id;
    if (!selectedNodes.every(n => n.parent_id === parentId)) return false;

    const sortedByPosition = [...selectedNodes].sort((a, b) => a.position - b.position);
    const reversed = sortedByPosition.reverse();

    return _reorderSelectedNodes(reversed);
  },

  // === Sort Children of a Specific Node ===

  _reorderChildren: async (parentId: string, sortedNodes: Node[]): Promise<boolean> => {
    if (sortedNodes.length === 0) return false;

    const originalPositions = sortedNodes.map(n => n.position).sort((a, b) => a - b);

    useOutlineStore.setState(s => ({ pendingOperations: s.pendingOperations + 1 }));
    try {
      let lastState: DocumentState | null = null;

      for (let i = 0; i < sortedNodes.length; i++) {
        const node = sortedNodes[i];
        const newPosition = originalPositions[i];
        if (node.position !== newPosition) {
          lastState = await api.moveNode(node.id, node.parent_id, newPosition);
        }
      }

      if (lastState) {
        outline().updateFromState(lastState);
      }
      return true;
    } catch (e) {
      useOutlineStore.setState({ error: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      useOutlineStore.setState(s => ({ pendingOperations: s.pendingOperations - 1 }));
    }
  },

  sortChildrenByTitle: async (parentId: string) => {
    const children = outline().childrenOf(parentId);
    if (children.length === 0) return false;

    const sorted = [...children].sort((a, b) => {
      const textA = a.content.replace(/<[^>]+>/g, '').toLowerCase();
      const textB = b.content.replace(/<[^>]+>/g, '').toLowerCase();
      return textA.localeCompare(textB);
    });

    return get()._reorderChildren(parentId, sorted);
  },

  sortChildrenByTitleReverse: async (parentId: string) => {
    const children = outline().childrenOf(parentId);
    if (children.length === 0) return false;

    const sorted = [...children].sort((a, b) => {
      const textA = a.content.replace(/<[^>]+>/g, '').toLowerCase();
      const textB = b.content.replace(/<[^>]+>/g, '').toLowerCase();
      return textB.localeCompare(textA);
    });

    return get()._reorderChildren(parentId, sorted);
  },

  sortChildrenByDate: async (parentId: string) => {
    const children = outline().childrenOf(parentId);
    if (children.length === 0) return false;

    const sorted = [...children].sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return b.date.localeCompare(a.date);
    });

    return get()._reorderChildren(parentId, sorted);
  },

  sortChildrenByDateReverse: async (parentId: string) => {
    const children = outline().childrenOf(parentId);
    if (children.length === 0) return false;

    const sorted = [...children].sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.localeCompare(b.date);
    });

    return get()._reorderChildren(parentId, sorted);
  },

  sortChildrenByUpdated: async (parentId: string) => {
    const children = outline().childrenOf(parentId);
    if (children.length === 0) return false;

    const sorted = [...children].sort((a, b) => {
      return b.updated_at.localeCompare(a.updated_at);
    });

    return get()._reorderChildren(parentId, sorted);
  },

  sortChildrenByUpdatedReverse: async (parentId: string) => {
    const children = outline().childrenOf(parentId);
    if (children.length === 0) return false;

    const sorted = [...children].sort((a, b) => {
      return a.updated_at.localeCompare(b.updated_at);
    });

    return get()._reorderChildren(parentId, sorted);
  },

  sortChildrenByCreated: async (parentId: string) => {
    const children = outline().childrenOf(parentId);
    if (children.length === 0) return false;

    const sorted = [...children].sort((a, b) => {
      return b.created_at.localeCompare(a.created_at);
    });

    return get()._reorderChildren(parentId, sorted);
  },

  sortChildrenByCreatedReverse: async (parentId: string) => {
    const children = outline().childrenOf(parentId);
    if (children.length === 0) return false;

    const sorted = [...children].sort((a, b) => {
      return a.created_at.localeCompare(b.created_at);
    });

    return get()._reorderChildren(parentId, sorted);
  },
}));
