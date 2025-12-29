import React, { useState, useEffect, useCallback, useMemo } from 'react';

interface RecurrencePickerProps {
  position: { x: number; y: number };
  currentRecurrence?: string;
  onSelect: (rrule: string | null) => void;
  onClose: () => void;
}

type FrequencyType = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

const weekdayOptions = [
  { value: 'MO', label: 'Mon' },
  { value: 'TU', label: 'Tue' },
  { value: 'WE', label: 'Wed' },
  { value: 'TH', label: 'Thu' },
  { value: 'FR', label: 'Fri' },
  { value: 'SA', label: 'Sat' },
  { value: 'SU', label: 'Sun' },
];

function parseRRule(rrule: string): { frequency: FrequencyType; interval: number; weekdays: string[] } {
  let frequency: FrequencyType = 'none';
  let interval = 1;
  let weekdays: string[] = [];

  const parts = rrule.split(';');
  for (const part of parts) {
    const [key, value] = part.split('=');
    switch (key) {
      case 'FREQ':
        if (value === 'DAILY') frequency = 'daily';
        else if (value === 'WEEKLY') frequency = 'weekly';
        else if (value === 'MONTHLY') frequency = 'monthly';
        else if (value === 'YEARLY') frequency = 'yearly';
        break;
      case 'INTERVAL':
        interval = parseInt(value, 10) || 1;
        break;
      case 'BYDAY':
        weekdays = value.split(',');
        break;
    }
  }

  return { frequency, interval, weekdays };
}

function buildRRule(frequency: FrequencyType, interval: number, weekdays: string[]): string | null {
  if (frequency === 'none') return null;

  let rrule = `FREQ=${frequency.toUpperCase()}`;

  if (interval > 1) {
    rrule += `;INTERVAL=${interval}`;
  }

  if (frequency === 'weekly' && weekdays.length > 0) {
    rrule += `;BYDAY=${weekdays.join(',')}`;
  }

  return rrule;
}

export function RecurrencePicker({ position, currentRecurrence, onSelect, onClose }: RecurrencePickerProps) {
  const initialState = currentRecurrence
    ? parseRRule(currentRecurrence)
    : { frequency: 'none' as FrequencyType, interval: 1, weekdays: [] };

  const [frequency, setFrequency] = useState<FrequencyType>(initialState.frequency);
  const [interval, setInterval] = useState(initialState.interval);
  const [weekdays, setWeekdays] = useState<string[]>(initialState.weekdays);

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target.closest('.recurrence-picker')) {
        onClose();
      }
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [onClose]);

  const handleApply = useCallback(() => {
    onSelect(buildRRule(frequency, interval, weekdays));
  }, [frequency, interval, weekdays, onSelect]);

  const handleClear = useCallback(() => {
    onSelect(null);
  }, [onSelect]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleApply();
    }
  }, [onClose, handleApply]);

  const toggleWeekday = useCallback((day: string) => {
    setWeekdays(prev =>
      prev.includes(day)
        ? prev.filter(d => d !== day)
        : [...prev, day]
    );
  }, []);

  const previewText = useMemo(() => {
    if (frequency === 'none') return 'No recurrence';
    let text = '';
    const pluralize = interval > 1;
    switch (frequency) {
      case 'daily':
        text = pluralize ? `Every ${interval} days` : 'Daily';
        break;
      case 'weekly':
        text = pluralize ? `Every ${interval} weeks` : 'Weekly';
        if (weekdays.length > 0) {
          const dayNames = weekdays.map(d =>
            weekdayOptions.find(o => o.value === d)?.label || d
          );
          text += ` on ${dayNames.join(', ')}`;
        }
        break;
      case 'monthly':
        text = pluralize ? `Every ${interval} months` : 'Monthly';
        break;
      case 'yearly':
        text = pluralize ? `Every ${interval} years` : 'Yearly';
        break;
    }
    return text;
  }, [frequency, interval, weekdays]);

  const getIntervalUnit = () => {
    switch (frequency) {
      case 'daily': return interval === 1 ? 'day' : 'days';
      case 'weekly': return interval === 1 ? 'week' : 'weeks';
      case 'monthly': return interval === 1 ? 'month' : 'months';
      case 'yearly': return interval === 1 ? 'year' : 'years';
      default: return '';
    }
  };

  return (
    <div
      className="recurrence-picker"
      style={{ left: position.x, top: position.y }}
      onKeyDown={handleKeyDown}
    >
      <div className="picker-header">
        <h3>Repeat</h3>
      </div>

      <div className="picker-body">
        <div className="form-row">
          <label>Frequency</label>
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as FrequencyType)}
            className="frequency-select"
          >
            <option value="none">Does not repeat</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>

        {frequency !== 'none' && (
          <>
            <div className="form-row">
              <label>Every</label>
              <div className="interval-row">
                <input
                  type="number"
                  value={interval}
                  onChange={(e) => setInterval(Math.max(1, Math.min(99, parseInt(e.target.value, 10) || 1)))}
                  min={1}
                  max={99}
                  className="interval-input"
                />
                <span className="interval-unit">{getIntervalUnit()}</span>
              </div>
            </div>

            {frequency === 'weekly' && (
              <div className="form-row">
                <label>On days</label>
                <div className="weekday-grid">
                  {weekdayOptions.map(day => (
                    <button
                      key={day.value}
                      className={`weekday-btn ${weekdays.includes(day.value) ? 'selected' : ''}`}
                      onClick={() => toggleWeekday(day.value)}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className="preview">{previewText}</div>
      </div>

      <div className="picker-footer">
        <button className="btn-clear" onClick={handleClear}>Clear</button>
        <button className="btn-apply" onClick={handleApply}>Apply</button>
      </div>
    </div>
  );
}

export default RecurrencePicker;
