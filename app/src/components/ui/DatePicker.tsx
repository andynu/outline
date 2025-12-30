import React, { useState, useRef, useEffect, useCallback } from 'react';
import { parseNaturalDate, formatISODate } from '../../lib/dateUtils';

interface DatePickerProps {
  position: { x: number; y: number };
  currentDate?: string;
  onSelect: (date: string | null) => void;
  onClose: () => void;
}

export function DatePicker({ position, currentDate, onSelect, onClose }: DatePickerProps) {
  const [inputValue, setInputValue] = useState(currentDate || '');
  const [adjustedPosition, setAdjustedPosition] = useState<{ x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const parsedDate = parseNaturalDate(inputValue);
  const isValid = parsedDate !== null || inputValue === '';

  // Adjust position to stay in viewport using useLayoutEffect for synchronous update
  useEffect(() => {
    const popup = popupRef.current;
    if (!popup) return;

    // Measure the popup's dimensions
    const rect = popup.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    let newTop = position.y;
    let newLeft = position.x;

    // If popup would go below viewport, position above the trigger
    if (position.y + rect.height > viewportHeight) {
      newTop = Math.max(10, viewportHeight - rect.height - 10);
    }

    // If popup would go outside right edge, shift left
    if (position.x + rect.width > viewportWidth) {
      newLeft = Math.max(10, viewportWidth - rect.width - 10);
    }

    setAdjustedPosition({ x: newLeft, y: newTop });
  }, [position]);

  // Focus input when position is set
  useEffect(() => {
    if (adjustedPosition && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [adjustedPosition]);

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target.closest('.date-picker')) {
        onClose();
      }
    };

    // Delay to avoid immediate close from the triggering click
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Backspace' && inputValue === '') {
      e.preventDefault();
      onSelect(null); // Clear the date
    }
  }, [inputValue, onClose, onSelect]);

  const handleSubmit = useCallback(() => {
    if (inputValue === '') {
      onSelect(null); // Clear the date
    } else if (parsedDate) {
      onSelect(parsedDate);
    }
  }, [inputValue, parsedDate, onSelect]);

  const setQuickDate = useCallback((offset: number) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    onSelect(formatISODate(date));
  }, [onSelect]);

  const previewText = parsedDate && inputValue
    ? new Date(parsedDate).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      })
    : null;

  // Use adjusted position once calculated, otherwise use initial position but hide with opacity
  const displayPosition = adjustedPosition || position;
  const isPositioned = adjustedPosition !== null;

  return (
    <div
      ref={popupRef}
      className="date-picker"
      style={{
        left: displayPosition.x,
        top: displayPosition.y,
        opacity: isPositioned ? 1 : 0,
        pointerEvents: isPositioned ? 'auto' : 'none',
      }}
    >
      <div className="date-picker-header">
        <input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          className={`date-input ${!isValid ? 'invalid' : ''}`}
          placeholder="today, tomorrow, jan 15..."
          spellCheck={false}
        />
      </div>

      {previewText && (
        <div className="preview">{previewText}</div>
      )}

      <div className="quick-dates">
        <button className="quick-date" onClick={() => setQuickDate(0)}>Today</button>
        <button className="quick-date" onClick={() => setQuickDate(1)}>Tomorrow</button>
        <button className="quick-date" onClick={() => setQuickDate(7)}>Next week</button>
        <button className="quick-date" onClick={() => onSelect(null)}>Clear</button>
      </div>

      <div className="hints">
        <span>today</span>
        <span>+3d</span>
        <span>mon</span>
        <span>jan 15</span>
      </div>
    </div>
  );
}

export default DatePicker;
