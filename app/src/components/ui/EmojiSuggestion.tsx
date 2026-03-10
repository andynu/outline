import React, { useState, useEffect, useMemo } from 'react';
import _EMOJI_MAP from '../../lib/emoji-map.json';

const EMOJI_MAP: Record<string, string> = _EMOJI_MAP;

// Pre-compute sorted entries for faster filtering
const EMOJI_ENTRIES: Array<[string, string]> = Object.entries(EMOJI_MAP)
  .sort((a, b) => a[0].localeCompare(b[0]));

interface EmojiSuggestionProps {
  query: string;
  position: { x: number; y: number };
  onSelect: (shortcode: string, emoji: string) => void;
  onClose: () => void;
}

interface EmojiMatch {
  shortcode: string;
  emoji: string;
}

export function EmojiSuggestion({ query, position, onSelect, onClose }: EmojiSuggestionProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const suggestions = useMemo((): EmojiMatch[] => {
    if (query.length < 2) return [];

    const queryLower = query.toLowerCase();
    const prefixMatches: EmojiMatch[] = [];
    const containsMatches: EmojiMatch[] = [];

    for (const [shortcode, emoji] of EMOJI_ENTRIES) {
      if (shortcode.startsWith(queryLower)) {
        prefixMatches.push({ shortcode, emoji });
      } else if (shortcode.includes(queryLower)) {
        containsMatches.push({ shortcode, emoji });
      }
      // Stop early once we have enough
      if (prefixMatches.length + containsMatches.length >= 50) break;
    }

    // Prefix matches first, then contains matches, capped at 8
    return [...prefixMatches, ...containsMatches].slice(0, 8);
  }, [query]);

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
            onSelect(suggestions[selectedIndex].shortcode, suggestions[selectedIndex].emoji);
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
  }, [suggestions, selectedIndex, onSelect, onClose]);

  if (suggestions.length === 0) {
    if (query.length >= 2) {
      return (
        <div
          className="suggestion-popup emoji-suggestion"
          style={{ left: position.x, top: position.y }}
          role="listbox"
        >
          <div className="no-results">No matching emoji</div>
        </div>
      );
    }
    return null;
  }

  return (
    <div
      className="suggestion-popup emoji-suggestion"
      style={{ left: position.x, top: position.y }}
      role="listbox"
    >
      {suggestions.map((item, index) => (
        <div
          key={item.shortcode}
          className={`suggestion-item ${index === selectedIndex ? 'selected' : ''}`}
          role="option"
          aria-selected={index === selectedIndex}
          onClick={() => onSelect(item.shortcode, item.emoji)}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          <span className="emoji-preview">{item.emoji}</span>
          <span className="emoji-shortcode">:{item.shortcode}:</span>
        </div>
      ))}
    </div>
  );
}

export default EmojiSuggestion;
