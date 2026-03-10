import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { getDateStatus, formatDateRelative, formatISODate, type DateStatus } from '../../lib/dateUtils';
import { DateBadge } from './DateBadge';
import { getAllDatedNodes } from '../../lib/api';
import type { DatedNodeInfo } from '../../lib/types';
import { stripHtml } from '../../lib/utils';

type ViewType = 'today' | 'upcoming' | 'overdue' | 'all';

/**
 * Check if a node is currently deferred (defer_date is in the future).
 * Overdue items are never considered deferred regardless of defer_date.
 */
function isDeferred(node: DatedNodeInfo): boolean {
  if (!node.defer_date) return false;
  // Overdue items are never hidden
  const status = getDateStatus(node.date, node.is_checked);
  if (status === 'overdue') return false;

  const today = formatISODate(new Date());
  return node.defer_date > today;
}

interface DateViewsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (nodeId: string, documentId: string) => void;
}

export function DateViewsPanel({ isOpen, onClose, onNavigate }: DateViewsPanelProps) {
  const [activeView, setActiveView] = useState<ViewType>('today');
  const [allDatedNodes, setAllDatedNodes] = useState<DatedNodeInfo[]>([]);
  const [loading, setLoading] = useState(false);

  // Load dated nodes from all documents when panel opens
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setLoading(true);

    getAllDatedNodes().then(nodes => {
      if (!cancelled) {
        setAllDatedNodes(nodes);
        setLoading(false);
      }
    }).catch(err => {
      console.error('Failed to load dated nodes:', err);
      if (!cancelled) {
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [isOpen]);

  // Calculate counts for each view (deferred items excluded from today/upcoming)
  const viewCounts = useMemo(() => {
    return {
      today: allDatedNodes.filter(n => getDateStatus(n.date, n.is_checked) === 'today' && !isDeferred(n)).length,
      upcoming: allDatedNodes.filter(n => ['today', 'urgent', 'soon'].includes(getDateStatus(n.date, n.is_checked)) && !isDeferred(n)).length,
      overdue: allDatedNodes.filter(n => getDateStatus(n.date, n.is_checked) === 'overdue').length,
      all: allDatedNodes.length,
    };
  }, [allDatedNodes]);

  // Count of deferred items (for info display)
  const deferredCount = useMemo(() => {
    return allDatedNodes.filter(n => isDeferred(n)).length;
  }, [allDatedNodes]);

  // Filter nodes by view type
  const filteredNodes = useMemo(() => {
    return allDatedNodes.filter(node => {
      const status = getDateStatus(node.date, node.is_checked);
      const deferred = isDeferred(node);

      switch (activeView) {
        case 'today':
          // Hide deferred items from Today view
          return status === 'today' && !deferred;
        case 'upcoming':
          // Hide deferred items from Upcoming view
          return (status === 'today' || status === 'urgent' || status === 'soon') && !deferred;
        case 'overdue':
          // Overdue items are never hidden by defer date
          return status === 'overdue';
        case 'all':
          // All view shows everything including deferred
          return true;
        default:
          return false;
      }
    }).sort((a, b) => a.date.localeCompare(b.date));
  }, [allDatedNodes, activeView]);

  // Group nodes by document for display
  const hasMultipleDocuments = useMemo(() => {
    const docIds = new Set(allDatedNodes.map(n => n.document_id));
    return docIds.size > 1;
  }, [allDatedNodes]);

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

  const handleNodeClick = useCallback((nodeId: string, documentId: string) => {
    onNavigate(nodeId, documentId);
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
          {loading ? (
            <div className="empty-state">Loading...</div>
          ) : filteredNodes.length === 0 ? (
            <div className="empty-state">
              {activeView === 'today' && 'No tasks due today'}
              {activeView === 'upcoming' && 'No upcoming tasks'}
              {activeView === 'overdue' && 'No overdue tasks'}
              {activeView === 'all' && 'No dated items'}
            </div>
          ) : (
            filteredNodes.map(node => {
              const deferred = isDeferred(node);
              return (
                <button
                  key={`${node.document_id}-${node.id}`}
                  className={`result-item ${node.is_checked ? 'checked' : ''} ${deferred ? 'deferred' : ''}`}
                  onClick={() => handleNodeClick(node.id, node.document_id)}
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
                    {deferred && (
                      <span className="deferred-label">deferred until {formatDateRelative(node.defer_date!)}</span>
                    )}
                    {hasMultipleDocuments && (
                      <span className="document-label">{node.document_title}</span>
                    )}
                  </div>
                  <DateBadge
                    date={node.date}
                    dateEnd={node.date_end}
                    isChecked={node.is_checked}
                  />
                </button>
              );
            })
          )}
        </div>

        <div className="modal-footer">
          {deferredCount > 0 && (activeView === 'today' || activeView === 'upcoming') && (
            <span className="hint deferred-hint">{deferredCount} deferred {deferredCount === 1 ? 'item' : 'items'} hidden</span>
          )}
          <span className="hint">Press Escape to close</span>
        </div>
      </div>
    </div>
  );
}

export default DateViewsPanel;
