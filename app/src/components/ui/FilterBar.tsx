import React from 'react';
import { useOutlineStore } from '../../store/outlineStore';

export function FilterBar() {
  const filterQuery = useOutlineStore(state => state.filterQuery);
  const clearFilter = useOutlineStore(state => state.clearFilter);

  if (!filterQuery) {
    return null;
  }

  return (
    <div className="filter-bar">
      <span className="filter-label">Filtering by:</span>
      <span className="filter-value">{filterQuery}</span>
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
