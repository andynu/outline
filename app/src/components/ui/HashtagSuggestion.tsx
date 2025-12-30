import React, { useState, useEffect, useCallback, useMemo } from 'react';

interface HashtagSuggestionProps {
  query: string;
  position: { x: number; y: number };
  onSelect: (tag: string) => void;
  onClose: () => void;
  /** Optional: Map of tag -> {count} for showing existing tags */
  existingTags?: Map<string, { count: number }>;
}

interface TagSuggestion {
  tag: string;
  count: number;
}

export function HashtagSuggestion({ query, position, onSelect, onClose, existingTags }: HashtagSuggestionProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Get suggestions based on query
  const suggestions = useMemo((): TagSuggestion[] => {
    const allTags = existingTags ?? new Map<string, { count: number }>();
    const entries = Array.from(allTags.entries());

    if (!query) {
      // No query - show most used tags
      return entries
        .map(([tag, data]) => ({ tag, count: data.count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);
    }

    // Filter by query (case insensitive prefix match)
    const queryLower = query.toLowerCase();
    return entries
      .filter(([tag]) => tag.toLowerCase().startsWith(queryLower))
      .map(([tag, data]) => ({ tag, count: data.count }))
      .sort((a, b) => {
        // Exact match first, then by count
        const aExact = a.tag.toLowerCase() === queryLower;
        const bExact = b.tag.toLowerCase() === queryLower;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        return b.count - a.count;
      })
      .slice(0, 8);
  }, [existingTags, query]);

  // Reset selected index when suggestions change
  useEffect(() => {
    setSelectedIndex(0);
  }, [suggestions.length]);

  // Keyboard handler
  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          event.stopPropagation();
          setSelectedIndex(prev => Math.min(prev + 1, suggestions.length - 1));
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
          if (suggestions[selectedIndex]) {
            onSelect(suggestions[selectedIndex].tag);
          } else if (query) {
            // Create new tag with the typed text
            onSelect(query);
          }
          break;
        case 'Escape':
          event.preventDefault();
          event.stopPropagation();
          onClose();
          break;
      }
    };

    // Use capture phase to handle before TipTap/ProseMirror
    window.addEventListener('keydown', handleKeydown, true);
    return () => window.removeEventListener('keydown', handleKeydown, true);
  }, [suggestions, selectedIndex, query, onSelect, onClose]);

  const showCreateNew = query && !suggestions.some(s => s.tag.toLowerCase() === query.toLowerCase());

  return (
    <div
      className="suggestion-popup hashtag-suggestion"
      style={{ left: position.x, top: position.y }}
    >
      {suggestions.length === 0 && query.length > 0 ? (
        <div
          className="suggestion-item selected"
          onClick={() => onSelect(query)}
        >
          <span className="new-tag-label">Create tag:</span>
          <span className="tag-name">#{query}</span>
        </div>
      ) : suggestions.length === 0 ? (
        <div className="hint">Type to search or create tags...</div>
      ) : (
        <>
          {suggestions.map((item, index) => (
            <div
              key={item.tag}
              className={`suggestion-item ${index === selectedIndex ? 'selected' : ''}`}
              onClick={() => onSelect(item.tag)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <span className="tag-name">#{item.tag}</span>
              <span className="tag-count">{item.count}</span>
            </div>
          ))}
          {showCreateNew && (
            <div
              className={`suggestion-item create-new ${selectedIndex === suggestions.length ? 'selected' : ''}`}
              onClick={() => onSelect(query)}
              onMouseEnter={() => setSelectedIndex(suggestions.length)}
            >
              <span className="new-tag-label">Create:</span>
              <span className="tag-name">#{query}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default HashtagSuggestion;
