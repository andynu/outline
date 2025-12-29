import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as api from '../../lib/api';
import type { SearchResult, DocumentInfo } from '../../lib/api';

type NavigatorMode = 'files' | 'items';

interface QuickNavigatorProps {
  isOpen: boolean;
  mode: NavigatorMode;
  onClose: () => void;
  onNavigate: (nodeId: string, documentId: string) => void;
}

function stripHtml(html: string): string {
  const div = document.createElement('div');
  div.textContent = html;
  return div.textContent || '';
}

export function QuickNavigator({ isOpen, mode, onClose, onNavigate }: QuickNavigatorProps) {
  const [query, setQuery] = useState('');
  const [fileResults, setFileResults] = useState<DocumentInfo[]>([]);
  const [itemResults, setItemResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [allDocuments, setAllDocuments] = useState<DocumentInfo[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load documents when opened in file mode
  useEffect(() => {
    if (isOpen && mode === 'files') {
      loadDocuments();
    }
  }, [isOpen, mode]);

  async function loadDocuments() {
    try {
      const docs = await api.listDocuments();
      setAllDocuments(docs);
    } catch (e) {
      console.error('Failed to load documents:', e);
    }
  }

  // Fuzzy filter for file names
  function fuzzyMatch(text: string, pattern: string): boolean {
    if (!pattern) return true;
    const textLower = text.toLowerCase();
    const patternLower = pattern.toLowerCase();
    return textLower.includes(patternLower);
  }

  // Filter files when query or documents change
  useEffect(() => {
    if (mode === 'files') {
      const filtered = allDocuments.filter(doc => fuzzyMatch(doc.title, query));
      setFileResults(filtered);
      setSelectedIndex(0);
    }
  }, [mode, query, allDocuments]);

  // Search items when query changes
  useEffect(() => {
    if (mode !== 'items') return;
    if (query.trim().length === 0) {
      setItemResults([]);
      setSelectedIndex(0);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await api.search(query, undefined, 30);
        setItemResults(results);
        setSelectedIndex(0);
      } finally {
        setLoading(false);
      }
    }, 150);

    return () => clearTimeout(timeoutId);
  }, [mode, query]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Scroll selected result into view
  useEffect(() => {
    const count = mode === 'files' ? fileResults.length : itemResults.length;
    if (count > 0) {
      const element = document.querySelector(`[data-nav-index="${selectedIndex}"]`);
      element?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, mode, fileResults.length, itemResults.length]);

  const handleClose = useCallback(() => {
    setQuery('');
    setFileResults([]);
    setItemResults([]);
    setSelectedIndex(0);
    onClose();
  }, [onClose]);

  const selectFile = useCallback((doc: DocumentInfo) => {
    onNavigate('', doc.id);
    handleClose();
  }, [onNavigate, handleClose]);

  const selectItem = useCallback((result: SearchResult) => {
    onNavigate(result.node_id, result.document_id);
    handleClose();
  }, [onNavigate, handleClose]);

  const selectCurrent = useCallback(() => {
    if (mode === 'files') {
      const doc = fileResults[selectedIndex];
      if (doc) {
        selectFile(doc);
      }
    } else {
      const result = itemResults[selectedIndex];
      if (result) {
        selectItem(result);
      }
    }
  }, [mode, fileResults, itemResults, selectedIndex, selectFile, selectItem]);

  // Keyboard handler
  useEffect(() => {
    if (!isOpen) return;

    const handleKeydown = (event: KeyboardEvent) => {
      const resultCount = mode === 'files' ? fileResults.length : itemResults.length;

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          setSelectedIndex(prev => Math.min(prev + 1, resultCount - 1));
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
  }, [isOpen, mode, fileResults.length, itemResults.length, selectCurrent, handleClose]);

  const handleBackdropClick = useCallback((event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      handleClose();
    }
  }, [handleClose]);

  if (!isOpen) {
    return null;
  }

  const placeholder = mode === 'files' ? 'Go to document...' : 'Go to item...';

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal quick-navigator-modal">
        <div className="search-input-wrapper">
          {mode === 'files' ? (
            <svg className="mode-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          ) : (
            <svg className="mode-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 12h8" />
              <path d="M12 8v8" />
            </svg>
          )}
          <input
            ref={inputRef}
            type="text"
            className="search-input"
            placeholder={placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {loading && <span className="loading-indicator">...</span>}
        </div>

        <div className="results">
          {mode === 'files' ? (
            fileResults.length === 0 ? (
              <div className="no-results">No documents found</div>
            ) : (
              fileResults.map((doc, index) => (
                <div
                  key={doc.id}
                  className={`result ${index === selectedIndex ? 'selected' : ''}`}
                  data-nav-index={index}
                  onClick={() => selectFile(doc)}
                >
                  <div className="result-title">{doc.title}</div>
                  <div className="result-meta">{doc.node_count} items</div>
                </div>
              ))
            )
          ) : (
            <>
              {itemResults.length === 0 && query.trim().length > 0 && !loading && (
                <div className="no-results">No items found</div>
              )}
              {itemResults.length === 0 && query.trim().length === 0 && (
                <div className="hint-text">Type to search all items...</div>
              )}
              {itemResults.map((result, index) => (
                <div
                  key={result.node_id}
                  className={`result ${index === selectedIndex ? 'selected' : ''}`}
                  data-nav-index={index}
                  onClick={() => selectItem(result)}
                >
                  <div className="result-content">
                    {stripHtml(result.snippet)}
                  </div>
                </div>
              ))}
            </>
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

export default QuickNavigator;
