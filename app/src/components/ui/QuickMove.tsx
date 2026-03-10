import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useOutlineStore } from '../../store/outlineStore';
import { useSelectionStore } from '../../store/selectionStore';
import { showToast } from '../../store/toastStore';
import { buildAncestryIndex, searchAncestryIndex } from '../../lib/ancestrySearch';
import type { AncestrySearchResult } from '../../lib/ancestrySearch';
import { stripHtml } from '../../lib/utils';

interface QuickMoveProps {
  isOpen: boolean;
  onClose: () => void;
  bulkMode?: boolean; // When true, move all selected nodes instead of focused node
}

export function QuickMove({ isOpen, onClose, bulkMode = false }: QuickMoveProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AncestrySearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [moving, setMoving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Get store state and actions
  const focusedId = useOutlineStore(state => state.focusedId);
  const nodes = useOutlineStore(state => state.nodes);
  const getNode = useOutlineStore(state => state.getNode);
  const moveNodeTo = useOutlineStore(state => state.moveNodeTo);
  const getSelectedNodes = useSelectionStore(state => state.getSelectedNodes);
  const selectedIds = useSelectionStore(state => state.selectedIds);
  const clearSelection = useSelectionStore(state => state.clearSelection);

  // Build ancestry index once when modal opens or nodes change while open
  const ancestryIndex = useMemo(() => {
    if (!isOpen) return [];
    return buildAncestryIndex(nodes);
  }, [isOpen, nodes]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Search when query changes using ancestry-aware search
  useEffect(() => {
    if (query.trim().length === 0) {
      setResults([]);
      setSelectedIndex(0);
      return;
    }

    // Build exclusion set: don't show the node being moved (or its descendants) as targets
    const excludeIds = new Set<string>();
    if (bulkMode && selectedIds.size > 0) {
      const selected = getSelectedNodes();
      for (const n of selected) {
        if (n) excludeIds.add(n.id);
      }
    } else if (focusedId) {
      excludeIds.add(focusedId);
    }

    // Debounce the search slightly for responsiveness
    const timeoutId = setTimeout(() => {
      const searchResults = searchAncestryIndex(ancestryIndex, query, 30, excludeIds);
      setResults(searchResults);
      setSelectedIndex(0);
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [query, ancestryIndex, focusedId, bulkMode, selectedIds, getSelectedNodes]);

  // Scroll selected result into view
  useEffect(() => {
    if (results.length > 0) {
      const element = document.querySelector(`[data-move-index="${selectedIndex}"]`);
      element?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, results.length]);

  const handleClose = useCallback(() => {
    setQuery('');
    setResults([]);
    setSelectedIndex(0);
    onClose();
  }, [onClose]);

  const moveToNode = useCallback(async (targetNodeId: string) => {
    // Determine which nodes to move
    const nodesToMove = bulkMode && selectedIds.size > 0
      ? getSelectedNodes()
      : focusedId ? [getNode(focusedId)].filter(Boolean) : [];

    if (nodesToMove.length === 0) {
      handleClose();
      return;
    }

    // Don't allow moving a node to itself or its descendant
    const isDescendant = (nodeId: string, ancestorIds: Set<string>): boolean => {
      let current = getNode(nodeId);
      while (current?.parent_id) {
        if (ancestorIds.has(current.parent_id)) return true;
        current = getNode(current.parent_id);
      }
      return false;
    };

    // Check if target is one of the nodes being moved or a descendant
    const moveNodeIds = new Set(nodesToMove.map(n => n!.id));
    if (moveNodeIds.has(targetNodeId) || isDescendant(targetNodeId, moveNodeIds)) {
      console.warn('Cannot move nodes to themselves or their descendants');
      handleClose();
      return;
    }

    setMoving(true);
    try {
      // Get current children count of target
      const targetChildren = nodes.filter(n => n.parent_id === targetNodeId);
      let newPosition = targetChildren.length;

      // Move nodes in order - this maintains their relative ordering
      for (const node of nodesToMove) {
        if (!node) continue;
        await moveNodeTo(node.id, targetNodeId, newPosition);
        newPosition++;
      }

      // Clear selection after bulk move
      if (bulkMode) {
        clearSelection();
      }

      handleClose();
    } catch (e) {
      console.error('Failed to move node(s):', e);
      showToast('Failed to move item');
    } finally {
      setMoving(false);
    }
  }, [focusedId, bulkMode, selectedIds, getSelectedNodes, nodes, moveNodeTo, handleClose, getNode, clearSelection]);

  const selectCurrent = useCallback(() => {
    const result = results[selectedIndex];
    if (result) {
      moveToNode(result.node_id);
    }
  }, [results, selectedIndex, moveToNode]);

  // Keyboard handler
  useEffect(() => {
    if (!isOpen) return;

    const handleKeydown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
          break;
        case 'ArrowUp':
          event.preventDefault();
          setSelectedIndex(prev => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          event.preventDefault();
          selectCurrent();
          break;
        case 'Escape':
          event.preventDefault();
          handleClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [isOpen, results.length, selectCurrent, handleClose]);

  const handleBackdropClick = useCallback((event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      handleClose();
    }
  }, [handleClose]);

  // Get source node content for display
  const getSourceNodeContent = useCallback((): string => {
    if (bulkMode && selectedIds.size > 0) {
      const selected = getSelectedNodes();
      if (selected.length === 0) return '';
      if (selected.length === 1) {
        const text = stripHtml(selected[0].content);
        return text.length > 40 ? text.substring(0, 40) + '...' : text;
      }
      return `${selected.length} items`;
    }
    if (!focusedId) return '';
    const node = getNode(focusedId);
    if (!node) return '';
    const text = stripHtml(node.content);
    return text.length > 40 ? text.substring(0, 40) + '...' : text;
  }, [focusedId, bulkMode, selectedIds, getNode, getSelectedNodes]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal quick-move-modal">
        <div className="header-info">
          <span className="move-label">Move:</span>
          <span className="source-node">{getSourceNodeContent()}</span>
        </div>

        <div className="search-input-wrapper">
          <svg className="mode-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 9l7 7 7-7" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="search-input"
            placeholder="Move to... (use spaces for path search)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={moving}
          />
          {moving && <span className="loading-indicator">Moving...</span>}
        </div>

        <div className="results" role="listbox">
          {results.length === 0 && query.trim().length > 0 ? (
            <div className="no-results">No items found</div>
          ) : results.length === 0 && query.trim().length === 0 ? (
            <div className="hint-text">Search for a destination node...</div>
          ) : (
            results.map((result, index) => (
              <div
                key={result.node_id}
                className={`result ${index === selectedIndex ? 'selected' : ''}`}
                data-move-index={index}
                role="option"
                aria-selected={index === selectedIndex}
                onClick={() => moveToNode(result.node_id)}
              >
                <div className="result-content">
                  {result.content}
                </div>
                {result.breadcrumbSegments.length > 1 && (
                  <div className="result-breadcrumb">
                    {result.breadcrumbSegments.map((segment, i) => (
                      <React.Fragment key={i}>
                        {i > 0 && <span className="breadcrumb-sep"> / </span>}
                        <span className={i === result.breadcrumbSegments.length - 1 ? 'breadcrumb-current-seg' : 'breadcrumb-ancestor-seg'}>
                          {segment.length > 30 ? segment.substring(0, 30) + '...' : segment}
                        </span>
                      </React.Fragment>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="modal-footer">
          <span className="hint">
            <kbd>↑↓</kbd> Navigate
            <kbd>Enter</kbd> Move here
            <kbd>Esc</kbd> Cancel
          </span>
        </div>
      </div>
    </div>
  );
}

export default QuickMove;
