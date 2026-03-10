import React, { useState, useEffect, useMemo } from 'react';
import _EMOJI_MAP from '../../lib/emoji-map.json';
import { useCustomEmojiStore } from '../../store/customEmojiStore';

const EMOJI_MAP: Record<string, string> = _EMOJI_MAP;

// Pre-compute sorted entries for faster filtering
const EMOJI_ENTRIES: Array<[string, string]> = Object.entries(EMOJI_MAP)
  .sort((a, b) => a[0].localeCompare(b[0]));

interface EmojiSuggestionProps {
  query: string;
  position: { x: number; y: number };
  onSelect: (shortcode: string, emoji: string, imageUrl?: string) => void;
  onClose: () => void;
}

interface EmojiMatch {
  shortcode: string;
  /** Unicode emoji character, or text for text-based custom emoji */
  emoji: string;
  /** For image-based custom emoji, the resolved URL */
  imageUrl?: string;
}

export function EmojiSuggestion({ query, position, onSelect, onClose }: EmojiSuggestionProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const customEmoji = useCustomEmojiStore(state => state.emoji);
  const resolveImageUrl = useCustomEmojiStore(state => state.resolveImageUrl);

  const suggestions = useMemo((): EmojiMatch[] => {
    if (query.length < 2) return [];

    const queryLower = query.toLowerCase();
    const prefixMatches: EmojiMatch[] = [];
    const containsMatches: EmojiMatch[] = [];

    // Search built-in emoji
    for (const [shortcode, emoji] of EMOJI_ENTRIES) {
      if (shortcode.startsWith(queryLower)) {
        prefixMatches.push({ shortcode, emoji });
      } else if (shortcode.includes(queryLower)) {
        containsMatches.push({ shortcode, emoji });
      }
      if (prefixMatches.length + containsMatches.length >= 50) break;
    }

    // Search custom emoji
    for (const [shortcode, entry] of Object.entries(customEmoji)) {
      const sc = shortcode.toLowerCase();
      const match: EmojiMatch | null = entry.text
        ? { shortcode: sc, emoji: entry.text }
        : entry.src
          ? { shortcode: sc, emoji: `:${sc}:`, imageUrl: resolveImageUrl(entry.src) ?? undefined }
          : null;

      if (!match) continue;

      if (sc.startsWith(queryLower)) {
        prefixMatches.push(match);
      } else if (sc.includes(queryLower)) {
        containsMatches.push(match);
      }
    }

    // Prefix matches first, then contains matches, capped at 8
    return [...prefixMatches, ...containsMatches].slice(0, 8);
  }, [query, customEmoji, resolveImageUrl]);

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
            const s = suggestions[selectedIndex];
            onSelect(s.shortcode, s.emoji, s.imageUrl);
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
          onClick={() => onSelect(item.shortcode, item.emoji, item.imageUrl)}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          <span className="emoji-preview">
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt={`:${item.shortcode}:`}
                className="custom-emoji"
              />
            ) : (
              item.emoji
            )}
          </span>
          <span className="emoji-shortcode">:{item.shortcode}:</span>
        </div>
      ))}
    </div>
  );
}

export default EmojiSuggestion;
