import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as api from '../../lib/api';
import type { SearchResult } from '../../lib/api';
import { useOutlineStore } from '../../store/outlineStore';

interface QuickMoveProps {
  isOpen: boolean;
  onClose: () => void;
}

function stripHtml(html: string): string {
  // Use regex to strip HTML tags - safer than innerHTML parsing
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

export function QuickMove({ isOpen, onClose }: QuickMoveProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [moving, setMoving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Get store state and actions
  const focusedId = useOutlineStore(state => state.focusedId);
  const nodes = useOutlineStore(state => state.nodes);
  const getNode = useOutlineStore(state => state.getNode);
  const moveNodeTo = useOutlineStore(state => state.moveNodeTo);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Search when query changes
  useEffect(() => {
    if (query.trim().length === 0) {
      setResults([]);
      setSelectedIndex(0);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setLoading(true);
      try {
        const searchResults = await api.search(query, undefined, 30);
        setResults(searchResults);
        setSelectedIndex(0);
      } finally {
        setLoading(false);
      }
    }, 150);

    return () => clearTimeout(timeoutId);
  }, [query]);

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
    if (!focusedId || focusedId === targetNodeId) {
      handleClose();
      return;
    }

    setMoving(true);
    try {
      // Move the focused node to be a child of the target node
      // Position it at the end of the target's children
      const targetChildren = nodes.filter(n => n.parent_id === targetNodeId);
      const newPosition = targetChildren.length;

      await moveNodeTo(focusedId, targetNodeId, newPosition);
      handleClose();
    } catch (e) {
      console.error('Failed to move node:', e);
    } finally {
      setMoving(false);
    }
  }, [focusedId, nodes, moveNodeTo, handleClose]);

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
    if (!focusedId) return '';
    const node = getNode(focusedId);
    if (!node) return '';
    const text = stripHtml(node.content);
    return text.length > 40 ? text.substring(0, 40) + '...' : text;
  }, [focusedId, getNode]);

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
            placeholder="Move to..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={moving}
          />
          {loading && <span className="loading-indicator">...</span>}
          {moving && <span className="loading-indicator">Moving...</span>}
        </div>

        <div className="results">
          {results.length === 0 && query.trim().length > 0 && !loading ? (
            <div className="no-results">No items found</div>
          ) : results.length === 0 && query.trim().length === 0 ? (
            <div className="hint-text">Search for a destination node...</div>
          ) : (
            results.map((result, index) => (
              <div
                key={result.node_id}
                className={`result ${index === selectedIndex ? 'selected' : ''}`}
                data-move-index={index}
                onClick={() => moveToNode(result.node_id)}
              >
                <div className="result-content">
                  {stripHtml(result.snippet)}
                </div>
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
