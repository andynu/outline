import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useOutlineStore } from '../../store/outlineStore';
import { getDateStatus, formatDateRelative, type DateStatus } from '../../lib/dateUtils';
import { DateBadge } from './DateBadge';

type ViewType = 'today' | 'upcoming' | 'overdue' | 'all';

interface DateViewsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (nodeId: string) => void;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

export function DateViewsPanel({ isOpen, onClose, onNavigate }: DateViewsPanelProps) {
  const nodes = useOutlineStore(state => state.nodes);
  const [activeView, setActiveView] = useState<ViewType>('today');

  // Get all nodes with dates
  const nodesWithDates = useMemo(() => {
    return nodes.filter(n => n.date);
  }, [nodes]);

  // Calculate counts for each view
  const viewCounts = useMemo(() => {
    return {
      today: nodesWithDates.filter(n => n.date && getDateStatus(n.date, n.is_checked) === 'today').length,
      upcoming: nodesWithDates.filter(n => n.date && ['today', 'urgent', 'soon'].includes(getDateStatus(n.date, n.is_checked))).length,
      overdue: nodesWithDates.filter(n => n.date && getDateStatus(n.date, n.is_checked) === 'overdue').length,
      all: nodesWithDates.length,
    };
  }, [nodesWithDates]);

  // Filter nodes by view type
  const filteredNodes = useMemo(() => {
    return nodesWithDates.filter(node => {
      if (!node.date) return false;

      const status = getDateStatus(node.date, node.is_checked);

      switch (activeView) {
        case 'today':
          return status === 'today';
        case 'upcoming':
          return status === 'today' || status === 'urgent' || status === 'soon';
        case 'overdue':
          return status === 'overdue';
        case 'all':
          return true;
        default:
          return false;
      }
    }).sort((a, b) => {
      // Sort by date ascending
      if (a.date && b.date) {
        return a.date.localeCompare(b.date);
      }
      return 0;
    });
  }, [nodesWithDates, activeView]);

  // Handle keyboard events
  useEffect(() => {
    if (!isOpen) return;

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [isOpen, onClose]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  const handleNodeClick = useCallback((nodeId: string) => {
    onNavigate(nodeId);
    onClose();
  }, [onNavigate, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal date-views-modal">
        <div className="modal-header">
          <h2>Date Views</h2>
          <button className="close-btn" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="view-tabs">
          <button
            className={`view-tab ${activeView === 'today' ? 'active' : ''}`}
            onClick={() => setActiveView('today')}
          >
            Today
            {viewCounts.today > 0 && (
              <span className="count">{viewCounts.today}</span>
            )}
          </button>
          <button
            className={`view-tab ${activeView === 'upcoming' ? 'active' : ''}`}
            onClick={() => setActiveView('upcoming')}
          >
            Upcoming
            {viewCounts.upcoming > 0 && (
              <span className="count">{viewCounts.upcoming}</span>
            )}
          </button>
          <button
            className={`view-tab ${activeView === 'overdue' ? 'active' : ''}`}
            onClick={() => setActiveView('overdue')}
          >
            Overdue
            {viewCounts.overdue > 0 && (
              <span className="count overdue">{viewCounts.overdue}</span>
            )}
          </button>
          <button
            className={`view-tab ${activeView === 'all' ? 'active' : ''}`}
            onClick={() => setActiveView('all')}
          >
            All Dates
            {viewCounts.all > 0 && (
              <span className="count">{viewCounts.all}</span>
            )}
          </button>
        </div>

        <div className="results">
          {filteredNodes.length === 0 ? (
            <div className="empty-state">
              {activeView === 'today' && 'No tasks due today'}
              {activeView === 'upcoming' && 'No upcoming tasks'}
              {activeView === 'overdue' && 'No overdue tasks'}
              {activeView === 'all' && 'No dated items'}
            </div>
          ) : (
            filteredNodes.map(node => (
              <button
                key={node.id}
                className={`result-item ${node.is_checked ? 'checked' : ''}`}
                onClick={() => handleNodeClick(node.id)}
              >
                <div className="result-content">
                  {node.node_type === 'checkbox' && (
                    <span className={`checkbox-indicator ${node.is_checked ? 'checked' : ''}`}>
                      {node.is_checked ? '✓' : ''}
                    </span>
                  )}
                  <span className={`content-text ${node.is_checked ? 'strikethrough' : ''}`}>
                    {stripHtml(node.content) || 'Untitled'}
                  </span>
                </div>
                {node.date && (
                  <DateBadge
                    date={node.date}
                    isChecked={node.is_checked}
                  />
                )}
              </button>
            ))
          )}
        </div>

        <div className="modal-footer">
          <span className="hint">Press Escape to close</span>
        </div>
      </div>
    </div>
  );
}

export default DateViewsPanel;
