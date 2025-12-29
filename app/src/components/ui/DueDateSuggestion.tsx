import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { parseNaturalDate, formatISODate, formatDateRelative } from '../../lib/dateUtils';

interface DueDateSuggestionProps {
  query: string;
  position: { x: number; y: number };
  onSelect: (date: string) => void;
  onClose: () => void;
}

// Quick date suggestions
const quickDates = [
  { label: 'Today', offset: 0 },
  { label: 'Tomorrow', offset: 1 },
  { label: 'Next week', offset: 7 },
  { label: 'In 2 weeks', offset: 14 },
  { label: 'Next month', offset: 30 },
];

function getDateFromOffset(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return formatISODate(date);
}

export function DueDateSuggestion({ query, position, onSelect, onClose }: DueDateSuggestionProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const popupRef = useRef<HTMLDivElement>(null);

  // Parse query and build suggestions
  const suggestions = useMemo(() => {
    const items: Array<{ label: string; date: string; preview: string }> = [];

    // If query is provided, try to parse it
    if (query) {
      const parsed = parseNaturalDate(query);
      if (parsed) {
        const displayDate = formatDateRelative(parsed);
        items.push({
          label: query,
          date: parsed,
          preview: displayDate,
        });
      }
    }

    // Add quick date suggestions, filtered by query if provided
    for (const quick of quickDates) {
      const date = getDateFromOffset(quick.offset);
      const preview = formatDateRelative(date);

      // If query provided, filter by it
      if (query) {
        const queryLower = query.toLowerCase();
        if (
          quick.label.toLowerCase().includes(queryLower) ||
          preview.toLowerCase().includes(queryLower)
        ) {
          // Avoid duplicates if the parsed date matches
          if (!items.some(item => item.date === date)) {
            items.push({
              label: quick.label,
              date,
              preview,
            });
          }
        }
      } else {
        items.push({
          label: quick.label,
          date,
          preview,
        });
      }
    }

    return items.slice(0, 6);
  }, [query]);

  // Reset selected index when suggestions change
  useEffect(() => {
    setSelectedIndex(0);
  }, [suggestions.length]);

  // Handle click outside - save the selected date
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        if (suggestions[selectedIndex]) {
          // Save the currently selected date before closing
          onSelect(suggestions[selectedIndex].date);
        } else {
          onClose();
        }
      }
    };

    // Delay adding listener to avoid capturing the click that opened the popup
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [suggestions, selectedIndex, onSelect, onClose]);

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
            onSelect(suggestions[selectedIndex].date);
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
  }, [suggestions, selectedIndex, onSelect, onClose]);

  return (
    <div
      ref={popupRef}
      className="suggestion-popup due-date-suggestion"
      style={{ left: position.x, top: position.y }}
    >
      {suggestions.length === 0 ? (
        <div className="hint">Type a date: today, +3d, jan 15...</div>
      ) : (
        suggestions.map((item, index) => (
          <div
            key={item.date + item.label}
            className={`suggestion-item ${index === selectedIndex ? 'selected' : ''}`}
            onClick={() => onSelect(item.date)}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            <span className="date-label">{item.label}</span>
            <span className="date-preview">{item.preview}</span>
          </div>
        ))
      )}

      <div className="hints">
        <span>today</span>
        <span>+3d</span>
        <span>mon</span>
        <span>jan 15</span>
      </div>
    </div>
  );
}

export default DueDateSuggestion;
