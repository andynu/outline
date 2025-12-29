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
  const inputRef = useRef<HTMLInputElement>(null);

  const parsedDate = parseNaturalDate(inputValue);
  const isValid = parsedDate !== null || inputValue === '';

  // Focus and select on mount
  useEffect(() => {
    const input = inputRef.current;
    if (input) {
      input.focus();
      input.select();
    }

    // Click outside handler
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target.closest('.date-picker')) {
        onClose();
      }
    };

    // Delay to avoid immediate close
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

  return (
    <div
      className="date-picker"
      style={{ left: position.x, top: position.y }}
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
