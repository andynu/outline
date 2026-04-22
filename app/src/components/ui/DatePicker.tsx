import React, { useState, useRef, useEffect, useCallback } from 'react';
import { parseNaturalDate, formatISODate } from '../../lib/dateUtils';
import { placePopup } from '../../lib/popupPosition';

export type DatePickerMode = 'due' | 'defer' | 'end';

interface DatePickerProps {
  position: { x: number; y: number };
  currentDate?: string;
  currentDeferDate?: string;
  currentDateEnd?: string;
  initialMode?: DatePickerMode;
  onSelect: (date: string | null, mode: DatePickerMode) => void;
  onClose: () => void;
}

const MODE_CYCLE: DatePickerMode[] = ['due', 'end', 'defer'];

export function DatePicker({ position, currentDate, currentDeferDate, currentDateEnd, initialMode = 'due', onSelect, onClose }: DatePickerProps) {
  const [mode, setMode] = useState<DatePickerMode>(initialMode);
  const activeDate = mode === 'due' ? currentDate : mode === 'defer' ? currentDeferDate : currentDateEnd;
  const [inputValue, setInputValue] = useState(activeDate || '');
  const [adjustedPosition, setAdjustedPosition] = useState<{ x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const parsedDate = parseNaturalDate(inputValue);
  const isValid = parsedDate !== null || inputValue === '';

  // Reset input value when mode changes
  const handleModeChange = useCallback((newMode: DatePickerMode) => {
    setMode(newMode);
    const newDate = newMode === 'due' ? currentDate : newMode === 'defer' ? currentDeferDate : currentDateEnd;
    setInputValue(newDate || '');
    // Re-focus input after mode switch
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  }, [currentDate, currentDeferDate, currentDateEnd]);

  // Adjust position to stay in viewport, accounting for CSS `zoom` on an
  // ancestor container (see lib/popupPosition.ts).
  useEffect(() => {
    const popup = popupRef.current;
    if (!popup) return;

    // getBoundingClientRect returns actual viewport coords (already
    // zoom-scaled), which is what placePopup expects.
    const rect = popup.getBoundingClientRect();

    // The incoming `position` was built as { x: trigger.left, y: trigger.bottom + 5 };
    // recover a zero-height trigger rect at that point (the 5px gap is reapplied
    // inside placePopup via `gap`).
    const trigger = {
      left: position.x,
      right: position.x,
      top: position.y - 5,
      bottom: position.y - 5,
    };

    const placed = placePopup(
      trigger,
      { width: rect.width, height: rect.height },
      { preferBelow: true, gap: 5 }
    );

    setAdjustedPosition({ x: placed.left, y: placed.top });
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
      onSelect(null, mode); // Clear the date
    } else if (e.key === 'Tab') {
      // Tab cycles through due/end/defer modes
      e.preventDefault();
      const currentIndex = MODE_CYCLE.indexOf(mode);
      const nextIndex = (currentIndex + 1) % MODE_CYCLE.length;
      handleModeChange(MODE_CYCLE[nextIndex]);
    }
  }, [inputValue, onClose, onSelect, mode, handleModeChange]);

  const handleSubmit = useCallback(() => {
    if (inputValue === '') {
      onSelect(null, mode); // Clear the date
    } else if (parsedDate) {
      onSelect(parsedDate, mode);
    }
  }, [inputValue, parsedDate, onSelect, mode]);

  const setQuickDate = useCallback((offset: number) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    onSelect(formatISODate(date), mode);
  }, [onSelect, mode]);

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

  const placeholderText = mode === 'due'
    ? 'today, tomorrow, jan 15...'
    : mode === 'end'
    ? 'end date...'
    : 'defer until...';

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
      <div className="date-picker-mode-tabs">
        <button
          className={`date-picker-mode-tab ${mode === 'due' ? 'active' : ''}`}
          onClick={() => handleModeChange('due')}
        >
          Due date
        </button>
        <button
          className={`date-picker-mode-tab ${mode === 'end' ? 'active' : ''}`}
          onClick={() => handleModeChange('end')}
        >
          End date
        </button>
        <button
          className={`date-picker-mode-tab ${mode === 'defer' ? 'active' : ''}`}
          onClick={() => handleModeChange('defer')}
        >
          Defer until
        </button>
      </div>

      <div className="date-picker-header">
        <input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          className={`date-input ${!isValid ? 'invalid' : ''}`}
          placeholder={placeholderText}
          spellCheck={false}
        />
      </div>

      {previewText && (
        <div className="preview">{previewText}</div>
      )}

      <div className="quick-dates">
        {mode === 'due' ? (
          <>
            <button className="quick-date" onClick={() => setQuickDate(0)}>Today</button>
            <button className="quick-date" onClick={() => setQuickDate(1)}>Tomorrow</button>
            <button className="quick-date" onClick={() => setQuickDate(7)}>Next week</button>
          </>
        ) : mode === 'end' ? (
          <>
            <button className="quick-date" onClick={() => setQuickDate(1)}>Tomorrow</button>
            <button className="quick-date" onClick={() => setQuickDate(7)}>In a week</button>
            <button className="quick-date" onClick={() => setQuickDate(14)}>In 2 weeks</button>
          </>
        ) : (
          <>
            <button className="quick-date" onClick={() => setQuickDate(1)}>Tomorrow</button>
            <button className="quick-date" onClick={() => setQuickDate(7)}>Next week</button>
            <button className="quick-date" onClick={() => setQuickDate(30)}>Next month</button>
          </>
        )}
        <button className="quick-date" onClick={() => onSelect(null, mode)}>Clear</button>
      </div>

      <div className="hints">
        <span>today</span>
        <span>+3d</span>
        <span>mon</span>
        <span>Tab to switch</span>
      </div>
    </div>
  );
}

export default DatePicker;
