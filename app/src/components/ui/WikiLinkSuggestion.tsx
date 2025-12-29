import React, { useState, useEffect, useCallback } from 'react';
import * as api from '../../lib/api';
import type { SearchResult } from '../../lib/api';

interface WikiLinkSuggestionProps {
  query: string;
  position: { x: number; y: number };
  onSelect: (nodeId: string, displayText: string) => void;
  onClose: () => void;
}

function stripHtml(html: string): string {
  const div = document.createElement('div');
  div.textContent = html;
  return div.textContent || '';
}

export function WikiLinkSuggestion({ query, position, onSelect, onClose }: WikiLinkSuggestionProps) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  // Search when query changes
  useEffect(() => {
    if (query.length > 0) {
      const timeoutId = setTimeout(async () => {
        setLoading(true);
        try {
          const searchResults = await api.search(query, undefined, 10);
          setResults(searchResults);
          setSelectedIndex(0);
        } finally {
          setLoading(false);
        }
      }, 100);

      return () => clearTimeout(timeoutId);
    } else {
      setResults([]);
      setSelectedIndex(0);
    }
  }, [query]);

  const selectResult = useCallback((result: SearchResult) => {
    // Get first line of content as display text
    const displayText = stripHtml(result.content).split('\n')[0].trim() || result.node_id;
    onSelect(result.node_id, displayText);
  }, [onSelect]);

  // Keyboard handler
  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          event.stopPropagation();
          setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
          break;
        case 'ArrowUp':
          event.preventDefault();
          event.stopPropagation();
          setSelectedIndex(prev => Math.max(prev - 1, 0));
          break;
        case 'Enter':
        case 'Tab':
          event.preventDefault();
          event.stopPropagation();
          if (results[selectedIndex]) {
            selectResult(results[selectedIndex]);
          }
          break;
        case 'Escape':
          event.preventDefault();
          event.stopPropagation();
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [results, selectedIndex, selectResult, onClose]);

  return (
    <div
      className="suggestion-popup wiki-link-suggestion"
      style={{ left: position.x, top: position.y }}
    >
      {loading && results.length === 0 ? (
        <div className="loading">Searching...</div>
      ) : results.length === 0 && query.length > 0 ? (
        <div className="no-results">No matches found</div>
      ) : results.length === 0 ? (
        <div className="hint">Type to search for items to link...</div>
      ) : (
        results.map((result, index) => (
          <div
            key={result.node_id}
            className={`suggestion-item ${index === selectedIndex ? 'selected' : ''}`}
            onClick={() => selectResult(result)}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            <div className="suggestion-text">
              {stripHtml(result.snippet)}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export default WikiLinkSuggestion;
