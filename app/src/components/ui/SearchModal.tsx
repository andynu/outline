import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as api from '../../lib/api';
import type { SearchResult } from '../../lib/api';

interface SearchModalProps {
  isOpen: boolean;
  documentScope?: string; // If set, search only within this document
  initialQuery?: string; // Pre-fill search query
  onClose: () => void;
  onNavigate: (nodeId: string, documentId: string) => void;
}

function stripHtml(html: string): string {
  const div = document.createElement('div');
  div.textContent = html;
  return div.textContent || '';
}

export function SearchModal({ isOpen, documentScope, initialQuery = '', onClose, onNavigate }: SearchModalProps) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
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
          if (results[selectedIndex]) {
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
  }, [isOpen, results, selectedIndex, selectResult, handleClose]);

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
        </div>

        <div className="results">
          {results.length === 0 && query.trim().length > 0 && !loading ? (
            <div className="no-results">No results found</div>
          ) : (
            results.map((result, index) => (
              <div
                key={result.node_id}
                className={`result ${index === selectedIndex ? 'selected' : ''}`}
                data-search-index={index}
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

        <div className="modal-footer">
          <span className="hint">
            <kbd>↑↓</kbd> Navigate
            <kbd>Enter</kbd> Select
            <kbd>Esc</kbd> Close
          </span>
        </div>
      </div>
    </div>
  );
}

export default SearchModal;
