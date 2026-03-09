import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as api from '../../lib/api';
import type { SearchResult } from '../../lib/api';
import { hasSearchOperators } from '../../lib/searchQueryParser';

type SearchMode = 'navigate' | 'filter';

interface SearchModalProps {
  isOpen: boolean;
  documentScope?: string; // If set, search only within this document
  initialQuery?: string; // Pre-fill search query
  onClose: () => void;
  onNavigate: (nodeId: string, documentId: string) => void;
  onFilter: (query: string) => void;
}

function stripHtml(html: string): string {
  const div = document.createElement('div');
  div.textContent = html;
  return div.textContent || '';
}

export function SearchModal({ isOpen, documentScope, initialQuery = '', onClose, onNavigate, onFilter }: SearchModalProps) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<SearchMode>('navigate');
  const inputRef = useRef<HTMLInputElement>(null);

  // Update query when initialQuery changes (e.g., hashtag click)
  useEffect(() => {
    if (initialQuery && isOpen) {
      setQuery(initialQuery);
    }
  }, [initialQuery, isOpen]);

  // Search when query changes
  useEffect(() => {
    if (query.trim().length > 0) {
      const timeoutId = setTimeout(async () => {
        setLoading(true);
        try {
          const searchResults = await api.search(query, documentScope);
          setResults(searchResults);
          setSelectedIndex(0);
        } finally {
          setLoading(false);
        }
      }, 150);

      return () => clearTimeout(timeoutId);
    } else {
      setResults([]);
      setSelectedIndex(0);
    }
  }, [query, documentScope]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Scroll selected result into view
  useEffect(() => {
    if (results.length > 0) {
      const element = document.querySelector(`[data-search-index="${selectedIndex}"]`);
      element?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, results.length]);

  const selectResult = useCallback((result: SearchResult) => {
    onNavigate(result.node_id, result.document_id);
    handleClose();
  }, [onNavigate]);

  const applyFilter = useCallback(() => {
    const trimmed = query.trim();
    if (trimmed) {
      onFilter(trimmed);
      handleClose();
    }
  }, [query, onFilter]);

  const handleClose = useCallback(() => {
    setQuery('');
    setResults([]);
    setSelectedIndex(0);
    onClose();
  }, [onClose]);

  // Keyboard handler
  useEffect(() => {
    if (!isOpen) return;

    const handleKeydown = (event: KeyboardEvent) => {
      // Tab toggles mode
      if (event.key === 'Tab') {
        event.preventDefault();
        setMode(prev => prev === 'navigate' ? 'filter' : 'navigate');
        return;
      }

      switch (event.key) {
        case 'ArrowDown':
          if (mode === 'navigate') {
            event.preventDefault();
            setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
          }
          break;
        case 'ArrowUp':
          if (mode === 'navigate') {
            event.preventDefault();
            setSelectedIndex(prev => Math.max(prev - 1, 0));
          }
          break;
        case 'Enter':
          event.preventDefault();
          if (mode === 'filter') {
            applyFilter();
          } else if (results[selectedIndex]) {
            selectResult(results[selectedIndex]);
          }
          break;
        case 'Escape':
          event.preventDefault();
          handleClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [isOpen, mode, results, selectedIndex, selectResult, handleClose, applyFilter]);

  const handleBackdropClick = useCallback((event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      handleClose();
    }
  }, [handleClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal search-modal">
        <div className="search-input-wrapper">
          <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="search-input"
            placeholder={documentScope ? "Search in this document..." : "Search all documents..."}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {loading && <span className="loading-indicator">...</span>}
          <div className="search-mode-toggle">
            <button
              className={`search-mode-btn ${mode === 'navigate' ? 'active' : ''}`}
              onClick={() => setMode('navigate')}
              title="Navigate to result"
            >
              Navigate
            </button>
            <button
              className={`search-mode-btn ${mode === 'filter' ? 'active' : ''}`}
              onClick={() => setMode('filter')}
              title="Filter outline by query"
            >
              Filter
            </button>
          </div>
        </div>

        {mode === 'navigate' ? (
          <div className="results" role="listbox">
            {results.length === 0 && query.trim().length > 0 && !loading ? (
              <div className="no-results">No results found</div>
            ) : results.length === 0 && query.trim().length === 0 ? (
              <SearchOperatorHints />
            ) : (
              results.map((result, index) => (
                <div
                  key={result.node_id}
                  className={`result ${index === selectedIndex ? 'selected' : ''}`}
                  data-search-index={index}
                  role="option"
                  aria-selected={index === selectedIndex}
                  onClick={() => selectResult(result)}
                >
                  <div className="result-content">
                    {stripHtml(result.snippet)}
                  </div>
                  {result.note && (
                    <div className="result-note">{result.note}</div>
                  )}
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="search-filter-preview">
            {query.trim() ? (
              <div className="filter-preview-message">
                Press <kbd>Enter</kbd> to filter outline to items matching "{query.trim()}"
                {hasSearchOperators(query) && (
                  <div className="filter-operator-note">Search operators will be applied</div>
                )}
              </div>
            ) : (
              <div className="filter-preview-message muted">
                Type a query to filter the outline
                <SearchOperatorHints />
              </div>
            )}
          </div>
        )}

        <div className="modal-footer">
          <span className="hint">
            <kbd>Tab</kbd> Toggle mode
            {mode === 'navigate' ? (
              <>
                <kbd>↑↓</kbd> Navigate
                <kbd>Enter</kbd> Select
              </>
            ) : (
              <><kbd>Enter</kbd> Apply filter</>
            )}
            <kbd>Esc</kbd> Close
          </span>
        </div>
      </div>
    </div>
  );
}

function SearchOperatorHints() {
  return (
    <div className="search-operator-hints">
      <div className="operator-hints-title">Search operators</div>
      <div className="operator-hints-grid">
        <code>is:completed</code><span>Checked items</span>
        <code>is:heading</code><span>Heading items</span>
        <code>has:date</code><span>Items with dates</span>
        <code>has:note</code><span>Items with notes</span>
        <code>has:children</code><span>Parent items</span>
        <code>has:color</code><span>Colored items</span>
        <code>color:red</code><span>Specific color</span>
        <code>"exact phrase"</code><span>Exact match</span>
        <code>-term</code><span>Exclude term</span>
        <code>A OR B</code><span>Either term</span>
        <code>edited:today</code><span>Edited today</span>
        <code>edited:-7d</code><span>Edited last 7 days</span>
      </div>
    </div>
  );
}

export default SearchModal;
