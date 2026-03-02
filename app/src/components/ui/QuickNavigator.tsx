import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as api from '../../lib/api';
import type { DocumentInfo } from '../../lib/api';
import { useOutlineStore } from '../../store/outlineStore';
import { buildAncestryIndex, searchAncestryIndex } from '../../lib/ancestrySearch';
import type { AncestrySearchResult } from '../../lib/ancestrySearch';

type NavigatorMode = 'files' | 'items';

interface QuickNavigatorProps {
  isOpen: boolean;
  mode: NavigatorMode;
  onClose: () => void;
  onNavigate: (nodeId: string, documentId: string) => void;
}

export function QuickNavigator({ isOpen, mode, onClose, onNavigate }: QuickNavigatorProps) {
  const [query, setQuery] = useState('');
  const [fileResults, setFileResults] = useState<DocumentInfo[]>([]);
  const [itemResults, setItemResults] = useState<AncestrySearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [allDocuments, setAllDocuments] = useState<DocumentInfo[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Get nodes from store for ancestry-aware search
  const nodes = useOutlineStore(state => state.nodes);

  // Build ancestry index once when modal opens in items mode or nodes change while open
  const ancestryIndex = useMemo(() => {
    if (!isOpen || mode !== 'items') return [];
    return buildAncestryIndex(nodes);
  }, [isOpen, mode, nodes]);

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

  // Search items when query changes using ancestry-aware search
  useEffect(() => {
    if (mode !== 'items') return;
    if (query.trim().length === 0) {
      setItemResults([]);
      setSelectedIndex(0);
      return;
    }

    // Debounce the search slightly for responsiveness
    const timeoutId = setTimeout(() => {
      const results = searchAncestryIndex(ancestryIndex, query, 30);
      setItemResults(results);
      setSelectedIndex(0);
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [mode, query, ancestryIndex]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setFileResults([]);
      setItemResults([]);
      setSelectedIndex(0);
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

  const selectItem = useCallback((result: AncestrySearchResult) => {
    // For ancestry search results, we use current document context
    // The node_id is sufficient for navigation within the current document
    onNavigate(result.node_id, '');
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

  const placeholder = mode === 'files' ? 'Go to document...' : 'Go to item... (use spaces for path search)';

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
        </div>

        <div className="results" role="listbox">
          {mode === 'files' ? (
            fileResults.length === 0 ? (
              <div className="no-results">No documents found</div>
            ) : (
              fileResults.map((doc, index) => (
                <div
                  key={doc.id}
                  className={`result ${index === selectedIndex ? 'selected' : ''}`}
                  data-nav-index={index}
                  role="option"
                  aria-selected={index === selectedIndex}
                  onClick={() => selectFile(doc)}
                >
                  <div className="result-title">{doc.title}</div>
                  <div className="result-meta">{doc.node_count} items</div>
                </div>
              ))
            )
          ) : (
            <>
              {itemResults.length === 0 && query.trim().length > 0 && (
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
                  role="option"
                  aria-selected={index === selectedIndex}
                  onClick={() => selectItem(result)}
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
