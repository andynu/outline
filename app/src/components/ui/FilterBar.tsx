import React, { useState, useRef, useEffect } from 'react';
import { useOutlineStore } from '../../store/outlineStore';
import { useSavedSearchStore } from '../../store/savedSearchStore';

export function FilterBar() {
  const filterQuery = useOutlineStore(state => state.filterQuery);
  const clearFilter = useOutlineStore(state => state.clearFilter);
  const addSavedSearch = useSavedSearchStore(state => state.addSavedSearch);

  const [showNameInput, setShowNameInput] = useState(false);
  const [saveName, setSaveName] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showNameInput && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [showNameInput]);

  // Reset save input when filter changes
  useEffect(() => {
    setShowNameInput(false);
    setSaveName('');
  }, [filterQuery]);

  if (!filterQuery) {
    return null;
  }

  const handleSave = () => {
    const name = saveName.trim();
    if (name) {
      addSavedSearch(name, filterQuery);
      setSaveName('');
      setShowNameInput(false);
    }
  };

  const handleSaveKeydown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      setShowNameInput(false);
      setSaveName('');
    }
  };

  return (
    <div className="filter-bar">
      <span className="filter-label">Filtering by:</span>
      <span className="filter-value">{filterQuery}</span>
      {showNameInput ? (
        <div className="filter-save-input-wrapper">
          <input
            ref={nameInputRef}
            type="text"
            className="filter-save-input"
            placeholder="Search name..."
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={handleSaveKeydown}
          />
          <button
            className="filter-save-confirm"
            onClick={handleSave}
            disabled={!saveName.trim()}
            title="Save search"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
        </div>
      ) : (
        <button
          className="filter-save-btn"
          onClick={() => setShowNameInput(true)}
          title="Save this search"
          aria-label="Save search"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      )}
      <button
        className="filter-clear-btn"
        onClick={clearFilter}
        title="Clear filter (Escape)"
        aria-label="Clear filter"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

export default FilterBar;
